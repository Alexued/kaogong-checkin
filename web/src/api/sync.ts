/** Local-first state persistence and guarded WebSocket synchronization. */
import { useAppStore } from '../stores/app';
import { ApiError, fetchInfo, fetchState, rememberServerInfo, replaceState, wsUrl } from './client';
import { getPairingToken, removePairingToken } from './pairing-storage';
import { SyncGeneration } from './sync-generation';
import { isSyncEnabled, LOCAL_STATE_KEY } from './sync-preference';
import { compactQueue, normalizeQueue, type QueuedSyncMessage } from './sync-queue';
import type { AppState, RemoteSyncMessage, ServerInfo, SyncMessage } from '../types';

const QUEUE_KEY = 'kgc-queue';
const ACK_PROTOCOL_VERSION = 2;

let queue: QueuedSyncMessage[] = [];
let queueLoaded = false;
let localInitialized = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let subscribed = false;

let socket: WebSocket | null = null;
let sentMutationIds = new Set<string>();
let retryDelay = 1000;
let started = false;
const generationGuard = new SyncGeneration();
let runGeneration = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let runAbortController: AbortController | null = null;
let replaceAbortController: AbortController | null = null;
let replacing = false;
let serverInfo: ServerInfo | null = null;

function loadQueue() {
  if (queueLoaded) return;
  queueLoaded = true;
  try {
    queue = normalizeQueue(JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'));
  } catch {
    queue = [];
  }
  persistQueue();
}

function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(LOCAL_STATE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as AppState;
    state.settings = Object.assign({ planEndDate: null, theme: 'light', markDate: null }, state.settings);
    return state;
  } catch {
    return null;
  }
}

function currentState(): AppState {
  const store = useAppStore();
  return {
    tasks: store.tasks,
    subtasks: store.subtasks,
    checkins: store.checkins,
    timers: store.timers,
    drills: store.drills,
    formulaDrills: store.formulaDrills,
    settings: store.settings,
  };
}

function schedulePersistState() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(currentState()));
    } catch {
      /* A full storage area must not interrupt local app behavior. */
    }
  }, 300);
}

function persistQueue() {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* Keep the in-memory queue usable if storage is temporarily unavailable. */
  }
  useAppStore().pendingSyncCount = queue.length;
}

function replayPendingLocally() {
  const store = useAppStore();
  for (const message of queue) store.applyRemote(message);
}

/** Hydration is synchronous and independent from every network branch. */
export function initializeLocalState() {
  if (localInitialized) return;
  localInitialized = true;
  loadQueue();
  const store = useAppStore();
  const cached = loadState();
  if (cached) store.applySnapshot(cached);
  replayPendingLocally();
  store.loaded = true;
  store.pendingSyncCount = queue.length;
  if (!subscribed) {
    subscribed = true;
    store.$subscribe(schedulePersistState);
  }
  schedulePersistState();
}

export function enqueue(message: SyncMessage) {
  loadQueue();
  queue = compactQueue(queue, message);
  persistQueue();
  flushCurrentSocket();
}

function isCurrentRun(generation: number): boolean {
  return started && generationGuard.isCurrent(generation) && isSyncEnabled();
}

function isCurrentSocket(generation: number, candidate: WebSocket): boolean {
  return isCurrentRun(generation) && socket === candidate;
}

function supportsAcknowledgements(): boolean {
  return Number(serverInfo?.protocolVersion || 1) >= ACK_PROTOCOL_VERSION;
}

function updateServerStatus(info: ServerInfo) {
  const store = useAppStore();
  store.syncServerId = info.serverId || '';
  store.syncServerName = info.name || '';
  store.syncPairingRequired = Boolean(info.pairingRequired);
  store.syncProtocolVersion = Number(info.protocolVersion || 1);
}

function pairingIsMissing(info: ServerInfo): boolean {
  return Boolean(info.pairingRequired && info.serverId && !getPairingToken(info.serverId));
}

function applyServerSnapshot(state: AppState) {
  const store = useAppStore();
  store.applySnapshot(state);
  // Pending local writes always win over a snapshot until the server acknowledges them.
  replayPendingLocally();
  schedulePersistState();
}

function removeAcknowledgedMutation(clientMutationId: string) {
  const index = queue.findIndex((message) => message.clientMutationId === clientMutationId);
  if (index < 0) return;
  queue.splice(index, 1);
  sentMutationIds.delete(clientMutationId);
  persistQueue();
}

function flushSocket(generation: number, candidate: WebSocket) {
  if (replacing || !isCurrentSocket(generation, candidate) || candidate.readyState !== WebSocket.OPEN) return;

  if (supportsAcknowledgements()) {
    for (const message of queue) {
      if (sentMutationIds.has(message.clientMutationId)) continue;
      try {
        candidate.send(JSON.stringify(message));
        sentMutationIds.add(message.clientMutationId);
      } catch {
        break;
      }
    }
    return;
  }

  // Legacy servers do not acknowledge. Remove only after WebSocket.send succeeds.
  let changed = false;
  while (queue.length && isCurrentSocket(generation, candidate) && candidate.readyState === WebSocket.OPEN) {
    try {
      candidate.send(JSON.stringify(queue[0]));
      queue.shift();
      changed = true;
    } catch {
      break;
    }
  }
  if (changed) persistQueue();
}

function flushCurrentSocket() {
  if (socket) flushSocket(runGeneration, socket);
}

function detachAndCloseSocket() {
  if (!socket) return;
  const previous = socket;
  socket = null;
  previous.onopen = null;
  previous.onmessage = null;
  previous.onclose = null;
  previous.onerror = null;
  try {
    previous.close();
  } catch {
    /* already closed */
  }
  sentMutationIds.clear();
}

function connect(generation: number) {
  if (!isCurrentRun(generation) || replacing) return;
  const store = useAppStore();
  let candidate: WebSocket;
  try {
    candidate = new WebSocket(wsUrl());
  } catch {
    scheduleReconnect(generation);
    return;
  }

  detachAndCloseSocket();
  socket = candidate;
  sentMutationIds = new Set();

  candidate.onopen = () => {
    if (!isCurrentSocket(generation, candidate)) return;
    retryDelay = 1000;
    store.online = true;
    store.syncPhase = 'online';
    flushSocket(generation, candidate);
  };

  candidate.onmessage = (event) => {
    if (!isCurrentSocket(generation, candidate)) return;
    try {
      const message = JSON.parse(event.data as string) as RemoteSyncMessage;
      if (message.kind === 'ack') {
        if (message.error) {
          sentMutationIds.delete(message.clientMutationId);
          candidate.close();
        } else {
          removeAcknowledgedMutation(message.clientMutationId);
        }
      }
      else if (message.kind === 'snapshot') applyServerSnapshot(message.state);
      else store.applyRemote(message);
    } catch {
      /* Ignore malformed or unrelated messages. */
    }
  };

  candidate.onclose = () => {
    if (!isCurrentSocket(generation, candidate)) return;
    socket = null;
    sentMutationIds.clear();
    store.online = false;
    store.syncPhase = 'offline';
    scheduleReconnect(generation);
  };

  candidate.onerror = () => {
    if (!isCurrentSocket(generation, candidate)) return;
    try {
      candidate.close();
    } catch {
      /* close callback handles retry */
    }
  };
}

function scheduleReconnect(generation: number) {
  if (!isCurrentRun(generation) || replacing || reconnectTimer) return;
  const delay = retryDelay;
  retryDelay = Math.min(retryDelay * 2, 30000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void refreshSnapshotAndConnect(generation);
  }, delay);
}

async function refreshSnapshotAndConnect(generation: number) {
  if (!isCurrentRun(generation) || replacing) return;
  const store = useAppStore();
  store.syncPhase = 'connecting';
  let info: ServerInfo | null = null;

  try {
    info = await fetchInfo(runAbortController?.signal);
    if (!isCurrentRun(generation)) return;
    rememberServerInfo(info);
    serverInfo = info;
    updateServerStatus(info);
    if (pairingIsMissing(info)) {
      store.online = false;
      store.syncPhase = 'pairing';
      return;
    }
  } catch (error) {
    if (!isCurrentRun(generation) || (error instanceof DOMException && error.name === 'AbortError')) return;
    // Older or temporarily unreachable servers remain eligible for the legacy WS path.
  }

  try {
    const state = await fetchState(runAbortController?.signal);
    if (!isCurrentRun(generation)) return;
    applyServerSnapshot(state);
  } catch (error) {
    if (!isCurrentRun(generation) || (error instanceof DOMException && error.name === 'AbortError')) return;
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      if (store.syncServerId) removePairingToken(store.syncServerId);
      store.online = false;
      store.syncPairingRequired = true;
      store.syncPhase = 'pairing';
      return;
    }
  }

  if (isCurrentRun(generation)) connect(generation);
}

export async function startSync() {
  initializeLocalState();
  if (!isSyncEnabled() || started) return;

  started = true;
  const generation = generationGuard.begin();
  runGeneration = generation;
  retryDelay = 1000;
  serverInfo = null;
  runAbortController?.abort();
  runAbortController = new AbortController();
  const store = useAppStore();
  store.online = false;
  store.syncPairingRequired = false;
  store.syncPhase = 'connecting';
  await refreshSnapshotAndConnect(generation);
}

export function stopSync() {
  runGeneration = generationGuard.invalidate();
  started = false;
  replacing = false;
  runAbortController?.abort();
  runAbortController = null;
  replaceAbortController?.abort();
  replaceAbortController = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  detachAndCloseSocket();
  const store = useAppStore();
  store.online = false;
  store.syncPhase = isSyncEnabled() ? 'offline' : 'local';
}

export async function restartSync() {
  stopSync();
  if (isSyncEnabled()) await startSync();
}

export async function overwriteServerWithLocal() {
  initializeLocalState();
  if (!isSyncEnabled()) throw new Error('sync disabled');
  if (replacing) throw new Error('replace already in progress');
  const store = useAppStore();
  if (!store.online) throw new Error('server offline');

  replacing = true;
  const generation = runGeneration;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  detachAndCloseSocket();
  store.online = false;
  store.syncPhase = 'connecting';
  replaceAbortController = new AbortController();
  try {
    const state = await replaceState(currentState(), replaceAbortController.signal);
    if (!isCurrentRun(generation)) throw new Error('sync run changed');
    queue = [];
    persistQueue();
    store.applySnapshot(state);
    schedulePersistState();
    return state;
  } finally {
    replaceAbortController = null;
    replacing = false;
    if (isCurrentRun(generation)) void refreshSnapshotAndConnect(generation);
  }
}

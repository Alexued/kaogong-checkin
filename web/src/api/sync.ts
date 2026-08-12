/** Local-first state persistence and guarded WebSocket synchronization. */
import { useAppStore } from '../stores/app';
import {
  ApiError,
  appendBackupSnapshotV3,
  fetchBackupCatalogV3,
  fetchInfo,
  fetchState,
  rememberServerInfo,
  replaceState,
  wsUrl,
  type BackupAppendResultV3,
} from './client';
import { getPairingToken, removePairingToken } from './pairing-storage';
import { SyncGeneration } from './sync-generation';
import { isSyncEnabled, LOCAL_STATE_KEY, persistSyncEnabled } from './sync-preference';
import { compactQueue, normalizeQueue, type QueuedSyncMessage } from './sync-queue';
import { createPeerTransfer, parsePeerTransfer, type PeerTransfer } from './peer-transfer';
import type { AppState, RemoteSyncMessage, ServerInfo, SyncMessage } from '../types';
import { fromV3, toV3 } from '../domain/legacyAdapterV3';
import { MigrationLockedError, RepositoryV3 } from '../storage/repositoryV3';
import {
  STATE_SCHEMA_VERSION,
  V1_BACKUP_KEY,
  migrateAppState,
  parseAndMigrateAppState,
} from '../lib/stateMigration';

const QUEUE_KEY = 'kgc-queue';
const PEER_QUEUE_ARCHIVE_KEY = 'kgc-peer-queue-archive-v1';
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
let v3Repository: RepositoryV3 | null = null;
let v3Ready = false;
let v3LoadPromise: Promise<void> | null = null;
let v3PersistTimer: ReturnType<typeof setTimeout> | null = null;
let v3PersistChain: Promise<void> = Promise.resolve();
let localMutationEpoch = 0;

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

function loadState(): { state: AppState | null; recoveryRequired: boolean } {
  const raw = localStorage.getItem(LOCAL_STATE_KEY);
  if (!raw) return { state: null, recoveryRequired: false };
  try {
    const migrated = parseAndMigrateAppState(raw);
    if (migrated.needsV1Backup) {
      if (localStorage.getItem(V1_BACKUP_KEY) === null) {
        localStorage.setItem(V1_BACKUP_KEY, migrated.original);
      }
      localStorage.setItem(LOCAL_STATE_KEY, migrated.serialized);
    }
    return { state: migrated.state, recoveryRequired: false };
  } catch {
    // Never schedule a blank-state write over a source that needs manual recovery.
    return { state: null, recoveryRequired: true };
  }
}

function currentState(): AppState {
  const store = useAppStore();
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    tasks: store.tasks,
    subtasks: store.subtasks,
    checkins: store.checkins,
    timers: store.timers,
    drills: store.drills,
    formulaDrills: store.formulaDrills,
    speedDrills: store.speedDrills,
    analysisReviews: store.analysisReviews,
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
  scheduleV3Persist();
}

function scheduleV3Persist() {
  if (!v3Ready || !v3Repository) return;
  if (v3PersistTimer) clearTimeout(v3PersistTimer);
  v3PersistTimer = setTimeout(() => {
    v3PersistTimer = null;
    v3PersistChain = v3PersistChain.then(async () => {
      if (!v3Repository || useAppStore().recoveryRequired) return;
      try {
        const snapshot = toV3(currentState());
        await v3Repository.commit(snapshot);
      } catch {
        useAppStore().recoveryRequired = true;
      }
    });
  }, 300);
}

async function initializeV3Persistence(): Promise<void> {
  if (!v3LoadPromise) {
    const hydrationEpoch = localMutationEpoch;
    v3Repository = new RepositoryV3(localStorage);
    v3LoadPromise = v3Repository.load().then(async (loaded) => {
      const store = useAppStore();
      if (localMutationEpoch === hydrationEpoch) {
        store.applySnapshot(fromV3(loaded.record.envelope.state));
      } else {
        // A user action won the hydration race; commit it instead of overwriting it.
        await v3Repository?.commit(toV3(currentState()));
      }
      v3Ready = true;
      store.recoveryRequired = false;
    }).catch((error) => {
      const store = useAppStore();
      store.recoveryRequired = error instanceof MigrationLockedError || Boolean(error);
      v3Ready = false;
      throw error;
    });
  }
  try { await v3LoadPromise; } catch { /* The recovery banner owns the error path. */ }
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
  store.recoveryRequired = cached.recoveryRequired;
  if (cached.state) store.applySnapshot(cached.state);
  if (cached.recoveryRequired) {
    store.loaded = true;
    void initializeV3Persistence();
    return;
  }
  replayPendingLocally();
  store.loaded = true;
  store.pendingSyncCount = queue.length;
  if (!subscribed) {
    subscribed = true;
    store.$subscribe(schedulePersistState);
  }
  schedulePersistState();
  void initializeV3Persistence();
}

function archivePeerQueue(previousQueue: QueuedSyncMessage[]) {
  if (!previousQueue.length) return;
  let archive: Array<{ createdAt: string; queue: QueuedSyncMessage[] }> = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(PEER_QUEUE_ARCHIVE_KEY) || '[]');
    if (Array.isArray(parsed)) archive = parsed;
  } catch {
    archive = [];
  }
  archive.unshift({ createdAt: new Date().toISOString(), queue: structuredClone(previousQueue) });
  try { localStorage.setItem(PEER_QUEUE_ARCHIVE_KEY, JSON.stringify(archive.slice(0, 5))); } catch {
    /* The native recovery point still preserves the pre-replacement snapshot. */
  }
}

export async function initializeLocalStateAsync(): Promise<void> {
  initializeLocalState();
  await initializeV3Persistence();
}

export function enqueue(message: SyncMessage) {
  localMutationEpoch += 1;
  loadQueue();
  queue = compactQueue(queue, message);
  persistQueue();
  scheduleV3Persist();
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
  store.syncStateSchemaVersion = Number(info.stateSchemaVersion || 1);
  const minimum = Number(info.minimumClientStateSchemaVersion || 1);
  store.syncStateSchemaCompatible =
    minimum <= STATE_SCHEMA_VERSION && store.syncStateSchemaVersion <= STATE_SCHEMA_VERSION;
}

function pairingIsMissing(info: ServerInfo): boolean {
  return Boolean(info.pairingRequired && info.serverId && !getPairingToken(info.serverId));
}

function applyServerSnapshot(state: AppState) {
  const store = useAppStore();
  let migrated: AppState;
  try {
    migrated = migrateAppState(state);
  } catch {
    return;
  }
  store.applySnapshot(migrated);
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
    if (!store.syncStateSchemaCompatible) {
      store.online = false;
      store.syncPhase = 'offline';
      return;
    }
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
  await initializeLocalStateAsync();
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

export async function backupLocalStateToComputer(): Promise<BackupAppendResultV3 | AppState> {
  await initializeLocalStateAsync();
  if (!isSyncEnabled()) throw new Error('sync disabled');
  if (replacing) throw new Error('replace already in progress');
  const store = useAppStore();
  if (!store.online) throw new Error('server offline');

  if (Number(serverInfo?.backupProtocolVersion || 0) < 3) {
    return overwriteServerWithLocal();
  }
  if (!v3Repository || store.recoveryRequired) throw new Error('local repository unavailable');

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
    const record = await v3Repository.commit(toV3(currentState()));
    const catalog = await fetchBackupCatalogV3(
      record.envelope.deviceId,
      replaceAbortController.signal,
    );
    if (!isCurrentRun(generation)) throw new Error('sync run changed');
    const result = await appendBackupSnapshotV3({
      mutationId: crypto.randomUUID(),
      deviceId: record.envelope.deviceId,
      expectedBackupRevision: catalog.head?.backupRevision || 0,
      localRevision: record.envelope.revision,
      envelope: record.envelope,
    }, replaceAbortController.signal);
    if (!isCurrentRun(generation)) throw new Error('sync run changed');
    return result;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      scheduleV3Persist();
    }
    throw error;
  } finally {
    replaceAbortController = null;
    replacing = false;
    if (isCurrentRun(generation)) void refreshSnapshotAndConnect(generation);
  }
}

/** Export one validated, size-bounded v3 snapshot for device direct sync. */
export async function exportLocalPeerTransfer(): Promise<PeerTransfer> {
  await initializeLocalStateAsync();
  if (!v3Repository || useAppStore().recoveryRequired) throw new Error('local repository unavailable');
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
    try { localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(currentState())); } catch { /* v3 remains canonical */ }
  }
  if (v3PersistTimer) {
    clearTimeout(v3PersistTimer);
    v3PersistTimer = null;
  }
  await v3PersistChain;
  const record = await v3Repository.commit(toV3(currentState()));
  return createPeerTransfer(record.envelope);
}

export async function exportLocalPeerRecoveryPoint(): Promise<{ bundleJson: string; transfer: PeerTransfer }> {
  const transfer = await exportLocalPeerTransfer();
  const bundleJson = JSON.stringify({
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    transfer,
    computerSyncEnabled: isSyncEnabled(),
    pendingComputerQueue: queue,
  });
  return { bundleJson, transfer };
}

/**
 * Apply a peer snapshot as a complete replacement. Callers create a native
 * recovery point first. Computer sync is forced off and its active queue is
 * archived before the canonical v3 record is committed.
 */
export async function replaceLocalStateFromPeer(value: unknown): Promise<AppState> {
  const { envelope } = await parsePeerTransfer(value);
  await initializeLocalStateAsync();
  if (!v3Repository || useAppStore().recoveryRequired) throw new Error('local repository unavailable');

  persistSyncEnabled(false);
  stopSync();
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (v3PersistTimer) {
    clearTimeout(v3PersistTimer);
    v3PersistTimer = null;
  }
  await v3PersistChain;

  const nextState = fromV3(envelope.state);
  const previousQueue = queue;
  archivePeerQueue(previousQueue);
  await v3Repository.commit(envelope.state, []);

  queue = [];
  queueLoaded = true;
  persistQueue();
  localMutationEpoch += 1;
  const store = useAppStore();
  store.applySnapshot(nextState);
  store.recoveryRequired = false;
  try { localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(nextState)); } catch {
    /* The canonical repository was already atomically committed. */
  }
  schedulePersistState();
  return nextState;
}

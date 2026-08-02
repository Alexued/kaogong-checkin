/**
 * WebSocket 同步：
 * - 启动：本地缓存水合（离线重启数据不丢）→ GET /api/state 全量快照 → 建立 WS
 * - 所有本地变更先入 localStorage 离线队列（乐观更新由 store 完成），
 *   WS 在线时立即按序发送；重连成功后重放队列，再拉一次全量快照对齐
 * - 全量状态持久化到 localStorage（防抖），启动时先恢复再与服务器对齐
 * - WS 断开指数退避重连（1s → 2s → … → 30s 封顶）
 */
import { useAppStore } from '../stores/app';
import { fetchState, replaceState, wsUrl } from './client';
import type { AppState, RemoteSyncMessage, SyncMessage } from '../types';

const QUEUE_KEY = 'kgc-queue';
const STATE_KEY = 'kgc-state';
const SYNC_ENABLED_KEY = 'kgc-sync-enabled';

function loadQueue(): SyncMessage[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

/** 读取本地持久化的全量状态；settings 字段补齐缺省值 */
function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AppState;
    s.settings = { planEndDate: null, theme: 'light', markDate: null, ...s.settings };
    return s;
  } catch {
    return null;
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** 防抖持久化 store 全量状态 */
function schedulePersistState() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const s = useAppStore();
    const snapshot: AppState = {
      tasks: s.tasks,
      subtasks: s.subtasks,
      checkins: s.checkins,
      timers: s.timers,
      drills: s.drills,
      formulaDrills: s.formulaDrills,
      settings: s.settings,
    };
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(snapshot));
    } catch {
      /* 存储满等异常忽略 */
    }
  }, 300);
}

let queue: SyncMessage[] = loadQueue();
let ws: WebSocket | null = null;
let retryDelay = 1000;
let started = false;
let replayed = false;
let subscribed = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let replacing = false;

export function isSyncEnabled(): boolean {
  return localStorage.getItem(SYNC_ENABLED_KEY) !== 'false';
}

function persistQueue() {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueue(msg: SyncMessage) {
  queue.push(msg);
  persistQueue();
  flush();
}

function flush() {
  if (replacing || !isSyncEnabled() || !ws || ws.readyState !== WebSocket.OPEN) return;
  while (queue.length > 0 && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(queue[0]));
    queue.shift();
    replayed = true;
  }
  persistQueue();
  if (replayed) {
    replayed = false;
    // 队列重放完成后拉全量快照对齐（单用户 last-write-wins）
    const store = useAppStore();
    fetchState()
      .then((s) => {
        if (isSyncEnabled() && !replacing) store.applySnapshot(s);
      })
      .catch(() => {});
  }
}

export async function startSync() {
  if (started) return;
  started = true;
  const store = useAppStore();
  // 先用本地缓存水合并重放离线队列：离线重启数据不丢
  const cached = loadState();
  if (cached) {
    store.applySnapshot(cached);
  }
  if (!isSyncEnabled()) {
    for (const m of queue) store.applyRemote(m);
    store.loaded = true;
    if (!subscribed) {
      subscribed = true;
      store.$subscribe(schedulePersistState);
    }
    schedulePersistState();
    started = false;
    return;
  }
  try {
    const serverState = await fetchState();
    if (isSyncEnabled()) store.applySnapshot(serverState);
  } catch {
    // 服务器不可达：离线模式，使用本地缓存数据
  }
  for (const m of queue) store.applyRemote(m);
  store.loaded = true;
  // 之后所有状态变化都持久化到本地（只订阅一次，restartSync 不重复订阅）
  if (!subscribed) {
    subscribed = true;
    store.$subscribe(schedulePersistState);
  }
  schedulePersistState();
  connect();
}

function connect() {
  if (!isSyncEnabled() || replacing) return;
  const store = useAppStore();
  try {
    ws = new WebSocket(wsUrl());
  } catch {
    scheduleReconnect();
    return;
  }
  ws.onopen = () => {
    retryDelay = 1000;
    store.online = true;
    flush();
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string) as RemoteSyncMessage;
      if (msg.kind === 'snapshot') store.applySnapshot(msg.state);
      else store.applyRemote(msg);
    } catch {
      /* 忽略坏消息 */
    }
  };
  ws.onclose = () => {
    store.online = false;
    ws = null;
    scheduleReconnect();
  };
  ws.onerror = () => {
    try {
      ws?.close();
    } catch {
      /* noop */
    }
  };
}

function scheduleReconnect() {
  if (!isSyncEnabled() || replacing || reconnectTimer) return;
  const delay = retryDelay;
  retryDelay = Math.min(retryDelay * 2, 30000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

export function stopSync() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.onclose = null;
    try {
      ws.close();
    } catch {
      /* noop */
    }
    ws = null;
  }
  useAppStore().online = false;
  started = false;
  replayed = false;
}

export function setSyncEnabled(enabled: boolean) {
  localStorage.setItem(SYNC_ENABLED_KEY, String(enabled));
  if (enabled) {
    retryDelay = 1000;
    void startSync();
  }
  else stopSync();
}

function currentState(): AppState {
  const s = useAppStore();
  return {
    tasks: s.tasks,
    subtasks: s.subtasks,
    checkins: s.checkins,
    timers: s.timers,
    drills: s.drills,
    formulaDrills: s.formulaDrills,
    settings: s.settings,
  };
}

export async function overwriteServerWithLocal() {
  if (!isSyncEnabled()) throw new Error('sync disabled');
  if (replacing) throw new Error('replace already in progress');
  const store = useAppStore();
  if (!store.online) throw new Error('server offline');
  replacing = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.onclose = null;
    try {
      ws.close();
    } catch {
      /* noop */
    }
    ws = null;
  }
  store.online = false;
  try {
    const state = await replaceState(currentState());
    queue = [];
    persistQueue();
    store.applySnapshot(state);
    return state;
  } finally {
    replacing = false;
    if (isSyncEnabled()) connect();
  }
}

/** 修改 serverUrl 后调用：以新地址重新初始化同步 */
export function restartSync() {
  stopSync();
  retryDelay = 1000;
  if (isSyncEnabled()) void startSync();
}

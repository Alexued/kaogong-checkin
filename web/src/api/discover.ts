/** UDP 局域网服务器扫描（仅原生 APK 内生效）。发现结果只展示，用户选择后才连接。 */
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { UdpSocket } from 'capacitor-udp-socket';
import { isSyncEnabled } from './sync-preference';

const UDP_PORT = 8322;
const STALE_MS = 30000;

export interface DiscoveredServer {
  key: string;
  name: string;
  host: string;
  httpPort: number;
  lastSeen: number;
  serverId?: string;
  pairingRequired: boolean;
  protocolVersion: number;
  apkAvailable: boolean;
  apkVersion?: string;
}

export interface DiscoveryDiagnostics {
  running: boolean;
  boundPort: number | null;
  receivedPackets: number;
  acceptedPackets: number;
  duplicatePackets: number;
  parseFailures: number;
  socketErrors: number;
  lastFailureReason?: 'empty-payload' | 'invalid-json' | 'invalid-metadata' | 'socket-error';
}

let activeSocketId: number | null = null;
let receiveListener: PluginListenerHandle | null = null;
let receiveErrorListener: PluginListenerHandle | null = null;
let startPromise: Promise<void> | null = null;
let discoveryGeneration = 0;
let expiryTimer: ReturnType<typeof setInterval> | null = null;
const candidates = new Map<string, DiscoveredServer>();
const candidateKeyByServerId = new Map<string, string>();
const subscribers = new Set<(servers: DiscoveredServer[]) => void>();
let diagnostics: DiscoveryDiagnostics = createDiagnostics();

function createDiagnostics(): DiscoveryDiagnostics {
  return {
    running: false,
    boundPort: null,
    receivedPackets: 0,
    acceptedPackets: 0,
    duplicatePackets: 0,
    parseFailures: 0,
    socketErrors: 0,
  };
}

export function getDiscoveryDiagnostics(): DiscoveryDiagnostics {
  return { ...diagnostics };
}

function snapshot(): DiscoveredServer[] {
  const cutoff = Date.now() - STALE_MS;
  for (const [key, server] of candidates) {
    if (server.lastSeen < cutoff) {
      candidates.delete(key);
      if (server.serverId && candidateKeyByServerId.get(server.serverId) === key) {
        candidateKeyByServerId.delete(server.serverId);
      }
    }
  }
  return [...candidates.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

function notify() {
  const servers = snapshot();
  for (const subscriber of subscribers) subscriber(servers);
}

export function subscribeDiscovery(subscriber: (servers: DiscoveredServer[]) => void): () => void {
  subscribers.add(subscriber);
  subscriber(snapshot());
  return () => subscribers.delete(subscriber);
}

export function clearDiscoveredServers() {
  candidates.clear();
  candidateKeyByServerId.clear();
  notify();
}

export function isDiscoveryRunning(): boolean {
  return activeSocketId !== null;
}

function startExpiryTimer() {
  if (expiryTimer) return;
  expiryTimer = setInterval(() => {
    const before = candidates.size;
    snapshot();
    if (candidates.size !== before) notify();
  }, 5000);
}

function stopExpiryTimer() {
  if (!expiryTimer) return;
  clearInterval(expiryTimer);
  expiryTimer = null;
}

async function closeSocket(socketId: number) {
  try {
    await UdpSocket.close({ socketId });
  } catch {
    /* socket already closed */
  }
}

function recordParseFailure(reason: DiscoveryDiagnostics['lastFailureReason']) {
  diagnostics.parseFailures += 1;
  diagnostics.lastFailureReason = reason;
}

function parsePacket(buffer: string): Record<string, unknown> | null {
  if (!buffer) {
    recordParseFailure('empty-payload');
    return null;
  }
  let text = buffer;
  try {
    text = atob(buffer);
  } catch {
    /* The plugin may already provide plaintext. */
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      recordParseFailure('invalid-json');
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    recordParseFailure('invalid-json');
    return null;
  }
}

function acceptPacket(event: { buffer?: string; remoteAddress?: string }) {
  diagnostics.receivedPackets += 1;
  const message = parsePacket(event.buffer || '');
  if (!message) return;

  const host = String(event.remoteAddress || '').replace(/^\//, '').trim();
  const httpPort = Number(message.httpPort);
  if (!host || !Number.isInteger(httpPort) || httpPort < 1 || httpPort > 65535) {
    recordParseFailure('invalid-metadata');
    return;
  }

  const serverId = typeof message.serverId === 'string' && message.serverId.trim()
    ? message.serverId.trim()
    : undefined;
  const key = `${host}:${httpPort}`;
  const priorKey = serverId ? candidateKeyByServerId.get(serverId) : undefined;
  if (priorKey) {
    diagnostics.duplicatePackets += 1;
    if (priorKey !== key) candidates.delete(priorKey);
  }

  candidates.set(key, {
    key,
    host,
    httpPort,
    name: String(message.name || host),
    lastSeen: Date.now(),
    serverId,
    pairingRequired: Boolean(message.pairingRequired),
    protocolVersion: Number(message.protocolVersion || 1),
    apkAvailable: Boolean(message.apkAvailable),
    apkVersion: /^\d+\.\d+\.\d+$/.test(String(message.apkVersion || ''))
      ? String(message.apkVersion)
      : undefined,
  });
  if (serverId) candidateKeyByServerId.set(serverId, key);
  diagnostics.acceptedPackets += 1;
  notify();
}

export function startDiscovery(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !isSyncEnabled() || activeSocketId !== null) return Promise.resolve();
  if (startPromise) return startPromise;

  const generation = ++discoveryGeneration;
  diagnostics = createDiagnostics();
  startPromise = (async () => {
    let socketId: number | null = null;
    let pendingReceiveListener: PluginListenerHandle | null = null;
    let pendingErrorListener: PluginListenerHandle | null = null;
    try {
      const created = await UdpSocket.create({
        properties: {
          name: 'kgc-discovery',
          bufferSize: 4096,
        },
      });
      socketId = created.socketId;
      if (generation !== discoveryGeneration || !isSyncEnabled()) {
        await closeSocket(socketId);
        return;
      }
      await UdpSocket.bind({ socketId, address: '0.0.0.0', port: UDP_PORT });
      if (generation !== discoveryGeneration || !isSyncEnabled()) {
        await closeSocket(socketId);
        return;
      }
      await UdpSocket.setBroadcast({ socketId, enabled: true });
      if (generation !== discoveryGeneration || !isSyncEnabled()) {
        await closeSocket(socketId);
        return;
      }
      const listener = await UdpSocket.addListener('receive', (event) => {
        if (!isSyncEnabled() || event.socketId !== socketId || event.socketId !== activeSocketId) return;
        acceptPacket(event);
      });
      pendingReceiveListener = listener;
      const errorListener = await UdpSocket.addListener('receiveError', (event) => {
        if (!isSyncEnabled() || event.socketId !== socketId || event.socketId !== activeSocketId) return;
        diagnostics.socketErrors += 1;
        diagnostics.lastFailureReason = 'socket-error';
      });
      pendingErrorListener = errorListener;
      if (generation !== discoveryGeneration || !isSyncEnabled()) {
        try { await listener.remove(); } catch { /* listener already removed */ }
        try { await errorListener.remove(); } catch { /* listener already removed */ }
        await closeSocket(socketId);
        return;
      }
      activeSocketId = socketId;
      receiveListener = listener;
      receiveErrorListener = errorListener;
      pendingReceiveListener = null;
      pendingErrorListener = null;
      diagnostics.running = true;
      diagnostics.boundPort = UDP_PORT;
      startExpiryTimer();
      console.log(`[discover] UDP listener bound on 0.0.0.0:${UDP_PORT}`);
    } catch (error) {
      if (pendingReceiveListener) {
        try { await pendingReceiveListener.remove(); } catch { /* listener already removed */ }
      }
      if (pendingErrorListener) {
        try { await pendingErrorListener.remove(); } catch { /* listener already removed */ }
      }
      if (socketId !== null && socketId !== activeSocketId) await closeSocket(socketId);
      console.warn('[discover] unavailable:', error);
    } finally {
      startPromise = null;
    }
  })();
  return startPromise;
}

export async function restartDiscovery(): Promise<void> {
  await stopDiscovery();
  clearDiscoveredServers();
  await startDiscovery();
}

export async function stopDiscovery(): Promise<void> {
  discoveryGeneration += 1;
  stopExpiryTimer();
  const pendingStart = startPromise;
  if (pendingStart) {
    try {
      await pendingStart;
    } catch {
      /* startup cleanup is best effort */
    }
  }
  if (receiveListener) {
    const listener = receiveListener;
    receiveListener = null;
    try {
      await listener.remove();
    } catch {
      /* listener already removed */
    }
  }
  if (receiveErrorListener) {
    const listener = receiveErrorListener;
    receiveErrorListener = null;
    try {
      await listener.remove();
    } catch {
      /* listener already removed */
    }
  }
  if (activeSocketId !== null) {
    const socketId = activeSocketId;
    activeSocketId = null;
    await closeSocket(socketId);
  }
  diagnostics.running = false;
  diagnostics.boundPort = null;
  if (diagnostics.receivedPackets || diagnostics.parseFailures || diagnostics.socketErrors) {
    console.log(
      `[discover] stopped: received=${diagnostics.receivedPackets}, accepted=${diagnostics.acceptedPackets}, `
      + `duplicates=${diagnostics.duplicatePackets}, parseFailures=${diagnostics.parseFailures}, `
      + `socketErrors=${diagnostics.socketErrors}`,
    );
  }
  clearDiscoveredServers();
}

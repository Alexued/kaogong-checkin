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

let activeSocketId: number | null = null;
let receiveListener: PluginListenerHandle | null = null;
let startPromise: Promise<void> | null = null;
let discoveryGeneration = 0;
let expiryTimer: ReturnType<typeof setInterval> | null = null;
const candidates = new Map<string, DiscoveredServer>();
const subscribers = new Set<(servers: DiscoveredServer[]) => void>();

function snapshot(): DiscoveredServer[] {
  const cutoff = Date.now() - STALE_MS;
  for (const [key, server] of candidates) {
    if (server.lastSeen < cutoff) candidates.delete(key);
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

export function startDiscovery(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !isSyncEnabled() || activeSocketId !== null) return Promise.resolve();
  if (startPromise) return startPromise;

  const generation = ++discoveryGeneration;
  startPromise = (async () => {
    let socketId: number | null = null;
    try {
      const created = await UdpSocket.create();
      socketId = created.socketId;
      if (generation !== discoveryGeneration || !isSyncEnabled()) {
        await closeSocket(socketId);
        return;
      }
      await UdpSocket.bind({ socketId, port: UDP_PORT });
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
        if (!isSyncEnabled() || event.socketId !== socketId || event.socketId !== activeSocketId || !event.buffer) return;
        try {
          let text = event.buffer;
          try {
            text = atob(event.buffer);
          } catch {
            /* plugin may already provide plaintext */
          }
          const message = JSON.parse(text) as {
            name?: string;
            httpPort?: number;
            serverId?: string;
            pairingRequired?: boolean;
            protocolVersion?: number;
            apkAvailable?: boolean;
            apkVersion?: string;
          };
          const host = (event.remoteAddress || '').replace(/^\//, '');
          if (!host || !message.httpPort) return;
          const key = `${host}:${message.httpPort}`;
          candidates.set(key, {
            key,
            host,
            httpPort: Number(message.httpPort),
            name: String(message.name || host),
            lastSeen: Date.now(),
            serverId: message.serverId ? String(message.serverId) : undefined,
            pairingRequired: Boolean(message.pairingRequired),
            protocolVersion: Number(message.protocolVersion || 1),
            apkAvailable: Boolean(message.apkAvailable),
            apkVersion: /^\d+\.\d+\.\d+$/.test(String(message.apkVersion || ''))
              ? String(message.apkVersion)
              : undefined,
          });
          notify();
        } catch {
          /* ignore unrelated broadcast packets */
        }
      });
      if (generation !== discoveryGeneration || !isSyncEnabled()) {
        try { await listener.remove(); } catch { /* listener already removed */ }
        await closeSocket(socketId);
        return;
      }
      activeSocketId = socketId;
      receiveListener = listener;
      startExpiryTimer();
      console.log(`[discover] scanning udp :${UDP_PORT}`);
    } catch (error) {
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
  if (activeSocketId !== null) {
    const socketId = activeSocketId;
    activeSocketId = null;
    await closeSocket(socketId);
  }
  clearDiscoveredServers();
}

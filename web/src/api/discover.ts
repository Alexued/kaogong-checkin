/**
 * UDP 服务器自动发现（仅原生 APK 内生效，best effort）：
 * 监听 8322 端口广播 {name, httpPort}，收到后用发送方 IP 自动填写 serverUrl 并重连。
 * 已手动配置 serverUrl 时不覆盖（手动优先）。
 */
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { UdpSocket } from 'capacitor-udp-socket';
import { getServerUrl, setServerUrl } from './client';
import { isSyncEnabled, restartSync } from './sync';

const UDP_PORT = 8322;
let activeSocketId: number | null = null;
let receiveListener: PluginListenerHandle | null = null;

export async function startDiscovery(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (!isSyncEnabled() || activeSocketId !== null) return;
  if (getServerUrl()) return; // 手动配置优先
  try {
    const { socketId } = await UdpSocket.create();
    activeSocketId = socketId;
    await UdpSocket.bind({ socketId, port: UDP_PORT });
    await UdpSocket.setBroadcast({ socketId, enabled: true });
    receiveListener = await UdpSocket.addListener('receive', (ev) => {
      if (!isSyncEnabled() || ev.socketId !== socketId || !ev.buffer || getServerUrl()) return;
      try {
        // 插件 buffer 为 base64；兼容明文
        let text = ev.buffer;
        try {
          text = atob(ev.buffer);
        } catch {
          /* 按明文处理 */
        }
        const msg = JSON.parse(text);
        const host = (ev.remoteAddress || '').replace(/^\//, '');
        if (msg && msg.httpPort && host) {
          console.log(`[discover] found server ${host}:${msg.httpPort} (${msg.name})`);
          setServerUrl(`${host}:${msg.httpPort}`);
          restartSync();
          void stopDiscovery();
        }
      } catch {
        /* 忽略非本应用广播 */
      }
    });
    console.log(`[discover] listening udp :${UDP_PORT}`);
  } catch (e) {
    // 插件不可用等场景：跳过自动发现，保留手动输入
    await stopDiscovery();
    console.warn('[discover] unavailable:', e);
  }
}

export async function stopDiscovery(): Promise<void> {
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
    try {
      await UdpSocket.close({ socketId });
    } catch {
      /* socket already closed */
    }
  }
}

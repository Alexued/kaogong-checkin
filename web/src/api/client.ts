/**
 * REST 客户端。
 * API base URL 从 localStorage 的 serverUrl 读取（为空则同源），
 * 为 Capacitor APK 场景做准备（WebView 源为 capacitor://localhost，需指向局域网服务器）。
 */
import type { AppState, ServerInfo } from '../types';

export function getServerUrl(): string {
  return (localStorage.getItem('serverUrl') || '').trim();
}

export function setServerUrl(url: string) {
  localStorage.setItem('serverUrl', url.trim());
}

function httpBase(): string {
  const s = getServerUrl();
  if (!s) return '';
  const withProto = /^https?:\/\//.test(s) ? s : `http://${s}`;
  return withProto.replace(/\/+$/, '');
}

export function wsUrl(): string {
  const s = getServerUrl();
  if (!s) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }
  return httpBase().replace(/^http/, 'ws') + '/ws';
}

export async function fetchState(): Promise<AppState> {
  const r = await fetch(httpBase() + '/api/state');
  if (!r.ok) throw new Error(`GET /api/state ${r.status}`);
  return r.json();
}

export async function replaceState(state: AppState): Promise<AppState> {
  const r = await fetch(httpBase() + '/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (!r.ok) throw new Error(`PUT /api/state ${r.status}`);
  return r.json();
}

export async function fetchInfo(): Promise<ServerInfo> {
  const r = await fetch(httpBase() + '/api/info');
  if (!r.ok) throw new Error(`GET /api/info ${r.status}`);
  return r.json();
}

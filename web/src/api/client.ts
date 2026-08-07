/** REST/WebSocket client for the selected computer companion. */
import type { AppState, ServerInfo } from '../types';
import type { StorageEnvelopeV3 } from '../domain/v3';
import {
  getPairingToken,
  getSelectedServerId,
  setSelectedServerId,
} from './pairing-storage';

const SERVER_URL_KEY = 'serverUrl';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface PairingResult {
  token: string;
  serverId: string;
  protocolVersion?: number;
  backupProtocolVersion?: number;
  backupFormatVersion?: number;
}

export interface BackupSnapshotMetadataV3 {
  snapshotId: string;
  localRevision: number;
  backupRevision: number;
  sha256: string;
  bytes: number;
  createdAt: string;
}

export interface BackupCatalogV3 {
  deviceId: string;
  head: BackupSnapshotMetadataV3 | null;
  snapshots: BackupSnapshotMetadataV3[];
  backupProtocolVersion: 3;
  backupFormatVersion: 1;
}

export interface BackupAppendResultV3 {
  metadata: BackupSnapshotMetadataV3;
  idempotent: boolean;
  retained: boolean;
  prunedSnapshotIds: string[];
  backupProtocolVersion: 3;
  backupFormatVersion: 1;
}

export interface BackupSnapshotV3 {
  metadata: BackupSnapshotMetadataV3;
  envelope: StorageEnvelopeV3;
  backupProtocolVersion: 3;
  backupFormatVersion: 1;
}

export function getServerUrl(): string {
  return (localStorage.getItem(SERVER_URL_KEY) || '').trim();
}

export function setServerUrl(url: string, serverId?: string) {
  const previous = getServerUrl();
  const next = url.trim();
  localStorage.setItem(SERVER_URL_KEY, next);
  if (serverId !== undefined) setSelectedServerId(serverId);
  else if (previous !== next) setSelectedServerId('');
}

export function rememberServerInfo(info: ServerInfo) {
  if (info.serverId) setSelectedServerId(info.serverId);
}

function httpBase(): string {
  const server = getServerUrl();
  if (!server) return '';
  const withProtocol = /^https?:\/\//.test(server) ? server : `http://${server}`;
  return withProtocol.replace(/\/+$/, '');
}

function authHeaders(): Record<string, string> {
  const token = getPairingToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function responseJson<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) throw new ApiError(`${operation} ${response.status}`, response.status);
  return response.json() as Promise<T>;
}

export function wsUrl(): string {
  const server = getServerUrl();
  let url: string;
  if (!server) {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    url = `${protocol}://${location.host}/ws`;
  } else {
    url = httpBase().replace(/^http/, 'ws') + '/ws';
  }

  const token = getPairingToken();
  if (!token) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

export async function fetchState(signal?: AbortSignal): Promise<AppState> {
  const response = await fetch(httpBase() + '/api/state', {
    headers: authHeaders(),
    signal,
  });
  return responseJson<AppState>(response, 'GET /api/state');
}

export async function replaceState(state: AppState, signal?: AbortSignal): Promise<AppState> {
  const response = await fetch(httpBase() + '/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(state),
    signal,
  });
  return responseJson<AppState>(response, 'PUT /api/state');
}

export async function fetchBackupCatalogV3(
  deviceId: string,
  signal?: AbortSignal,
): Promise<BackupCatalogV3> {
  const response = await fetch(
    `${httpBase()}/api/v3/backups/${encodeURIComponent(deviceId)}`,
    { headers: authHeaders(), signal },
  );
  return responseJson<BackupCatalogV3>(response, 'GET /api/v3/backups/:deviceId');
}

export async function appendBackupSnapshotV3(
  request: {
    mutationId: string;
    deviceId: string;
    expectedBackupRevision: number;
    localRevision: number;
    envelope: StorageEnvelopeV3;
  },
  signal?: AbortSignal,
): Promise<BackupAppendResultV3> {
  const response = await fetch(`${httpBase()}/api/v3/backups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(request),
    signal,
  });
  return responseJson<BackupAppendResultV3>(response, 'POST /api/v3/backups');
}

export async function fetchBackupSnapshotV3(
  deviceId: string,
  snapshotId: string,
  signal?: AbortSignal,
): Promise<BackupSnapshotV3> {
  const response = await fetch(
    `${httpBase()}/api/v3/backups/${encodeURIComponent(deviceId)}/${encodeURIComponent(snapshotId)}`,
    { headers: authHeaders(), signal },
  );
  return responseJson<BackupSnapshotV3>(response, 'GET /api/v3/backups/:deviceId/:snapshotId');
}

export async function fetchInfo(signal?: AbortSignal): Promise<ServerInfo> {
  const response = await fetch(httpBase() + '/api/info', { signal });
  return responseJson<ServerInfo>(response, 'GET /api/info');
}

export async function pairServer(
  code: string,
  expectedServerId = getSelectedServerId(),
  signal?: AbortSignal,
): Promise<PairingResult> {
  const response = await fetch(httpBase() + '/api/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim(), clientName: '考公打卡 Android', protocolVersion: 2 }),
    signal,
  });
  const result = await responseJson<PairingResult>(response, 'POST /api/pair');
  if (!result.token || !result.serverId) throw new Error('配对响应缺少令牌或服务器标识');
  if (expectedServerId && result.serverId !== expectedServerId) {
    throw new Error('服务器标识已变化，请重新扫描');
  }
  return result;
}

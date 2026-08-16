import { validateDomainState, type StorageEnvelopeV3 } from '../domain/v3.ts';

export const PEER_PROTOCOL_VERSION = 2 as const;
export const PEER_TRANSFER_FORMAT_VERSION = 1 as const;
export const MAX_PEER_SNAPSHOT_BYTES = 8 * 1024 * 1024;

export interface PeerSnapshotSummary {
  appMode: 'exam' | 'general';
  taskCount: number;
  progressCount: number;
  timerCount: number;
  drillCount: number;
  savedAt: string;
}

export interface PeerTransfer {
  transferFormatVersion: 1;
  snapshotJson: string;
  snapshotSha256: string;
  snapshotUtf8Bytes: number;
  summary: PeerSnapshotSummary;
}

export interface PeerConnectTarget {
  host: string;
  port: number;
  pairingCode: string;
  deviceId?: string;
  sessionId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isIpv4(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function requireIdentifier(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 128 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`INVALID_${field}`);
  }
  return normalized;
}

export async function sha256Utf8(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('DIGEST_UNAVAILABLE');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function summarizeEnvelope(envelope: StorageEnvelopeV3): PeerSnapshotSummary {
  validateDomainState(envelope.state);
  return {
    appMode: envelope.state.settings.appMode,
    taskCount: envelope.state.tasks.filter((item) => item.deletedAt === null).length,
    progressCount: envelope.state.dailyProgress.filter((item) => item.deletedAt === null && item.completed > 0).length,
    timerCount: envelope.state.timerSessions.filter((item) => item.deletedAt === null).length,
    drillCount:
      envelope.state.drillAttempts.filter((item) => item.deletedAt === null).length
      + (envelope.state.speedAttempts || []).filter((item) => item.deletedAt === null).length
      + (envelope.state.analysisReviews || []).filter((item) => item.deletedAt === null).length,
    savedAt: envelope.savedAt,
  };
}

export async function createPeerTransfer(envelope: StorageEnvelopeV3): Promise<PeerTransfer> {
  if (envelope.schemaVersion !== 3) throw new Error('UNSUPPORTED_STATE_VERSION');
  validateDomainState(envelope.state);
  const snapshotJson = JSON.stringify(envelope);
  const snapshotUtf8Bytes = new TextEncoder().encode(snapshotJson).byteLength;
  if (snapshotUtf8Bytes > MAX_PEER_SNAPSHOT_BYTES) throw new Error('SNAPSHOT_TOO_LARGE');
  return {
    transferFormatVersion: PEER_TRANSFER_FORMAT_VERSION,
    snapshotJson,
    snapshotSha256: await sha256Utf8(snapshotJson),
    snapshotUtf8Bytes,
    summary: summarizeEnvelope(envelope),
  };
}

export async function parsePeerTransfer(value: unknown): Promise<{ transfer: PeerTransfer; envelope: StorageEnvelopeV3 }> {
  if (!isRecord(value) || value.transferFormatVersion !== PEER_TRANSFER_FORMAT_VERSION) {
    throw new Error('UNSUPPORTED_TRANSFER_VERSION');
  }
  const snapshotJson = typeof value.snapshotJson === 'string' ? value.snapshotJson : '';
  const snapshotSha256 = typeof value.snapshotSha256 === 'string' ? value.snapshotSha256.toLowerCase() : '';
  const claimedBytes = value.snapshotUtf8Bytes;
  const actualBytes = new TextEncoder().encode(snapshotJson).byteLength;
  if (!snapshotJson || actualBytes > MAX_PEER_SNAPSHOT_BYTES) throw new Error('SNAPSHOT_TOO_LARGE');
  if (!Number.isSafeInteger(claimedBytes) || claimedBytes !== actualBytes) throw new Error('SNAPSHOT_SIZE_MISMATCH');
  if (!/^[a-f0-9]{64}$/.test(snapshotSha256) || await sha256Utf8(snapshotJson) !== snapshotSha256) {
    throw new Error('SNAPSHOT_DIGEST_MISMATCH');
  }
  let envelope: StorageEnvelopeV3;
  try {
    envelope = JSON.parse(snapshotJson) as StorageEnvelopeV3;
  } catch {
    throw new Error('INVALID_SNAPSHOT_JSON');
  }
  if (envelope.schemaVersion !== 3) throw new Error('UNSUPPORTED_STATE_VERSION');
  if (!Number.isSafeInteger(envelope.revision) || envelope.revision < 0) throw new Error('INVALID_REVISION');
  requireIdentifier(envelope.deviceId, 'DEVICE_ID');
  if (typeof envelope.savedAt !== 'string' || Number.isNaN(Date.parse(envelope.savedAt))) throw new Error('INVALID_SAVED_AT');
  validateDomainState(envelope.state);
  const transfer: PeerTransfer = {
    transferFormatVersion: PEER_TRANSFER_FORMAT_VERSION,
    snapshotJson,
    snapshotSha256,
    snapshotUtf8Bytes: actualBytes,
    summary: summarizeEnvelope(envelope),
  };
  return { transfer, envelope };
}

export function parseManualPeerAddress(value: string): { host: string; port: number } {
  const normalized = value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const match = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/.exec(normalized);
  if (!match || !isIpv4(match[1])) throw new Error('INVALID_PEER_ADDRESS');
  const port = Number(match[2]);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_PEER_PORT');
  return { host: match[1], port };
}

export function buildPeerConnectUri(target: PeerConnectTarget): string {
  const endpoint = parseManualPeerAddress(`${target.host}:${target.port}`);
  if (!/^\d{6}$/.test(target.pairingCode)) throw new Error('INVALID_PAIRING_CODE');
  const url = new URL('kgc://peer-connect');
  url.searchParams.set('v', String(PEER_PROTOCOL_VERSION));
  url.searchParams.set('host', endpoint.host);
  url.searchParams.set('port', String(endpoint.port));
  url.searchParams.set('code', target.pairingCode);
  if (target.deviceId) url.searchParams.set('device', requireIdentifier(target.deviceId, 'DEVICE_ID'));
  if (target.sessionId) url.searchParams.set('session', requireIdentifier(target.sessionId, 'SESSION_ID'));
  return url.toString();
}

export function parsePeerConnectUri(value: string): PeerConnectTarget {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('INVALID_PEER_LINK');
  }
  const webViewRoute = /^\/\/([^/?#]+)/.exec(url.pathname)?.[1] || '';
  const route = (url.hostname || webViewRoute).toLowerCase();
  if (url.protocol !== 'kgc:' || route !== 'peer-connect') throw new Error('INVALID_PEER_LINK');
  if (url.searchParams.get('v') !== String(PEER_PROTOCOL_VERSION)) throw new Error('UNSUPPORTED_PEER_PROTOCOL');
  const endpoint = parseManualPeerAddress(`${url.searchParams.get('host') || ''}:${url.searchParams.get('port') || ''}`);
  const pairingCode = url.searchParams.get('code') || '';
  if (!/^\d{6}$/.test(pairingCode)) throw new Error('INVALID_PAIRING_CODE');
  const deviceId = url.searchParams.get('device') || undefined;
  const sessionId = url.searchParams.get('session') || undefined;
  return {
    ...endpoint,
    pairingCode,
    ...(deviceId ? { deviceId: requireIdentifier(deviceId, 'DEVICE_ID') } : {}),
    ...(sessionId ? { sessionId: requireIdentifier(sessionId, 'SESSION_ID') } : {}),
  };
}

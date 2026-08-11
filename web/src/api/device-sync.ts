import { App as CapApp } from '@capacitor/app';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { readonly, shallowRef } from 'vue';
import { confirmDialog } from '../lib/appDialog';
import { setComputerSyncEnabled } from './computer-sync';
import {
  buildPeerConnectUri,
  parsePeerConnectUri,
  parsePeerTransfer,
  type PeerConnectTarget,
  type PeerSnapshotSummary,
  type PeerTransfer,
} from './peer-transfer';
import {
  exportLocalPeerRecoveryPoint,
  exportLocalPeerTransfer,
  replaceLocalStateFromPeer,
} from './sync';

const DISCOVERABLE_KEY = 'kgc-device-sync-discoverable';
const SEARCHING_KEY = 'kgc-device-sync-searching';

export interface PeerDevice {
  deviceId: string;
  name: string;
  host: string;
  port: number;
  platform: string;
  appVersion: string;
  online: boolean;
  lastSeenAt: string;
}

export interface HostingInfo {
  deviceId: string;
  name: string;
  address: string;
  port: number;
  pairingCode: string;
  sessionId: string;
  expiresAt: string;
  qrUri: string;
}

export interface RecoveryPoint {
  id: string;
  createdAt: string;
  sourceName: string;
  sourceDeviceId: string;
  utf8Bytes: number;
  sha256: string;
  summary: PeerSnapshotSummary;
}

interface IncomingRequestEvent {
  requestId: string;
  kind: 'push-offer' | 'pull-offer';
  sourceDevice: PeerDevice;
  summary?: PeerSnapshotSummary;
}

interface IncomingSnapshotEvent {
  requestId: string;
  sourceDevice: PeerDevice;
  transfer: PeerTransfer;
}

interface NativeDeviceSyncPlugin {
  startHosting(options: { deviceId: string; appVersion: string; protocolVersion: number }): Promise<Omit<HostingInfo, 'qrUri'>>;
  stopHosting(): Promise<void>;
  startDiscovery(options: { deviceId: string }): Promise<void>;
  stopDiscovery(): Promise<void>;
  push(options: { peer: PeerDevice; pairingCode: string; transfer: PeerTransfer }): Promise<{ requestId: string; status: string }>;
  pull(options: { peer: PeerDevice; pairingCode: string }): Promise<{ requestId: string; transfer: PeerTransfer }>;
  completePull(options: { requestId: string; committed: boolean; error?: string }): Promise<void>;
  approveIncoming(options: { requestId: string; accepted: boolean; transfer?: PeerTransfer }): Promise<void>;
  completeIncoming(options: { requestId: string; committed: boolean; error?: string }): Promise<void>;
  saveRecoveryPoint(options: { bundleJson: string; sourceName: string; sourceDeviceId: string; summary: PeerSnapshotSummary }): Promise<RecoveryPoint>;
  listRecoveryPoints(): Promise<{ points: RecoveryPoint[] }>;
  readRecoveryPoint(options: { id: string }): Promise<{ point: RecoveryPoint; bundleJson: string }>;
  addListener(eventName: 'peerFound', listener: (event: PeerDevice) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'peerLost', listener: (event: { deviceId: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'incomingRequest', listener: (event: IncomingRequestEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'incomingSnapshot', listener: (event: IncomingSnapshotEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'hostingChanged', listener: (event: Omit<HostingInfo, 'qrUri'>) => void): Promise<PluginListenerHandle>;
}

const NativeDeviceSync = registerPlugin<NativeDeviceSyncPlugin>('DeviceSync');
const nativeSupported = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const discoverable = shallowRef(localStorage.getItem(DISCOVERABLE_KEY) === 'true');
const searching = shallowRef(localStorage.getItem(SEARCHING_KEY) === 'true');
const foreground = shallowRef(true);
const hostingInfo = shallowRef<HostingInfo | null>(null);
const peers = shallowRef<PeerDevice[]>([]);
const recoveryPoints = shallowRef<RecoveryPoint[]>([]);
const pendingPeerTarget = shallowRef<PeerConnectTarget | null>(null);
const statusMessage = shallowRef('');
const busy = shallowRef(false);
const searchRevision = shallowRef(0);
const successRevision = shallowRef(0);
const peerRevision = shallowRef(0);
const listeners: PluginListenerHandle[] = [];
let initialized = false;
let localDeviceId = '';

export const deviceSyncState = {
  supported: nativeSupported,
  discoverable: readonly(discoverable),
  searching: readonly(searching),
  foreground: readonly(foreground),
  hostingInfo: readonly(hostingInfo),
  peers: readonly(peers),
  recoveryPoints: readonly(recoveryPoints),
  pendingPeerTarget: readonly(pendingPeerTarget),
  statusMessage: readonly(statusMessage),
  busy: readonly(busy),
  searchRevision: readonly(searchRevision),
  successRevision: readonly(successRevision),
  peerRevision: readonly(peerRevision),
};

function appVersion(): string {
  return String(import.meta.env.VITE_APP_VERSION || '0.10.0');
}

function normalizePeer(peer: PeerDevice): PeerDevice {
  return {
    ...peer,
    port: Number(peer.port),
    online: peer.online !== false,
    lastSeenAt: peer.lastSeenAt || new Date().toISOString(),
  };
}

function rememberPeer(peer: PeerDevice) {
  if (!peer.deviceId || peer.deviceId === localDeviceId) return;
  const next = peers.value.slice();
  const index = next.findIndex((item) => item.deviceId === peer.deviceId);
  const normalized = normalizePeer(peer);
  if (index >= 0) next[index] = normalized;
  else next.push(normalized);
  peers.value = next.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  peerRevision.value += 1;
}

function markPeerLost(deviceId: string) {
  const next = peers.value.map((peer) => peer.deviceId === deviceId ? { ...peer, online: false } : peer);
  peers.value = next;
  window.setTimeout(() => {
    peers.value = peers.value.filter((peer) => peer.deviceId !== deviceId || peer.online);
  }, 2500);
}

function withQr(info: Omit<HostingInfo, 'qrUri'>): HostingInfo {
  return {
    ...info,
    qrUri: buildPeerConnectUri({
      host: info.address,
      port: info.port,
      pairingCode: info.pairingCode,
      deviceId: info.deviceId,
      sessionId: info.sessionId,
    }),
  };
}

function summaryText(summary?: PeerSnapshotSummary): string {
  if (!summary) return '对方未提供记录摘要';
  return `${summary.taskCount} 个项目，${summary.progressCount} 条打卡，${summary.timerCount} 条计时，${summary.drillCount} 条训练`;
}

async function ensureIdentity(): Promise<string> {
  if (localDeviceId) return localDeviceId;
  const { envelope } = await parsePeerTransfer(await exportLocalPeerTransfer());
  localDeviceId = envelope.deviceId;
  return localDeviceId;
}

async function startHostingIfNeeded() {
  if (!nativeSupported || !foreground.value || !discoverable.value || hostingInfo.value) return;
  const info = await NativeDeviceSync.startHosting({
    deviceId: await ensureIdentity(),
    appVersion: appVersion(),
    protocolVersion: 1,
  });
  hostingInfo.value = withQr(info);
}

async function startDiscoveryIfNeeded() {
  if (!nativeSupported || !foreground.value || !searching.value) return;
  await NativeDeviceSync.startDiscovery({ deviceId: await ensureIdentity() });
  searchRevision.value += 1;
}

async function applyIncomingTransfer(
  transfer: PeerTransfer,
  source: Pick<PeerDevice, 'deviceId' | 'name'>,
): Promise<void> {
  const parsed = await parsePeerTransfer(transfer);
  const recovery = await exportLocalPeerRecoveryPoint();
  await NativeDeviceSync.saveRecoveryPoint({
    bundleJson: recovery.bundleJson,
    sourceName: source.name,
    sourceDeviceId: source.deviceId,
    summary: recovery.transfer.summary,
  });
  await setComputerSyncEnabled(false);
  await replaceLocalStateFromPeer(parsed.transfer);
  await refreshRecoveryPoints();
  successRevision.value += 1;
  statusMessage.value = `已接收 ${source.name} 的记录，电脑同步已暂停`;
}

async function handleIncomingRequest(event: IncomingRequestEvent) {
  if (event.kind === 'push-offer') {
    const accepted = await confirmDialog({
      title: `接收“${event.sourceDevice.name}”的记录`,
      message: `本机现有记录将被完整替换。对方记录包含：${summaryText(event.summary)}。`,
      details: ['替换前会自动创建恢复点', '电脑同步会暂停，避免旧快照覆盖新记录'],
      confirmLabel: '允许接收',
      variant: 'danger',
    });
    await NativeDeviceSync.approveIncoming({ requestId: event.requestId, accepted });
    if (!accepted) statusMessage.value = `已拒绝 ${event.sourceDevice.name} 的发送请求`;
    return;
  }

  const accepted = await confirmDialog({
    title: `向“${event.sourceDevice.name}”发送记录`,
    message: '对方请求获取本机的完整记录。发送不会修改本机数据。',
    details: ['任务、打卡、计时和训练记录都会发送', '仅本次请求有效'],
    confirmLabel: '允许发送',
    variant: 'warning',
  });
  if (!accepted) {
    await NativeDeviceSync.approveIncoming({ requestId: event.requestId, accepted: false });
    statusMessage.value = `已拒绝 ${event.sourceDevice.name} 的接收请求`;
    return;
  }
  const transfer = await exportLocalPeerTransfer();
  await NativeDeviceSync.approveIncoming({ requestId: event.requestId, accepted: true, transfer });
  statusMessage.value = `正在向 ${event.sourceDevice.name} 发送记录`;
}

async function handleIncomingSnapshot(event: IncomingSnapshotEvent) {
  try {
    await applyIncomingTransfer(event.transfer, event.sourceDevice);
    await NativeDeviceSync.completeIncoming({ requestId: event.requestId, committed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'REPLACE_FAILED';
    statusMessage.value = '接收失败，本机原记录已保留';
    await NativeDeviceSync.completeIncoming({ requestId: event.requestId, committed: false, error: message });
  }
}

async function applyLifecycle() {
  if (!nativeSupported) return;
  if (!foreground.value) {
    await Promise.allSettled([NativeDeviceSync.stopHosting(), NativeDeviceSync.stopDiscovery()]);
    hostingInfo.value = null;
    peers.value = [];
    return;
  }
  if (discoverable.value) await startHostingIfNeeded();
  else {
    await NativeDeviceSync.stopHosting();
    hostingInfo.value = null;
  }
  if (searching.value) await startDiscoveryIfNeeded();
  else {
    await NativeDeviceSync.stopDiscovery();
    peers.value = [];
  }
}

export async function initializeDeviceSync(onPeerLink?: () => void) {
  if (initialized || !nativeSupported) return;
  initialized = true;
  listeners.push(
    await NativeDeviceSync.addListener('peerFound', rememberPeer),
    await NativeDeviceSync.addListener('peerLost', ({ deviceId }) => markPeerLost(deviceId)),
    await NativeDeviceSync.addListener('incomingRequest', (event) => { void handleIncomingRequest(event); }),
    await NativeDeviceSync.addListener('incomingSnapshot', (event) => { void handleIncomingSnapshot(event); }),
    await NativeDeviceSync.addListener('hostingChanged', (event) => { hostingInfo.value = withQr(event); }),
    await CapApp.addListener('appStateChange', ({ isActive }) => {
      foreground.value = isActive;
      void applyLifecycle();
    }),
    await CapApp.addListener('appUrlOpen', ({ url }) => {
      try {
        pendingPeerTarget.value = parsePeerConnectUri(url);
        onPeerLink?.();
      } catch {
        statusMessage.value = '二维码连接信息无效或已不兼容';
      }
    }),
  );
  const launch = await CapApp.getLaunchUrl();
  if (launch?.url) {
    try {
      pendingPeerTarget.value = parsePeerConnectUri(launch.url);
      onPeerLink?.();
    } catch {
      // Ignore unrelated launch URLs.
    }
  }
  await refreshRecoveryPoints();
  await applyLifecycle();
}

export async function setDeviceDiscoverable(enabled: boolean) {
  const previous = discoverable.value;
  discoverable.value = enabled;
  localStorage.setItem(DISCOVERABLE_KEY, String(enabled));
  statusMessage.value = '';
  try {
    await applyLifecycle();
  } catch (error) {
    discoverable.value = previous;
    localStorage.setItem(DISCOVERABLE_KEY, String(previous));
    throw error;
  }
}

export async function setDeviceSearching(enabled: boolean) {
  const previous = searching.value;
  searching.value = enabled;
  localStorage.setItem(SEARCHING_KEY, String(enabled));
  statusMessage.value = '';
  try {
    await applyLifecycle();
  } catch (error) {
    searching.value = previous;
    localStorage.setItem(SEARCHING_KEY, String(previous));
    throw error;
  }
}

export function clearPendingPeerTarget() {
  pendingPeerTarget.value = null;
}

export async function sendRecordsToPeer(peer: PeerDevice, pairingCode: string) {
  const accepted = await confirmDialog({
    title: `向“${peer.name}”发送本机记录`,
    message: '对方确认后，其现有记录会被完整替换。本机记录不会改变。',
    confirmLabel: '发起发送',
    variant: 'warning',
  });
  if (!accepted) return false;
  busy.value = true;
  statusMessage.value = `等待 ${peer.name} 确认接收`;
  try {
    const transfer = await exportLocalPeerTransfer();
    await NativeDeviceSync.push({ peer, pairingCode, transfer });
    successRevision.value += 1;
    statusMessage.value = `已将记录发送给 ${peer.name}`;
    return true;
  } finally {
    busy.value = false;
  }
}

export async function receiveRecordsFromPeer(peer: PeerDevice, pairingCode: string) {
  const accepted = await confirmDialog({
    title: `接收“${peer.name}”的完整记录`,
    message: '本机任务、打卡、计时和训练记录会被对方记录完整替换。',
    details: ['替换前自动创建恢复点', '电脑同步会自动暂停'],
    confirmLabel: '发起接收',
    variant: 'danger',
  });
  if (!accepted) return false;
  busy.value = true;
  statusMessage.value = `等待 ${peer.name} 确认发送`;
  let requestId = '';
  try {
    const result = await NativeDeviceSync.pull({ peer, pairingCode });
    requestId = result.requestId;
    await applyIncomingTransfer(result.transfer, peer);
    await NativeDeviceSync.completePull({ requestId, committed: true });
    return true;
  } catch (error) {
    if (requestId) {
      const message = error instanceof Error ? error.message : 'REPLACE_FAILED';
      await NativeDeviceSync.completePull({ requestId, committed: false, error: message });
    }
    statusMessage.value = '接收失败，本机原记录已保留';
    throw error;
  } finally {
    busy.value = false;
  }
}

export async function refreshRecoveryPoints() {
  if (!nativeSupported) return;
  const result = await NativeDeviceSync.listRecoveryPoints();
  recoveryPoints.value = result.points || [];
}

export async function restoreRecoveryPoint(point: RecoveryPoint) {
  const accepted = await confirmDialog({
    title: '恢复这份设备备份',
    message: `将恢复 ${new Date(point.createdAt).toLocaleString('zh-CN')} 前后的本机记录。当前记录也会先生成一份恢复点。`,
    confirmLabel: '恢复记录',
    variant: 'danger',
  });
  if (!accepted) return false;
  busy.value = true;
  try {
    const current = await exportLocalPeerRecoveryPoint();
    await NativeDeviceSync.saveRecoveryPoint({
      bundleJson: current.bundleJson,
      sourceName: '恢复前的本机记录',
      sourceDeviceId: localDeviceId || 'local-device',
      summary: current.transfer.summary,
    });
    const saved = await NativeDeviceSync.readRecoveryPoint({ id: point.id });
    const bundle = JSON.parse(saved.bundleJson) as { transfer?: PeerTransfer };
    if (!bundle.transfer) throw new Error('RECOVERY_TRANSFER_MISSING');
    await setComputerSyncEnabled(false);
    await replaceLocalStateFromPeer(bundle.transfer);
    await refreshRecoveryPoints();
    successRevision.value += 1;
    statusMessage.value = '恢复完成，电脑同步保持暂停';
    return true;
  } finally {
    busy.value = false;
  }
}

export function peerFromTarget(target: PeerConnectTarget, name = '手动连接设备'): PeerDevice {
  return {
    deviceId: target.deviceId || `manual-${target.host}-${target.port}`,
    name,
    host: target.host,
    port: target.port,
    platform: 'Android',
    appVersion: '',
    online: true,
    lastSeenAt: new Date().toISOString(),
  };
}

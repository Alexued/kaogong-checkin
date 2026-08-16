import { App as CapApp } from '@capacitor/app';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { readonly, shallowRef } from 'vue';
import { confirmDialog } from '../lib/appDialog';
import { useAppStore } from '../stores/app';
import { setComputerSyncEnabled } from './computer-sync';
import { APP_VERSION } from './update';
import {
  buildPeerConnectUri,
  PEER_PROTOCOL_VERSION,
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
const DEVICE_ID_KEY = 'kgc-device-sync-id-v1';

export interface PeerDevice {
  deviceId: string;
  name: string;
  model: string;
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
  model: string;
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
  sourceModel: string;
  utf8Bytes: number;
  sha256: string;
  summary: PeerSnapshotSummary;
}

export interface LocalDeviceInfo {
  deviceId: string;
  name: string;
  model: string;
  platform: string;
  appVersion: string;
}

export interface PairedDevice {
  deviceId: string;
  name: string;
  model: string;
  accentIndex: number;
  pairedAt: string;
  lastSeenAt: string;
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

interface IncomingPairRequestEvent {
  requestId: string;
  sourceDevice: PeerDevice;
}

interface NativeDeviceSyncPlugin {
  configureIdentity(options: { deviceId: string; appVersion: string }): Promise<LocalDeviceInfo>;
  startHosting(options: { deviceId: string; appVersion: string; protocolVersion: number }): Promise<Omit<HostingInfo, 'qrUri'>>;
  stopHosting(): Promise<void>;
  startDiscovery(options: { deviceId: string }): Promise<void>;
  stopDiscovery(): Promise<void>;
  requestPairing(options: { peer: PeerDevice; pairingCode: string }): Promise<{ pairedDevice: PairedDevice }>;
  approvePairing(options: { requestId: string; accepted: boolean }): Promise<void>;
  listPairedDevices(): Promise<{ devices: PairedDevice[] }>;
  forgetPairing(options: { deviceId: string }): Promise<void>;
  scanPeerQr(): Promise<{ cancelled: boolean; value?: string }>;
  push(options: { peer: PeerDevice; transfer: PeerTransfer }): Promise<{ requestId: string; status: string }>;
  pull(options: { peer: PeerDevice }): Promise<{ requestId: string; transfer: PeerTransfer }>;
  completePull(options: { requestId: string; committed: boolean; error?: string }): Promise<void>;
  approveIncoming(options: { requestId: string; accepted: boolean; transfer?: PeerTransfer }): Promise<void>;
  completeIncoming(options: { requestId: string; committed: boolean; error?: string }): Promise<void>;
  saveRecoveryPoint(options: { bundleJson: string; sourceName: string; sourceDeviceId: string; sourceModel: string; summary: PeerSnapshotSummary }): Promise<RecoveryPoint>;
  listRecoveryPoints(): Promise<{ points: RecoveryPoint[] }>;
  readRecoveryPoint(options: { id: string }): Promise<{ point: RecoveryPoint; bundleJson: string }>;
  addListener(eventName: 'peerFound', listener: (event: PeerDevice) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'peerLost', listener: (event: { deviceId: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'incomingRequest', listener: (event: IncomingRequestEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'incomingSnapshot', listener: (event: IncomingSnapshotEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'incomingPairRequest', listener: (event: IncomingPairRequestEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'pairingChanged', listener: (event: { deviceId: string; paired: boolean; pairedDevice?: PairedDevice }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'hostingChanged', listener: (event: Omit<HostingInfo, 'qrUri'>) => void): Promise<PluginListenerHandle>;
}

const NativeDeviceSync = registerPlugin<NativeDeviceSyncPlugin>('DeviceSync');
const nativeSupported = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const discoverable = shallowRef(localStorage.getItem(DISCOVERABLE_KEY) === 'true');
const searching = shallowRef(localStorage.getItem(SEARCHING_KEY) === 'true');
const foreground = shallowRef(true);
const hostingInfo = shallowRef<HostingInfo | null>(null);
const localDeviceInfo = shallowRef<LocalDeviceInfo | null>(null);
const peers = shallowRef<PeerDevice[]>([]);
const pairedDevices = shallowRef<PairedDevice[]>([]);
const recoveryPoints = shallowRef<RecoveryPoint[]>([]);
const pendingPeerTarget = shallowRef<PeerConnectTarget | null>(null);
const statusMessage = shallowRef('');
const busy = shallowRef(false);
const searchRevision = shallowRef(0);
const successRevision = shallowRef(0);
const peerRevision = shallowRef(0);
const pairingRevision = shallowRef(0);
const listeners: PluginListenerHandle[] = [];
let initialized = false;
let localDeviceId = '';

export const deviceSyncState = {
  supported: nativeSupported,
  discoverable: readonly(discoverable),
  searching: readonly(searching),
  foreground: readonly(foreground),
  hostingInfo: readonly(hostingInfo),
  localDeviceInfo: readonly(localDeviceInfo),
  peers: readonly(peers),
  pairedDevices: readonly(pairedDevices),
  recoveryPoints: readonly(recoveryPoints),
  pendingPeerTarget: readonly(pendingPeerTarget),
  statusMessage: readonly(statusMessage),
  busy: readonly(busy),
  searchRevision: readonly(searchRevision),
  successRevision: readonly(successRevision),
  peerRevision: readonly(peerRevision),
  pairingRevision: readonly(pairingRevision),
};

function normalizePeer(peer: PeerDevice): PeerDevice {
  return {
    ...peer,
    model: peer.model || peer.name || 'Android 设备',
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
  const stored = localStorage.getItem(DEVICE_ID_KEY)?.trim() || '';
  localDeviceId = stored.length >= 8
    ? stored
    : (crypto.randomUUID?.() || `device-${Date.now().toString(36)}`);
  try { localStorage.setItem(DEVICE_ID_KEY, localDeviceId); } catch {
    /* Discovery remains available even when WebView storage is full. */
  }
  return localDeviceId;
}

async function startHostingIfNeeded() {
  if (!nativeSupported || !discoverable.value || hostingInfo.value) return;
  const info = await NativeDeviceSync.startHosting({
    deviceId: await ensureIdentity(),
    appVersion: APP_VERSION,
    protocolVersion: PEER_PROTOCOL_VERSION,
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
  const wasRecoveryRequired = useAppStore().recoveryRequired;
  if (!wasRecoveryRequired) {
    const recovery = await exportLocalPeerRecoveryPoint();
    const local = localDeviceInfo.value;
    await NativeDeviceSync.saveRecoveryPoint({
      bundleJson: recovery.bundleJson,
      sourceName: local?.name || '本机记录',
      sourceDeviceId: local?.deviceId || localDeviceId || 'local-device',
      sourceModel: local?.model || 'Android 设备',
      summary: recovery.transfer.summary,
    });
  }
  await setComputerSyncEnabled(false);
  await replaceLocalStateFromPeer(parsed.transfer);
  await refreshRecoveryPoints();
  successRevision.value += 1;
  statusMessage.value = wasRecoveryRequired
    ? `已用 ${source.name} 的记录完成恢复，电脑同步已暂停`
    : `已接收 ${source.name} 的记录，电脑同步已暂停`;
}

async function handleIncomingPairRequest(event: IncomingPairRequestEvent) {
  const accepted = await confirmDialog({
    title: `与“${event.sourceDevice.name}”配对`,
    message: '接受后，这两台设备以后传输记录时不再重复输入六位码。',
    details: ['每次发送或完整替换仍需要目标设备确认', `对方机型：${event.sourceDevice.model || 'Android 设备'}`],
    confirmLabel: '接受配对',
    cancelLabel: '拒绝配对',
    variant: 'warning',
    explicitDecision: true,
  });
  await NativeDeviceSync.approvePairing({ requestId: event.requestId, accepted });
  statusMessage.value = accepted
    ? `已接受 ${event.sourceDevice.name} 的配对请求，正在完成确认`
    : `已拒绝 ${event.sourceDevice.name} 的配对请求`;
}

async function handleIncomingRequest(event: IncomingRequestEvent) {
  if (event.kind === 'push-offer') {
    const accepted = await confirmDialog({
      title: `接收“${event.sourceDevice.name}”的记录`,
      message: `本机现有记录将被完整替换。对方记录包含：${summaryText(event.summary)}。`,
      details: useAppStore().recoveryRequired
        ? ['原始迁移备份仍会保留', '电脑同步会暂停，避免旧快照覆盖新记录']
        : ['替换前会自动创建恢复点', '电脑同步会暂停，避免旧快照覆盖新记录'],
      confirmLabel: '允许接收',
      cancelLabel: '拒绝本次',
      variant: 'danger',
      explicitDecision: true,
    });
    await NativeDeviceSync.approveIncoming({ requestId: event.requestId, accepted });
    if (!accepted) statusMessage.value = `已拒绝 ${event.sourceDevice.name} 的发送请求`;
    return;
  }

  if (useAppStore().recoveryRequired) {
    await NativeDeviceSync.approveIncoming({ requestId: event.requestId, accepted: false });
    statusMessage.value = '本机数据尚未恢复，不能向外发送；可以从另一台设备接收记录';
    return;
  }

  const accepted = await confirmDialog({
    title: `向“${event.sourceDevice.name}”发送记录`,
    message: '对方请求获取本机的完整记录。发送不会修改本机数据。',
    details: ['任务、打卡、计时和训练记录都会发送', '仅本次请求有效'],
    confirmLabel: '允许发送',
    cancelLabel: '拒绝本次',
    variant: 'warning',
    explicitDecision: true,
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
  if (discoverable.value) await startHostingIfNeeded();
  else {
    await NativeDeviceSync.stopHosting();
    hostingInfo.value = null;
  }
  if (!foreground.value) {
    await NativeDeviceSync.stopDiscovery();
    peers.value = [];
    return;
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
  localDeviceInfo.value = await NativeDeviceSync.configureIdentity({
    deviceId: await ensureIdentity(),
    appVersion: APP_VERSION,
  });
  listeners.push(
    await NativeDeviceSync.addListener('peerFound', rememberPeer),
    await NativeDeviceSync.addListener('peerLost', ({ deviceId }) => markPeerLost(deviceId)),
    await NativeDeviceSync.addListener('incomingRequest', (event) => { void handleIncomingRequest(event); }),
    await NativeDeviceSync.addListener('incomingSnapshot', (event) => { void handleIncomingSnapshot(event); }),
    await NativeDeviceSync.addListener('incomingPairRequest', (event) => { void handleIncomingPairRequest(event); }),
    await NativeDeviceSync.addListener('pairingChanged', () => { void refreshPairedDevices(); }),
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
  await refreshPairedDevices();
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

export async function refreshPairedDevices() {
  if (!nativeSupported) return;
  const result = await NativeDeviceSync.listPairedDevices();
  pairedDevices.value = (result.devices || []).map((device) => ({
    ...device,
    accentIndex: Math.max(0, Math.min(5, Number(device.accentIndex) || 0)),
  }));
  pairingRevision.value += 1;
}

export async function pairWithPeer(peer: PeerDevice, pairingCode: string) {
  if (!/^\d{6}$/.test(pairingCode)) throw new Error('PAIRING_CODE_INVALID');
  busy.value = true;
  statusMessage.value = `等待 ${peer.name} 接受配对`;
  try {
    await NativeDeviceSync.requestPairing({ peer, pairingCode });
    await refreshPairedDevices();
    successRevision.value += 1;
    statusMessage.value = `已与 ${peer.name} 配对`;
    return true;
  } finally {
    busy.value = false;
  }
}

export async function scanPeerPairingQr(): Promise<PeerConnectTarget | null> {
  const result = await NativeDeviceSync.scanPeerQr();
  if (result.cancelled || !result.value) return null;
  return parsePeerConnectUri(result.value);
}

export async function forgetPeerPairing(peer: Pick<PeerDevice, 'deviceId' | 'name'>) {
  const accepted = await confirmDialog({
    title: `解除与“${peer.name}”的配对`,
    message: '解除后，下次传输前需要重新输入六位码或扫描二维码。',
    confirmLabel: '解除配对',
    variant: 'danger',
  });
  if (!accepted) return false;
  await NativeDeviceSync.forgetPairing({ deviceId: peer.deviceId });
  await refreshPairedDevices();
  statusMessage.value = `已解除与 ${peer.name} 的配对`;
  return true;
}

export async function sendRecordsToPeer(peer: PeerDevice) {
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
    await NativeDeviceSync.push({ peer, transfer });
    successRevision.value += 1;
    statusMessage.value = `已将记录发送给 ${peer.name}`;
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('PAIRING')) await refreshPairedDevices();
    throw error;
  } finally {
    busy.value = false;
  }
}

export async function receiveRecordsFromPeer(peer: PeerDevice) {
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
    const result = await NativeDeviceSync.pull({ peer });
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
    if (error instanceof Error && error.message.includes('PAIRING')) await refreshPairedDevices();
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
    if (!useAppStore().recoveryRequired) {
      const current = await exportLocalPeerRecoveryPoint();
      await NativeDeviceSync.saveRecoveryPoint({
        bundleJson: current.bundleJson,
        sourceName: localDeviceInfo.value?.name || '恢复前的本机记录',
        sourceDeviceId: localDeviceInfo.value?.deviceId || localDeviceId || 'local-device',
        sourceModel: localDeviceInfo.value?.model || 'Android 设备',
        summary: current.transfer.summary,
      });
    }
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
    model: name,
    host: target.host,
    port: target.port,
    platform: 'Android',
    appVersion: '',
    online: true,
    lastSeenAt: new Date().toISOString(),
  };
}

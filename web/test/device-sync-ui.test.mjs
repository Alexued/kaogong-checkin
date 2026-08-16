import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [panel, settings, service, sync, plugin, manifest, mainActivity, router, androidBuild] = await Promise.all([
  readFile(new URL('../src/components/DeviceSyncPanel.vue', import.meta.url), 'utf8'),
  readFile(new URL('../src/views/SettingsView.vue', import.meta.url), 'utf8'),
  readFile(new URL('../src/api/device-sync.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/api/sync.ts', import.meta.url), 'utf8'),
  readFile(new URL('../android/app/src/main/java/com/wjy/kaogong/DeviceSyncPlugin.java', import.meta.url), 'utf8'),
  readFile(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8'),
  readFile(new URL('../android/app/src/main/java/com/wjy/kaogong/MainActivity.java', import.meta.url), 'utf8'),
  readFile(new URL('../src/router.ts', import.meta.url), 'utf8'),
  readFile(new URL('../android/app/build.gradle', import.meta.url), 'utf8'),
]);

test('device direct sync exposes two independent switches and explicit send/receive actions', () => {
  assert.match(panel, /允许附近设备发现本机/);
  assert.match(panel, /主动搜索附近设备/);
  assert.match(panel, /@change="toggleDiscoverable"/);
  assert.match(panel, /@change="toggleSearching"/);
  assert.match(panel, /发送本机记录/);
  assert.match(panel, /接收对方记录/);
  assert.match(panel, /应用内扫码/);
  assert.match(panel, /发送配对请求/);
  assert.match(panel, /paired: isPaired\(peer\)/);
  assert.doesNotMatch(panel, /使用地址和配对码/);
  assert.match(panel, /PixelGrid/);
  assert.match(panel, /当前可发现和接收设备/);
  assert.match(panel, /store\.recoveryRequired/);
  assert.match(panel, /data-back-priority="175"/);
});

test('settings keeps connection summaries on the root and details on secondary routes', () => {
  assert.match(settings, /连接与同步/);
  assert.match(settings, /to="\/settings\/device-sync"/);
  assert.match(settings, /to="\/settings\/computer-sync"/);
  assert.match(settings, /section === 'device'/);
  assert.match(settings, /section === 'computer'/);
  assert.match(router, /path: '\/settings\/device-sync'[\s\S]*parentPath: '\/settings'[\s\S]*rootTab: '\/settings'/);
  assert.match(router, /path: '\/settings\/computer-sync'[\s\S]*parentPath: '\/settings'[\s\S]*rootTab: '\/settings'/);
});

test('discovery identity is independent from business data recovery', () => {
  const identity = service.slice(
    service.indexOf('async function ensureIdentity'),
    service.indexOf('async function startHostingIfNeeded'),
  );
  assert.match(identity, /DEVICE_ID_KEY/);
  assert.match(identity, /crypto\.randomUUID/);
  assert.doesNotMatch(identity, /exportLocalPeerTransfer/);

  const incoming = service.slice(
    service.indexOf('async function applyIncomingTransfer'),
    service.indexOf('async function handleIncomingRequest'),
  );
  assert.match(incoming, /wasRecoveryRequired/);
  assert.match(incoming, /replaceLocalStateFromPeer/);
});

test('peer replacement archives the old queue, disables computer sync and commits one full v3 state', () => {
  const replacement = sync.slice(sync.indexOf('export async function replaceLocalStateFromPeer'));
  assert.match(replacement, /parsePeerTransfer/);
  assert.match(replacement, /persistSyncEnabled\(false\)/);
  assert.match(replacement, /archivePeerQueue\(previousQueue\)/);
  assert.match(replacement, /v3Repository\.replaceFromExternal\(envelope\.state\)/);
  assert.match(replacement, /queue = \[\]/);
  assert.doesNotMatch(replacement, /replayPendingLocally/);
  assert.match(service, /saveRecoveryPoint[\s\S]*setComputerSyncEnabled\(false\)[\s\S]*replaceLocalStateFromPeer/);
  assert.match(replacement, /replaceFromExternal/);
  assert.match(replacement, /store\.recoveryRequired = false/);
});

test('computer overwrite uses the local candidate without fetching computer state first', () => {
  const overwrite = sync.slice(
    sync.indexOf('export async function overwriteComputerWithLocal'),
    sync.indexOf('export async function backupLocalStateToComputer'),
  );
  assert.match(overwrite, /localOverwriteCandidate \|\| currentState\(\)/);
  assert.match(overwrite, /fetchInfo/);
  assert.match(overwrite, /replaceState\(outgoing/);
  assert.doesNotMatch(overwrite, /fetchState/);
  assert.match(panel, /接收后会自动退出只读模式/);
  assert.match(settings, /用本机完整覆盖电脑/);
  assert.match(settings, /电脑会自动保留覆盖前恢复副本/);
});

test('recovery protection point reuses one coherent export and one repository commit', () => {
  const recoveryExport = sync.slice(
    sync.indexOf('export async function exportLocalPeerRecoveryPoint'),
    sync.indexOf('export async function replaceLocalStateFromPeer'),
  );
  assert.match(recoveryExport, /const transfer = await exportLocalPeerTransfer\(\)/);
  assert.match(recoveryExport, /return \{ bundleJson, transfer \}/);
  assert.doesNotMatch(recoveryExport, /structuredClone/);

  const restore = service.slice(
    service.indexOf('export async function restoreRecoveryPoint'),
    service.indexOf('export function peerFromTarget'),
  );
  assert.equal((restore.match(/exportLocalPeerRecoveryPoint\(\)/g) || []).length, 1);
  assert.doesNotMatch(restore, /exportLocalPeerTransfer\(\)/);
  assert.match(restore, /summary: current\.transfer\.summary/);
});

test('Android plugin owns NSD, framed TCP, approval, rate limiting and five atomic recovery points', () => {
  assert.match(plugin, /_kgc-sync\._tcp\./);
  assert.match(plugin, /new ServerSocket/);
  assert.match(plugin, /writeInt\(bytes\.length\)/);
  assert.match(plugin, /incomingRequest/);
  assert.match(plugin, /WAITING_APPROVAL/);
  assert.match(plugin, /MAX_PAIRING_FAILURES = 5/);
  assert.match(plugin, /stream\.getFD\(\)\.sync\(\)/);
  assert.match(plugin, /for \(int index = 5;/);
  assert.match(mainActivity, /registerPlugin\(DeviceSyncPlugin\.class\)/);
  assert.match(manifest, /android:scheme="kgc" android:host="peer-connect"/);
});

test('Android pairing v2 persists native-only tokens and completes a two-sided acknowledgement', () => {
  assert.match(plugin, /PROTOCOL_VERSION = 2/);
  assert.match(plugin, /SharedPreferences pairingPreferences/);
  assert.match(plugin, /public void requestPairing/);
  assert.match(plugin, /public void approvePairing/);
  assert.match(plugin, /"paired-ack"/);
  assert.match(plugin, /waitForPairingAck/);
  assert.match(plugin, /new byte\[32\]/);
  assert.match(plugin, /MessageDigest\.isEqual/);
  assert.match(plugin, /PAIRING_KEY_PREFIX/);
  assert.match(plugin, /public void forgetPairing/);
  assert.match(service, /NativeDeviceSync\.push\(\{ peer, transfer \}\)/);
  assert.match(service, /NativeDeviceSync\.pull\(\{ peer \}\)/);
  assert.doesNotMatch(service, /NativeDeviceSync\.push\(\{ peer, pairingCode/);
});

test('pairing QR scan stays inside the Android app and validates through the web parser', () => {
  assert.match(plugin, /public void scanPeerQr/);
  assert.match(plugin, /PeerQrCaptureActivity\.class/);
  assert.match(plugin, /IntentIntegrator\.QR_CODE/);
  assert.match(service, /return parsePeerConnectUri\(result\.value\)/);
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /\.PeerQrCaptureActivity/);
  assert.match(androidBuild, /zxing-android-embedded:4\.3\.0/);
});

test('device discovery advertises the canonical app version and serializes Android NSD resolution', () => {
  assert.match(service, /import \{ APP_VERSION \} from '\.\/update'/);
  assert.match(service, /appVersion: APP_VERSION/);
  assert.doesNotMatch(service, /VITE_APP_VERSION|0\.12\.0/);
  assert.match(plugin, /isOwnServiceName\(serviceName\)/);
  assert.match(plugin, /pendingResolveNames/);
  assert.match(plugin, /RESOLVE_GAP_MS = 250L/);
  assert.match(plugin, /RESOLVE_RETRY_DELAYS_MS/);
  assert.match(plugin, /candidate\.retry\(\)/);
  assert.match(plugin, /localServicePrefix\(\) \+ "-" \+ suffix/);
  assert.match(plugin, /sessionId\.substring/);
  assert.match(plugin, /CONNECT_RETRY_DELAYS_MS/);
  assert.match(plugin, /Thread\.sleep\(CONNECT_RETRY_DELAYS_MS\[attempt\]\)/);
});

test('Android discovery restart waits for the previous NSD session to stop', () => {
  assert.match(plugin, /DISCOVERY_STOP_TIMEOUT_MS = 2_000L/);
  assert.match(plugin, /discoveryStopCallbacks/);
  assert.match(plugin, /discoveryStopping/);
  assert.match(plugin, /stopDiscoveryInternal\(\(\) -> \{/);
  assert.match(plugin, /onDiscoveryStopped\(String serviceType\) \{ finishDiscoveryStop\(this\); \}/);
  assert.match(plugin, /completeDiscoveryStopLocked/);
  assert.match(plugin, /resolving\.set\(false\)/);
  assert.match(plugin, /invalidateDiscoveryRequests\(\)/);
});

test('Android discovery has a bounded UDP broadcast fallback without pairing secrets', () => {
  assert.match(plugin, /PEER_DISCOVERY_PORT = 43_879/);
  assert.match(plugin, /MAX_PEER_DISCOVERY_BYTES = 2_048/);
  assert.match(plugin, /PEER_ADVERTISEMENT_INTERVAL_MS = 1_500L/);
  assert.match(plugin, /PEER_PROBE_INTERVAL_MS = 1_000L/);
  assert.match(plugin, /startPeerAdvertising\(\)/);
  assert.match(plugin, /startPeerSearchFallback\(\)/);
  assert.match(plugin, /peerProbe = scheduler\.scheduleAtFixedRate/);
  assert.match(plugin, /kgc-peer-probe-v2/);
  assert.match(plugin, /respondToPeerProbe/);
  assert.match(plugin, /sendPeerAdvertisement\(peerDiscoverySocket/);
  assert.match(plugin, /boolean udpStarted = startPeerSearchFallback\(\)/);
  assert.match(plugin, /if \(udpStarted\) \{\s*call\.resolve\(\)/);
  assert.match(plugin, /packet\.getAddress\(\)\.getHostAddress\(\)/);
  assert.match(plugin, /closePeerDiscoverySocketIfIdle\(\)/);
  const advertisement = plugin.slice(
    plugin.indexOf('private void broadcastPeerAdvertisement'),
    plugin.indexOf('private List<InetAddress> peerBroadcastAddresses'),
  );
  assert.match(advertisement, /"kgc-peer-v2"/);
  assert.match(advertisement, /"protocolVersion"/);
  assert.match(advertisement, /"deviceId"/);
  assert.match(advertisement, /"port"/);
  assert.doesNotMatch(advertisement, /pairingCode|snapshot|recovery/);
});

test('incoming decisions are explicit and an enabled host survives a brief Android pause', () => {
  const incoming = service.slice(
    service.indexOf('async function handleIncomingRequest'),
    service.indexOf('async function handleIncomingSnapshot'),
  );
  assert.equal((incoming.match(/explicitDecision: true/g) || []).length, 2);
  assert.equal((incoming.match(/cancelLabel: '拒绝本次'/g) || []).length, 2);

  const pause = plugin.slice(
    plugin.indexOf('protected void handleOnPause()'),
    plugin.indexOf('protected void handleOnDestroy()'),
  );
  assert.match(pause, /stopDiscoveryInternal\(\)/);
  assert.doesNotMatch(pause, /stopHostingInternal\(\)/);
  assert.doesNotMatch(pause, /cancelIncoming\(\)/);

  const lifecycle = service.slice(
    service.indexOf('async function applyLifecycle'),
    service.indexOf('export async function initializeDeviceSync'),
  );
  assert.match(lifecycle, /discoverable\.value[\s\S]*startHostingIfNeeded/);
  assert.match(lifecycle, /!foreground\.value[\s\S]*stopDiscovery/);
  assert.doesNotMatch(lifecycle, /!foreground\.value[\s\S]*stopHosting/);
});

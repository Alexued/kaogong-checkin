import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [panel, service, sync, plugin, manifest, mainActivity] = await Promise.all([
  readFile(new URL('../src/components/DeviceSyncPanel.vue', import.meta.url), 'utf8'),
  readFile(new URL('../src/api/device-sync.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/api/sync.ts', import.meta.url), 'utf8'),
  readFile(new URL('../android/app/src/main/java/com/wjy/kaogong/DeviceSyncPlugin.java', import.meta.url), 'utf8'),
  readFile(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8'),
  readFile(new URL('../android/app/src/main/java/com/wjy/kaogong/MainActivity.java', import.meta.url), 'utf8'),
]);

test('device direct sync exposes two independent switches and explicit send/receive actions', () => {
  assert.match(panel, /允许附近设备发现本机/);
  assert.match(panel, /主动搜索附近设备/);
  assert.match(panel, /@change="toggleDiscoverable"/);
  assert.match(panel, /@change="toggleSearching"/);
  assert.match(panel, /发送本机记录/);
  assert.match(panel, /接收对方记录/);
  assert.match(panel, /系统相机扫描/);
  assert.match(panel, /PixelGrid/);
});

test('peer replacement archives the old queue, disables computer sync and commits one full v3 state', () => {
  const replacement = sync.slice(sync.indexOf('export async function replaceLocalStateFromPeer'));
  assert.match(replacement, /parsePeerTransfer/);
  assert.match(replacement, /persistSyncEnabled\(false\)/);
  assert.match(replacement, /archivePeerQueue\(previousQueue\)/);
  assert.match(replacement, /v3Repository\.commit\(envelope\.state, \[\]\)/);
  assert.match(replacement, /queue = \[\]/);
  assert.doesNotMatch(replacement, /replayPendingLocally/);
  assert.match(service, /saveRecoveryPoint[\s\S]*setComputerSyncEnabled\(false\)[\s\S]*replaceLocalStateFromPeer/);
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

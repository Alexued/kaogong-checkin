import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advertisedApkFingerprint,
  automaticUpdateFingerprint,
} from '../src/api/update-automation.ts';

test('automatic updates use GitHub while computer sync is disabled', () => {
  assert.equal(
    automaticUpdateFingerprint(false, '192.168.1.8:8321', '0.7.0', '0.8.0'),
    'github|||0.7.0',
  );
});

test('LAN update fingerprints change when the computer advertises another APK', () => {
  const before = automaticUpdateFingerprint(true, '192.168.1.8:8321', '0.7.0', '0.7.0');
  const after = automaticUpdateFingerprint(true, '192.168.1.8:8321', '0.7.0', '0.8.0');
  assert.notEqual(before, after);
});

test('discovery fingerprints distinguish APK presence and version', () => {
  const base = { key: '192.168.1.8:8321', serverId: 'server-1' };
  assert.equal(advertisedApkFingerprint({ ...base, apkAvailable: false }), 'server-1|none');
  assert.equal(advertisedApkFingerprint({ ...base, apkAvailable: true, apkVersion: '0.8.0' }), 'server-1|0.8.0');
});

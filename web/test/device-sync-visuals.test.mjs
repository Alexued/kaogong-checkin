import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_SYNC_ACCENTS,
  assignRecoveryAccents,
  pairingAccent,
  recoveryAccent,
  recoveryAgeBucket,
  recoveryAgeText,
} from '../src/lib/deviceSyncVisuals.ts';

test('paired-device colors are bounded and stable on both devices', () => {
  assert.equal(pairingAccent(0), DEVICE_SYNC_ACCENTS[0]);
  assert.equal(pairingAccent(5), DEVICE_SYNC_ACCENTS[5]);
  assert.equal(pairingAccent(-3), DEVICE_SYNC_ACCENTS[0]);
  assert.equal(pairingAccent(99), DEVICE_SYNC_ACCENTS[5]);
});

test('recovery colors are stable by model and distribute across known devices', () => {
  const devices = [
    { sourceModel: 'M2007J1SC', sourceDeviceId: 'phone-device-001' },
    { sourceModel: 'Xiaomi Pad 6', sourceDeviceId: 'tablet-device-002' },
    { sourceModel: 'Pixel 9', sourceDeviceId: 'phone-device-003' },
    { sourceModel: 'SM-S9280', sourceDeviceId: 'phone-device-004' },
  ];
  const assigned = [...assignRecoveryAccents(devices).values()];
  assert.deepEqual([...assignRecoveryAccents(devices)], [...assignRecoveryAccents(devices)]);
  assert.ok(DEVICE_SYNC_ACCENTS.includes(recoveryAccent('M2007J1SC', 'phone-device-001')));
  assert.ok(assigned.every((color) => DEVICE_SYNC_ACCENTS.includes(color)));
  assert.equal(new Set(assigned).size, devices.length);
});

test('recovery time buckets have explicit recent, week and older labels', () => {
  const now = Date.parse('2026-08-14T08:00:00.000Z');
  assert.equal(recoveryAgeBucket('2026-08-14T07:00:00.000Z', now), 'recent');
  assert.equal(recoveryAgeBucket('2026-08-10T08:00:00.000Z', now), 'week');
  assert.equal(recoveryAgeBucket('2026-07-01T08:00:00.000Z', now), 'older');
  assert.equal(recoveryAgeBucket('invalid', now), 'older');
  assert.deepEqual(['recent', 'week', 'older'].map(recoveryAgeText), ['24 小时内', '7 天内', '更早']);
});

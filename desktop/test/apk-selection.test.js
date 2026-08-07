'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { findLatestApk } = require('../../server/src/update');
const { selectCanonicalApk } = require('../src/apk-selection');

test('desktop uses the exact APK selected by the running server', () => {
  let fallbackCalled = false;
  const selected = selectCanonicalApk(
    {
      apkAvailable: true,
      apkFileName: 'kaogong-checkin-v2.4.6.apk',
      apkVersion: '2.4.6',
      apkSize: 2048,
    },
    () => {
      fallbackCalled = true;
      return null;
    },
  );

  assert.deepEqual(selected, {
    fileName: 'kaogong-checkin-v2.4.6.apk',
    version: '2.4.6',
    size: 2048,
  });
  assert.equal(fallbackCalled, false);
});

test('desktop resource inspection uses the server semantic-version selector', (t) => {
  const updateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaogong-desktop-apk-'));
  t.after(() => fs.rmSync(updateDir, { recursive: true, force: true }));

  const lowerPath = path.join(updateDir, 'kaogong-checkin-v1.9.9.apk');
  const higherPath = path.join(updateDir, 'kaogong-checkin-v2.0.0.apk');
  fs.writeFileSync(lowerPath, 'lower');
  fs.writeFileSync(higherPath, 'higher');
  fs.writeFileSync(path.join(updateDir, 'newest.apk'), 'invalid');
  fs.utimesSync(lowerPath, new Date('2030-01-01T00:00:00Z'), new Date('2030-01-01T00:00:00Z'));
  fs.utimesSync(higherPath, new Date('2020-01-01T00:00:00Z'), new Date('2020-01-01T00:00:00Z'));

  const selected = selectCanonicalApk({}, () => findLatestApk(updateDir));
  assert.equal(selected.fileName, 'kaogong-checkin-v2.0.0.apk');
  assert.equal(selected.version, '2.0.0');
});

test('desktop preserves the server no-APK decision without rescanning', () => {
  const selected = selectCanonicalApk(
    { apkAvailable: false },
    () => assert.fail('fallback selector must not run'),
  );
  assert.equal(selected, null);
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  canonicalApkName,
  parseAaptBadging,
  prepareEmbeddedApk,
  verifyEmbeddedApk,
} = require('../desktop-apk');

const EXPECTED = Object.freeze({
  version: '0.9.0',
  versionCode: 12,
  applicationId: 'com.wjy.kaogong',
});

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kaogong-desktop-apk-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('parses package identity from aapt badging output', () => {
  assert.deepEqual(
    parseAaptBadging("package: name='com.wjy.kaogong' versionCode='12' versionName='0.9.0' platformBuildVersionName='16'"),
    EXPECTED,
  );
});

test('valid source replaces stale APKs with one canonical embedded artifact', (t) => {
  const directory = fixture(t);
  const source = path.join(directory, 'app-debug.apk');
  const destination = path.join(directory, 'embedded');
  fs.writeFileSync(source, 'version 0.9.0');
  fs.mkdirSync(destination);
  fs.writeFileSync(path.join(destination, 'kaogong-checkin-v0.7.1.apk'), 'old');
  fs.writeFileSync(path.join(destination, '.gitkeep'), '');

  const prepared = prepareEmbeddedApk(source, {
    expected: EXPECTED,
    destinationDirectory: destination,
    inspect: () => EXPECTED,
  });

  assert.equal(prepared.fileName, canonicalApkName(EXPECTED.version));
  assert.equal(fs.readFileSync(prepared.filePath, 'utf8'), 'version 0.9.0');
  assert.deepEqual(
    fs.readdirSync(destination).sort(),
    ['.gitkeep', canonicalApkName(EXPECTED.version)].sort(),
  );
});

test('identity failure preserves the previously embedded APK', (t) => {
  const directory = fixture(t);
  const source = path.join(directory, 'old-source.apk');
  const destination = path.join(directory, 'embedded');
  const previous = path.join(destination, 'kaogong-checkin-v0.7.1.apk');
  fs.writeFileSync(source, 'old source');
  fs.mkdirSync(destination);
  fs.writeFileSync(previous, 'previous');

  assert.throws(() => prepareEmbeddedApk(source, {
    expected: EXPECTED,
    destinationDirectory: destination,
    inspect: () => ({ ...EXPECTED, version: '0.7.1', versionCode: 10 }),
  }), /version mismatch/);
  assert.equal(fs.readFileSync(previous, 'utf8'), 'previous');
});

test('verification rejects extra or incorrectly named APKs', (t) => {
  const directory = fixture(t);
  fs.writeFileSync(path.join(directory, canonicalApkName(EXPECTED.version)), 'current');
  fs.writeFileSync(path.join(directory, 'unexpected.apk'), 'extra');
  assert.throws(() => verifyEmbeddedApk({
    expected: EXPECTED,
    destinationDirectory: directory,
    inspect: () => EXPECTED,
  }), /must contain only/);
});

test('desktop pack and dist commands explicitly run the APK release gate', () => {
  const desktopPackage = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', '..', 'desktop', 'package.json'),
    'utf8',
  ));
  assert.match(desktopPackage.scripts['prepare:release'], /prepare:apk.*verify:apk/);
  assert.match(desktopPackage.scripts.pack, /^npm run prepare:release && /);
  assert.match(desktopPackage.scripts.dist, /^npm run prepare:release && /);
});

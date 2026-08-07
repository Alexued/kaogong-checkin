import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import releaseLib from '../release-lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('release metadata declares the stage 0 compatibility target', () => {
  assert.deepEqual(releaseLib.readVersion(), {
    version: '0.9.0',
    versionCode: 12,
    stateSchemaVersion: 3,
    syncProtocolVersion: 3,
    backupFormatVersion: 1,
    applicationId: 'com.wjy.kaogong',
    releaseChannel: 'internal-debug',
  });
});

test('all generated version consumers match the release metadata', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-version.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Version metadata is consistent at 0\.9\.0 \(12\)/);
});

test('release manifest carries the compatibility metadata', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kaogong-release-metadata-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const apkPath = path.join(directory, 'kaogong-checkin-v0.9.0.apk');
  const manifestPath = path.join(directory, 'release-manifest.json');
  fs.writeFileSync(apkPath, 'fixture apk');

  const result = spawnSync(
    process.execPath,
    ['scripts/create-release-manifest.js', apkPath, manifestPath],
    { cwd: ROOT, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.deepEqual(
    {
      version: manifest.version,
      versionCode: manifest.versionCode,
      stateSchemaVersion: manifest.stateSchemaVersion,
      syncProtocolVersion: manifest.syncProtocolVersion,
      backupFormatVersion: manifest.backupFormatVersion,
      applicationId: manifest.applicationId,
      releaseChannel: manifest.releaseChannel,
    },
    releaseLib.readVersion(),
  );
  assert.equal(manifest.fileName, 'kaogong-checkin-v0.9.0.apk');
  assert.equal(manifest.size, 11);
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
});

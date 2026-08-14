import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import releaseLib from '../release-lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('release metadata declares the current compatibility target', () => {
  const current = JSON.parse(fs.readFileSync(path.join(ROOT, 'release', 'version.json'), 'utf8'));
  assert.deepEqual(releaseLib.readVersion(), current);
});

test('all generated version consumers match the release metadata', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-version.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const current = releaseLib.readVersion();
  assert.match(result.stdout, new RegExp(`Version metadata is consistent at ${current.version.replaceAll('.', '\\.')} \\(${current.versionCode}\\)`));
});

test('release manifest carries the compatibility metadata', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kaogong-release-metadata-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const current = releaseLib.readVersion();
  const apkPath = path.join(directory, `kaogong-checkin-v${current.version}.apk`);
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
  assert.equal(manifest.fileName, `kaogong-checkin-v${current.version}.apk`);
  assert.equal(manifest.size, 11);
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
});

test('GitHub Pages and the Windows companion target the same current release', () => {
  const current = releaseLib.readVersion();
  const windows = JSON.parse(fs.readFileSync(path.join(ROOT, 'release', 'windows-manifest.json'), 'utf8'));
  const desktopPackage = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop', 'package.json'), 'utf8'));
  const releaseData = fs.readFileSync(path.join(ROOT, 'docs', 'styles', 'shared', 'release-data.js'), 'utf8');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const installerName = `kaogong-checkin-windows-x64-setup-v${current.version}.exe`;

  assert.equal(windows.version, current.version);
  assert.equal(windows.fileName, installerName);
  assert.equal(windows.productName, '格记电脑伴侣');
  assert.equal(desktopPackage.version, current.version);
  assert.equal(desktopPackage.productName, windows.productName);
  assert.equal(windows.embeddedApkSha256, JSON.parse(fs.readFileSync(path.join(ROOT, 'release', 'release-manifest.json'), 'utf8')).sha256);
  assert.match(windows.sha256, /^[a-f0-9]{64}$/);
  assert.ok(windows.size > 0);

  for (const value of [current.version, installerName, windows.sha256.toUpperCase()]) {
    assert.ok(releaseData.includes(value), `release-data.js is missing ${value}`);
    assert.ok(readme.includes(value), `README.md is missing ${value}`);
  }
  assert.doesNotMatch(releaseData, /v0\.7\.1|DECAD4791|8D853018/);

  const publicPages = [path.join(ROOT, 'docs', 'index.html')];
  for (const entry of fs.readdirSync(path.join(ROOT, 'docs', 'styles'), { withFileTypes: true })) {
    const indexPath = path.join(ROOT, 'docs', 'styles', entry.name, 'index.html');
    if (entry.isDirectory() && fs.existsSync(indexPath)) publicPages.push(indexPath);
  }
  for (const pagePath of publicPages) {
    const page = fs.readFileSync(pagePath, 'utf8');
    assert.ok(page.includes(current.version), `${path.relative(ROOT, pagePath)} is missing ${current.version}`);
    assert.ok(page.includes(installerName), `${path.relative(ROOT, pagePath)} is missing ${installerName}`);
    assert.doesNotMatch(page, /v0\.7\.1|DECAD4791|8D853018|考公打卡/);
  }

  const builtInstaller = path.join(ROOT, 'desktop', 'dist', installerName);
  if (fs.existsSync(builtInstaller)) {
    const bytes = fs.readFileSync(builtInstaller);
    assert.equal(bytes.length, windows.size);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), windows.sha256);
  }
});

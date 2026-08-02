const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function waitForServer(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('test server did not start');
}

function startServer(t, updateDir) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaogong-update-data-'));
  const httpPort = 19000 + Math.floor(Math.random() * 1000);
  const udpPort = httpPort + 1000;
  const serverPath = path.join(__dirname, '..', 'src', 'index.js');
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      KGC_HTTP_PORT: String(httpPort),
      KGC_UDP_PORT: String(udpPort),
      KGC_DATA_DIR: dataDir,
      KGC_UPDATE_DIR: updateDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => {
    child.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${httpPort}`;
}

test('LAN update API selects and downloads the highest valid APK', async (t) => {
  const updateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaogong-updates-'));
  t.after(() => fs.rmSync(updateDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(updateDir, 'kaogong-checkin-v0.5.2.apk'), 'older');
  fs.writeFileSync(path.join(updateDir, 'kaogong-checkin-v0.12.0.apk'), 'latest-apk');
  fs.writeFileSync(path.join(updateDir, 'kaogong-checkin-vbad.apk'), 'ignored');
  fs.writeFileSync(path.join(updateDir, 'other-v99.0.0.apk'), 'ignored');

  const baseUrl = startServer(t, updateDir);
  await waitForServer(`${baseUrl}/api/update/latest`);

  const metadataResponse = await fetch(`${baseUrl}/api/update/latest`);
  assert.equal(metadataResponse.status, 200);
  const metadata = await metadataResponse.json();
  assert.equal(metadata.version, '0.12.0');
  assert.equal(metadata.source, 'lan');
  assert.equal(metadata.fileName, 'kaogong-checkin-v0.12.0.apk');
  assert.equal(metadata.size, Buffer.byteLength('latest-apk'));
  assert.equal(metadata.apkUrl, `${baseUrl}/updates/kaogong-checkin-v0.12.0.apk`);

  const downloadResponse = await fetch(metadata.apkUrl);
  assert.equal(downloadResponse.status, 200);
  assert.match(downloadResponse.headers.get('content-type') || '', /application\/vnd\.android\.package-archive/i);
  assert.match(downloadResponse.headers.get('content-disposition') || '', /kaogong-checkin-v0\.12\.0\.apk/i);
  assert.equal(await downloadResponse.text(), 'latest-apk');

  assert.equal((await fetch(`${baseUrl}/updates/not-an-update.apk`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/updates/%2e%2e%2fkaogong-checkin-v0.12.0.apk`)).status, 404);
});

test('LAN update API returns 404 when no valid APK is available', async (t) => {
  const updateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaogong-empty-updates-'));
  t.after(() => fs.rmSync(updateDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(updateDir, 'latest.apk'), 'invalid-name');

  const baseUrl = startServer(t, updateDir);
  await waitForServer(`${baseUrl}/api/update/latest`);
  const response = await fetch(`${baseUrl}/api/update/latest`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'no update APK available' });
});

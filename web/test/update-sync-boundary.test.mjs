import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const values = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  },
});
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { setTimeout, clearTimeout },
});

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
test.after(() => vite.close());
const update = await vite.ssrLoadModule('/src/api/update.ts');
const computerSync = await vite.ssrLoadModule('/src/api/computer-sync.ts');
const { SYNC_ENABLED_KEY } = await vite.ssrLoadModule('/src/api/sync-preference.ts');
setActivePinia(createPinia());

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function githubRelease(version) {
  return {
    tag_name: `v${version}`,
    name: `v${version}`,
    html_url: `https://github.test/v${version}`,
    body: 'notes',
    published_at: '2026-08-07T00:00:00Z',
    assets: [{ name: `kaogong-checkin-v${version}.apk`, browser_download_url: `https://github.test/v${version}.apk` }],
  };
}

function lanRelease(version, apkUrl = `/updates/kaogong-checkin-v${version}.apk`) {
  return { version, apkUrl, pageUrl: apkUrl, name: `v${version}`, notes: 'local' };
}

test('disabled sync rejects direct LAN update and pairing calls without fetching', async () => {
  values.set(SYNC_ENABLED_KEY, 'false');
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    throw new Error('network should not be reached');
  };

  await assert.rejects(
    update.fetchLatestLanRelease('192.168.1.8:8321'),
    (error) => error instanceof DOMException && error.name === 'AbortError',
  );
  await assert.rejects(
    computerSync.pairComputerServer('123456', 'server-1'),
    (error) => error instanceof DOMException && error.name === 'AbortError',
  );
  assert.equal(fetches, 0);
});

test('turning sync off aborts an in-flight LAN update request', async () => {
  values.set(SYNC_ENABLED_KEY, 'true');
  let requestSignal;
  globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
    requestSignal = init.signal;
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  });

  const pending = update.fetchLatestLanRelease('192.168.1.8:8321');
  await Promise.resolve();
  assert.equal(requestSignal.aborted, false);
  await computerSync.setComputerSyncEnabled(false);
  await assert.rejects(
    pending,
    (error) => error instanceof DOMException && error.name === 'AbortError',
  );
  assert.equal(requestSignal.aborted, true);
});

test('combined checks choose the highest version and prefer LAN when versions tie', async (t) => {
  values.set(SYNC_ENABLED_KEY, 'true');
  values.set('serverUrl', '192.168.1.8:8321');

  async function check(lanVersion, githubVersion) {
    globalThis.fetch = async (url) => String(url).includes('/api/update/latest')
      ? jsonResponse(lanRelease(lanVersion))
      : jsonResponse(githubRelease(githubVersion));
    return update.fetchLatestRelease();
  }

  await t.test('LAN can win', async () => {
    assert.equal((await check('0.8.0', '0.7.0')).source, 'lan');
  });
  await t.test('GitHub can win', async () => {
    assert.equal((await check('0.7.0', '0.8.0')).source, 'github');
  });
  await t.test('equal versions prefer LAN', async () => {
    assert.equal((await check('0.8.0', '0.8.0')).source, 'lan');
  });
});

test('one failed source falls back and both failed sources report failure', async () => {
  values.set(SYNC_ENABLED_KEY, 'true');
  values.set('serverUrl', '192.168.1.8:8321');
  globalThis.fetch = async (url) => String(url).includes('/api/update/latest')
    ? jsonResponse({}, 404)
    : jsonResponse(githubRelease('0.8.0'));
  assert.equal((await update.fetchLatestRelease()).source, 'github');

  globalThis.fetch = async () => jsonResponse({}, 503);
  await assert.rejects(update.fetchLatestRelease(), /No update source is available/);
});

test('manual update checks stay on GitHub while computer sync is disabled', async () => {
  values.set(SYNC_ENABLED_KEY, 'false');
  values.set('serverUrl', '192.168.1.8:8321');
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return jsonResponse(githubRelease('0.8.0'));
  };
  const result = await update.fetchLatestRelease();
  assert.equal(result.source, 'github');
  assert.equal(urls.length, 1);
  assert.match(urls[0], /api\.github\.com/);
});

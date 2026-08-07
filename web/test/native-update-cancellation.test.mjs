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
Object.defineProperty(globalThis, 'androidBridge', {
  configurable: true,
  value: {},
});

let startHandler = () => Promise.reject(new Error('unexpected start'));
let cancelHandler = () => Promise.reject(new Error('unexpected cancel'));
const nativeCalls = [];
globalThis.Capacitor = {
  PluginHeaders: [{
    name: 'AppUpdate',
    methods: [
      { name: 'startDownload', rtype: 'promise' },
      { name: 'cancelDownload', rtype: 'promise' },
    ],
  }],
  nativePromise(plugin, method, options) {
    nativeCalls.push({ plugin, method, options });
    if (method === 'startDownload') return startHandler(options);
    if (method === 'cancelDownload') return cancelHandler(options);
    throw new Error(`unexpected native method: ${method}`);
  },
};

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
test.after(() => vite.close());
const update = await vite.ssrLoadModule('/src/api/update.ts');
const computerSync = await vite.ssrLoadModule('/src/api/computer-sync.ts');
const { SYNC_ENABLED_KEY } = await vite.ssrLoadModule('/src/api/sync-preference.ts');
setActivePinia(createPinia());

function status(state, downloadId = 41) {
  return {
    downloadId,
    status: state,
    percent: 0,
    bytesDownloaded: 0,
    totalBytes: 100,
    speedBytesPerSecond: 0,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitForNativeCalls(method, count, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (nativeCalls.filter((call) => call.method === method).length < count) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${method}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test.beforeEach(() => {
  values.clear();
  nativeCalls.length = 0;
});

test('sync shutdown waits for a pending LAN download start and then cancels it', async () => {
  const pendingStart = deferred();
  startHandler = () => pendingStart.promise;
  cancelHandler = async () => status('cancelled');

  const download = update.startAppUpdateDownload('http://computer/update.apk', 'update.apk', 'lan');
  const cancellation = update.cancelActiveLanAppUpdate();
  await Promise.resolve();
  assert.equal(nativeCalls.filter((call) => call.method === 'cancelDownload').length, 0);

  pendingStart.resolve(status('queued'));
  assert.equal((await download).status, 'cancelled');
  assert.equal(await cancellation, true);
  assert.equal(nativeCalls.filter((call) => call.method === 'cancelDownload').length, 1);
  assert.equal(update.getActiveAppUpdateSource(), null);
});

test('a failed pending cancellation retains the LAN source until a retry succeeds', async () => {
  startHandler = async () => status('queued', 52);
  cancelHandler = async () => { throw new Error('DownloadManager unavailable'); };

  const download = update.startAppUpdateDownload('http://computer/update.apk', 'update.apk', 'lan');
  const downloadFailure = assert.rejects(download, /DownloadManager unavailable/);
  await assert.rejects(update.cancelActiveLanAppUpdate(), /DownloadManager unavailable/);
  await downloadFailure;
  assert.equal(update.getActiveAppUpdateSource(), 'lan');
  assert.equal(nativeCalls.filter((call) => call.method === 'cancelDownload').length, 2);

  cancelHandler = async () => status('idle', null);
  assert.equal(await update.cancelActiveLanAppUpdate(), true);
  assert.equal(update.getActiveAppUpdateSource(), null);
});

test('a second native download cannot replace an operation waiting to be cancelled', async () => {
  const pendingStart = deferred();
  startHandler = () => pendingStart.promise;
  cancelHandler = async () => status('cancelled', 63);

  const first = update.startAppUpdateDownload('http://computer/update.apk', 'lan.apk', 'lan');
  await assert.rejects(
    update.startAppUpdateDownload('https://github.test/update.apk', 'github.apk', 'github'),
    /already active/,
  );
  const cancellation = update.cancelActiveLanAppUpdate();
  pendingStart.resolve(status('queued', 63));
  assert.equal((await first).status, 'cancelled');
  assert.equal(await cancellation, true);
});

test('a queued LAN download keeps ownership when another download is requested', async () => {
  startHandler = async () => status('queued', 71);

  assert.equal(
    (await update.startAppUpdateDownload('http://computer/update.apk', 'lan.apk', 'lan')).status,
    'queued',
  );
  await assert.rejects(
    update.startAppUpdateDownload('https://github.test/update.apk', 'github.apk', 'github'),
    /already active/,
  );
  assert.equal(nativeCalls.filter((call) => call.method === 'startDownload').length, 1);
  assert.equal(update.getActiveAppUpdateSource(), 'lan');
});

test('a failed LAN cancellation is persisted for UI recovery', async () => {
  startHandler = async () => status('queued', 72);
  cancelHandler = async () => { throw new Error('DownloadManager unavailable'); };

  await update.startAppUpdateDownload('http://computer/update.apk', 'lan.apk', 'lan');
  await assert.rejects(update.cancelActiveLanAppUpdate(72), /DownloadManager unavailable/);

  assert.equal(update.getActiveAppUpdateSource(), 'lan');
  assert.equal(update.hasActiveAppUpdateStopFailure(), true);
});

test('sync shutdown automatically retries a failed LAN cancellation', async () => {
  values.set(SYNC_ENABLED_KEY, 'true');
  startHandler = async () => status('queued', 74);
  let attempts = 0;
  cancelHandler = async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('DownloadManager temporarily unavailable');
    return status('cancelled', 74);
  };

  await update.startAppUpdateDownload('http://computer/update.apk', 'lan.apk', 'lan');
  await computerSync.setComputerSyncEnabled(false);

  assert.equal(attempts, 3);
  assert.equal(update.getActiveAppUpdateSource(), null);
  assert.equal(update.hasActiveAppUpdateStopFailure(), false);
});

test('re-enabling sync cancels an old LAN cancellation retry before a new download starts', async () => {
  values.set(SYNC_ENABLED_KEY, 'true');
  startHandler = async () => status('queued', 75);
  cancelHandler = async () => { throw new Error('DownloadManager temporarily unavailable'); };

  await update.startAppUpdateDownload('http://computer/old.apk', 'old.apk', 'lan');
  const disabling = computerSync.setComputerSyncEnabled(false);
  await waitForNativeCalls('cancelDownload', 1);

  values.set('serverUrl', 'computer.test:8321');
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).endsWith('/api/info')
    ? { serverId: '', pairingRequired: false, protocolVersion: 2 }
    : {
        tasks: [], subtasks: [], checkins: [], timers: [], drills: [], formulaDrills: [],
        settings: { planEndDate: null, theme: 'light', markDate: null },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  globalThis.WebSocket = class FakeWebSocket {
    static OPEN = 1;
    readyState = 0;
    onopen = null;
    onmessage = null;
    onclose = null;
    onerror = null;
    send() {}
    close() { this.readyState = 3; }
  };

  const enabling = computerSync.setComputerSyncEnabled(true);
  await Promise.all([disabling, enabling]);
  assert.equal(update.hasActiveAppUpdateStopFailure(), true);

  update.clearActiveAppUpdateSource();
  startHandler = async () => status('queued', 76);
  await update.startAppUpdateDownload('http://computer/new.apk', 'new.apk', 'lan');
  await new Promise((resolve) => setTimeout(resolve, 350));

  assert.equal(nativeCalls.filter((call) => call.method === 'cancelDownload').length, 1);
  assert.equal(update.getActiveAppUpdateSource(), 'lan');

  cancelHandler = async () => status('cancelled', 76);
  await computerSync.setComputerSyncEnabled(false);
});

test('a native removed=false response does not report LAN cancellation success', async () => {
  startHandler = async () => status('queued', 74);
  cancelHandler = async () => ({ ...status('cancelled', 74), removed: false });

  await update.startAppUpdateDownload('http://computer/update.apk', 'lan.apk', 'lan');
  await assert.rejects(
    update.cancelActiveLanAppUpdate(74),
    /was not removed/,
  );

  assert.equal(update.getActiveAppUpdateSource(), 'lan');
  assert.equal(update.hasActiveAppUpdateStopFailure(), true);
});

test('an unknown native status retains active download ownership', () => {
  assert.equal(update.shouldRetainActiveAppUpdateSource('unknown'), true);
  assert.equal(update.shouldRetainActiveAppUpdateSource('downloading'), true);
  assert.equal(update.shouldRetainActiveAppUpdateSource('not_found'), false);
  assert.equal(update.shouldRetainActiveAppUpdateSource('failed'), false);
});

test('stop failure subscribers receive late cancellation failures', async () => {
  const failures = [];
  const unsubscribe = update.subscribeActiveAppUpdateStopFailure((failed) => failures.push(failed));
  try {
    startHandler = async () => status('queued', 73);
    cancelHandler = async () => { throw new Error('DownloadManager unavailable'); };

    await update.startAppUpdateDownload('http://computer/update.apk', 'lan.apk', 'lan');
    await assert.rejects(update.cancelActiveLanAppUpdate(73), /DownloadManager unavailable/);
  } finally {
    unsubscribe();
  }

  assert.deepEqual(failures, [false, false, true]);
});

test('an empty native cancel response clears a stale persisted LAN source on startup', async () => {
  values.set(SYNC_ENABLED_KEY, 'false');
  values.set('kgc-active-update-source', 'lan');
  cancelHandler = async () => undefined;

  await computerSync.initializeComputerSync();

  assert.equal(nativeCalls.filter((call) => call.method === 'cancelDownload').length, 1);
  assert.equal(update.getActiveAppUpdateSource(), null);
});

test('a completed LAN download is preserved while startup clears its active source', async () => {
  values.set(SYNC_ENABLED_KEY, 'false');
  values.set('kgc-active-update-source', 'lan');
  cancelHandler = async () => ({ ...status('downloaded', 75), preserved: true });

  await computerSync.initializeComputerSync();

  assert.equal(nativeCalls.filter((call) => call.method === 'cancelDownload').length, 1);
  assert.equal(update.getActiveAppUpdateSource(), null);
  assert.equal(update.hasActiveAppUpdateStopFailure(), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const values = new Map([['kgc-sync-enabled', 'true']]);
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

const calls = [];
const listeners = new Map();
globalThis.Capacitor = {
  PluginHeaders: [{
    name: 'UdpSocket',
    methods: [
      { name: 'create', rtype: 'promise' },
      { name: 'bind', rtype: 'promise' },
      { name: 'setBroadcast', rtype: 'promise' },
      { name: 'close', rtype: 'promise' },
      { name: 'addListener', rtype: 'callback' },
      { name: 'removeListener', rtype: 'callback' },
    ],
  }],
  nativePromise(plugin, method, options) {
    calls.push({ plugin, method, options });
    if (method === 'create') return Promise.resolve({ socketId: 7 });
    return Promise.resolve();
  },
  nativeCallback(plugin, method, options, callback) {
    calls.push({ plugin, method, options });
    if (method === 'addListener') listeners.set(options.eventName, callback);
    return Promise.resolve(`${options.eventName || 'listener'}-1`);
  },
};

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
test.after(() => vite.close());
const discovery = await vite.ssrLoadModule('/src/api/discover.ts');

function packet(remoteAddress, body) {
  return {
    socketId: 7,
    remoteAddress,
    remotePort: 8322,
    buffer: btoa(JSON.stringify(body)),
  };
}

test('UDP discovery binds all interfaces, deduplicates by serverId, and ignores late packets', async () => {
  const snapshots = [];
  const unsubscribe = discovery.subscribeDiscovery((servers) => snapshots.push(servers));

  await discovery.startDiscovery();
  assert.equal(discovery.isDiscoveryRunning(), true);
  assert.deepEqual(
    calls.find((call) => call.method === 'create')?.options,
    { properties: { name: 'kgc-discovery', bufferSize: 4096 } },
  );
  assert.deepEqual(
    calls.find((call) => call.method === 'bind')?.options,
    { socketId: 7, address: '0.0.0.0', port: 8322 },
  );

  const receive = listeners.get('receive');
  receive(packet('192.168.1.10', { serverId: 'server-1', name: 'PC', httpPort: 8321 }));
  receive(packet('10.0.0.10', { serverId: 'server-1', name: 'PC', httpPort: 8321 }));
  receive({ socketId: 7, remoteAddress: '10.0.0.10', buffer: '{bad json' });

  const beforeStop = snapshots.at(-1);
  assert.equal(beforeStop.length, 1);
  assert.equal(beforeStop[0].key, '10.0.0.10:8321');
  assert.deepEqual(discovery.getDiscoveryDiagnostics(), {
    running: true,
    boundPort: 8322,
    receivedPackets: 3,
    acceptedPackets: 2,
    duplicatePackets: 1,
    parseFailures: 1,
    socketErrors: 0,
    lastFailureReason: 'invalid-json',
  });

  await discovery.stopDiscovery();
  const snapshotCountAfterStop = snapshots.length;
  receive(packet('192.168.1.11', { serverId: 'server-2', name: 'Late', httpPort: 8321 }));
  assert.equal(snapshots.length, snapshotCountAfterStop);
  assert.equal(discovery.isDiscoveryRunning(), false);
  assert.equal(discovery.getDiscoveryDiagnostics().running, false);
  assert.equal(calls.some((call) => call.method === 'close' && call.options.socketId === 7), true);
  assert.equal(calls.filter((call) => call.method === 'removeListener').length, 2);
  unsubscribe();
});

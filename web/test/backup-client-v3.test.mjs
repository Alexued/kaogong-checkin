import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScript } from './import-typescript.mjs';

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('v3 backup client authenticates and preserves encoded device and snapshot identities', async (t) => {
  const previousStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const storage = new MemoryStorage();
  storage.setItem('serverUrl', '192.168.7.2:8321');
  storage.setItem('kgc-selected-server-id', 'server-a');
  storage.setItem('kgc-pairing-tokens', JSON.stringify({ 'server-a': 'token-secret' }));
  globalThis.localStorage = storage;
  t.after(() => {
    globalThis.localStorage = previousStorage;
    globalThis.fetch = previousFetch;
  });

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === 'POST') {
      return response({
        metadata: { snapshotId: 'snapshot/1', backupRevision: 1 },
        idempotent: false,
        retained: true,
        prunedSnapshotIds: [],
        backupProtocolVersion: 3,
        backupFormatVersion: 1,
      }, 201);
    }
    if (String(url).endsWith('/snapshot%2F1')) {
      return response({ metadata: { snapshotId: 'snapshot/1' }, envelope: { schemaVersion: 3 } });
    }
    return response({ deviceId: 'device/a', head: null, snapshots: [] });
  };

  const client = await importTypeScript(new URL('../src/api/client.ts', import.meta.url));
  await client.fetchBackupCatalogV3('device/a');
  await client.appendBackupSnapshotV3({
    mutationId: 'mutation-1',
    deviceId: 'device/a',
    expectedBackupRevision: 0,
    localRevision: 1,
    envelope: { schemaVersion: 3, revision: 1, deviceId: 'device/a', savedAt: 'x', state: {} },
  });
  await client.fetchBackupSnapshotV3('device/a', 'snapshot/1');

  assert.equal(calls[0].url, 'http://192.168.7.2:8321/api/v3/backups/device%2Fa');
  assert.equal(calls[1].url, 'http://192.168.7.2:8321/api/v3/backups');
  assert.equal(calls[2].url, 'http://192.168.7.2:8321/api/v3/backups/device%2Fa/snapshot%2F1');
  for (const call of calls) {
    assert.equal(call.options.headers.Authorization, 'Bearer token-secret');
  }
  assert.equal(JSON.parse(calls[1].options.body).mutationId, 'mutation-1');
});

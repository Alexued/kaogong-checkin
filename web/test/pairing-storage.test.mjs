import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPairingToken,
  getSelectedServerId,
  removePairingToken,
  savePairingToken,
} from '../src/api/pairing-storage.ts';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('pairing tokens are isolated by server id and remain outside app settings', () => {
  const storage = memoryStorage();
  savePairingToken('server-a', 'token-a', storage);
  savePairingToken('server-b', 'token-b', storage);
  assert.equal(getPairingToken('server-a', storage), 'token-a');
  assert.equal(getPairingToken('server-b', storage), 'token-b');
  assert.equal(getSelectedServerId(storage), 'server-b');
  assert.equal(storage.getItem('kgc-state'), null);
});

test('removing one pairing token does not revoke other computers', () => {
  const storage = memoryStorage();
  savePairingToken('server-a', 'token-a', storage);
  savePairingToken('server-b', 'token-b', storage);
  removePairingToken('server-a', storage);
  assert.equal(getPairingToken('server-a', storage), '');
  assert.equal(getPairingToken('server-b', storage), 'token-b');
});

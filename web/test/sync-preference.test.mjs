import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCAL_STATE_KEY,
  SYNC_ENABLED_KEY,
  resolveInitialSyncEnabled,
} from '../src/api/sync-preference.ts';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    snapshot: () => Object.fromEntries(values),
  };
}

test('fresh installations default computer sync to disabled and persist the decision', () => {
  const storage = memoryStorage();
  assert.equal(resolveInitialSyncEnabled(storage), false);
  assert.equal(storage.snapshot()[SYNC_ENABLED_KEY], 'false');
});

test('existing installations with local state remain enabled', () => {
  const storage = memoryStorage({ [LOCAL_STATE_KEY]: '{"tasks":[]}' });
  assert.equal(resolveInitialSyncEnabled(storage), true);
  assert.equal(storage.snapshot()[SYNC_ENABLED_KEY], 'true');
});

test('an explicit computer sync preference always wins migration detection', () => {
  const disabled = memoryStorage({ [LOCAL_STATE_KEY]: '{}', [SYNC_ENABLED_KEY]: 'false' });
  const enabled = memoryStorage({ [SYNC_ENABLED_KEY]: 'true' });
  assert.equal(resolveInitialSyncEnabled(disabled), false);
  assert.equal(resolveInitialSyncEnabled(enabled), true);
});

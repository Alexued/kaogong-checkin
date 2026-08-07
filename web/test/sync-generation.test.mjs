import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncGeneration } from '../src/api/sync-generation.ts';

test('stop invalidates callbacks from the previous HTTP and socket generation', () => {
  const guard = new SyncGeneration();
  const firstRun = guard.begin();
  assert.equal(guard.isCurrent(firstRun), true);
  guard.invalidate();
  assert.equal(guard.isCurrent(firstRun), false);
});

test('only the newest restarted run remains current', () => {
  const guard = new SyncGeneration();
  const firstRun = guard.begin();
  const secondRun = guard.begin();
  assert.equal(guard.isCurrent(firstRun), false);
  assert.equal(guard.isCurrent(secondRun), true);
});

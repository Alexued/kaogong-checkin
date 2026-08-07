import test from 'node:test';
import assert from 'node:assert/strict';
import { compactQueue, normalizeQueue } from '../src/api/sync-queue.ts';

const mutation = (entity, id, title, mutationId, kind = 'upsert') => ({
  kind,
  entity,
  payload: { id, title, updatedAt: `2026-08-05T00:00:0${title}.000Z` },
  clientMutationId: mutationId,
});

test('queue compaction keeps only the final mutation for one entity', () => {
  let queue = [];
  queue = compactQueue(queue, mutation('task', 'task-1', '1', 'm1'));
  queue = compactQueue(queue, mutation('task', 'task-1', '2', 'm2'));
  assert.equal(queue.length, 1);
  assert.equal(queue[0].payload.title, '2');
  assert.equal(queue[0].clientMutationId, 'm2');
});

test('a replacement moves to the tail so queue order matches the latest mutation order', () => {
  let queue = [];
  queue = compactQueue(queue, mutation('task', 'task-1', '1', 'm1'));
  queue = compactQueue(queue, {
    kind: 'upsert', entity: 'settings', payload: { theme: 'light', updatedAt: '1' }, clientMutationId: 's1',
  });
  queue = compactQueue(queue, mutation('checkin', 'checkin-1', '2', 'm2'));
  queue = compactQueue(queue, {
    kind: 'upsert', entity: 'settings', payload: { theme: 'dark', updatedAt: '2' }, clientMutationId: 's2',
  });
  assert.deepEqual(queue.map((item) => item.clientMutationId), ['m1', 'm2', 's2']);
  assert.equal(queue[2].payload.theme, 'dark');
});

test('task deletion remains after newly enqueued dependent tombstones', () => {
  let queue = [];
  queue = compactQueue(queue, mutation('task', 'task-1', '1', 'task-upsert'));
  queue = compactQueue(queue, mutation('checkin', 'checkin-1', '2', 'checkin-delete', 'delete'));
  queue = compactQueue(queue, mutation('task', 'task-1', '3', 'task-delete', 'delete'));
  assert.deepEqual(queue.map((item) => item.clientMutationId), ['checkin-delete', 'task-delete']);
});

test('legacy queues gain stable mutation ids and are compacted during load', () => {
  const queue = normalizeQueue([
    { kind: 'upsert', entity: 'task', payload: { id: 'task-1', updatedAt: '1' } },
    { kind: 'delete', entity: 'task', payload: { id: 'task-1', updatedAt: '2' } },
  ]);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].kind, 'delete');
  assert.equal(typeof queue[0].clientMutationId, 'string');
  assert.ok(queue[0].clientMutationId.length > 0);
});

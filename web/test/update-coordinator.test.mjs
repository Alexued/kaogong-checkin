import test from 'node:test';
import assert from 'node:assert/strict';
import { UpdateCoordinator } from '../src/api/update-coordinator.ts';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('automatic checks debounce duplicate triggers and dedupe a completed fingerprint', async () => {
  let checks = 0;
  const results = [];
  const coordinator = new UpdateCoordinator({
    debounceMs: 10,
    canCheckAutomatically: () => true,
    automaticFingerprint: () => '192.168.1.8:8321|0.6.0',
    performCheck: async () => {
      checks += 1;
      return `release-${checks}`;
    },
    onSuccess: (value) => results.push(value),
  });

  assert.equal(coordinator.scheduleAutomatic(), true);
  assert.equal(coordinator.scheduleAutomatic(), false);
  assert.equal(coordinator.scheduleAutomatic(), false);
  await wait(30);
  assert.equal(checks, 1);
  assert.deepEqual(results, ['release-1']);
  assert.equal(coordinator.scheduleAutomatic(), false);

  assert.equal(coordinator.scheduleAutomatic(true), true);
  await wait(30);
  assert.equal(checks, 2);
  assert.deepEqual(results, ['release-1', 'release-2']);
  coordinator.dispose();
});

test('a superseded generation cannot publish a late result', async () => {
  const resolvers = [];
  const results = [];
  const coordinator = new UpdateCoordinator({
    canCheckAutomatically: () => true,
    automaticFingerprint: () => 'server|0.6.0',
    performCheck: () => new Promise((resolve) => resolvers.push(resolve)),
    onSuccess: (value) => results.push(value),
  });

  const first = coordinator.checkNow();
  const second = coordinator.checkNow();
  resolvers[0]('old');
  resolvers[1]('new');
  await Promise.all([first, second]);
  assert.deepEqual(results, ['new']);
  coordinator.dispose();
});

test('cancelling an in-flight check is silent and aborts its signal', async () => {
  let aborted = false;
  let errors = 0;
  let cancellations = 0;
  const coordinator = new UpdateCoordinator({
    canCheckAutomatically: () => true,
    automaticFingerprint: () => 'server|0.6.0',
    performCheck: (signal) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true;
        reject(signal.reason);
      }, { once: true });
    }),
    onError: () => { errors += 1; },
    onCancelled: () => { cancellations += 1; },
  });

  const checking = coordinator.checkNow();
  coordinator.cancel();
  await checking;
  assert.equal(aborted, true);
  assert.equal(errors, 0);
  assert.equal(cancellations, 1);
  coordinator.dispose();
});

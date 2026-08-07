import test from 'node:test';
import assert from 'node:assert/strict';
import {
  navigateToParent,
  normalizeParentPath,
  resolveBackAction,
} from '../src/lib/backNavigation.ts';

test('root tabs minimize instead of adding navigation history', () => {
  for (const path of ['/', '/timer', '/drill', '/settings']) {
    assert.deepEqual(resolveBackAction(path, '/unexpected'), { type: 'minimize' });
  }
});

test('secondary routes use their explicit parent even without browser history', () => {
  assert.deepEqual(resolveBackAction('/stats/day/2026-08-07', '/settings'), {
    type: 'navigate',
    path: '/settings',
  });
  assert.deepEqual(resolveBackAction('/timer/history', '/timer'), {
    type: 'navigate',
    path: '/timer',
  });
  assert.deepEqual(resolveBackAction('/tasks', '/'), { type: 'navigate', path: '/' });
});

test('unknown secondary routes fall back to today and reject invalid metadata', () => {
  assert.equal(normalizeParentPath(' settings '), null);
  assert.equal(normalizeParentPath(' /settings '), '/settings');
  assert.deepEqual(resolveBackAction('/unknown', 'https://example.com'), {
    type: 'navigate',
    path: '/',
  });
});

test('page buttons replace the detail route with its parent', async () => {
  const calls = [];
  const router = {
    currentRoute: { value: { meta: { parentPath: '/timer' } } },
    async replace(path) {
      calls.push(path);
    },
  };

  await navigateToParent(router);
  assert.deepEqual(calls, ['/timer']);
});

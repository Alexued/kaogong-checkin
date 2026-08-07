import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dismissTopBackLayer,
  navigateToParent,
  normalizeParentPath,
  resolveBackAction,
} from '../src/lib/backNavigation.ts';

test('Android back closes only the highest-priority dismissible layer first', () => {
  const clicks = [];
  const layers = [
    { dataset: { backPriority: '100' }, click: () => clicks.push('editor') },
    { dataset: { backPriority: '200' }, click: () => clicks.push('celebration') },
    { dataset: { backPriority: '120' }, click: () => clicks.push('history') },
  ];

  assert.equal(dismissTopBackLayer(layers), true);
  assert.deepEqual(clicks, ['celebration']);
  assert.equal(dismissTopBackLayer([]), false);
});

test('Android back prefers the last mounted layer when priorities match', () => {
  const clicks = [];
  const layers = [
    { dataset: { backPriority: '100' }, click: () => clicks.push('first') },
    { dataset: { backPriority: 'invalid' }, click: () => clicks.push('invalid') },
    { dataset: { backPriority: '100' }, click: () => clicks.push('last') },
  ];

  assert.equal(dismissTopBackLayer(layers), true);
  assert.deepEqual(clicks, ['last']);
});

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

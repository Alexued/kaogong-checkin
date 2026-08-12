import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia } from 'pinia';
import { importTypeScript } from './import-typescript.mjs';

const { useAppStore } = await importTypeScript(new URL('../src/stores/app.ts', import.meta.url));

test('read-only recovery blocks check-in changes and reports failure to the UI', () => {
  const store = useAppStore(createPinia());
  const timestamp = '2026-08-12T00:00:00.000Z';
  store.applySnapshot({
    schemaVersion: 2,
    tasks: [{ id: 'task-1', title: 'Task', type: 'daily', endDate: null, createdAt: timestamp, updatedAt: timestamp, archived: false, order: 0, target: 1, unit: '' }],
    subtasks: [],
    checkins: [],
    timers: [],
    drills: [],
    formulaDrills: [],
    speedDrills: [],
    analysisReviews: [],
    settings: { appMode: 'exam', planEndDate: null, theme: 'light', markDate: null },
  });
  store.recoveryRequired = true;

  assert.equal(store.toggleCheckin('task-1', '2026-08-12'), false);
  assert.equal(store.checkins.length, 0);
  assert.match(store.writeBlockedMessage, /等待恢复/);
});

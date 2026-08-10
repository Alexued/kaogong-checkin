import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia } from 'pinia';
import { importTypeScript } from './import-typescript.mjs';

const { useAppStore } = await importTypeScript(new URL('../src/stores/app.ts', import.meta.url));

function snapshot(settings = {}) {
  return {
    schemaVersion: 2,
    tasks: [],
    subtasks: [],
    checkins: [],
    timers: [],
    drills: [],
    formulaDrills: [],
    settings: { planEndDate: null, theme: 'light', markDate: null, ...settings },
  };
}

test('store defaults and old snapshots use exam mode while explicit general mode persists', () => {
  const store = useAppStore(createPinia());
  assert.equal(store.settings.appMode, 'exam');

  store.applySnapshot(snapshot({ appMode: 'general' }));
  assert.equal(store.settings.appMode, 'general');

  store.applySnapshot(snapshot());
  assert.equal(store.settings.appMode, 'exam');
});

test('remote mode changes preserve drill data and reject invalid values atomically', () => {
  const store = useAppStore(createPinia());
  store.drills = [{ id: 'drill-kept' }];
  store.formulaDrills = [{ id: 'formula-kept' }];

  store.applyRemote({
    kind: 'upsert',
    entity: 'settings',
    payload: { appMode: 'general', updatedAt: '2099-08-08T00:00:00.000Z' },
  });
  assert.equal(store.settings.appMode, 'general');
  assert.equal(store.drills[0].id, 'drill-kept');
  assert.equal(store.formulaDrills[0].id, 'formula-kept');

  assert.throws(() => store.applyRemote({
    kind: 'upsert',
    entity: 'settings',
    payload: { appMode: 'focus', updatedAt: '2099-08-09T00:00:00.000Z' },
  }), /app mode/i);
  assert.equal(store.settings.appMode, 'general');
  assert.equal(store.drills[0].id, 'drill-kept');
  assert.equal(store.formulaDrills[0].id, 'formula-kept');
});

test('an invalid snapshot does not partially replace business collections', () => {
  const store = useAppStore(createPinia());
  store.tasks = [{ id: 'task-kept' }];
  const invalid = snapshot({ appMode: 'focus' });
  invalid.tasks = [{ id: 'task-rejected' }];

  assert.throws(() => store.applySnapshot(invalid), /app mode/i);
  assert.equal(store.tasks[0].id, 'task-kept');
  assert.equal(store.settings.appMode, 'exam');
});

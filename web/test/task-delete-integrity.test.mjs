import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const values = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  },
});

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
test.after(() => vite.close());
const { useAppStore } = await vite.ssrLoadModule('/src/stores/app.ts');
const { migrateLegacyToV3 } = await vite.ssrLoadModule('/src/domain/migrateV3.ts');

function stateSnapshot(store) {
  return {
    schemaVersion: 2,
    tasks: store.tasks,
    subtasks: store.subtasks,
    checkins: store.checkins,
    timers: store.timers,
    drills: store.drills,
    formulaDrills: store.formulaDrills,
    settings: store.settings,
  };
}

test('subtask and task deletion leave a v3-valid legacy state', () => {
  values.clear();
  setActivePinia(createPinia());
  const store = useAppStore();
  const createdAt = '2026-08-07T00:00:00.000Z';
  store.applySnapshot({
    schemaVersion: 2,
    tasks: [{ id: 'task-1', title: 'Task', type: 'daily', endDate: null, createdAt, updatedAt: createdAt, archived: false, order: 0, target: 1, unit: '' }],
    subtasks: [
      { id: 'sub-drop', taskId: 'task-1', title: 'Drop', order: 0, createdAt, updatedAt: createdAt },
      { id: 'sub-keep', taskId: 'task-1', title: 'Keep', order: 1, createdAt, updatedAt: createdAt },
    ],
    checkins: [
      { id: 'parent-check', taskId: 'task-1', date: '2026-08-07', createdAt, updatedAt: createdAt, deleted: false, progress: 1, targetSnapshot: 1, unitSnapshot: '' },
      { id: 'drop-check', taskId: 'sub-drop', date: '2026-08-07', createdAt, updatedAt: createdAt, deleted: false, progress: 1, targetSnapshot: 1, unitSnapshot: '' },
      { id: 'keep-check', taskId: 'sub-keep', date: '2026-08-07', createdAt, updatedAt: createdAt, deleted: false, progress: 1, targetSnapshot: 1, unitSnapshot: '' },
    ],
    timers: [
      { id: 'timer-1', label: 'History', taskId: 'task-1', date: '2026-08-07', startedAt: createdAt, durationMs: 1000, laps: [], createdAt, updatedAt: createdAt, deleted: false, mode: 'stopwatch' },
      { id: 'timer-deleted', label: 'Deleted history', taskId: 'task-1', date: '2026-08-07', startedAt: createdAt, durationMs: 500, laps: [], createdAt, updatedAt: createdAt, deleted: true, mode: 'stopwatch' },
    ],
    drills: [],
    formulaDrills: [],
    settings: { planEndDate: null, theme: 'light', markDate: null },
  });

  store.saveTask({ id: 'task-1', title: 'Task edited offline', type: 'daily' });
  store.saveSubtasks('task-1', [{ id: 'sub-keep', title: 'Keep' }]);
  assert.equal(store.subtasks.some((subtask) => subtask.id === 'sub-drop'), false);
  assert.equal(store.checkins.find((checkin) => checkin.id === 'drop-check').deleted, true);
  assert.doesNotThrow(() => migrateLegacyToV3(JSON.stringify(stateSnapshot(store))));

  store.deleteTask('task-1');
  assert.equal(store.tasks.length, 0);
  assert.equal(store.subtasks.length, 0);
  assert.equal(store.checkins.every((checkin) => checkin.deleted), true);
  assert.equal(store.timers.every((timer) => timer.taskId === null), true);
  assert.equal(store.timers.find((timer) => timer.id === 'timer-deleted').deleted, true);

  const result = migrateLegacyToV3(JSON.stringify(stateSnapshot(store)));
  assert.equal(result.state.tasks.length, 0);
  assert.equal(result.state.dailyProgress.length, 0);
  assert.equal(result.state.timerSessions.length, 2);
  assert.equal(result.state.timerSessions.every((timer) => timer.taskId === null), true);
  assert.notEqual(result.state.timerSessions.find((timer) => timer.id === 'timer-deleted').deletedAt, null);

  const queue = JSON.parse(values.get('kgc-queue'));
  const taskDeleteIndex = queue.findIndex((message) => message.entity === 'task' && message.payload.id === 'task-1');
  assert.equal(queue[taskDeleteIndex].kind, 'delete');
  assert.equal(taskDeleteIndex, queue.length - 1);
  assert.equal(queue.slice(0, taskDeleteIndex).some((message) => message.entity === 'checkin' && message.kind === 'delete'), true);
  assert.equal(queue.slice(0, taskDeleteIndex).some((message) => message.entity === 'timer' && message.payload.taskId === null), true);
});

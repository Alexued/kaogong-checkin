import test from 'node:test';
import assert from 'node:assert/strict';
import { importTypeScript } from './import-typescript.mjs';

const adapter = await importTypeScript(new URL('../src/domain/legacyAdapterV3.ts', import.meta.url));
const domain = await importTypeScript(new URL('../src/domain/v3.ts', import.meta.url));

function legacyState() {
  return {
    schemaVersion: 2,
    tasks: [
      {
        id: 'task-q', title: '数量任务', type: 'daily', endDate: null,
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z',
        archived: true, order: 3, target: 3, unit: '题',
      },
      {
        id: 'task-c', title: '清单任务', type: 'deadline', endDate: '2026-08-10',
        createdAt: '2026-08-03T00:00:00.000Z', updatedAt: '2026-08-03T00:00:00.000Z',
        archived: false, order: 1, target: 1, unit: '',
      },
    ],
    subtasks: [{
      id: 'sub-1', taskId: 'task-c', title: '子任务', order: 0,
      createdAt: '2026-08-03T00:00:00.000Z', updatedAt: '2026-08-03T00:00:00.000Z',
    }],
    checkins: [
      {
        id: 'progress-q', taskId: 'task-q', date: '2026-08-04',
        createdAt: '2026-08-04T01:00:00.000Z', updatedAt: '2026-08-04T01:00:00.000Z',
        deleted: false, progress: 2, targetSnapshot: 3, unitSnapshot: '题',
      },
      {
        id: 'progress-c', taskId: 'task-c', date: '2026-08-04',
        createdAt: '2026-08-04T02:00:00.000Z', updatedAt: '2026-08-04T02:00:00.000Z',
        deleted: false, progress: 1, targetSnapshot: 1, unitSnapshot: '',
      },
      {
        id: 'sub-check', taskId: 'sub-1', date: '2026-08-04',
        createdAt: '2026-08-04T03:00:00.000Z', updatedAt: '2026-08-04T03:00:00.000Z',
        deleted: false, progress: 1, targetSnapshot: 1, unitSnapshot: '',
      },
    ],
    timers: [{
      id: 'timer-1', label: '练习', taskId: 'task-q', date: '2026-08-04',
      startedAt: '2026-08-04T04:00:00.000Z', durationMs: 1234,
      laps: [{ elapsedMs: 1234, splitMs: 1234 }], mode: 'countdown',
      createdAt: '2026-08-04T04:00:00.000Z', updatedAt: '2026-08-04T04:01:00.000Z', deleted: true,
    }],
    drills: [{
      id: 'drill-1', percent: 33.3, userAnswer: '1/3', correct: false, mode: 'random', sessionId: 'session-p',
      createdAt: '2026-08-04T05:00:00.000Z', updatedAt: '2026-08-04T05:00:00.000Z', deleted: false,
    }],
    formulaDrills: [{
      id: 'formula-1', formulaKey: 'growth-1', known: false, mode: 'full', sessionId: 'session-f',
      createdAt: '2026-08-04T06:00:00.000Z', updatedAt: '2026-08-04T06:00:00.000Z', deleted: true,
    }],
    settings: {
      planEndDate: '2026-12-31', theme: 'dark', markDate: '2026-11-30',
      updatedAt: '2026-08-04T07:00:00.000Z',
    },
  };
}

test('toV3 preserves current v2 business fields without mutating the UI state', () => {
  const source = legacyState();
  const before = structuredClone(source);
  const state = adapter.toV3(source);

  assert.deepEqual(source, before);
  assert.doesNotThrow(() => domain.validateDomainState(state));
  const quantity = state.tasks.find((task) => task.id === 'task-q');
  assert.deepEqual(quantity.completion, { kind: 'quantity', target: 3, unit: '题' });
  assert.equal(quantity.archivedAt, '2026-08-02T00:00:00.000Z');
  assert.equal(quantity.order, 3);
  const checklist = state.tasks.find((task) => task.id === 'task-c');
  assert.equal(checklist.schedule.kind, 'deadline');
  assert.equal(checklist.schedule.endDate, '2026-08-10');
  assert.equal(checklist.subtasks[0].id, 'sub-1');
  const progress = state.dailyProgress.find((item) => item.taskId === 'task-c');
  assert.equal(progress.completed, 1);
  assert.deepEqual(progress.subtaskSnapshot, [{ id: 'sub-1', title: '子任务', done: true }]);
  assert.equal(state.timerSessions[0].mode, 'countdown');
  assert.equal(state.timerSessions[0].deletedAt, '2026-08-04T04:01:00.000Z');
  assert.deepEqual(
    state.drillAttempts.map(({ kind, catalogKey, correct, known, deletedAt }) => ({ kind, catalogKey, correct, known, deletedAt })),
    [
      { kind: 'percent', catalogKey: '33.3', correct: false, known: null, deletedAt: null },
      { kind: 'formula', catalogKey: 'growth-1', correct: null, known: false, deletedAt: '2026-08-04T06:00:00.000Z' },
    ],
  );
  assert.equal(state.settings.theme, 'dark');
  assert.equal(state.settings.markDate, '2026-11-30');
});

test('fromV3 returns every legacy UI collection and preserves record semantics', () => {
  const state = adapter.toV3(legacyState());
  const before = structuredClone(state);
  const legacy = adapter.fromV3(state);

  assert.deepEqual(state, before);
  assert.deepEqual(Object.keys(legacy).sort(), [
    'checkins', 'drills', 'formulaDrills', 'schemaVersion', 'settings', 'subtasks', 'tasks', 'timers',
  ]);
  assert.equal(legacy.schemaVersion, 2);
  assert.deepEqual(legacy.tasks.find((task) => task.id === 'task-q'), legacyState().tasks[0]);
  assert.deepEqual(legacy.subtasks, legacyState().subtasks);
  assert.deepEqual(legacy.checkins.find((item) => item.id === 'progress-q'), legacyState().checkins[0]);
  const child = legacy.checkins.find((item) => item.taskId === 'sub-1');
  assert.ok(child.id.startsWith('v3-sub:'));
  assert.deepEqual(
    { date: child.date, deleted: child.deleted, progress: child.progress, targetSnapshot: child.targetSnapshot, unitSnapshot: child.unitSnapshot },
    { date: '2026-08-04', deleted: false, progress: 1, targetSnapshot: 1, unitSnapshot: '' },
  );
  assert.deepEqual(legacy.timers, legacyState().timers);
  assert.deepEqual(legacy.drills, legacyState().drills);
  assert.deepEqual(legacy.formulaDrills, legacyState().formulaDrills);
  assert.deepEqual(legacy.settings, { planEndDate: '2026-12-31', theme: 'dark', markDate: '2026-11-30' });
});

test('a child-only completion survives a v2 to v3 to UI to v3 round trip', () => {
  const source = legacyState();
  source.checkins = source.checkins.filter((item) => item.id !== 'progress-c');
  const first = adapter.toV3(source);
  const firstProgress = first.dailyProgress.find((item) => item.taskId === 'task-c');
  assert.equal(firstProgress.completed, 0);
  assert.equal(firstProgress.deletedAt, null);
  assert.equal(firstProgress.subtaskSnapshot[0].done, true);

  const legacy = adapter.fromV3(first);
  const projectedParent = legacy.checkins.find((item) => item.taskId === 'task-c');
  assert.equal(projectedParent.deleted, true);
  assert.equal(legacy.checkins.find((item) => item.taskId === 'sub-1').deleted, false);

  const second = adapter.toV3(legacy);
  const secondProgress = second.dailyProgress.find((item) => item.taskId === 'task-c');
  assert.equal(secondProgress.completed, 0);
  assert.equal(secondProgress.deletedAt, null);
  assert.equal(secondProgress.subtaskSnapshot[0].done, true);
});

test('fromV3 hides task and subtask tombstones but retains legacy record tombstones', () => {
  const state = adapter.toV3(legacyState());
  state.tasks.find((task) => task.id === 'task-q').deletedAt = '2026-08-05T00:00:00.000Z';
  state.tasks.find((task) => task.id === 'task-c').subtasks[0].deletedAt = '2026-08-05T00:00:00.000Z';

  const legacy = adapter.fromV3(state);
  assert.equal(legacy.tasks.some((task) => task.id === 'task-q'), false);
  assert.equal(legacy.subtasks.some((subtask) => subtask.id === 'sub-1'), false);
  assert.equal(legacy.checkins.some((checkin) => checkin.id === 'progress-q'), true);
  assert.equal(legacy.checkins.some((checkin) => checkin.taskId === 'sub-1'), false);
  assert.equal(legacy.timers[0].deleted, true);
  assert.equal(legacy.formulaDrills[0].deleted, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  STATE_SCHEMA_VERSION,
  migrateAppState,
  parseAndMigrateAppState,
} from '../src/lib/stateMigration.ts';

function legacyState() {
  return {
    customRoot: { keep: true },
    tasks: [{
      id: 'task-1',
      title: '资料分析',
      type: 'daily',
      endDate: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      archived: false,
      order: 0,
      customTaskField: 'kept',
    }],
    checkins: [{
      id: 'checkin-1',
      taskId: 'task-1',
      date: '2026-08-01',
      createdAt: '2026-08-01T01:00:00.000Z',
      updatedAt: '2026-08-01T01:00:00.000Z',
      deleted: false,
      customCheckinField: 42,
    }, {
      id: 'checkin-deleted',
      taskId: 'task-1',
      date: '2026-08-02',
      createdAt: '2026-08-02T01:00:00.000Z',
      updatedAt: '2026-08-02T01:00:00.000Z',
      deleted: true,
    }],
    settings: { planEndDate: null, theme: 'light', note: '保留' },
  };
}

test('v1 state migrates to v2 without mutating input or dropping unknown fields', () => {
  const input = legacyState();
  const before = JSON.stringify(input);
  const migrated = migrateAppState(input);

  assert.equal(JSON.stringify(input), before);
  assert.notEqual(migrated, input);
  assert.equal(migrated.schemaVersion, STATE_SCHEMA_VERSION);
  assert.equal(migrated.customRoot.keep, true);
  assert.equal(migrated.tasks[0].target, 1);
  assert.equal(migrated.tasks[0].unit, '');
  assert.equal(migrated.tasks[0].customTaskField, 'kept');
  assert.deepEqual(
    migrated.checkins.map(({ progress, targetSnapshot, unitSnapshot, deleted }) => ({
      progress, targetSnapshot, unitSnapshot, deleted,
    })),
    [
      { progress: 1, targetSnapshot: 1, unitSnapshot: '', deleted: false },
      { progress: 1, targetSnapshot: 1, unitSnapshot: '', deleted: true },
    ],
  );
  assert.equal(migrated.checkins[0].customCheckinField, 42);
  for (const key of ['subtasks', 'timers', 'drills', 'formulaDrills']) {
    assert.deepEqual(migrated[key], []);
  }
});

test('migration is idempotent and normalizes invalid v2 quantities deterministically', () => {
  const first = migrateAppState({
    ...legacyState(),
    schemaVersion: 2,
    tasks: [{ ...legacyState().tasks[0], target: -20, unit: '一二三四五六七八九十一二三四' }],
    checkins: [{
      ...legacyState().checkins[0],
      progress: 99,
      targetSnapshot: 3,
      unitSnapshot: 7,
    }],
  });
  const second = migrateAppState(first);

  assert.deepEqual(second, first);
  assert.equal(first.tasks[0].target, 1);
  assert.equal(first.tasks[0].unit, '一二三四五六七八九十一二');
  assert.equal(first.checkins[0].progress, 3);
  assert.equal(first.checkins[0].targetSnapshot, 3);
  assert.equal(first.checkins[0].unitSnapshot, '');
});

test('a task with subtasks is normalized to checklist mode', () => {
  const input = legacyState();
  input.tasks[0].target = 20;
  input.tasks[0].unit = '题';
  input.subtasks = [{ id: 'sub-1', taskId: 'task-1', title: '第一组' }];
  const migrated = migrateAppState(input);
  assert.equal(migrated.tasks[0].target, 1);
  assert.equal(migrated.tasks[0].unit, '');
});

test('stored-state parsing reports whether an exact v1 backup is required', () => {
  const raw = JSON.stringify(legacyState());
  const result = parseAndMigrateAppState(raw);
  assert.equal(result.needsV1Backup, true);
  assert.equal(result.original, raw);
  assert.equal(migrateAppState(JSON.parse(result.serialized)).schemaVersion, 2);

  const v2 = parseAndMigrateAppState(result.serialized);
  assert.equal(v2.needsV1Backup, false);
  assert.deepEqual(v2.state, result.state);
});

test('corrupt, invalid-shaped, and future-version state is rejected', () => {
  assert.throws(() => parseAndMigrateAppState('{bad json'));
  assert.throws(() => migrateAppState(null), /state/i);
  assert.throws(() => migrateAppState({ tasks: {}, checkins: [] }), /tasks/i);
  assert.throws(() => migrateAppState({ schemaVersion: 3, tasks: [], checkins: [] }), /version/i);
});

test('local hydration backs up v1 before replacing it and blocks writes after migration failure', async () => {
  const source = await readFile(new URL('../src/api/sync.ts', import.meta.url), 'utf8');
  const backupWrite = source.indexOf('localStorage.setItem(V1_BACKUP_KEY, migrated.original)');
  const migratedWrite = source.indexOf('localStorage.setItem(LOCAL_STATE_KEY, migrated.serialized)');
  assert.ok(backupWrite >= 0 && migratedWrite > backupWrite);
  assert.match(source, /if \(cached\.recoveryRequired\) \{[\s\S]*store\.loaded = true;[\s\S]*return;/);
});

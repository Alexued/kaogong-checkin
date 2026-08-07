import test from 'node:test';
import assert from 'node:assert/strict';
import { importTypeScript } from './import-typescript.mjs';

const migration = await importTypeScript(new URL('../src/domain/migrateV3.ts', import.meta.url));
const domain = await importTypeScript(new URL('../src/domain/v3.ts', import.meta.url));
const repositoryModule = await importTypeScript(new URL('../src/storage/repositoryV3.ts', import.meta.url));

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); this.failKey = null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { if (key === this.failKey) throw new Error('quota'); this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function legacyState() {
  return {
    schemaVersion: 2,
    tasks: [{ id: 'task-1', title: '资料分析', type: 'daily', endDate: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', archived: false, order: 2, target: 1, unit: '' }],
    subtasks: [{ id: 'sub-1', taskId: 'task-1', title: '第一组', order: 0, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }],
    checkins: [
      { id: 'parent-old', taskId: 'task-1', date: '2026-08-01', createdAt: '2026-08-01T01:00:00.000Z', updatedAt: '2026-08-01T01:00:00.000Z', deleted: false, progress: 1, targetSnapshot: 1, unitSnapshot: '' },
      { id: 'parent-new', taskId: 'task-1', date: '2026-08-01', createdAt: '2026-08-01T02:00:00.000Z', updatedAt: '2026-08-01T02:00:00.000Z', deleted: true, progress: 0, targetSnapshot: 1, unitSnapshot: '' },
      { id: 'sub-1-check', taskId: 'sub-1', date: '2026-08-01', createdAt: '2026-08-01T03:00:00.000Z', updatedAt: '2026-08-01T03:00:00.000Z', deleted: false, progress: 1, targetSnapshot: 1, unitSnapshot: '' },
    ],
    timers: [], drills: [], formulaDrills: [],
    settings: { planEndDate: null, theme: 'dark', markDate: '2026-08-10' },
  };
}

test('v2 parent and subtask records map deterministically to one daily snapshot', () => {
  const source = legacyState();
  const result = migration.migrateLegacyToV3(JSON.stringify(source), JSON.stringify([]));
  assert.equal(result.state.tasks[0].schedule.startDate, '2026-08-01');
  assert.equal(result.state.tasks[0].order, 2);
  assert.equal(result.state.dailyProgress.length, 1);
  assert.equal(result.state.dailyProgress[0].completed, 0, 'latest deleted parent wins');
  assert.deepEqual(result.state.dailyProgress[0].subtaskSnapshot, [{ id: 'sub-1', title: '第一组', done: true }]);
  assert.equal(result.report.duplicateCount, 1);
  assert.doesNotThrow(() => domain.validateDomainState(result.state));
});

test('legacy timer performance fractions are rounded before v3 validation', () => {
  const source = legacyState();
  source.timers = [{
    id: 'timer-fractional',
    label: 'stopwatch',
    taskId: null,
    date: '2026-08-01',
    startedAt: '2026-08-01T03:00:00.000Z',
    durationMs: 12362.100000023842,
    laps: [{ elapsedMs: 12362.100000023842, splitMs: 12362.100000023842 }],
    createdAt: '2026-08-01T03:00:00.000Z',
    updatedAt: '2026-08-01T03:30:00.000Z',
    deleted: false,
    mode: 'stopwatch',
  }];
  const result = migration.migrateLegacyToV3(JSON.stringify(source));
  assert.equal(result.state.timerSessions[0].durationMs, 12362);
  assert.deepEqual(result.state.timerSessions[0].laps[0], { elapsedMs: 12362, splitMs: 12362 });
  assert.doesNotThrow(() => domain.validateDomainState(result.state));
});

test('orphan progress is fatal instead of being silently dropped', () => {
  const source = legacyState();
  source.checkins.push({ id: 'orphan', taskId: 'missing', date: '2026-08-01', createdAt: '2026-08-01T01:00:00.000Z', updatedAt: '2026-08-01T01:00:00.000Z', deleted: false, progress: 1, targetSnapshot: 1, unitSnapshot: '' });
  assert.throws(() => migration.migrateLegacyToV3(JSON.stringify(source)), /ORPHAN_CHECKIN/);
});

test('repository migration stores exact source backup and commits a stable v3 envelope', async () => {
  const rawState = JSON.stringify(legacyState());
  const rawQueue = JSON.stringify([]);
  const storage = new MemoryStorage({ 'kgc-state': rawState, 'kgc-queue': rawQueue });
  const repository = new repositoryModule.RepositoryV3(storage);
  const loaded = await repository.load();
  assert.equal(loaded.migrated, true);
  assert.equal(storage.getItem('kgc-migration-backup-v3') !== null, true);
  const backup = await repository.exportBackup();
  assert.equal(backup.sources.find((item) => item.key === 'kgc-state').raw, rawState);
  const firstRevision = loaded.record.envelope.revision;
  const nextState = structuredClone(loaded.record.envelope.state);
  nextState.settings.theme = 'light';
  const committed = await repository.commit(nextState);
  assert.equal(committed.envelope.revision, firstRevision + 1);
  assert.equal(committed.envelope.deviceId, loaded.record.envelope.deviceId);
});

test('repository locks a corrupt primary and never substitutes blank state', async () => {
  const storage = new MemoryStorage({ 'kgc-repository-v3': '{broken' });
  const repository = new repositoryModule.RepositoryV3(storage);
  await assert.rejects(repository.load(), (error) => error instanceof repositoryModule.MigrationLockedError);
  assert.equal(storage.getItem('kgc-repository-v3'), '{broken');
  assert.ok(storage.getItem('kgc-migration-lock-v3'));
});

test('repository write failure preserves the complete previous primary record', async () => {
  const storage = new MemoryStorage();
  const repository = new repositoryModule.RepositoryV3(storage);
  const loaded = await repository.load();
  const previous = storage.getItem('kgc-repository-v3');
  const nextState = structuredClone(loaded.record.envelope.state);
  nextState.settings.theme = 'dark';
  storage.failKey = 'kgc-repository-v3';

  await assert.rejects(
    repository.commit(nextState),
    (error) => error.code === 'REPOSITORY_WRITE_FAILED',
  );
  assert.equal(storage.getItem('kgc-repository-v3'), previous);
});

test('migration source changes after backup are locked without overwriting either source', async () => {
  const originalState = JSON.stringify(legacyState());
  const changed = legacyState();
  changed.tasks[0].title = 'changed-after-backup';
  const rawQueue = JSON.stringify([]);
  const backupStorage = new MemoryStorage({ 'kgc-state': originalState, 'kgc-queue': rawQueue });
  const firstRepository = new repositoryModule.RepositoryV3(backupStorage);
  await firstRepository.load();
  const backup = backupStorage.getItem('kgc-migration-backup-v3');

  const storage = new MemoryStorage({
    'kgc-state': JSON.stringify(changed),
    'kgc-queue': rawQueue,
    'kgc-migration-backup-v3': backup,
  });
  const repository = new repositoryModule.RepositoryV3(storage);
  await assert.rejects(repository.load(), (error) => {
    assert.equal(error.lock.errorCode, 'MIGRATION_SOURCE_CHANGED');
    return true;
  });
  assert.equal(storage.getItem('kgc-state'), JSON.stringify(changed));
  assert.equal(storage.getItem('kgc-migration-backup-v3'), backup);
  assert.equal(storage.getItem('kgc-repository-v3'), null);
});

test('a damaged migration lock remains fail-closed even with a valid primary', async () => {
  const seedStorage = new MemoryStorage();
  const seedRepository = new repositoryModule.RepositoryV3(seedStorage);
  await seedRepository.load();
  const primary = seedStorage.getItem('kgc-repository-v3');
  const storage = new MemoryStorage({
    'kgc-repository-v3': primary,
    'kgc-migration-lock-v3': '{damaged',
  });
  const repository = new repositoryModule.RepositoryV3(storage);
  await assert.rejects(repository.load(), (error) => {
    assert.equal(error.lock.errorCode, 'INVALID_MIGRATION_LOCK');
    return true;
  });
  assert.equal(storage.getItem('kgc-repository-v3'), primary);
});

test('manual migration retry rebuilds only from the preserved backup and clears the lock', async () => {
  const rawState = JSON.stringify(legacyState());
  const rawQueue = JSON.stringify([]);
  const sourceStorage = new MemoryStorage({ 'kgc-state': rawState, 'kgc-queue': rawQueue });
  const sourceRepository = new repositoryModule.RepositoryV3(sourceStorage);
  await sourceRepository.load();
  const storage = new MemoryStorage({
    'kgc-state': '{live-source-is-corrupt',
    'kgc-queue': '[{"live":"queue"}]',
    'kgc-migration-backup-v3': sourceStorage.getItem('kgc-migration-backup-v3'),
    'kgc-migration-lock-v3': JSON.stringify({
      formatVersion: 1,
      sourceDigest: 'locked',
      sourceBytesRef: 'backup',
      errorCode: 'MIGRATION_FAILED',
      firstFailedAt: '2026-08-08T00:00:00.000Z',
    }),
  });
  const repository = new repositoryModule.RepositoryV3(storage);
  const retried = await repository.retryMigration();
  assert.equal(retried.record.envelope.state.tasks[0].title, legacyState().tasks[0].title);
  assert.equal(storage.getItem('kgc-migration-lock-v3'), null);
  assert.equal(storage.getItem('kgc-state'), '{live-source-is-corrupt');
  assert.equal(storage.getItem('kgc-queue'), '[{"live":"queue"}]');
});

test('domain validation rejects duplicate progress keys and orphan timers', () => {
  const state = domain.emptyDomainState();
  state.tasks.push({
    id: 'task-1', title: 'Task', schedule: { kind: 'daily', startDate: '2026-01-01', endDate: null },
    completion: { kind: 'checklist', target: 1, unit: '' }, subtasks: [], order: 0,
    archivedAt: null, deletedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  });
  const progress = { id: 'progress-1', taskId: 'task-1', date: '2026-01-01', completed: 1, targetSnapshot: 1, unitSnapshot: '', subtaskSnapshot: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null };
  state.dailyProgress.push(progress, { ...progress, id: 'progress-2' });
  assert.throws(() => domain.validateDomainState(state), /DUPLICATE_PROGRESS/);
  state.dailyProgress = [];
  state.timerSessions.push({ id: 'timer-1', label: '', taskId: 'missing', date: '2026-01-01', startedAt: '2026-01-01T00:00:00.000Z', durationMs: 0, laps: [], mode: 'stopwatch', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null });
  assert.throws(() => domain.validateDomainState(state), /ORPHAN_TIMER/);
});

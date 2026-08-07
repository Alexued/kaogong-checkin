import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importTypeScript } from './import-typescript.mjs';

const { completionForDate } = await importTypeScript(new URL('../src/lib/completion.ts', import.meta.url));
const { buildProgressCheckin, generatePlan, selectProgressSource } =
  await importTypeScript(new URL('../src/lib/plan.ts', import.meta.url));

const baseTask = (overrides = {}) => ({
  id: 'task-1',
  title: '资料分析',
  type: 'daily',
  target: 20,
  unit: '题',
  endDate: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  archived: false,
  order: 0,
  ...overrides,
});

const checkin = (date, progress, targetSnapshot = 20, overrides = {}) => ({
  id: `checkin-${date}`,
  taskId: 'task-1',
  date,
  progress,
  targetSnapshot,
  unitSnapshot: '题',
  createdAt: `${date}T01:00:00.000Z`,
  updatedAt: `${date}T01:00:00.000Z`,
  deleted: false,
  ...overrides,
});

test('quantity completion uses immutable checkin snapshots rather than an edited task target', () => {
  const task = baseTask({ target: 30, unit: '道' });
  const plan = generatePlan([task], [checkin('2026-08-03', 10)], '2026-08-03', null);
  assert.equal(plan.today[0].progress, 10);
  assert.equal(plan.today[0].target, 20);
  assert.equal(plan.today[0].unit, '题');
  assert.equal(plan.today[0].done, false);
});

test('three days of debt aggregate by task while retaining every source date', () => {
  const plan = generatePlan(
    [baseTask()],
    [checkin('2026-08-01', 5), checkin('2026-08-02', 20)],
    '2026-08-04',
    null,
  );

  assert.equal(plan.carried.length, 1);
  const debt = plan.carried[0];
  assert.equal(debt.date, '2026-08-01');
  assert.equal(debt.progress, 5);
  assert.equal(debt.target, 40);
  assert.deepEqual(debt.sources.map((source) => source.date), ['2026-08-01', '2026-08-03']);
  assert.equal(selectProgressSource(debt, 1).date, '2026-08-01');
  assert.equal(selectProgressSource(debt, -1).date, '2026-08-01');
});

test('completion ratio includes partial quantity progress without marking the task done', () => {
  const summary = completionForDate(
    [baseTask(), baseTask({ id: 'task-2', title: '复盘', target: 1, unit: '' })],
    [checkin('2026-08-03', 10), {
      ...checkin('2026-08-03', 1, 1), id: 'checkin-task-2', taskId: 'task-2', unitSnapshot: '',
    }],
    '2026-08-03',
    null,
  );
  assert.equal(summary.done, 1);
  assert.equal(summary.total, 2);
  assert.equal(summary.ratio, 0.75);
});

test('progress records keep first snapshots, clamp values, and soft-delete at zero', () => {
  let record = buildProgressCheckin(
    baseTask(), 'task-1', '2026-08-03', 1, undefined,
    '2026-08-03T01:00:00.000Z', 'record-1',
  );
  assert.equal(record.progress, 1);
  assert.equal(record.targetSnapshot, 20);
  assert.equal(record.unitSnapshot, '题');

  record = buildProgressCheckin(
    baseTask({ target: 50, unit: '道' }), 'task-1', '2026-08-03', 2, record,
    '2026-08-03T02:00:00.000Z', 'ignored',
  );
  assert.equal(record.progress, 2);
  assert.equal(record.targetSnapshot, 20);
  assert.equal(record.unitSnapshot, '题');

  record = buildProgressCheckin(
    baseTask(), 'task-1', '2026-08-03', 0, record,
    '2026-08-03T03:00:00.000Z', 'ignored',
  );
  assert.equal(record.deleted, true);
  assert.equal(record.progress, 0);
  const debt = generatePlan(
    [baseTask({ target: 50, unit: '道' })],
    [record],
    '2026-08-04',
    null,
  ).carried[0].sources.find((source) => source.date === '2026-08-03');
  assert.equal(debt.target, 20);
  assert.equal(debt.unit, '题');
  assert.equal(buildProgressCheckin(baseTask(), 'task-1', '2026-08-04', 0, undefined, 'now', 'new'), null);
});

test('store exposes quantity actions and enforces checklist targets when subtasks are saved', async () => {
  const source = await readFile(new URL('../src/stores/app.ts', import.meta.url), 'utf8');
  assert.match(source, /setProgress\(/);
  assert.match(source, /incrementProgress\(/);
  assert.match(source, /decrementProgress\(/);
  assert.match(source, /target:\s*1,\s*unit:\s*''/s);
});

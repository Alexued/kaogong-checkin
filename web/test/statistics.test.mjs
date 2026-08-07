import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  completionSeries,
  monthlyCompletion,
  recentRecordDays,
  statisticsSummary,
  timerComparisonGroups,
} from '../src/lib/statistics.ts';

const heatmapSource = await readFile(new URL('../src/components/MonthlyHeatmap.vue', import.meta.url), 'utf8');
const barChartSource = await readFile(new URL('../src/components/BarChart.vue', import.meta.url), 'utf8');
const statsViewSource = await readFile(new URL('../src/views/StatsView.vue', import.meta.url), 'utf8');

function task(overrides = {}) {
  return {
    id: 'daily',
    title: '行测',
    type: 'daily',
    endDate: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    archived: false,
    order: 0,
    target: 1,
    unit: '',
    ...overrides,
  };
}

function checkin(date, overrides = {}) {
  return {
    id: `checkin-${date}`,
    taskId: 'daily',
    date,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
    deleted: false,
    progress: 1,
    targetSnapshot: 1,
    unitSnapshot: '',
    ...overrides,
  };
}

function timer(index, overrides = {}) {
  const minute = String(index).padStart(2, '0');
  return {
    id: `timer-${index}`,
    label: `第 ${index} 组`,
    taskId: null,
    date: '2026-08-04',
    startedAt: `2026-08-04T08:${minute}:00.000Z`,
    durationMs: index * 1_000,
    laps: [],
    createdAt: `2026-08-04T08:${minute}:00.000Z`,
    updatedAt: `2026-08-04T08:${minute}:00.000Z`,
    deleted: false,
    mode: 'stopwatch',
    ...overrides,
  };
}

test('summary uses full attendance, quantity progress, missing days, and a stable plan countdown', () => {
  const tasks = [task({ target: 3 })];
  const checkins = [
    checkin('2026-08-01', { progress: 3, targetSnapshot: 3 }),
    checkin('2026-08-03', { progress: 2, targetSnapshot: 3 }),
    checkin('2026-08-04', { progress: 3, targetSnapshot: 3 }),
    checkin('2026-08-02', { deleted: true, progress: 3, targetSnapshot: 3 }),
  ];

  assert.deepEqual(statisticsSummary(tasks, checkins, '2026-08-04', '2026-08-10'), {
    streakDays: 1,
    fullAttendanceDays: 2,
    averageCompletionRate: 2 / 3,
    daysUntilPlanEnd: 6,
  });
});

test('an unfinished today does not immediately erase the completed streak through yesterday', () => {
  const tasks = [task({ target: 2 })];
  const checkins = [
    checkin('2026-08-02', { progress: 2, targetSnapshot: 2 }),
    checkin('2026-08-03', { progress: 2, targetSnapshot: 2 }),
    checkin('2026-08-04', { progress: 1, targetSnapshot: 2 }),
  ];

  assert.equal(statisticsSummary(tasks, checkins, '2026-08-04', null).streakDays, 2);
});

test('a deadline task remains scheduled on historical days before its completion', () => {
  const tasks = [task({ id: 'deadline', type: 'deadline', endDate: '2026-08-03' })];
  const checkins = [checkin('2026-08-03', { id: 'deadline-done', taskId: 'deadline' })];

  const bars = completionSeries(tasks, checkins, '2026-08-03', null);
  assert.deepEqual(
    bars.slice(-3).map((bar) => [bar.date, bar.percent]),
    [['2026-08-01', 0], ['2026-08-02', 0], ['2026-08-03', 100]],
  );
  assert.equal(statisticsSummary(tasks, checkins, '2026-08-03', null).averageCompletionRate, 1 / 3);
});

test('month projection always yields a Monday-first six-week grid and marks recorded dates', () => {
  const month = monthlyCompletion(
    [task()],
    [checkin('2026-08-01')],
    '2026-08',
    '2026-08-04',
    null,
    ['2026-08-01', '2026-08-03'],
  );

  assert.equal(month.label, '2026年8月');
  assert.equal(month.previousMonth, '2026-07');
  assert.equal(month.nextMonth, '2026-09');
  assert.equal(month.cells.length, 42);
  assert.equal(month.cells[0].date, '2026-07-27');
  assert.equal(month.cells.at(-1).date, '2026-09-06');
  assert.deepEqual(
    month.cells.find((cell) => cell.date === '2026-08-01'),
    {
      date: '2026-08-01',
      day: 1,
      inMonth: true,
      isToday: false,
      isFuture: false,
      hasRecord: true,
      done: 1,
      total: 1,
      ratio: 1,
      percent: 100,
      level: 4,
    },
  );
  assert.equal(month.cells.find((cell) => cell.date === '2026-08-03').hasRecord, true);
  assert.equal(month.cells.find((cell) => cell.date === '2026-08-05').isFuture, true);
});

test('completion series keeps exactly fourteen calendar days including zero-value absences', () => {
  const bars = completionSeries(
    [task({ createdAt: '2026-07-01T00:00:00.000Z' })],
    [checkin('2026-07-22'), checkin('2026-08-04')],
    '2026-08-04',
    null,
  );

  assert.equal(bars.length, 14);
  assert.equal(bars[0].date, '2026-07-22');
  assert.equal(bars.at(-1).date, '2026-08-04');
  assert.equal(bars[0].percent, 100);
  assert.equal(bars[1].percent, 0);
  assert.equal(bars.at(-1).isToday, true);
});

test('timer comparison selects the latest twelve non-deleted records before grouping modes', () => {
  const records = Array.from({ length: 13 }, (_, index) => timer(index + 1));
  records.push(timer(59, { id: 'deleted', deleted: true, durationMs: 1 }));
  records[10].mode = 'countdown';
  records[11].mode = 'countdown';
  records[12].mode = 'countdown';

  const groups = timerComparisonGroups(records);

  assert.deepEqual(groups.map((group) => group.mode), ['stopwatch', 'countdown']);
  assert.equal(groups.reduce((sum, group) => sum + group.bars.length, 0), 12);
  assert.equal(groups.flatMap((group) => group.bars).some((bar) => bar.id === 'timer-1'), false);
  assert.equal(groups[0].fastestId, 'timer-2');
  assert.equal(groups[1].fastestId, 'timer-11');
  assert.equal(groups[1].averageMs, 12_000);
});

test('recent record dates use explicit local dates at time-zone boundaries and exclude deleted rows', () => {
  const timers = [
    timer(1, {
      date: '2026-08-01',
      startedAt: '2026-08-02T00:30:00.000Z',
      createdAt: '2026-08-02T00:30:00.000Z',
    }),
  ];
  const drills = [
    {
      id: 'drill-1', percent: 25, userAnswer: '1/4', correct: true, mode: 'full',
      sessionId: 'percent-session', createdAt: '2026-08-03T23:30:00.000Z',
      updatedAt: '2026-08-03T23:30:00.000Z', deleted: false,
    },
  ];
  const formulas = [
    {
      id: 'formula-1', formulaKey: 'growth', known: true, mode: 'random',
      sessionId: 'formula-session', createdAt: '2026-08-03T23:40:00.000Z',
      updatedAt: '2026-08-03T23:40:00.000Z', deleted: true,
    },
  ];

  const days = recentRecordDays(
    [task()],
    [checkin('2026-08-02')],
    timers,
    drills,
    formulas,
    '2026-08-04',
    null,
    () => '2026-08-04',
  );

  assert.deepEqual(days.map((day) => day.date), ['2026-08-04', '2026-08-02', '2026-08-01']);
  assert.equal(days[0].drillSessions, 1);
  assert.equal(days[0].formulaSessions, 0);
  assert.equal(days[2].timerSessions, 1);
});

test('empty statistics remain finite and recent record dates are capped at fourteen', () => {
  assert.deepEqual(statisticsSummary([], [], '2026-08-04', null), {
    streakDays: 0,
    fullAttendanceDays: 0,
    averageCompletionRate: 0,
    daysUntilPlanEnd: null,
  });

  const timers = Array.from({ length: 16 }, (_, index) => timer(index + 1, {
    date: `2026-07-${String(index + 1).padStart(2, '0')}`,
  }));
  const days = recentRecordDays([], [], timers, [], [], '2026-08-04', null);
  assert.equal(days.length, 14);
  assert.equal(days[0].date, '2026-07-16');
  assert.equal(days.at(-1).date, '2026-07-03');
});

test('statistics components keep accessible, stable, responsive chart geometry', () => {
  assert.match(heatmapSource, /role="grid"/);
  assert.match(heatmapSource, /@keydown="moveFocus/);
  assert.match(heatmapSource, /Array\.from\(\{ length: 6 \}/);
  assert.match(heatmapSource, /@media \(max-height: 420px\) and \(orientation: landscape\)/);
  assert.match(heatmapSource, /@media \(prefers-reduced-motion: reduce\)/);

  assert.match(barChartSource, /role="img"/);
  assert.match(barChartSource, /aria-describedby/);
  assert.match(barChartSource, /height: 188px/);
  assert.match(barChartSource, /@media \(max-width: 360px\)/);
  assert.match(barChartSource, /@media \(prefers-reduced-motion: reduce\)/);

  assert.match(statsViewSource, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(statsViewSource, /@media \(max-height: 420px\) and \(orientation: landscape\)/);
  assert.match(statsViewSource, /@media \(prefers-reduced-motion: reduce\)/);
});

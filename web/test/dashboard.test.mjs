import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importTypeScript } from './import-typescript.mjs';

const dashboard = await importTypeScript(new URL('../src/lib/dashboard.ts', import.meta.url));

function task(id, title, type = 'daily') {
  return {
    id, title, type, endDate: null,
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
    archived: false, order: 0, target: 1, unit: '',
  };
}

function item(t, done = false) {
  return { task: t, date: '2026-08-13', overdueDays: 0, progress: done ? 1 : 0, target: 1, unit: '', done };
}

test('dashboard tracks use exam labels and split task names into 行测 and 申论', () => {
  const plan = {
    today: [item(task('a', '行测资料分析')), item(task('b', '申论综合分析'))],
    carried: [],
  };
  assert.deepEqual(
    dashboard.buildDashboardTracks(plan, 'exam').map(({ label, total, done, ratio }) => ({ label, total, done, ratio })),
    [
      { label: '行测', total: 1, done: 0, ratio: 0 },
      { label: '申论', total: 1, done: 0, ratio: 0 },
    ],
  );
});

test('general dashboard uses neutral 行动 and 习惯 tracks and prioritizes carried work', () => {
  const overdue = item(task('a', '晨间阅读'), true);
  const current = item(task('b', '散步'), false);
  const plan = { today: [current], carried: [overdue] };
  const tracks = dashboard.buildDashboardTracks(plan, 'general');
  assert.deepEqual(tracks.map((track) => track.label), ['行动', '习惯']);
  assert.equal(dashboard.buildDashboardSuggestion(plan, 0, 'general').tone, 'warn');
  assert.match(dashboard.buildDashboardSuggestion(plan, 0, 'general').title, /散步|晨间阅读/);
});

test('capability metrics remain finite with empty and malformed timer values', () => {
  const metrics = dashboard.buildCapabilityMetrics({
    mode: 'exam', tasks: [], checkins: [],
    timers: [{ deleted: false, date: '2026-08-13', durationMs: NaN }],
    speedDrills: [], analysisReviews: [], today: '2026-08-13',
  });
  assert.equal(metrics[1].value, '0 分钟');
  assert.ok(metrics.every((metric) => !/NaN|Infinity/.test(`${metric.value} ${metric.detail}`)));
});

test('new surfaces expose the expected mobile workflows and PixelGrid feedback', async () => {
  const [today, focus, stats, timer, appStyles, tabBar] = await Promise.all([
    readFile(new URL('../src/views/TodayView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/drill/FocusQuestionPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/StatsView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/TimerView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/TabBar.vue', import.meta.url), 'utf8'),
  ]);
  assert.match(today, /dashboard-suggestion/);
  assert.match(today, /runSuggestion/);
  assert.match(today, /行动与习惯双轨/);
  assert.match(focus, /题目面板/);
  assert.match(focus, /收藏/);
  assert.match(focus, /标记/);
  assert.match(focus, /草稿/);
  assert.match(focus, /用 Skills 复盘/);
  assert.match(focus, /PixelGrid/);
  assert.match(focus, /closest<HTMLElement>\('\.swipe-page'\)/);
  assert.match(focus, /await nextTick\(\)/);
  assert.match(focus, /window\.scrollTo\(\{ top: 0, behavior: 'auto' \}\)/);
  assert.match(focus, /onDeactivated\(\(\) => document\.body\.classList\.remove\('focus-session-open'\)\)/);
  assert.match(focus, /onActivated\(\(\) => document\.body\.classList\.toggle\('focus-session-open', stage\.value === 'practice'\)\)/);
  assert.match(appStyles, /body\.focus-session-open \.tabbar\s*\{\s*display: none;/);
  assert.doesNotMatch(tabBar, /:global\(body\.focus-session-open\)/);
  assert.match(stats, /最近的能力变化/);
  assert.match(timer, /route.query.taskId/);
});

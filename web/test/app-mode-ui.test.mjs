import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { APP_MODE_COPY, effectivePlanEnd } from '../src/lib/appMode.ts';

test('mode policy preserves the exam boundary and removes it from general planning', () => {
  const planEndDate = '2026-12-31';
  assert.equal(effectivePlanEnd({ appMode: 'exam', planEndDate }), planEndDate);
  assert.equal(effectivePlanEnd({ appMode: 'general', planEndDate }), null);
  assert.equal(APP_MODE_COPY.exam.navigationLabel, '背诵');
  assert.equal(APP_MODE_COPY.general.navigationLabel, '复盘');
});

test('general mode owns a review root and filters exam-only activity from summaries', async () => {
  const [drill, stats, today, router, dayDetail, tasks] = await Promise.all([
    readFile(new URL('../src/views/DrillView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/StatsView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/TodayView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/router.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/DayDetailView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/TasksView.vue', import.meta.url), 'utf8'),
  ]);

  assert.match(drill, /<StatsView v-if="isGeneral"/);
  assert.match(stats, /visibleDrills/);
  assert.match(stats, /route\.path === '\/drill' \? '\/review\/day'/);
  assert.match(today, /effectivePlanEnd\(store\.settings\)/);
  assert.match(today, /class="head-btn icon-only"[\s\S]*aria-label="isGeneral \? '新增打卡项' : '新增任务'"/);
  assert.match(today, /empty-landscape-add/);
  assert.match(today, /v-if="showFab"/);
  assert.match(router, /path: '\/review\/day\/:date'/);
  assert.match(dayDetail, /resolveDayDetailSiblingPath\(route\.name/);
  assert.match(dayDetail, /store\.subtasks\.find\(\(subtask\) => subtask\.id === c\.taskId\)/);
  assert.match(tasks, /相关打卡进度将从本机移除/);
  assert.match(tasks, /计时记录会保留，但不再关联这个任务/);
});

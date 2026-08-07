<template>
  <div class="page stats-page">
    <header class="page-heading">
      <h1 class="page-title">统计</h1>
      <p class="page-sub">计划完成情况与练习节奏</p>
    </header>

    <section class="card summary-strip" aria-label="学习摘要">
      <div class="summary-item">
        <strong>{{ summary.streakDays }}</strong>
        <span>连续全勤</span>
      </div>
      <div class="summary-item">
        <strong>{{ summary.fullAttendanceDays }}</strong>
        <span>全勤天数</span>
      </div>
      <div class="summary-item">
        <strong>{{ Math.round(summary.averageCompletionRate * 100) }}%</strong>
        <span>平均完成率</span>
      </div>
      <div class="summary-item">
        <strong>{{ summary.daysUntilPlanEnd ?? '—' }}</strong>
        <span>距计划结束</span>
      </div>
    </section>

    <div class="overview-grid">
      <section class="card section-panel heatmap-panel" style="--enter-order: 1">
        <div class="panel-head">
          <div>
            <h2>月度完成</h2>
            <p>{{ monthRecordedCount }} 个记录日</p>
          </div>
        </div>
        <MonthlyHeatmap
          :model="month"
          :can-go-next="month.month < today.slice(0, 7)"
          @previous="visibleMonth = month.previousMonth"
          @next="visibleMonth = month.nextMonth"
          @select="goDay"
        />
      </section>

      <section class="card section-panel rate-panel" style="--enter-order: 2">
        <div class="panel-head">
          <div>
            <h2>近 14 天完成率</h2>
            <p>{{ recentPlannedDays }} 个计划日</p>
          </div>
          <strong class="panel-metric">{{ recentAverage }}%</strong>
        </div>
        <BarChart
          :bars="rateBars"
          aria-label="最近十四天每日完成率柱状图"
          :max-value="100"
          :show-scale="true"
          scale-suffix="%"
          empty-text="暂无计划记录"
        />
      </section>
    </div>

    <section class="card section-panel timer-panel" style="--enter-order: 3">
      <div class="panel-head">
        <div>
          <h2>最近 12 条计时</h2>
          <p>{{ recentTimerCount }} 条有效记录</p>
        </div>
      </div>

      <template v-if="timerGroups.length">
        <div v-for="group in timerGroups" :key="group.mode" class="timer-group">
          <div class="timer-group-head">
            <div>
              <h3>{{ group.mode === 'stopwatch' ? '秒表' : '倒计时' }}</h3>
              <span>{{ group.bars.length }} 条记录</span>
            </div>
            <dl>
              <div><dt>平均</dt><dd>{{ fmtDuration(group.averageMs) }}</dd></div>
              <div><dt>最快</dt><dd>{{ fastestText(group) }}</dd></div>
            </dl>
          </div>
          <BarChart
            :bars="timerBars(group)"
            :aria-label="`${group.mode === 'stopwatch' ? '秒表' : '倒计时'}最近用时柱状图`"
            :average="group.averageMs"
            :average-label="`平均 ${fmtDuration(group.averageMs)}`"
          />
        </div>
      </template>
      <BarChart
        v-else
        :bars="[]"
        aria-label="最近计时记录为空"
        empty-text="暂无计时记录"
      />
    </section>

    <section class="records-section section-panel" style="--enter-order: 4" aria-labelledby="record-days-title">
      <div class="section-title-row">
        <div>
          <h2 id="record-days-title">最近记录日</h2>
          <p>任务、计时与背诵</p>
        </div>
        <span>{{ recordDays.length }} 天</span>
      </div>
      <div class="card record-list">
        <button
          v-for="day in recordDays"
          :key="day.date"
          type="button"
          class="record-row"
          @click="goDay(day.date)"
        >
          <span class="record-date">
            <strong>{{ formatCn(day.date) }}</strong>
            <small>周{{ weekdayCn(day.date) }}</small>
          </span>
          <span class="record-summary">{{ recordSummary(day) }}</span>
          <span v-if="day.total > 0" class="record-rate" :class="{ full: day.ratio === 1 }">
            {{ day.ratio === 1 ? '全勤' : `${Math.round(day.ratio * 100)}%` }}
          </span>
          <span class="row-arrow" aria-hidden="true">›</span>
        </button>
        <div v-if="!recordDays.length" class="records-empty">暂无学习记录</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import BarChart, { type ChartBar } from '../components/BarChart.vue';
import MonthlyHeatmap from '../components/MonthlyHeatmap.vue';
import { formatCn, todayStr, weekdayCn } from '../lib/date';
import {
  completionSeries,
  monthlyCompletion,
  recentRecordDays,
  recordedDates,
  statisticsSummary,
  timerComparisonGroups,
  type RecordDay,
  type TimerComparisonGroup,
} from '../lib/statistics';
import { fmtDuration } from '../lib/stopwatch';
import { useAppStore } from '../stores/app';

const store = useAppStore();
const router = useRouter();
const today = todayStr();
const visibleMonth = ref(today.slice(0, 7));

/** Subtask check-ins stay out of main-task completion statistics. */
const mainCheckins = computed(() => {
  const subtaskIds = new Set(store.subtasks.map((subtask) => subtask.id));
  return store.checkins.filter((checkin) => !subtaskIds.has(checkin.taskId));
});

const planEndDate = computed(() => store.settings.planEndDate || null);
const allRecordDates = computed(() => recordedDates(
  mainCheckins.value,
  store.timers,
  store.drills,
  store.formulaDrills,
));
const summary = computed(() => statisticsSummary(
  store.tasks,
  mainCheckins.value,
  today,
  planEndDate.value,
));
const month = computed(() => monthlyCompletion(
  store.tasks,
  mainCheckins.value,
  visibleMonth.value,
  today,
  planEndDate.value,
  allRecordDates.value,
));
const recentCompletion = computed(() => completionSeries(
  store.tasks,
  mainCheckins.value,
  today,
  planEndDate.value,
));
const rateBars = computed<ChartBar[]>(() => recentCompletion.value.map((point) => ({
  id: point.date,
  label: point.label,
  value: point.percent,
  valueLabel: point.valueLabel,
  title: point.date,
  highlight: point.isToday,
})));
const recentAverage = computed(() => {
  const planned = recentCompletion.value.filter((point) => point.total > 0);
  return planned.length
    ? Math.round(planned.reduce((sum, point) => sum + point.percent, 0) / planned.length)
    : 0;
});
const timerGroups = computed(() => timerComparisonGroups(store.timers));
const recentPlannedDays = computed(() => recentCompletion.value.filter((point) => point.total > 0).length);
const recentTimerCount = computed(() => timerGroups.value.reduce((sum, group) => sum + group.bars.length, 0));
const monthRecordedCount = computed(() => month.value.cells.filter((cell) => cell.inMonth && cell.hasRecord).length);
const recordDays = computed(() => recentRecordDays(
  store.tasks,
  mainCheckins.value,
  store.timers,
  store.drills,
  store.formulaDrills,
  today,
  planEndDate.value,
));

function goDay(date: string) {
  router.push(`/stats/day/${date}`);
}

function timerBars(group: TimerComparisonGroup): ChartBar[] {
  return group.bars.map((bar) => ({
    id: bar.id,
    label: bar.label,
    value: bar.value,
    valueLabel: bar.valueLabel,
    title: bar.title,
    highlight: bar.isFastest,
  }));
}

function fastestText(group: TimerComparisonGroup): string {
  return group.bars.find((bar) => bar.id === group.fastestId)?.valueLabel || '—';
}

function recordSummary(day: RecordDay): string {
  const parts: string[] = [];
  if (day.total > 0) parts.push(`任务 ${day.done}/${day.total}`);
  else if (day.taskRecords > 0) parts.push(`打卡 ${day.taskRecords}`);
  if (day.timerSessions > 0) parts.push(`计时 ${day.timerSessions} 组`);
  if (day.drillSessions > 0) parts.push(`百化分 ${day.drillSessions} 场`);
  if (day.formulaSessions > 0) parts.push(`公式 ${day.formulaSessions} 场`);
  return parts.join(' · ') || '有学习记录';
}
</script>

<style scoped>
.stats-page {
  padding-bottom: calc(96px + env(safe-area-inset-bottom));
}

.page-heading {
  margin-bottom: 16px;
}

.page-heading .page-sub {
  margin-bottom: 0;
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  overflow: hidden;
  animation: stats-enter 260ms cubic-bezier(.16, 1, .3, 1) both;
}

.summary-item {
  min-width: 0;
  min-height: 82px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 8px;
}

.summary-item:nth-child(odd) { border-inline-end: 1px solid var(--card-border); }
.summary-item:nth-child(-n + 2) { border-block-end: 1px solid var(--card-border); }

.summary-item strong {
  color: var(--accent-solid);
  font-size: 24px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}

.summary-item span {
  margin-top: 5px;
  color: var(--text-2);
  font-size: 11px;
  line-height: 1.35;
  text-align: center;
}

.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.section-panel {
  min-width: 0;
  animation: stats-enter 300ms cubic-bezier(.16, 1, .3, 1) both;
  animation-delay: calc(var(--enter-order, 0) * 45ms);
}

.heatmap-panel,
.rate-panel,
.timer-panel {
  padding: 16px;
}

.panel-head,
.section-title-row,
.timer-group-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.panel-head {
  min-height: 49px;
  margin-bottom: 8px;
}

.panel-head h2,
.section-title-row h2,
.timer-group-head h3 {
  margin: 0;
  color: var(--text);
  font-weight: 700;
  text-wrap: balance;
}

.panel-head h2,
.section-title-row h2 { font-size: 15px; }
.timer-group-head h3 { font-size: 14px; }

.panel-head p,
.section-title-row p {
  margin: 4px 0 0;
  color: var(--text-3);
  font-size: 11px;
  line-height: 1.5;
  text-wrap: pretty;
}

.panel-metric {
  flex: none;
  color: var(--accent-solid);
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}

.timer-panel {
  margin-top: 12px;
}

.timer-group {
  min-width: 0;
  padding-top: 10px;
}

.timer-group + .timer-group {
  margin-top: 10px;
  border-top: 1px solid var(--card-border);
  padding-top: 18px;
}

.timer-group-head {
  min-height: 40px;
  align-items: center;
  margin-bottom: 2px;
}

.timer-group-head > div > span {
  display: block;
  margin-top: 3px;
  color: var(--text-3);
  font-size: 10px;
}

.timer-group-head dl,
.timer-group-head dl > div {
  display: flex;
  align-items: baseline;
}

.timer-group-head dl {
  gap: 12px;
  margin: 0;
}

.timer-group-head dl > div { gap: 4px; }
.timer-group-head dt { color: var(--text-3); font-size: 10px; }
.timer-group-head dd {
  margin: 0;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.records-section {
  margin-top: 18px;
}

.section-title-row {
  align-items: center;
  margin: 0 2px 9px;
}

.section-title-row > span {
  flex: none;
  color: var(--text-3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.record-list {
  overflow: hidden;
}

.record-row {
  width: 100%;
  min-height: 66px;
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) auto 18px;
  align-items: center;
  gap: 10px;
  border: 0;
  border-bottom: 1px solid var(--card-border);
  padding: 10px 14px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  text-align: start;
  touch-action: manipulation;
  transition: transform 150ms cubic-bezier(.16, 1, .3, 1), background-color 150ms ease;
}

.record-row:last-of-type { border-bottom: 0; }
.record-row:active { transform: scale(.99); background: var(--accent-soft); }
.record-row:focus-visible { outline: 2px solid var(--accent-solid); outline-offset: -2px; }

.record-date strong,
.record-date small {
  display: block;
}

.record-date strong {
  font-size: 13px;
  white-space: nowrap;
}

.record-date small {
  margin-top: 3px;
  color: var(--text-3);
  font-size: 10px;
}

.record-summary {
  min-width: 0;
  overflow: hidden;
  color: var(--text-2);
  font-size: 11px;
  line-height: 1.5;
  text-overflow: clip;
  white-space: normal;
}

.record-rate {
  min-width: 40px;
  border-radius: 999px;
  padding: 3px 7px;
  background: var(--accent-soft);
  color: var(--text-2);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
}

.record-rate.full { color: var(--accent-solid); }

.row-arrow {
  color: var(--text-3);
  font-size: 22px;
  line-height: 1;
  text-align: end;
}

.records-empty {
  min-height: 118px;
  display: grid;
  place-items: center;
  color: var(--text-3);
  font-size: 13px;
}

@keyframes stats-enter {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (hover: hover) {
  .record-row:hover { background: var(--accent-soft); }
}

@media (min-width: 560px) {
  .summary-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .summary-item { min-height: 88px; }
  .summary-item:not(:last-child) { border-inline-end: 1px solid var(--card-border); }
  .summary-item:nth-child(-n + 2) { border-block-end: 0; }
  .overview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 380px) {
  .heatmap-panel,
  .rate-panel,
  .timer-panel { padding: 14px; }
  .record-row {
    grid-template-columns: 69px minmax(0, 1fr) auto 14px;
    gap: 7px;
    padding-inline: 11px;
  }
  .record-rate { min-width: 36px; padding-inline: 5px; }
}

@media (max-height: 420px) and (orientation: landscape) {
  .stats-page { padding-top: calc(10px + env(safe-area-inset-top)); }
  .page-heading { margin-bottom: 10px; }
  .summary-item { min-height: 70px; padding-block: 8px; }
  .overview-grid,
  .timer-panel { margin-top: 10px; }
  .records-section { margin-top: 14px; }
}

@media (prefers-reduced-motion: reduce) {
  .summary-strip,
  .section-panel { animation: none; }
  .record-row { transition-duration: .01ms; }
}
</style>

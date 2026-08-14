<template>
  <div class="page overview-page">
    <header class="overview-heading">
      <button class="back-button" type="button" aria-label="返回今日" title="返回今日" @click="navigateToParent(router)">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <div>
        <h1 class="page-title">{{ isGeneral ? '节律概览' : '学习概览' }}</h1>
        <p class="page-sub">{{ formatCn(selectedDate) }} · 周{{ weekdayCn(selectedDate) }}</p>
      </div>
      <PixelGrid pattern="arrival" :size="44" decorative />
    </header>

    <CalendarStrip
      v-model="selectedDate"
      :mark-date="store.settings.markDate ?? null"
      :completion-level="completionLevel"
      @mark="onMark"
    />

    <section class="progress-overview" :aria-label="isGeneral ? '当日打卡进度' : '当日完成进度'">
      <ProgressRing :percent="progress">
        <div class="ring-text"><strong>{{ doneCount }}</strong><span>/{{ plan.today.length }}</span></div>
      </ProgressRing>
      <div class="progress-copy">
        <strong>{{ isToday ? (isGeneral ? '今日节律' : '今日进度') : '当天进度' }}</strong>
        <span>{{ plan.today.length ? `${Math.round(progress * 100)}% 已完成` : '暂无计划' }}</span>
      </div>
    </section>

    <section class="dashboard-shell" aria-labelledby="dashboard-title">
      <div class="dashboard-greeting">
        <div>
          <span class="dashboard-kicker">{{ copy.label }} · {{ formatCn(selectedDate) }}</span>
          <h2 id="dashboard-title">{{ isToday ? (isGeneral ? '今天也从一小步开始' : '今天先把节奏稳住') : '这一天的安排' }}</h2>
          <p>{{ isToday ? '任务、专注和复盘会在这里汇合。' : '历史计划只读展示，修改请回到对应日期。' }}</p>
        </div>
        <PixelGrid pattern="arrival" :size="56" decorative />
      </div>

      <div class="dashboard-metrics" aria-label="当日摘要">
        <div class="dashboard-metric"><strong>{{ plan.today.length + plan.carried.length }}</strong><span>当日事项</span></div>
        <div class="dashboard-metric"><strong>{{ focusMinutes }}<small>分</small></strong><span>当日专注</span></div>
        <div class="dashboard-metric"><strong>{{ pendingReviews }}</strong><span>{{ isGeneral ? '复盘记录' : '待复盘' }}</span></div>
        <div class="dashboard-metric"><strong>{{ availableMinutes }}<small>分</small></strong><span>建议可用</span></div>
      </div>

      <div class="dashboard-suggestion card" :class="`tone-${suggestion.tone}`">
        <div class="suggestion-mark">
          <PixelGrid v-if="suggestion.tone === 'done'" pattern="confirm" :size="34" once />
          <PixelGrid v-else preset="wave" :size="34" once />
        </div>
        <div class="suggestion-copy">
          <span>{{ suggestion.eyebrow }}</span>
          <strong>{{ suggestion.title }}</strong>
          <p>{{ suggestion.detail }}</p>
        </div>
        <button class="dashboard-action" type="button" @click="runSuggestion">
          {{ suggestion.actionLabel }}<span aria-hidden="true">→</span>
        </button>
      </div>

      <div class="dashboard-plan card">
        <div class="dashboard-section-head">
          <div><span class="dashboard-kicker">当日计划</span><h3>{{ isGeneral ? '行动与习惯双轨' : '行测与申论双轨' }}</h3></div>
          <router-link to="/stats">能力概览 <span aria-hidden="true">↗</span></router-link>
        </div>
        <div class="track-list">
          <div v-for="track in dashboardTracks" :key="track.id" class="track-row">
            <div class="track-label"><strong>{{ track.label }}</strong><span>{{ track.done }}/{{ track.total }} 项</span></div>
            <div class="track-bar"><i :style="{ width: `${Math.round(track.ratio * 100)}%` }"></i></div>
            <span class="track-percent">{{ Math.round(track.ratio * 100) }}%</span>
          </div>
        </div>
        <div class="dashboard-links">
          <router-link to="/timer"><span aria-hidden="true">◷</span>开始专注</router-link>
          <router-link to="/stats"><span aria-hidden="true">▦</span>查看周计划</router-link>
          <router-link to="/stats"><span aria-hidden="true">↗</span>记录今日</router-link>
        </div>
      </div>

      <div class="capability-strip" aria-label="能力摘要">
        <div v-for="metric in capabilityMetrics" :key="metric.id" class="capability-item">
          <span>{{ metric.label }}</span><strong>{{ metric.value }}</strong><small>{{ metric.detail }}</small>
          <i v-if="metric.percent !== undefined" :style="{ width: `${metric.percent}%` }"></i>
        </div>
      </div>
    </section>

    <div v-if="markCountdown" class="mark-banner card">
      <span class="mark-flag">{{ copy.markDate }}</span>
      <span class="mark-text">{{ formatCn(markCountdown.date) }} 周{{ weekdayCn(markCountdown.date) }}</span>
      <strong class="mark-days">{{ markCountdown.days === 0 ? '就是今天' : `还有 ${markCountdown.days} 天` }}</strong>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CalendarStrip from '../components/CalendarStrip.vue';
import PixelGrid from '../components/PixelGrid.vue';
import ProgressRing from '../components/ProgressRing.vue';
import { navigateToParent } from '../lib/backNavigation';
import { completionForDate } from '../lib/completion';
import { buildCapabilityMetrics, buildDashboardSuggestion, buildDashboardTracks, focusMinutesForDay } from '../lib/dashboard';
import { diffDays, formatCn, todayStr, weekdayCn } from '../lib/date';
import { effectivePlanEnd, modeCopy } from '../lib/appMode';
import { generatePlan } from '../lib/plan';
import { useAppStore } from '../stores/app';

const store = useAppStore();
const route = useRoute();
const router = useRouter();
const requestedDate = typeof route.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.query.date)
  ? route.query.date
  : todayStr();
const selectedDate = ref(requestedDate);
const isGeneral = computed(() => store.settings.appMode === 'general');
const copy = computed(() => modeCopy(store.settings.appMode));
const planEndDate = computed(() => effectivePlanEnd(store.settings));
const isToday = computed(() => selectedDate.value === todayStr());
const plan = computed(() => generatePlan(store.tasks, store.checkins, selectedDate.value, planEndDate.value));
const pendingReviews = computed(() => store.analysisReviews.filter((review) => !review.deleted).length);
const focusMinutes = computed(() => focusMinutesForDay(store.timers, selectedDate.value));
const availableMinutes = computed(() => Math.max(0, 120 - focusMinutes.value));
const dashboardTracks = computed(() => buildDashboardTracks(plan.value, store.settings.appMode));
const suggestion = computed(() => buildDashboardSuggestion(plan.value, pendingReviews.value, store.settings.appMode));
const capabilityMetrics = computed(() => buildCapabilityMetrics({
  mode: store.settings.appMode,
  tasks: store.tasks,
  checkins: store.checkins,
  timers: store.timers,
  speedDrills: store.speedDrills,
  analysisReviews: store.analysisReviews,
  today: selectedDate.value,
}));
const completion = computed(() => completionForDate(store.tasks, store.checkins, selectedDate.value, planEndDate.value));
const doneCount = computed(() => completion.value.done);
const progress = computed(() => completion.value.ratio);
const markCountdown = computed(() => {
  const date = store.settings.markDate;
  if (!date) return null;
  const days = diffDays(todayStr(), date);
  return days < 0 ? null : { date, days };
});

function completionLevel(date: string): number {
  return completionForDate(store.tasks, store.checkins, date, planEndDate.value).level;
}

function onMark(date: string) {
  store.saveSettings({ markDate: store.settings.markDate === date ? null : date });
}

function runSuggestion() {
  const first = plan.value.carried[0] || plan.value.today.find((item) => !item.done);
  if (first) {
    void router.push({ path: '/timer', query: { taskId: first.task.id } });
  } else if (pendingReviews.value) {
    void router.push({ path: '/drill', query: { module: 'review' } });
  } else if (!plan.value.today.length) {
    void router.push('/tasks');
  } else {
    void router.push('/stats');
  }
}
</script>

<style scoped>
.overview-heading{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:center;gap:11px;margin:2px 0 14px}.overview-heading .page-title{margin:0 0 3px}.overview-heading .page-sub{margin:0}.back-button{width:44px;height:44px;display:grid;place-items:center;border:0;border-radius:12px;background:var(--accent-soft);color:var(--accent-solid)}
.progress-overview{display:flex;align-items:center;gap:16px;padding:15px 2px 12px}.progress-copy{display:flex;flex-direction:column;gap:4px}.progress-copy strong{font-size:16px}.progress-copy span{color:var(--text-2);font-size:13px;font-variant-numeric:tabular-nums}.ring-text strong{font-size:20px}.ring-text span{color:var(--text-3);font-size:12px}
.dashboard-shell{display:grid;gap:12px;margin:2px 0 14px}.dashboard-greeting{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:82px;padding:8px 2px}.dashboard-greeting h2{margin:4px 0 5px;font-size:21px;line-height:1.25;text-wrap:balance}.dashboard-greeting p{margin:0;color:var(--text-2);font-size:12px}.dashboard-kicker{color:var(--accent-solid);font-size:11px;font-weight:800}
.dashboard-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-block:1px solid var(--card-border);background:color-mix(in srgb,var(--card) 64%,transparent)}.dashboard-metric{min-width:0;display:grid;justify-items:center;gap:3px;padding:11px 4px}.dashboard-metric+.dashboard-metric{border-inline-start:1px solid var(--card-border)}.dashboard-metric strong{font-size:19px;font-variant-numeric:tabular-nums}.dashboard-metric strong small{margin-left:2px;color:var(--text-3);font-size:10px}.dashboard-metric span{color:var(--text-3);font-size:10px;white-space:nowrap}
.dashboard-suggestion{display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:10px;padding:13px;border-radius:12px}.dashboard-suggestion.tone-warn{border-color:color-mix(in srgb,var(--warn) 40%,var(--card-border));background:color-mix(in srgb,var(--warn-soft) 46%,var(--card))}.dashboard-suggestion.tone-done{border-color:color-mix(in srgb,var(--accent-solid) 35%,var(--card-border))}.suggestion-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--accent-soft);color:var(--accent-solid)}.tone-warn .suggestion-mark{background:var(--warn-soft);color:var(--warn)}.suggestion-copy{min-width:0;display:grid;gap:2px}.suggestion-copy>span{color:var(--text-3);font-size:10px;font-weight:800}.suggestion-copy strong{overflow-wrap:anywhere;font-size:14px;line-height:1.35}.suggestion-copy p{margin:1px 0 0;color:var(--text-2);font-size:11px;line-height:1.45}.dashboard-action{min-height:44px;display:inline-flex;align-items:center;gap:5px;border:0;border-radius:9px;padding:7px 9px;background:var(--text);color:var(--card);font:inherit;font-size:11px;font-weight:800;white-space:nowrap}.dashboard-action span{font-size:16px}
.dashboard-plan{padding:15px;border-radius:12px}.dashboard-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dashboard-section-head h3{margin:3px 0 0;font-size:17px}.dashboard-section-head a,.dashboard-links a{color:var(--accent-solid);font-size:11px;font-weight:800;text-decoration:none;white-space:nowrap}.track-list{display:grid;gap:13px;margin-top:17px}.track-row{display:grid;grid-template-columns:66px minmax(0,1fr) 37px;align-items:center;gap:9px}.track-label{display:grid;gap:2px}.track-label strong{font-size:13px}.track-label span{color:var(--text-3);font-size:10px}.track-bar{height:7px;overflow:hidden;border-radius:999px;background:var(--heat-0)}.track-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--accent-from),var(--accent-to));transition:width 340ms cubic-bezier(.16,1,.3,1)}.track-row:nth-child(2) .track-bar i{background:linear-gradient(90deg,#7c3aed,#ec4899)}.track-percent{color:var(--text-2);font-size:11px;font-variant-numeric:tabular-nums;text-align:end}.dashboard-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:17px}.dashboard-links a{min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:4px;border:1px solid var(--card-border);border-radius:8px;color:var(--text-2)}.dashboard-links a:first-child{background:var(--text);border-color:var(--text);color:var(--card)}.dashboard-links a span{color:var(--accent-solid);font-size:15px}.dashboard-links a:first-child span{color:inherit}
.capability-strip{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.capability-item{position:relative;min-width:0;display:grid;gap:3px;padding:11px 12px 14px;border-bottom:1px solid var(--card-border)}.capability-item>span{color:var(--text-3);font-size:10px}.capability-item strong{font-size:18px;font-variant-numeric:tabular-nums}.capability-item small{color:var(--text-2);font-size:10px;line-height:1.4;overflow-wrap:anywhere}.capability-item i{position:absolute;right:0;bottom:-1px;left:0;height:2px;background:var(--accent-solid);transform-origin:left}
.mark-banner{display:flex;align-items:center;gap:10px;padding:12px 16px;margin-bottom:10px;border-color:color-mix(in srgb,var(--danger) 45%,var(--card-border));background:color-mix(in srgb,var(--danger) 7%,var(--card))}.mark-flag{flex:none;font-size:11px;font-weight:700;color:#fff;background:var(--danger);border-radius:999px;padding:3px 10px}.mark-text{min-width:0;flex:1;font-size:14px;font-weight:600}.mark-days{flex:none;color:var(--danger);font-size:15px}
@media(max-width:380px){.dashboard-suggestion{grid-template-columns:32px minmax(0,1fr)}.dashboard-action{grid-column:2;justify-self:start;margin-top:5px}.suggestion-mark{width:30px;height:30px}.track-row{grid-template-columns:58px minmax(0,1fr) 34px;gap:6px}.mark-banner{align-items:flex-start;flex-wrap:wrap}.mark-days{margin-left:auto}}
@media(prefers-reduced-motion:reduce){.track-bar i{transition-duration:.01ms}}
</style>

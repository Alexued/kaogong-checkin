<template>
  <div class="page day-detail-page">
    <button class="overview-back" type="button" @click="returnToOverview"><span aria-hidden="true">‹</span> 返回概览</button>
    <div class="day-nav">
      <button class="arrow" @click="go(-1)" aria-label="前一天">‹</button>
      <div class="day-title">
        <h1 class="page-title">{{ formatCn(date) }}</h1>
        <p class="page-sub">周{{ weekdayCn(date) }} · {{ date }}</p>
      </div>
      <button class="arrow" @click="go(1)" aria-label="后一天">›</button>
    </div>

    <!-- 任务打卡 -->
    <div class="section-title">任务打卡</div>
    <div class="card block">
      <template v-if="doneItems.length || missedItems.length">
        <div v-for="c in doneItems" :key="c.id" class="line">
          <span class="mark ok">✓</span>
          <span class="line-title">{{ c.title }}</span>
          <span class="line-meta">{{ formatTime(c.createdAt) }}</span>
        </div>
        <div v-for="t in missedItems" :key="t.id" class="line">
          <span class="mark bad">✗</span>
          <span class="line-title">{{ t.title }}</span>
          <span class="line-meta muted">未完成</span>
        </div>
      </template>
      <div v-else class="empty">无记录</div>
    </div>

    <!-- 计时记录 -->
    <div class="section-title">计时记录</div>
    <div class="card block">
      <template v-if="timerItems.length">
        <div v-for="t in timerItems" :key="t.id" class="line">
          <span class="line-title">{{ t.label || '（无标签）' }}</span>
          <span class="line-meta">{{ fmtDuration(t.durationMs) }} · {{ t.laps.length }} 打点</span>
        </div>
      </template>
      <div v-else class="empty">无记录</div>
    </div>

    <!-- 百化分 -->
    <div class="section-title">百化分</div>
    <div class="card block">
      <template v-if="drillSessions.length">
        <div v-for="s in drillSessions" :key="s.sessionId" class="line">
          <span class="badge">{{ s.mode === 'full' ? '完整' : '随机' }}</span>
          <span class="line-title">{{ s.count }} 题</span>
          <span class="line-meta" :class="rateClass(s.rate)">
            正确率 {{ Math.round(s.rate * 100) }}%
          </span>
        </div>
      </template>
      <div v-else class="empty">无记录</div>
    </div>

    <!-- 公式背诵 -->
    <div class="section-title">公式背诵</div>
    <div class="card block">
      <template v-if="formulaSessions.length">
        <div v-for="s in formulaSessions" :key="s.sessionId" class="line">
          <span class="badge">{{ s.mode === 'full' ? '完整' : '随机' }}</span>
          <span class="line-title">{{ s.count }} 个</span>
          <span class="line-meta" :class="rateClass(s.rate)">
            记住率 {{ Math.round(s.rate * 100) }}%
          </span>
        </div>
      </template>
      <div v-else class="empty">无记录</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { generatePlan } from '../lib/plan';
import { addDays, formatCn, formatTime, toLocalDateStr, weekdayCn } from '../lib/date';
import { fmtDuration } from '../lib/stopwatch';
import { runViewTransition } from '../lib/motion';

const store = useAppStore();
const route = useRoute();
const router = useRouter();

const date = computed(() => String(route.params.date));

function go(n: number) {
  router.push(`/stats/day/${addDays(date.value, n)}`);
}

async function returnToOverview() {
  const targetDate = date.value;
  const root = document.querySelector<HTMLElement>('.day-detail-page');
  let destination: HTMLElement | null = null;
  if (root) root.style.viewTransitionName = 'day-detail-origin';
  try {
    await runViewTransition(async () => {
      await router.push('/settings');
      await nextTick();
      destination = document.querySelector<HTMLElement>(`[data-heat-date="${targetDate}"]`);
      if (destination) destination.style.viewTransitionName = 'day-detail-origin';
    });
  } finally {
    if (root) root.style.viewTransitionName = '';
    if (destination) destination.style.viewTransitionName = '';
  }
}

// ---------- 任务打卡 ----------
const doneItems = computed(() =>
  store.checkins
    .filter((c) => !c.deleted && c.date === date.value)
    .map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      title: store.tasks.find((t) => t.id === c.taskId)?.title || '（已删除任务）',
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
);

/** 当天应做但未完成（借 plan.ts 计算） */
const missedItems = computed(() => {
  const plan = generatePlan(store.tasks, store.checkins, date.value, store.settings.planEndDate);
  return plan.today.filter((x) => !x.done).map((x) => ({ id: x.task.id, title: x.task.title }));
});

// ---------- 计时 ----------
const timerItems = computed(() =>
  store.timers
    .filter((t) => !t.deleted && t.date === date.value)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
);

// ---------- 背诵场次（按 createdAt 的本地日期归属） ----------
function sameLocalDay(iso: string, d: string) {
  return toLocalDateStr(new Date(iso)) === d;
}

function groupSessions<T extends { sessionId: string; createdAt: string; mode: 'full' | 'random'; deleted: boolean }>(
  rows: T[],
  ok: (r: T) => boolean
) {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    if (r.deleted || !sameLocalDay(r.createdAt, date.value)) continue;
    const arr = map.get(r.sessionId);
    if (arr) arr.push(r);
    else map.set(r.sessionId, [r]);
  }
  return [...map.entries()]
    .map(([sessionId, rs]) => {
      const good = rs.filter(ok).length;
      return {
        sessionId,
        mode: rs[0].mode,
        count: rs.length,
        rate: rs.length ? good / rs.length : 0,
        time: rs[0].createdAt,
      };
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

const drillSessions = computed(() => groupSessions(store.drills, (d) => d.correct));
const formulaSessions = computed(() => groupSessions(store.formulaDrills, (d) => d.known));

function rateClass(rate: number) {
  return rate < 0.6 ? 'weak' : rate < 0.85 ? 'mid' : 'good';
}
</script>

<style scoped>
.day-detail-page { animation: detail-fallback-in 300ms cubic-bezier(.22,1,.36,1) both; }
.overview-back { min-height:40px; display:inline-flex; align-items:center; gap:5px; border:0; background:transparent; color:var(--accent-solid); font-size:14px; font-weight:700; padding:0 4px; }
.overview-back span { font-size:24px; line-height:1; transition:transform 160ms cubic-bezier(.22,1,.36,1); }.overview-back:active span { transform:translateX(-3px); }
@keyframes detail-fallback-in { from{opacity:0;transform:scale(.96)} to{opacity:1;transform:scale(1)} }
.day-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.day-title {
  text-align: center;
}

.arrow {
  border: 1px solid var(--card-border);
  background: var(--card);
  color: var(--text-2);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-size: 20px;
  cursor: pointer;
  flex: none;
  transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.arrow:active {
  transform: scale(0.9);
}

.block {
  padding: 8px 16px;
}

.line {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--card-border);
  font-size: 14.5px;
}

.line:last-child {
  border-bottom: none;
}

.line-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line-meta {
  flex: none;
  font-size: 12.5px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.line-meta.muted {
  color: var(--text-3);
}

.line-meta.good {
  color: var(--accent-solid);
  font-weight: 700;
}

.line-meta.mid {
  color: var(--warn);
  font-weight: 700;
}

.line-meta.weak {
  color: var(--danger);
  font-weight: 700;
}

.mark {
  width: 18px;
  flex: none;
  text-align: center;
  font-weight: 700;
}

.mark.ok {
  color: var(--accent-solid);
}

.mark.bad {
  color: var(--danger);
}
@media (prefers-reduced-motion: reduce) { .day-detail-page { animation:none; } }
</style>

<template>
  <div class="page">
    <div class="top-bar">
      <button class="back-btn" type="button" @click="navigateToParent(router)">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
          stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        返回
      </button>
      <h1 class="page-title small">历史记录</h1>
      <button class="mini" @click="compareMode = !compareMode">
        {{ compareMode ? '返回列表' : '数据对比' }}
      </button>
    </div>

    <!-- 数据对比：最近 10 次横向条形图 -->
    <div v-if="compareMode" class="card compare">
      <template v-if="recentRecords.length">
        <div v-for="r in recentRecords" :key="r.id" class="bar-row">
          <div class="bar-label" :title="r.label || '（无标签）'">{{ r.label || '（无标签）' }}</div>
          <div class="bar-track">
            <div
              class="bar"
              :class="{ fastest: r.id === fastestId, slowest: r.id === slowestId }"
              :style="{ width: barWidth(r.durationMs) }"
            ></div>
          </div>
          <div class="bar-val">
            {{ fmtDuration(r.durationMs) }}
            <span v-if="r.id === fastestId" class="tag fast">最快</span>
            <span v-if="r.id === slowestId" class="tag slow">最慢</span>
          </div>
        </div>
        <div class="mean">均值 {{ fmtDuration(meanMs) }}</div>
      </template>
      <div v-else class="empty">还没有计时记录</div>
    </div>

    <!-- 按日期分组的历史列表 -->
    <template v-else>
      <div v-if="!grouped.length" class="empty">还没有计时记录</div>
      <div v-for="g in grouped" :key="g.date">
        <div class="group-date">{{ g.date }}</div>
        <div v-for="r in g.records" :key="r.id" class="card record clickable" @click="detail = r">
          <div class="record-head">
              <div>
              <span class="record-label">{{ r.label || '（无标签）' }}</span>
              <span class="badge mode-badge">{{ r.mode === 'countdown' ? '倒计时' : '计时' }}</span>
              <span v-if="taskTitle(r.taskId)" class="badge">{{ taskTitle(r.taskId) }}</span>
            </div>
            <div class="record-right">
              <strong>{{ fmtDuration(r.durationMs) }}</strong>
              <button class="mini danger" @click.stop="onDelete(r.id)">删除</button>
            </div>
          </div>
          <div v-if="r.laps.length" class="record-laps">
            <span v-for="(lap, i) in r.laps" :key="i" class="lap-chip">
              #{{ i + 1 }} +{{ fmtDuration(lap.splitMs) }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- 记录详情弹层 -->
    <teleport to="body">
      <div v-if="detail" class="sheet-mask" @click.self="detail = null">
        <div
          v-motion
          class="sheet card"
          :initial="{ opacity: 0, y: 60 }"
          :enter="{
            opacity: 1,
            y: 0,
            transition: { type: 'spring', stiffness: 280, damping: 26 },
          }"
        >
          <h2 class="sheet-title">{{ detail.label || '（无标签）' }}</h2>
          <div class="detail-grid">
            <span class="dt">关联任务</span>
            <span>{{ taskTitle(detail.taskId) || '未关联' }}</span>
            <span class="dt">日期</span>
            <span>{{ detail.date }}</span>
            <span class="dt">起止时间</span>
            <span>{{ formatTime(detail.startedAt) }} ~ {{ endTime(detail) }}</span>
            <span class="dt">总时长</span>
            <span><strong>{{ fmtDuration(detail.durationMs) }}</strong></span>
          </div>
          <template v-if="detail.laps.length">
            <div class="section-title">打点（{{ detail.laps.length }}）</div>
            <div class="detail-laps">
              <div v-for="(lap, i) in detail.laps" :key="i" class="lap">
                <span class="lap-no">#{{ i + 1 }}</span>
                <span class="lap-split">+{{ fmtDuration(lap.splitMs) }}</span>
                <span class="lap-elapsed">{{ fmtDuration(lap.elapsedMs) }}</span>
              </div>
            </div>
          </template>
          <div v-else class="empty">本次没有打点</div>
          <button class="btn close-btn" @click="detail = null">关闭</button>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { fmtDuration } from '../lib/stopwatch';
import { formatTime } from '../lib/date';
import { navigateToParent } from '../lib/backNavigation';
import type { TimerRecord } from '../types';

const store = useAppStore();
const router = useRouter();

/** 记录详情弹层当前展示的记录 */
const detail = ref<TimerRecord | null>(null);

function endTime(r: TimerRecord): string {
  return formatTime(new Date(new Date(r.startedAt).getTime() + r.durationMs).toISOString());
}

// ---------- 历史 ----------
const records = computed(() =>
  store.timers.filter((t) => !t.deleted).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
);

const grouped = computed(() => {
  const map = new Map<string, TimerRecord[]>();
  for (const r of records.value) {
    const arr = map.get(r.date);
    if (arr) arr.push(r);
    else map.set(r.date, [r]);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, rs]) => ({ date, records: rs }));
});

function taskTitle(id: string | null) {
  return id ? store.tasks.find((t) => t.id === id)?.title || '' : '';
}

function onDelete(id: string) {
  if (window.confirm('删除这条计时记录？')) store.deleteTimer(id);
}

// ---------- 数据对比（最近 10 次） ----------
const compareMode = ref(false);
const recentRecords = computed(() => records.value.slice(0, 10).slice().reverse());

const maxMs = computed(() => Math.max(1, ...recentRecords.value.map((r) => r.durationMs)));
const meanMs = computed(() =>
  recentRecords.value.length
    ? recentRecords.value.reduce((s, r) => s + r.durationMs, 0) / recentRecords.value.length
    : 0
);
const fastestId = computed(() =>
  recentRecords.value.length
    ? recentRecords.value.reduce((a, b) => (a.durationMs <= b.durationMs ? a : b)).id
    : ''
);
const slowestId = computed(() =>
  recentRecords.value.length
    ? recentRecords.value.reduce((a, b) => (a.durationMs >= b.durationMs ? a : b)).id
    : ''
);

function barWidth(ms: number) {
  return `${Math.max(6, (ms / maxMs.value) * 100)}%`;
}
</script>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.page-title.small {
  font-size: 20px;
  margin: 0;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--card-border);
  background: var(--card);
  color: var(--text-2);
  border-radius: 999px;
  padding: 6px 13px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.back-btn:active {
  transform: scale(0.94);
}

.mini {
  border: 1px solid var(--card-border);
  background: transparent;
  color: var(--text-2);
  border-radius: 9px;
  padding: 5px 10px;
  font-size: 12.5px;
  cursor: pointer;
}

.mini.danger {
  color: var(--danger);
}

.group-date {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-3);
  margin: 14px 2px 8px;
}

.record {
  padding: 13px 16px;
  margin-bottom: 10px;
}

.record.clickable {
  cursor: pointer;
  transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.record.clickable:active {
  transform: scale(0.98);
}

.record-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.record-label {
  font-size: 15px;
  font-weight: 600;
  margin-right: 8px;
}

.mode-badge {
  margin-right: 6px;
  background: var(--bg-elev);
  color: var(--text-2);
  border: 1px solid var(--card-border);
}

.record-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  font-variant-numeric: tabular-nums;
}

.record-laps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.lap-chip {
  font-size: 12px;
  color: var(--text-2);
  background: var(--accent-soft);
  border-radius: 999px;
  padding: 2px 9px;
  font-variant-numeric: tabular-nums;
}

.compare {
  padding: 16px;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.bar-label {
  width: 84px;
  flex: none;
  font-size: 12.5px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-track {
  flex: 1;
  height: 16px;
  background: var(--heat-0);
  border-radius: 8px;
  overflow: hidden;
}

.bar {
  height: 100%;
  border-radius: 8px;
  background: linear-gradient(90deg, var(--accent-from), var(--accent-to));
  transition: width 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.bar.fastest {
  background: linear-gradient(90deg, #34d399, #10b981);
}

.bar.slowest {
  background: linear-gradient(90deg, #fbbf24, #f87171);
}

.bar-val {
  width: 86px;
  flex: none;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
}

.tag {
  font-size: 10px;
  font-weight: 700;
  border-radius: 999px;
  padding: 1px 6px;
  margin-left: 3px;
}

.tag.fast {
  color: #10b981;
  background: rgba(16, 185, 129, 0.14);
}

.tag.slow {
  color: var(--danger);
  background: rgba(239, 68, 68, 0.12);
}

.mean {
  text-align: right;
  font-size: 12.5px;
  color: var(--text-2);
  margin-top: 4px;
}

/* 记录详情弹层 */
.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
}

.sheet {
  width: 100%;
  max-width: 640px;
  max-height: 82vh;
  overflow-y: auto;
  border-radius: 20px 20px 0 0;
  padding: 20px 18px calc(20px + env(safe-area-inset-bottom));
}

.sheet-title {
  margin: 0 0 14px;
  font-size: 18px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 84px 1fr;
  gap: 10px 12px;
  font-size: 14.5px;
  margin-bottom: 8px;
}

.detail-grid .dt {
  color: var(--text-3);
  font-size: 13px;
}

.detail-laps {
  margin-bottom: 8px;
}

.lap {
  display: flex;
  gap: 14px;
  padding: 6px 4px;
  font-variant-numeric: tabular-nums;
  font-size: 14.5px;
}

.lap-no {
  color: var(--text-3);
  width: 32px;
}

.lap-split {
  color: var(--accent-solid);
  font-weight: 700;
  flex: 1;
}

.lap-elapsed {
  color: var(--text-2);
}

.close-btn {
  width: 100%;
  margin-top: 10px;
}
</style>

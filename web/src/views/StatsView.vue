<template>
  <div class="page">
    <h1 class="page-title">统计</h1>
    <p class="page-sub">坚持就是胜利</p>

    <div class="stat-cards">
      <div v-motion class="card stat" :initial="{ opacity: 0, y: 18 }"
        :enter="{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } }">
        <div class="num">{{ streak }}</div>
        <div class="label">连续打卡（天）</div>
      </div>
      <div v-motion class="card stat" :initial="{ opacity: 0, y: 18 }"
        :enter="{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26, delay: 60 } }">
        <div class="num">{{ total }}</div>
        <div class="label">总完成数</div>
      </div>
      <div v-motion class="card stat" :initial="{ opacity: 0, y: 18 }"
        :enter="{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26, delay: 120 } }">
        <div class="num">{{ timerTotalText }}</div>
        <div class="label">计时总时长</div>
      </div>
      <div v-motion class="card stat" :initial="{ opacity: 0, y: 18 }"
        :enter="{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26, delay: 180 } }">
        <div class="num">{{ drillTotal }}</div>
        <div class="label">背诵总题数</div>
      </div>
    </div>

    <div class="section-title row-between">
      <span>近 30 天（点格子看详情）</span>
      <input v-model="pickedDate" type="date" class="input date-pick" @change="goPicked" />
    </div>
    <div v-motion class="card heat-card" :initial="{ opacity: 0, y: 18 }"
      :enter="{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26, delay: 120 } }">
      <div class="heat" data-swipe-ignore>
        <div
          v-for="cell in cells"
          :key="cell.date"
          class="cell clickable"
          :class="'lv' + level(cell.count)"
          :title="`${cell.date}：完成 ${cell.count} 项`"
          @click="goDay(cell.date)"
        ></div>
      </div>
      <div class="legend">
        <span>少</span>
        <div class="cell lv0"></div>
        <div class="cell lv1"></div>
        <div class="cell lv2"></div>
        <div class="cell lv3"></div>
        <div class="cell lv4"></div>
        <span>多</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { streakDays, totalDone, heatmap } from '../lib/stats';
import { todayStr } from '../lib/date';

const store = useAppStore();
const router = useRouter();

const pickedDate = ref('');

function goDay(d: string) {
  router.push(`/stats/day/${d}`);
}

function goPicked() {
  if (pickedDate.value) {
    goDay(pickedDate.value);
    pickedDate.value = '';
  }
}

/** 统计只计主任务打卡：子任务打卡不算入主任务完成数/连续天数/热力图 */
const mainCheckins = computed(() => {
  const subIds = new Set(store.subtasks.map((s) => s.id));
  return store.checkins.filter((c) => !subIds.has(c.taskId));
});

const streak = computed(() => streakDays(mainCheckins.value, todayStr()));
const total = computed(() => totalDone(mainCheckins.value));
const cells = computed(() => heatmap(mainCheckins.value, todayStr(), 30));

/** 计时总时长（h 或 m 缩写显示） */
const timerTotalText = computed(() => {
  const ms = store.timers.filter((t) => !t.deleted).reduce((s, t) => s + t.durationMs, 0);
  const mins = Math.round(ms / 60000);
  if (mins >= 60) return `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}`;
  return `${mins}m`;
});

const drillTotal = computed(() => store.drills.filter((d) => !d.deleted).length);

function level(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}
</script>

<style scoped>
.stat-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stat {
  padding: 20px 16px;
  text-align: center;
}

.num {
  font-size: 34px;
  font-weight: 800;
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.label {
  font-size: 13px;
  color: var(--text-2);
  margin-top: 4px;
}

.heat-card {
  padding: 16px;
}

.heat {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 6px;
}

.cell {
  aspect-ratio: 1;
  border-radius: 5px;
  background: var(--heat-0);
  transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.cell.clickable {
  cursor: pointer;
}

.heat .cell:active {
  transform: scale(1.2);
}

.row-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.date-pick {
  width: auto;
  padding: 5px 10px;
  font-size: 13px;
}

.cell.lv1 { background: var(--heat-1); }
.cell.lv2 { background: var(--heat-2); }
.cell.lv3 { background: var(--heat-3); }
.cell.lv4 { background: var(--heat-4); }

.legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  margin-top: 12px;
  font-size: 11px;
  color: var(--text-3);
}

.legend .cell {
  width: 12px;
  height: 12px;
}
</style>

<template>
  <div class="page">
    <div v-if="!store.online" class="offline-banner">
      离线模式，数据将在恢复连接后同步
    </div>

    <header class="head">
      <div>
        <h1 class="page-title">{{ formatCn(selectedDate) }} 周{{ weekdayCn(selectedDate) }}</h1>
        <p class="page-sub">
          {{ isToday ? '今天的计划' : '查看历史' }}
          <button v-if="!isToday" class="back-today" @click="selectedDate = todayStr()">回到今天</button>
        </p>
      </div>
      <div class="head-right">
        <ProgressRing :percent="progress">
          <div class="ring-text">
            <strong>{{ doneCount }}</strong
            ><span>/{{ plan.today.length }}</span>
          </div>
        </ProgressRing>
        <div class="head-btns">
          <button class="head-btn" :class="{ on: reordering }" @click="reordering = !reordering">
            {{ reordering ? '完成' : '排序' }}
          </button>
          <router-link to="/tasks" class="head-btn">管理</router-link>
        </div>
      </div>
    </header>

    <!-- 重要日倒计时 -->
    <div v-if="markCountdown" class="mark-banner card">
      <span class="mark-flag">重要日</span>
      <span class="mark-text">
        {{ formatCn(markCountdown.date) }} 周{{ weekdayCn(markCountdown.date) }}
      </span>
      <strong class="mark-days">
        {{ markCountdown.days === 0 ? '就是今天！' : `还有 ${markCountdown.days} 天` }}
      </strong>
    </div>

    <!-- 周日历条（可滑动 / 展开月视图 / 长按标记） -->
    <CalendarStrip
      v-model="selectedDate"
      :mark-date="store.settings.markDate ?? null"
      @mark="onMark"
    />

    <!-- 今日任务 -->
    <template v-if="plan.today.length">
      <div class="section-title">今日任务</div>
      <div class="task-grid">
        <TaskCard
          v-for="(item, i) in plan.today"
          :key="item.task.id + '@' + item.date"
          :item="item"
          :index="i"
          :reorder="reordering"
          :first="i === 0"
          :last="i === plan.today.length - 1"
          :sub-items="subsByTask.get(item.task.id) || []"
          :expanded="expandedTasks.has(item.task.id)"
          @toggle="onToggle"
          @move="onMove"
          @toggle-sub="onToggleSub"
          @toggle-expand="onToggleExpand"
        />
      </div>
    </template>

    <!-- 结转任务 -->
    <template v-if="plan.carried.length">
      <div class="section-title">之前未完成</div>
      <div class="task-grid">
        <TaskCard
          v-for="(item, i) in plan.carried"
          :key="item.task.id + '@' + item.date"
          :item="item"
          :index="plan.today.length + i"
          @toggle="onToggle"
        />
      </div>
    </template>

    <div v-if="!plan.today.length && !plan.carried.length" class="empty">
      这一天没有任务，点右下角 + 添加吧
    </div>

    <!-- 右下角快速新增任务（teleport 出滑动轨道，保持相对视口固定；仅今日页激活时显示） -->
    <teleport to="body">
      <button v-if="isActiveTab" class="fab" type="button" aria-label="新增任务" @click="sheetOpen = true">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
          stroke-width="2.6" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </teleport>
    <TaskEditorSheet v-model:open="sheetOpen" @save="onSaveTask" />

    <CelebrationOverlay :show="showCelebration" @close="showCelebration = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import confetti from 'canvas-confetti';
import { useAppStore } from '../stores/app';
import { generatePlan, type PlanItem } from '../lib/plan';
import { todayStr, diffDays, formatCn, weekdayCn } from '../lib/date';
import TaskCard from '../components/TaskCard.vue';
import ProgressRing from '../components/ProgressRing.vue';
import CelebrationOverlay from '../components/CelebrationOverlay.vue';
import CalendarStrip from '../components/CalendarStrip.vue';
import TaskEditorSheet from '../components/TaskEditorSheet.vue';
import type { Task } from '../types';

const store = useAppStore();
const route = useRoute();
const selectedDate = ref(todayStr());
const showCelebration = ref(false);
const reordering = ref(false);
const sheetOpen = ref(false);

/** Tab 页常驻轨道后，FAB 只在今日页为当前路由时显示 */
const isActiveTab = computed(() => route.path === '/');

/** 展开子任务的主任务 id 集合 */
const expandedTasks = ref(new Set<string>());

function onToggleExpand(item: PlanItem) {
  const s = new Set(expandedTasks.value);
  if (s.has(item.task.id)) s.delete(item.task.id);
  else s.add(item.task.id);
  expandedTasks.value = s;
}

interface SubItem {
  id: string;
  title: string;
  done: boolean;
  checkinId?: string;
}

/** 各主任务的子任务清单（含当前查看日期的打卡状态） */
const subsByTask = computed(() => {
  const map = new Map<string, SubItem[]>();
  const day = selectedDate.value;
  const sorted = store.subtasks.slice().sort((a, b) => a.order - b.order);
  for (const s of sorted) {
    const c = store.checkins.find((x) => !x.deleted && x.taskId === s.id && x.date === day);
    const arr = map.get(s.taskId);
    const item: SubItem = { id: s.id, title: s.title, done: !!c, checkinId: c?.id };
    if (arr) arr.push(item);
    else map.set(s.taskId, [item]);
  }
  return map;
});

/** 子任务打卡/恢复（日期跟随当前查看的日期） */
function onToggleSub(sub: SubItem) {
  store.toggleCheckin(sub.id, selectedDate.value, sub.checkinId);
}

const isToday = computed(() => selectedDate.value === todayStr());

const plan = computed(() =>
  generatePlan(store.tasks, store.checkins, selectedDate.value, store.settings.planEndDate)
);

const doneCount = computed(() => plan.value.today.filter((x) => x.done).length);
const progress = computed(() =>
  plan.value.today.length ? doneCount.value / plan.value.today.length : 0
);

/** 重要日倒计时（已过去的标记日不再提示） */
const markCountdown = computed(() => {
  const md = store.settings.markDate;
  if (!md) return null;
  const days = diffDays(todayStr(), md);
  if (days < 0) return null;
  return { date: md, days };
});

/** 长按某天：已是标记日则取消，否则设为标记日 */
function onMark(date: string) {
  store.saveSettings({ markDate: store.settings.markDate === date ? null : date });
}

function onToggle(item: PlanItem, ev: MouseEvent) {
  const checking = !item.done;
  // 补卡：item.date 为原始日期，直接写入 checkin.date
  store.toggleCheckin(item.task.id, item.date, item.checkinId);
  if (checking) {
    celebrate(ev);
    checkAllDone();
  }
}

/** 排序模式：与相邻任务交换顺序（全局顺序，后续天数同步变化） */
function onMove(item: PlanItem, dir: -1 | 1) {
  const list = plan.value.today;
  const idx = list.findIndex((x) => x.task.id === item.task.id && x.date === item.date);
  const neighbor = list[idx + dir];
  if (!neighbor) return;
  store.swapTaskOrder(item.task.id, neighbor.task.id);
}

function onSaveTask(form: {
  title: string;
  type: Task['type'];
  endDate: string;
  subs: { id?: string; title: string }[];
}) {
  const id = store.saveTask({
    title: form.title,
    type: form.type,
    endDate: form.endDate || null,
  });
  if (id) store.saveSubtasks(id, form.subs);
}

/**
 * 全天完成庆祝：仅在当次打卡后「今日任务全完成且结转清零」时触发。
 * 由于刚打卡的项此前一定未完成，此处全完成必然是"从未完成变为全完成"的跃迁；
 * 打开页面时已是全完成不经过此路径；当天没有任务（today 为空）也不触发。
 */
function checkAllDone() {
  const p = plan.value;
  if (p.today.length > 0 && p.carried.length === 0 && p.today.every((x) => x.done)) {
    showCelebration.value = true;
  }
}

/** canvas-confetti 粒子爆发（以点击位置为原点） */
function celebrate(ev: MouseEvent) {
  confetti({
    particleCount: 90,
    spread: 75,
    startVelocity: 34,
    gravity: 0.9,
    ticks: 180,
    origin: {
      x: ev.clientX / window.innerWidth,
      y: ev.clientY / window.innerHeight,
    },
    colors: ['#14b8a6', '#3b82f6', '#f59e0b', '#f472b6', '#a78bfa'],
  });
}
</script>

<style scoped>
.offline-banner {
  background: var(--warn-soft);
  color: var(--warn);
  border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent);
  border-radius: 12px;
  padding: 9px 14px;
  font-size: 13.5px;
  font-weight: 600;
  margin-bottom: 14px;
  text-align: center;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.head-right {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: none;
}

.head-btns {
  display: flex;
  gap: 6px;
}

.head-btn {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-solid);
  background: var(--accent-soft);
  border: none;
  border-radius: 999px;
  padding: 3px 12px;
  text-decoration: none;
  cursor: pointer;
  transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.head-btn:active {
  transform: scale(0.94);
}

.head-btn.on {
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  color: #fff;
}

.back-today {
  border: none;
  background: var(--accent-soft);
  color: var(--accent-solid);
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  padding: 2px 10px;
  margin-left: 6px;
  cursor: pointer;
}

.ring-text strong {
  font-size: 20px;
}

.ring-text span {
  font-size: 12px;
  color: var(--text-3);
}

/* 重要日倒计时横幅 */
.mark-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  margin-bottom: 10px;
  border-color: color-mix(in srgb, var(--danger) 45%, var(--card-border));
  background: color-mix(in srgb, var(--danger) 7%, var(--card));
}

.mark-flag {
  flex: none;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: var(--danger);
  border-radius: 999px;
  padding: 3px 10px;
}

.mark-text {
  font-size: 14px;
  font-weight: 600;
  flex: 1;
  min-width: 0;
}

.mark-days {
  flex: none;
  font-size: 15px;
  color: var(--danger);
}

/* 右下角新增任务 FAB */
.fab {
  position: fixed;
  right: 18px;
  bottom: calc(84px + env(safe-area-inset-bottom));
  width: 56px;
  height: 56px;
  border: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  box-shadow: 0 6px 18px color-mix(in srgb, var(--accent-solid) 45%, transparent);
  cursor: pointer;
  z-index: 40;
  transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fab:active {
  transform: scale(0.9);
}

/* 平板 / 宽屏：任务双列，FAB 对齐内容列右缘 */
@media (min-width: 768px) {
  .task-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 12px;
  }

  .fab {
    right: calc(50% - 440px + 24px);
  }
}
</style>

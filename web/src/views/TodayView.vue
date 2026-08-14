<template>
  <div class="page">
    <header class="head">
      <div class="head-copy">
        <h1 class="page-title">
          <span class="date-part">{{ formatCn(selectedDate) }}</span>
          <span class="weekday-part">周{{ weekdayCn(selectedDate) }}</span>
        </h1>
        <p class="page-sub">
          {{ isToday ? copy.todayPlan : '查看历史' }}
          <button v-if="!isToday" class="back-today" type="button" @click="selectedDate = todayStr()">
            回到今天
          </button>
        </p>
      </div>
      <div class="head-actions">
        <button
          class="head-btn icon-only"
          :class="{ 'empty-landscape-add': !hasPlannedItems }"
          type="button"
          :aria-label="isGeneral ? '新增打卡项' : '新增任务'"
          @click="openNewTask"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button
          class="head-btn icon-only"
          :class="{ on: reordering }"
          type="button"
          :aria-label="reordering ? '完成排序' : '调整顺序'"
          :title="reordering ? '完成排序' : '调整顺序'"
          @click="reordering = !reordering"
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8 6h12M8 12h12M8 18h12" /><path d="M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        </button>
        <router-link to="/tasks" class="head-btn icon-only" :aria-label="isGeneral ? '管理打卡项目' : '管理任务'" :title="isGeneral ? '管理打卡项目' : '管理任务'">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5" />
          </svg>
        </router-link>
        <router-link :to="{ path: '/overview', query: { date: selectedDate } }" class="head-btn icon-only" aria-label="打开学习概览" title="打开学习概览">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
          </svg>
        </router-link>
      </div>
    </header>

    <DataRecoveryPanel compact />

    <!-- 连续日期轨道（可左右浏览 / 上下展开月视图 / 长按标记） -->
    <CalendarStrip
      v-model="selectedDate"
      :mark-date="store.settings.markDate ?? null"
      :completion-level="completionLevel"
      @mark="onMark"
    />

    <!-- 结转任务 -->
    <template v-if="plan.carried.length">
      <div class="section-title">之前未完成</div>
      <div class="task-grid">
        <TaskCard
          v-for="(item, i) in plan.carried"
          :key="item.task.id + '@' + item.date"
          :item="item"
          :index="plan.today.length + i"
          :general="isGeneral"
          :expanded="expandedItems.has(itemKey(item))"
          @toggle="onToggle"
          @toggle-source="onToggleSource"
          @adjust-progress="onAdjustProgress"
          @toggle-expand="onToggleExpand"
          @open-menu="openTaskMenu"
        />
      </div>
    </template>

    <!-- 今日任务 -->
    <template v-if="plan.today.length">
      <div class="section-title">{{ copy.todaySection }}</div>
      <div class="task-grid">
        <TaskCard
          v-for="(item, i) in plan.today"
          :key="item.task.id + '@' + item.date"
          :item="item"
          :index="i"
          :general="isGeneral"
          :reorder="reordering"
          :first="i === 0"
          :last="i === plan.today.length - 1"
          :sub-items="subsByTask.get(item.task.id) || []"
          :expanded="expandedItems.has(itemKey(item))"
          @toggle="onToggle"
          @adjust-progress="onAdjustProgress"
          @move="onMove"
          @toggle-sub="onToggleSub"
          @toggle-expand="onToggleExpand"
          @open-menu="openTaskMenu"
        />
      </div>
    </template>

    <div v-if="!plan.today.length && !plan.carried.length" class="empty">
      {{ isGeneral ? '这一天还没有打卡项，点右下角 + 安排一个' : '这一天没有任务，点右下角 + 添加吧' }}
    </div>

    <!-- 右下角快速新增任务（teleport 出滑动轨道，保持相对视口固定；仅今日页激活时显示） -->
    <teleport to="body">
      <button
        v-if="showFab"
        class="fab"
        :class="{ 'fab-entering': shellPhase === 'entering' }"
        type="button"
        :aria-label="isGeneral ? '新增打卡项' : '新增任务'"
        @click="openNewTask"
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
          stroke-width="2.6" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </teleport>
    <teleport to="body">
      <PixelGrid
        v-if="pixelFeedback"
        :key="pixelFeedback.key"
        class="pixel-check-feedback"
        :style="{ left: `${pixelFeedback.x}px`, top: `${pixelFeedback.y}px` }"
        :pattern="pixelFeedback.pattern"
        :label="pixelFeedback.label"
        once
      />
    </teleport>
    <TaskEditorSheet
      v-model:open="sheetOpen"
      :task="editingTask"
      :subtasks="editingTask ? taskSubtasks(editingTask.id) : []"
      @save="onSaveTask"
    />
    <TaskContextMenu
      :open="!!taskMenu"
      :item="taskMenu?.item || null"
      :anchor="taskMenu?.anchor || { x: 0, y: 0 }"
      @close="closeTaskMenu"
      @edit="editMenuTask"
      @focus="focusMenuTask"
      @reorder="reorderFromMenu"
      @delete="deleteMenuTask"
    />

    <CelebrationOverlay :show="showCelebration" @close="showCelebration = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { generatePlan, selectProgressSource, type PlanItem, type ProgressSource } from '../lib/plan';
import { completionForDate } from '../lib/completion';
import { todayStr, formatCn, weekdayCn } from '../lib/date';
import TaskCard from '../components/TaskCard.vue';
import CelebrationOverlay from '../components/CelebrationOverlay.vue';
import CalendarStrip from '../components/CalendarStrip.vue';
import TaskEditorSheet from '../components/TaskEditorSheet.vue';
import PixelGrid from '../components/PixelGrid.vue';
import type { Task } from '../types';
import { effectivePlanEnd, modeCopy } from '../lib/appMode';
import { pixelPatternCycleDuration, type PixelGridPatternPreset } from '../lib/pixelGrid';
import { SHELL_PHASE_KEY, type ShellPhase } from '../lib/shellPhase';
import DataRecoveryPanel from '../components/DataRecoveryPanel.vue';
import TaskContextMenu from '../components/TaskContextMenu.vue';
import { confirmDialog } from '../lib/appDialog';

const store = useAppStore();
const route = useRoute();
const router = useRouter();
const selectedDate = ref(todayStr());
const showCelebration = ref(false);
const reordering = ref(false);
const sheetOpen = ref(false);
const editingTask = ref<Task | null>(null);
const taskMenu = ref<{ item: PlanItem; anchor: { x: number; y: number } } | null>(null);
const isGeneral = computed(() => store.settings.appMode === 'general');
const copy = computed(() => modeCopy(store.settings.appMode));
const planEndDate = computed(() => effectivePlanEnd(store.settings));
const pixelFeedback = ref<{
  key: number;
  x: number;
  y: number;
  pattern: PixelGridPatternPreset;
  label: string;
} | null>(null);
let pixelFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
let feedbackKey = 0;
let taskCreationOrigin: { x: number; y: number } | null = null;
const shellPhase = inject(SHELL_PHASE_KEY, ref<ShellPhase>('ready'));

/** Tab 页常驻轨道后，FAB 只在今日页为当前路由时显示 */
const isActiveTab = computed(() => route.path === '/');
const showFab = computed(() => (
  isActiveTab.value && !hasPlannedItems.value && shellPhase.value !== 'pending'
));

/** 展开子任务的主任务 id 集合 */
const expandedItems = ref(new Set<string>());

function itemKey(item: PlanItem) {
  return `${item.task.id}@${item.sources?.length ? 'carried' : item.date}`;
}

function onToggleExpand(item: PlanItem) {
  const key = itemKey(item);
  const next = new Set(expandedItems.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedItems.value = next;
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
function onToggleSub(sub: SubItem, ev: MouseEvent) {
  const checking = !sub.done;
  if (!store.toggleCheckin(sub.id, selectedDate.value, sub.checkinId)) {
    showRecoveryForBlockedWrite();
    return;
  }
  if (checking) celebrate(ev);
}

function showRecoveryForBlockedWrite() {
  document.querySelector('#data-recovery')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const isToday = computed(() => selectedDate.value === todayStr());

const plan = computed(() =>
  generatePlan(store.tasks, store.checkins, selectedDate.value, planEndDate.value)
);
const hasPlannedItems = computed(() => plan.value.today.length > 0 || plan.value.carried.length > 0);

/** 任务日期的完成度色阶，与统计页共用 --heat-0 ~ --heat-4。 */
function completionLevel(date: string): number {
  return completionForDate(store.tasks, store.checkins, date, planEndDate.value).level;
}

/** 长按某天：已是标记日则取消，否则设为标记日 */
function onMark(date: string) {
  store.saveSettings({ markDate: store.settings.markDate === date ? null : date });
}

function onToggle(item: PlanItem, ev: MouseEvent) {
  const source = selectProgressSource(item, item.done ? -1 : 1);
  const checking = source.progress < source.target;
  const saved = store.setProgress(
    item.task.id,
    source.date,
    checking ? source.target : 0,
    source.checkinId,
  );
  if (!saved) {
    showRecoveryForBlockedWrite();
    return;
  }
  if (checking) {
    celebrate(ev);
    checkAllDone();
  }
}

function onToggleSource(item: PlanItem, source: ProgressSource, ev: MouseEvent) {
  const checking = source.progress < source.target;
  if (!store.setProgress(item.task.id, source.date, checking ? source.target : 0, source.checkinId)) {
    showRecoveryForBlockedWrite();
    return;
  }
  if (checking) {
    celebrate(ev);
    checkAllDone();
  }
}

function onAdjustProgress(
  item: PlanItem,
  delta: -1 | 1,
  explicitSource: ProgressSource | undefined,
  ev: MouseEvent,
) {
  const source = explicitSource || selectProgressSource(item, delta);
  const next = Math.min(source.target, Math.max(0, source.progress + delta));
  if (!store.setProgress(item.task.id, source.date, next, source.checkinId)) {
    showRecoveryForBlockedWrite();
    return;
  }
  if (delta > 0 && next === source.target) {
    celebrate(ev);
    checkAllDone();
  }
}

function taskSubtasks(taskId: string) {
  return store.subtasks.filter((s) => s.taskId === taskId).sort((a, b) => a.order - b.order);
}

function openNewTask(ev?: MouseEvent) {
  if (ev) taskCreationOrigin = { x: ev.clientX, y: ev.clientY };
  editingTask.value = null;
  sheetOpen.value = true;
}

function openTaskMenu(item: PlanItem, anchor: { x: number; y: number }) {
  if (reordering.value) return;
  taskMenu.value = { item, anchor };
}

function closeTaskMenu() {
  taskMenu.value = null;
}

function editMenuTask() {
  const item = taskMenu.value?.item;
  closeTaskMenu();
  if (!item) return;
  editingTask.value = item.task;
  sheetOpen.value = true;
}

function focusMenuTask() {
  const item = taskMenu.value?.item;
  closeTaskMenu();
  if (item) void router.push({ path: '/timer', query: { taskId: item.task.id } });
}

function reorderFromMenu() {
  closeTaskMenu();
  reordering.value = true;
}

async function deleteMenuTask() {
  const menu = taskMenu.value;
  closeTaskMenu();
  if (!menu) return;
  const noun = isGeneral.value ? '打卡项' : '任务';
  const accepted = await confirmDialog({
    title: `删除${noun}“${menu.item.task.title}”`,
    message: `删除后，这个${noun}及相关打卡进度将从本机移除。`,
    details: ['计时记录会保留，但不再关联这个任务', '此操作不能直接撤销'],
    confirmLabel: `删除${noun}`,
    variant: 'danger',
  });
  if (!accepted) return;
  store.deleteTask(menu.item.task.id);
  showPixelFeedback('dissolve', `${noun}已删除`, menu.anchor);
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
  id?: string;
  title: string;
  type: Task['type'];
  endDate: string;
  target: number;
  unit: string;
  subs: { id?: string; title: string }[];
}) {
  const creating = !form.id;
  const id = store.saveTask({
    id: form.id,
    title: form.title,
    type: form.type,
    endDate: form.endDate || null,
    target: form.target,
    unit: form.unit,
  });
  if (id) store.saveSubtasks(id, form.subs);
  if (id && creating && taskCreationOrigin) {
    showPixelFeedback('arrival', isGeneral.value ? '打卡项已创建' : '任务已创建', taskCreationOrigin);
  }
  taskCreationOrigin = null;
  editingTask.value = null;
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

function showPixelFeedback(
  pattern: PixelGridPatternPreset,
  label: string,
  origin: { x: number; y: number },
) {
  feedbackKey += 1;
  pixelFeedback.value = { key: feedbackKey, pattern, label, ...origin };
  if (pixelFeedbackTimer) clearTimeout(pixelFeedbackTimer);
  pixelFeedbackTimer = setTimeout(() => {
    pixelFeedback.value = null;
    pixelFeedbackTimer = null;
  }, Math.ceil(pixelPatternCycleDuration(pattern) * 1000) + 120);
}

/** SwiftPixelGrid Pattern feedback, anchored to the triggering control. */
function celebrate(ev: MouseEvent) {
  showPixelFeedback('confirm', '打卡完成', { x: ev.clientX, y: ev.clientY });
}

onBeforeUnmount(() => {
  if (pixelFeedbackTimer) clearTimeout(pixelFeedbackTimer);
});
</script>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.head-copy {
  min-width: 0;
  flex: 1;
}

.page-title .date-part,
.page-title .weekday-part {
  white-space: nowrap;
}

.head .page-title {
  display: flex;
  flex-wrap: wrap;
  column-gap: 6px;
}

.head-actions {
  display: flex;
  gap: 8px;
  flex: none;
}

.head-btn {
  min-width: 78px;
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-solid);
  background: var(--accent-soft);
  border: none;
  border-radius: 999px;
  text-decoration: none;
  cursor: pointer;
  transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.head-btn svg {
  flex: none;
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
  min-height: 44px;
  padding: 5px 11px;
  margin-left: 6px;
  cursor: pointer;
}

/* 右下角新增任务 FAB */
.fab {
  position: fixed;
  right: calc(18px + env(safe-area-inset-right));
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

.fab.fab-entering {
  animation: fab-shell-enter 360ms cubic-bezier(0.16, 1, 0.3, 1) both;
  will-change: transform, opacity;
}

@keyframes fab-shell-enter {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.88);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.head-btn.icon-only {
  width: 48px;
  min-width: 48px;
  padding: 0;
}

.pixel-check-feedback {
  position: fixed;
  z-index: 190;
  color: var(--accent-solid);
  pointer-events: none;
  transform: translate(-50%, -50%) scale(1.35);
  filter: drop-shadow(0 0 7px color-mix(in srgb, var(--accent-solid) 45%, transparent));
}

@media (max-width: 520px) {
  .head-actions {
    gap: 6px;
  }

  .empty {
    padding-right: 84px;
    padding-left: 4px;
    text-align: left;
    line-height: 1.7;
    text-wrap: pretty;
  }
}

@media (max-width: 360px) {
  .head-btn {
    width: 48px;
    min-width: 48px;
    padding: 0;
  }

  .head-btn span {
    display: none;
  }
}

/* 平板 / 宽屏：任务双列，FAB 对齐内容列右缘 */
@media (min-width: 768px) {
  .task-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 12px;
  }

  .fab {
    right: max(
      calc(24px + env(safe-area-inset-right)),
      calc(50% - 440px + 24px + env(safe-area-inset-right))
    );
  }
}

@media (max-height: 420px) and (orientation: landscape) {
  .head-btn.empty-landscape-add {
    display: inline-flex;
  }

  .fab {
    display: none;
    bottom: calc(66px + env(safe-area-inset-bottom));
    width: 48px;
    height: 48px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fab.fab-entering {
    animation: fab-shell-fade 160ms ease-out both;
  }

  @keyframes fab-shell-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}
</style>

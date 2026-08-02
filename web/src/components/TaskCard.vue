<template>
  <div
    v-motion
    class="card task-card"
    :class="{
      done: item.done,
      carried: item.overdueDays > 0,
      sorting: reorder,
      'long-press-active': longPressActive,
    }"
    :initial="{ opacity: 0, y: 18 }"
    :enter="{
      opacity: 1,
      y: 0,
      transition: { type: 'spring', stiffness: 260, damping: 26, delay: Math.min(index, 5) * 45 },
    }"
    @click="onCardClick"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @lostpointercapture="onPointerCancel"
  >
    <div class="main-row">
      <CheckButton :done="item.done" @toggle="onToggle" />
      <div class="body">
        <div class="title">{{ item.task.title }}</div>
        <div class="meta">
          <span v-if="item.overdueDays > 0" class="badge warn">逾期 {{ item.overdueDays }} 天</span>
          <span v-if="item.overdueDays > 0" class="date">{{ item.date }} 应完成</span>
          <span v-else class="badge">{{ item.task.type === 'daily' ? '每日' : '截止' }}</span>
          <span v-if="subItems.length" class="badge sub">
            子任务 {{ subDoneCount }}/{{ subItems.length }}
          </span>
        </div>
      </div>
      <svg
        v-if="subItems.length && !reorder"
        class="chev" :class="{ open: expanded }"
        viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
        stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
      <div v-if="reorder" class="reorder-btns" @click.stop>
        <button type="button" :disabled="first" aria-label="上移" @click="emit('move', item, -1)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
            stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 14 6-6 6 6" />
          </svg>
        </button>
        <button type="button" :disabled="last" aria-label="下移" @click="emit('move', item, 1)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
            stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 10 6 6 6-6" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 子任务清单（展开时） -->
    <div v-if="subItems.length && expanded && !reorder" class="subs" @click.stop>
      <div
        v-for="s in subItems"
        :key="s.id"
        class="sub-row"
        :class="{ done: s.done }"
        @click="emit('toggle-sub', s, $event)"
      >
        <CheckButton class="sub-check" :done="s.done" @toggle="(ev) => emit('toggle-sub', s, ev)" />
        <span class="sub-title">{{ s.title }}</span>
      </div>
    </div>
  </div>

</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { PlanItem } from '../lib/plan';
import CheckButton from './CheckButton.vue';

interface SubItem {
  id: string;
  title: string;
  done: boolean;
  checkinId?: string;
}

const props = withDefaults(
  defineProps<{
    item: PlanItem;
    index: number;
    /** 排序模式：整条点击不再切换打卡，右侧显示上移/下移按钮 */
    reorder?: boolean;
    first?: boolean;
    last?: boolean;
    /** 子任务清单（有子任务时点击卡片展开/收起） */
    subItems?: SubItem[];
    expanded?: boolean;
  }>(),
  { reorder: false, first: false, last: false, subItems: () => [], expanded: false }
);
const emit = defineEmits<{
  (e: 'toggle', item: PlanItem, ev: MouseEvent): void;
  (e: 'move', item: PlanItem, dir: -1 | 1): void;
  (e: 'toggle-sub', sub: SubItem, ev: MouseEvent): void;
  (e: 'toggle-expand', item: PlanItem): void;
  (e: 'edit', item: PlanItem): void;
}>();

const subDoneCount = computed(() => props.subItems.filter((s) => s.done).length);

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10;
const longPressActive = ref(false);
let pressTimer: ReturnType<typeof setTimeout> | null = null;
let revealTimer: ReturnType<typeof setTimeout> | null = null;
let pointerId: number | null = null;
let startX = 0;
let startY = 0;
let suppressClick = false;
let suppressClickTimer: ReturnType<typeof setTimeout> | null = null;

function clearPressTimer() {
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
}

function clearRevealTimer() {
  if (revealTimer) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
}

function armClickSuppression() {
  suppressClick = true;
  if (suppressClickTimer) clearTimeout(suppressClickTimer);
  suppressClickTimer = setTimeout(() => {
    suppressClickTimer = null;
    suppressClick = false;
  }, 900);
}

function resetPress() {
  clearPressTimer();
  clearRevealTimer();
  if (suppressClickTimer) {
    clearTimeout(suppressClickTimer);
    suppressClickTimer = null;
  }
  suppressClick = false;
  pointerId = null;
  longPressActive.value = false;
}

function isLongPressTarget(target: EventTarget | null) {
  const el = target instanceof Element ? target : null;
  // The check button, subtask rows and sorting controls have their own gestures.
  return !!el && !el.closest('button, input, textarea, select, a, .sub-row, [data-no-longpress]');
}

function onPointerDown(ev: PointerEvent) {
  if (props.reorder || ev.button !== 0 || !isLongPressTarget(ev.target)) return;
  resetPress();
  pointerId = ev.pointerId;
  startX = ev.clientX;
  startY = ev.clientY;
  const card = ev.currentTarget as HTMLElement;
  try {
    card.setPointerCapture(ev.pointerId);
  } catch {
    // Some older WebViews do not support pointer capture.
  }
  pressTimer = setTimeout(() => {
    pressTimer = null;
    if (pointerId !== ev.pointerId) return;
    armClickSuppression();
    longPressActive.value = true;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(12);
    // Let the lift state render before the editor sheet takes focus.
    revealTimer = setTimeout(() => {
      revealTimer = null;
      emit('edit', props.item);
      longPressActive.value = false;
      pointerId = null;
    }, 90);
  }, LONG_PRESS_MS);
}

function onPointerMove(ev: PointerEvent) {
  if (pointerId !== ev.pointerId || !pressTimer) return;
  if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > MOVE_CANCEL_PX) {
    resetPress();
  }
}

function onPointerUp(ev: PointerEvent) {
  if (pointerId !== ev.pointerId) return;
  clearPressTimer();
  pointerId = null;
  // Keep the lifted state until the editor event has been delivered.
  if (!revealTimer) longPressActive.value = false;
}

function onPointerCancel(ev: PointerEvent) {
  if (pointerId !== ev.pointerId) return;
  resetPress();
}

watch(
  () => props.reorder,
  (reordering) => {
    if (reordering) resetPress();
  }
);

onUnmounted(resetPress);

function onToggle(ev: MouseEvent) {
  emit('toggle', props.item, ev);
}

/** 整条卡片点击：有子任务时展开/收起，否则切换打卡/恢复；排序模式下不响应 */
function onCardClick(ev: MouseEvent) {
  if (suppressClick) {
    suppressClick = false;
    ev.preventDefault();
    return;
  }
  if (props.reorder) return;
  if (props.subItems.length) emit('toggle-expand', props.item);
  else emit('toggle', props.item, ev);
}
</script>

<style scoped>
.task-card {
  position: relative;
  z-index: 1;
  padding: 14px 16px;
  margin-bottom: 10px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition:
    transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 280ms ease,
    opacity 300ms ease;
}

/* 卡片按压缩放回弹 */
.task-card:not(.long-press-active):active {
  transform: scale(0.97);
}

.task-card.long-press-active {
  z-index: 81;
  transform: translateY(-6px) scale(1.015) !important;
  /* The wide spread dims the current scroll surface while this card stays above it. */
  box-shadow: var(--shadow-lg), 0 0 0 100vmax rgba(15, 23, 42, 0.16);
}

.main-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.body {
  min-width: 0;
  flex: 1;
}

.title {
  font-size: 15.5px;
  font-weight: 600;
  transition: color 200ms ease;
}

.task-card.done .title {
  color: var(--text-3);
  text-decoration: line-through;
}

.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.badge.sub {
  background: var(--bg-elev);
  color: var(--text-2);
  border: 1px solid var(--card-border);
}

.date {
  font-size: 12px;
  color: var(--text-3);
}

.task-card.carried {
  border-color: color-mix(in srgb, var(--warn) 35%, var(--card-border));
}

.chev {
  flex: none;
  color: var(--text-3);
  transition: transform 200ms ease;
}

.chev.open {
  transform: rotate(180deg);
}

/* 子任务清单 */
.subs {
  margin-top: 10px;
  padding-top: 6px;
  border-top: 1px dashed var(--card-border);
}

.sub-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 2px;
  border-radius: 10px;
  cursor: pointer;
  transition: background-color 160ms ease;
}

.sub-row:active {
  background: var(--accent-soft);
}

.sub-check {
  transform: scale(0.82);
  margin: -3px 0;
}

.sub-title {
  font-size: 14px;
  color: var(--text-2);
  transition: color 200ms ease;
}

.sub-row.done .sub-title {
  color: var(--text-3);
  text-decoration: line-through;
}

.reorder-btns {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: none;
}

.reorder-btns button {
  border: 1px solid var(--card-border);
  background: var(--bg-elev);
  color: var(--text-2);
  border-radius: 9px;
  width: 34px;
  height: 26px;
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.reorder-btns button:active {
  transform: scale(0.9);
}

.reorder-btns button:disabled {
  opacity: 0.3;
}

@media (prefers-reduced-motion: reduce) {
  .task-card,
  .task-card.long-press-active {
    transition-duration: 0.01ms;
  }
}
</style>

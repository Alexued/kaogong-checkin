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
      <CheckButton v-if="!isQuantity" :done="item.done" @toggle="onToggle" />
      <div class="body">
        <div class="title">{{ item.task.title }}</div>
        <div class="meta">
          <span v-if="item.overdueDays > 0" class="badge warn">
            {{ debtSources.length > 1 ? `欠账 ${debtSources.length} 天` : `逾期 ${item.overdueDays} 天` }}
          </span>
          <span v-if="item.overdueDays > 0" class="date">
            {{ debtSources.length > 1 ? `最早 ${item.date}` : `${item.date} 应完成` }}
          </span>
          <span v-else class="badge">{{ item.task.type === 'daily' ? '每日' : '截止' }}</span>
          <span v-if="isQuantity" class="badge quantity">
            {{ item.target - item.progress }}{{ item.unit }}待完成
          </span>
          <span v-if="subItems.length" class="badge sub">
            子任务 {{ subDoneCount }}/{{ subItems.length }}
          </span>
        </div>
      </div>
      <div v-if="isQuantity && !reorder" class="progress-control" @click.stop>
        <button
          class="progress-btn"
          type="button"
          :disabled="item.progress <= 0"
          :aria-label="`减少${item.task.title}进度`"
          @click="emit('adjust-progress', item, -1, undefined, $event)"
        >−</button>
        <output class="progress-value" :aria-label="`${item.task.title}进度 ${item.progress}/${item.target}${item.unit}`">
          <strong>{{ item.progress }}</strong><span>/{{ item.target }}{{ item.unit }}</span>
        </output>
        <button
          class="progress-btn add"
          type="button"
          :disabled="item.progress >= item.target"
          :aria-label="`增加${item.task.title}进度`"
          @click="emit('adjust-progress', item, 1, undefined, $event)"
        >＋</button>
      </div>
      <svg
        v-if="hasDetails && !reorder"
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

    <div v-if="debtSources.length && expanded && !reorder" class="sources" @click.stop>
      <div v-for="source in debtSources" :key="source.date" class="source-row">
        <div class="source-date">
          <strong>{{ source.date }}</strong>
          <span>逾期 {{ source.overdueDays }} 天</span>
        </div>
        <div v-if="isQuantity" class="source-progress">
          <button
            type="button"
            :disabled="source.progress <= 0"
            :aria-label="`减少 ${source.date} 进度`"
            @click="emit('adjust-progress', item, -1, source, $event)"
          >−</button>
          <span>{{ source.progress }}/{{ source.target }}{{ source.unit }}</span>
          <button
            type="button"
            :disabled="source.progress >= source.target"
            :aria-label="`增加 ${source.date} 进度`"
            @click="emit('adjust-progress', item, 1, source, $event)"
          >＋</button>
        </div>
        <CheckButton
          v-else
          :done="source.done"
          @toggle="(event) => emit('toggle-source', item, source, event)"
        />
      </div>
    </div>
  </div>

</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { PlanItem, ProgressSource } from '../lib/plan';
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
  (e: 'adjust-progress', item: PlanItem, delta: -1 | 1, source: ProgressSource | undefined, ev: MouseEvent): void;
  (e: 'toggle-source', item: PlanItem, source: ProgressSource, ev: MouseEvent): void;
}>();

const subDoneCount = computed(() => props.subItems.filter((s) => s.done).length);
const isQuantity = computed(() =>
  props.item.sources?.length
    ? props.item.sources.some((source) => source.target > 1)
    : props.item.target > 1,
);
const debtSources = computed(() => props.item.sources || []);
const hasDetails = computed(() => props.subItems.length > 0 || debtSources.value.length > 0);

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10;
const longPressActive = ref(false);
let pressTimer: ReturnType<typeof setTimeout> | null = null;
let revealTimer: ReturnType<typeof setTimeout> | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
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
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
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
    // Finish the card lift before establishing the editor overlay.
    revealTimer = setTimeout(() => {
      revealTimer = null;
      emit('edit', props.item);
      releaseTimer = setTimeout(() => {
        releaseTimer = null;
        longPressActive.value = false;
        pointerId = null;
      }, 140);
    }, 220);
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
  if (hasDetails.value) emit('toggle-expand', props.item);
  else if (isQuantity.value) return;
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
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
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

.badge.quantity {
  background: var(--accent-soft);
  color: var(--accent-solid);
}

.progress-control {
  flex: none;
  display: grid;
  grid-template-columns: 44px minmax(64px, auto) 44px;
  align-items: center;
  border: 1px solid var(--card-border);
  border-radius: 12px;
  overflow: hidden;
}

.progress-btn,
.source-progress button {
  width: 44px;
  height: 44px;
  border: 0;
  background: var(--bg-elev);
  color: var(--text-2);
  font-size: 20px;
  cursor: pointer;
}

.progress-btn.add {
  color: var(--accent-solid);
}

.progress-btn:disabled,
.source-progress button:disabled {
  opacity: 0.35;
  cursor: default;
}

.progress-value {
  min-width: 0;
  padding: 0 6px;
  text-align: center;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.progress-value strong {
  font-size: 15px;
}

.progress-value span {
  color: var(--text-3);
  font-size: 11px;
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

.sources {
  margin-top: 10px;
  padding-top: 6px;
  border-top: 1px dashed var(--card-border);
}

.source-row {
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}

.source-date {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.source-date strong {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.source-date span {
  color: var(--text-3);
  font-size: 11px;
}

.source-progress {
  flex: none;
  display: grid;
  grid-template-columns: 44px minmax(68px, auto) 44px;
  align-items: center;
  border: 1px solid var(--card-border);
  border-radius: 10px;
  overflow: hidden;
}

.source-progress span {
  padding: 0 6px;
  text-align: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

@media (max-width: 430px) {
  .main-row {
    flex-wrap: wrap;
  }

  .progress-control {
    order: 2;
    width: 100%;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
  }

  .source-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .source-progress {
    width: 100%;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
  }
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

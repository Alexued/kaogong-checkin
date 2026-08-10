<template>
  <section class="month-heatmap" :aria-labelledby="titleId">
    <header class="month-head">
      <button
        class="month-nav"
        type="button"
        aria-label="查看上个月"
        title="上个月"
        @click="emit('previous')"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <h3 :id="titleId" class="month-title" aria-live="polite">{{ model.label }}</h3>
      <button
        class="month-nav"
        type="button"
        aria-label="查看下个月"
        title="下个月"
        :disabled="!canGoNext"
        @click="emit('next')"
      >
        <span aria-hidden="true">›</span>
      </button>
    </header>

    <div ref="grid" class="calendar-grid" role="grid" data-swipe-ignore :aria-label="`${model.label}完成情况`">
      <div class="weekday-row" role="row">
        <span v-for="weekday in weekdays" :key="weekday" role="columnheader">{{ weekday }}</span>
      </div>
      <div :key="model.month" class="month-weeks">
        <div v-for="(week, weekIndex) in weeks" :key="weekIndex" class="month-week" role="row">
          <template v-for="(cell, dayIndex) in week" :key="cell.date">
            <span v-if="!cell.inMonth" class="day-spacer" role="gridcell" aria-hidden="true"></span>
            <button
              v-else
              type="button"
              role="gridcell"
              class="day-cell"
              :class="[`level-${cell.level}`, { today: cell.isToday, recorded: cell.hasRecord }]"
              :data-cell-index="weekIndex * 7 + dayIndex"
              :tabindex="focusIndex === weekIndex * 7 + dayIndex ? 0 : -1"
              :aria-label="dayLabel(cell)"
              :aria-disabled="cell.isFuture || !cell.hasRecord"
              @focus="focusIndex = weekIndex * 7 + dayIndex"
              @click="selectDay(cell)"
              @keydown="moveFocus($event, weekIndex * 7 + dayIndex)"
            >
              <span class="day-number">{{ cell.day }}</span>
              <span v-if="cell.hasRecord" class="record-dot" aria-hidden="true"></span>
            </button>
          </template>
        </div>
      </div>
    </div>

    <div class="heat-legend" aria-label="完成率色阶">
      <span>0%</span>
      <i v-for="level in [0, 1, 2, 3, 4]" :key="level" :class="`level-${level}`"></i>
      <span>100%</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import type { MonthCell, MonthProjection } from '../lib/statistics';

const props = withDefaults(defineProps<{
  model: MonthProjection;
  canGoNext?: boolean;
}>(), {
  canGoNext: true,
});

const emit = defineEmits<{
  previous: [];
  next: [];
  select: [date: string];
}>();

const titleId = `month-title-${useId()}`;
const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const grid = ref<HTMLElement | null>(null);
const weeks = computed(() => Array.from({ length: 6 }, (_, index) => props.model.cells.slice(index * 7, index * 7 + 7)));

function initialFocusIndex(): number {
  const today = props.model.cells.findIndex((cell) => cell.inMonth && cell.isToday);
  if (today >= 0) return today;
  return Math.max(0, props.model.cells.findIndex((cell) => cell.inMonth));
}

const focusIndex = ref(initialFocusIndex());

watch(
  () => props.model.month,
  () => { focusIndex.value = initialFocusIndex(); },
);

function dayLabel(cell: MonthCell): string {
  const completion = cell.total > 0
    ? `完成 ${cell.done}/${cell.total}，完成率 ${cell.percent}%`
    : '当天无计划';
  const record = cell.hasRecord ? '，有记录，可查看详情' : '，无记录';
  const state = cell.isToday ? '，今天' : cell.isFuture ? '，未来日期' : '';
  return `${cell.date}，${completion}${record}${state}`;
}

function selectDay(cell: MonthCell) {
  if (!cell.isFuture && cell.hasRecord) emit('select', cell.date);
}

function moveFocus(event: KeyboardEvent, index: number) {
  const offsets: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
    Home: -index,
    End: 41 - index,
  };
  const offset = offsets[event.key];
  if (offset === undefined) return;
  event.preventDefault();
  let target = event.key === 'Home'
    ? props.model.cells.findIndex((cell) => cell.inMonth)
    : event.key === 'End'
      ? props.model.cells.reduce((last, cell, cellIndex) => cell.inMonth ? cellIndex : last, -1)
      : Math.max(0, Math.min(41, index + offset));
  const step = offset < 0 ? -1 : 1;
  while (target >= 0 && target < 42 && !props.model.cells[target].inMonth) target += step;
  if (target < 0 || target >= 42) return;
  focusIndex.value = target;
  requestAnimationFrame(() => {
    grid.value?.querySelector<HTMLElement>(`[data-cell-index="${target}"]`)?.focus();
  });
}
</script>

<style scoped>
.month-heatmap {
  min-width: 0;
}

.month-head {
  min-height: 44px;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 8px;
}

.month-title {
  margin: 0;
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
  text-align: center;
  text-wrap: balance;
}

.month-nav {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 10px;
  padding: 0;
  background: var(--accent-soft);
  color: var(--accent-solid);
  cursor: pointer;
  touch-action: manipulation;
  transition: transform 150ms cubic-bezier(.16, 1, .3, 1), opacity 150ms ease;
}

.month-nav span {
  translate: 0 -1px;
  font-size: 28px;
  line-height: 1;
}

.month-nav:active:not(:disabled) {
  transform: scale(.94);
}

.month-nav:disabled {
  cursor: default;
  opacity: .28;
}

.month-nav:focus-visible,
.day-cell:focus-visible {
  outline: 2px solid var(--accent-solid);
  outline-offset: 2px;
}

.calendar-grid {
  min-height: 298px;
  margin-top: 8px;
}

.weekday-row,
.month-week {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
}

.weekday-row {
  height: 24px;
  align-items: center;
  color: var(--text-3);
  font-size: 10px;
  font-weight: 700;
  text-align: center;
}

.month-weeks {
  display: grid;
  grid-template-rows: repeat(6, 44px);
  gap: 2px;
  height: 274px;
  animation: month-settle 180ms cubic-bezier(.16, 1, .3, 1) both;
}

.day-cell,
.day-spacer {
  min-width: 0;
  min-height: 0;
  border-radius: 7px;
}

.day-cell {
  position: relative;
  display: grid;
  place-items: center;
  border: 0;
  padding: 0;
  background: var(--heat-0);
  color: var(--text-2);
  cursor: default;
  font: inherit;
  touch-action: manipulation;
  transition: transform 150ms cubic-bezier(.16, 1, .3, 1), filter 150ms ease;
}

.day-cell.recorded:not([aria-disabled='true']) {
  cursor: pointer;
}

.day-cell.level-1,
.heat-legend .level-1 { background: var(--heat-1); }
.day-cell.level-1 { color: var(--text); }
.day-cell.level-2,
.heat-legend .level-2 { background: var(--heat-2); color: var(--text); }
.day-cell.level-3,
.heat-legend .level-3 { background: var(--heat-3); color: #fff; }
.day-cell.level-4,
.heat-legend .level-4 { background: var(--heat-4); color: #fff; }

.day-cell[aria-disabled='true'] {
  opacity: .62;
}

.day-cell.today {
  box-shadow: inset 0 0 0 2px var(--accent-solid);
  font-weight: 800;
}

.day-cell:active:not([aria-disabled='true']) {
  transform: scale(.9);
  filter: brightness(1.06);
}

.day-number {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.record-dot {
  position: absolute;
  inset-inline-end: 4px;
  inset-block-end: 4px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  opacity: .75;
}

.heat-legend {
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  margin-top: 8px;
  color: var(--text-3);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.heat-legend i {
  width: 11px;
  height: 11px;
  flex: none;
  border-radius: 3px;
  background: var(--heat-0);
}

@keyframes month-settle {
  from { opacity: 0; transform: translateX(8px); }
  to { opacity: 1; transform: translateX(0); }
}

@media (hover: hover) {
  .month-nav:hover:not(:disabled),
  .day-cell.recorded:hover:not([aria-disabled='true']) {
    filter: brightness(1.06);
  }
}

@media (max-width: 360px) {
  .day-cell, .day-spacer { border-radius: 6px; }
  .record-dot { inset-inline-end: 3px; inset-block-end: 3px; }
}

@media (max-height: 420px) and (orientation: landscape) {
  .month-weeks { gap: 2px; }
}

@media (prefers-reduced-motion: reduce) {
  .month-weeks { animation: none; }
  .month-nav,
  .day-cell { transition-duration: .01ms; }
}
</style>

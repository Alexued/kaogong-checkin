<template>
  <div class="cal-wrap" data-swipe-ignore>
    <section
      class="cal card"
      :class="{ expanded }"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend.passive="onTouchEnd"
      @touchcancel.passive="onTouchCancel"
    >
      <div v-if="expanded" class="cal-head">
        <button class="nav" type="button" aria-label="上一月" @click="shiftMonth(-1)">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span class="cal-title">{{ monthTitle }}</span>
        <button class="nav" type="button" aria-label="下一月" @click="shiftMonth(1)">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      <div v-if="!expanded" ref="trackEl" class="track-viewport" @scroll.passive="onTrackScroll">
        <div class="track">
          <button
            v-for="d in trackDates"
            :key="d"
            :ref="(el) => setDayRef(d, el)"
            type="button"
            class="day track-day"
            :class="dayClass(d)"
            :aria-label="`${d}，完成度 ${completionLevel(d) * 25}%`"
            @click="onDayClick(d)"
            @touchstart.passive="onDayPressStart(d)"
            @touchmove.passive="onDayPressMove"
            @touchend.passive="onDayPressEnd"
            @touchcancel.passive="onDayPressEnd"
            @mousedown="onDayPressStart(d)"
            @mouseup="onDayPressEnd"
            @mouseleave="onDayPressEnd"
          >
            <span class="wd">{{ weekdayCn(d) }}</span>
            <span class="dn">{{ Number(d.slice(8)) }}</span>
            <span class="progress-dot" aria-hidden="true"></span>
          </button>
        </div>
      </div>

      <div v-else class="month-grid" :class="{ entering: expanded }">
        <div class="week-head" aria-hidden="true">
          <span v-for="w in WEEK_HEAD" :key="w">{{ w }}</span>
        </div>
        <div class="grid">
          <button
            v-for="d in monthDates"
            :key="d"
            type="button"
            class="day month-day"
            :class="dayClass(d)"
            :aria-label="`${d}，完成度 ${completionLevel(d) * 25}%`"
            @click="onDayClick(d)"
            @touchstart.passive="onDayPressStart(d)"
            @touchmove.passive="onDayPressMove"
            @touchend.passive="onDayPressEnd"
            @touchcancel.passive="onDayPressEnd"
            @mousedown="onDayPressStart(d)"
            @mouseup="onDayPressEnd"
            @mouseleave="onDayPressEnd"
          >
            <span class="dn">{{ Number(d.slice(8)) }}</span>
            <span class="progress-dot" aria-hidden="true"></span>
          </button>
        </div>
      </div>

      <button
        class="expand"
        type="button"
        :aria-label="expanded ? '收起月历' : '展开月历'"
        :aria-expanded="expanded"
        @click="toggleExpanded"
      >
        <svg
          viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
          :style="{ transform: expanded ? 'rotate(180deg)' : 'none' }"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { addDays, todayStr, weekdayCn } from '../lib/date';

const props = withDefaults(
  defineProps<{
    /** 选中日期 yyyy-MM-dd */
    modelValue: string;
    /** 标记的重要日 */
    markDate: string | null;
    /** 与统计热力图共享的 0~4 完成度色阶 */
    completionLevel?: (date: string) => number;
  }>(),
  { markDate: null, completionLevel: () => 0 }
);

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
  /** 长按某天：由父级决定设置/取消标记 */
  (e: 'mark', date: string): void;
}>();

const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日'];
const expanded = ref(false);
const trackEl = ref<HTMLElement | null>(null);
const rangeStart = ref(addDays(todayStr(), -35));
const rangeEnd = ref(addDays(todayStr(), 35));
const monthCursor = ref(props.modelValue.slice(0, 7));
const dayRefs = new Map<string, HTMLElement>();

const trackDates = computed(() => {
  const dates: string[] = [];
  for (let d = rangeStart.value; d <= rangeEnd.value; d = addDays(d, 1)) dates.push(d);
  return dates;
});

const monthDates = computed(() => {
  const first = `${monthCursor.value}-01`;
  const offset = (new Date(`${first}T00:00:00`).getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
});

const monthTitle = computed(() => {
  const [y, m] = monthCursor.value.split('-');
  return `${y}年${Number(m)}月`;
});

function completionLevel(date: string) {
  const level = props.completionLevel(date);
  return Math.max(0, Math.min(4, Math.round(level)));
}

function dayClass(date: string) {
  return {
    active: date === props.modelValue,
    today: date === todayStr(),
    marked: date === props.markDate,
    dim: expanded.value && date.slice(0, 7) !== monthCursor.value,
    [`level-${completionLevel(date)}`]: true,
  };
}

function setDayRef(date: string, el: Element | null) {
  if (el instanceof HTMLElement) dayRefs.set(date, el);
  else dayRefs.delete(date);
}

function centerSelected(behavior: ScrollBehavior = 'smooth') {
  const el = dayRefs.get(props.modelValue);
  if (!el) return;
  el.scrollIntoView({ behavior, block: 'nearest', inline: 'center' });
}

function ensureDateInRange(date: string) {
  if (date < rangeStart.value) rangeStart.value = addDays(date, -35);
  if (date > rangeEnd.value) rangeEnd.value = addDays(date, 35);
}

watch(
  () => props.modelValue,
  (date, oldDate) => {
    ensureDateInRange(date);
    monthCursor.value = date.slice(0, 7);
    if (!expanded.value) {
      void nextTick(() => centerSelected(oldDate ? 'smooth' : 'auto'));
    }
  },
  { immediate: true }
);

function toggleExpanded() {
  if (suppressClick) {
    clearClickSuppression();
    return;
  }
  clearClickSuppression();
  if (!expanded.value) {
    monthCursor.value = props.modelValue.slice(0, 7);
    expanded.value = true;
  } else {
    expanded.value = false;
    ensureDateInRange(props.modelValue);
    void nextTick(() => centerSelected('auto'));
  }
}

function onDayClick(date: string) {
  if (suppressClick) {
    clearClickSuppression();
    return;
  }
  emit('update:modelValue', date);
  if (expanded.value) {
    expanded.value = false;
    ensureDateInRange(date);
    void nextTick(() => centerSelected('smooth'));
  }
}

/* ---------- 长按标记重要日 ---------- */
const LONG_PRESS = 500;
let pressTimer: ReturnType<typeof setTimeout> | null = null;
let pressDate: string | null = null;
let suppressClick = false;
let suppressClickTimer: ReturnType<typeof setTimeout> | null = null;

function armClickSuppression() {
  suppressClick = true;
  if (suppressClickTimer) clearTimeout(suppressClickTimer);
  suppressClickTimer = setTimeout(() => {
    suppressClickTimer = null;
    suppressClick = false;
  }, 700);
}

function clearClickSuppression() {
  if (suppressClickTimer) {
    clearTimeout(suppressClickTimer);
    suppressClickTimer = null;
  }
  suppressClick = false;
}

function clearPress() {
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
  pressDate = null;
}

function onDayPressStart(date: string) {
  clearPress();
  if (gestureMoved) return;
  pressDate = date;
  pressTimer = setTimeout(() => {
    pressTimer = null;
    armClickSuppression();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(10);
    emit('mark', date);
    pressDate = null;
  }, LONG_PRESS);
}

function onDayPressMove() {
  clearPress();
}

function onDayPressEnd() {
  clearPress();
}

/* ---------- 日历区上下手势。横向只交给连续日期轨道原生滚动 ---------- */
let touchX = 0;
let touchY = 0;
let gestureMoved = false;
let adjustingRange = false;

function onTouchStart(ev: TouchEvent) {
  if (ev.touches.length !== 1) return;
  const t = ev.touches[0];
  touchX = t.clientX;
  touchY = t.clientY;
  gestureMoved = false;
}

function onTouchMove(ev: TouchEvent) {
  if (!ev.touches.length) return;
  const t = ev.touches[0];
  if (Math.hypot(t.clientX - touchX, t.clientY - touchY) > 10) {
    gestureMoved = true;
    clearPress();
  }
}

function onTouchEnd(ev: TouchEvent) {
  const t = ev.changedTouches[0];
  if (!t) return;
  const dx = t.clientX - touchX;
  const dy = t.clientY - touchY;
  const vertical = Math.abs(dy) >= 36 && Math.abs(dy) > Math.abs(dx);
  const horizontal = Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy);
  if (vertical) {
    if (dy > 0 && !expanded.value) {
      expanded.value = true;
      monthCursor.value = props.modelValue.slice(0, 7);
    } else if (dy < 0 && expanded.value) {
      expanded.value = false;
      ensureDateInRange(props.modelValue);
      void nextTick(() => centerSelected('smooth'));
    }
    armClickSuppression();
  } else if (horizontal) {
    // A horizontal track gesture should never select the pressed date.
    armClickSuppression();
  }
  gestureMoved = false;
}

function onTouchCancel() {
  gestureMoved = false;
  clearPress();
}

/* ---------- 轨道接近边缘时扩展日期，不跳周/月 ---------- */
function trackStep() {
  const track = trackEl.value;
  const first = track?.querySelector<HTMLElement>('.track-day');
  if (!track || !first) return 56;
  const gap = Number.parseFloat(getComputedStyle(track).columnGap || '0');
  return first.getBoundingClientRect().width + gap;
}

function onTrackScroll() {
  const track = trackEl.value;
  if (!track || adjustingRange) return;
  const threshold = 220;
  if (track.scrollLeft < threshold) {
    const count = 21;
    adjustingRange = true;
    rangeStart.value = addDays(rangeStart.value, -count);
    void nextTick(() => {
      track.scrollLeft += count * trackStep();
      adjustingRange = false;
    });
  } else if (track.scrollWidth - track.clientWidth - track.scrollLeft < threshold) {
    const count = 21;
    adjustingRange = true;
    rangeEnd.value = addDays(rangeEnd.value, count);
    void nextTick(() => { adjustingRange = false; });
  }
}

function shiftMonth(amount: number) {
  clearClickSuppression();
  const [year, month] = monthCursor.value.split('-').map(Number);
  const target = new Date(year, month - 1 + amount, 1);
  monthCursor.value = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
}

onMounted(() => {
  void nextTick(() => centerSelected('auto'));
});

onUnmounted(() => {
  clearPress();
  clearClickSuppression();
  dayRefs.clear();
});
</script>

<style scoped>
.cal {
  margin: 0 0 12px;
  padding: 8px 8px 4px;
  overflow: hidden;
}

.track-viewport {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;
  scroll-snap-type: x proximity;
  touch-action: pan-x;
}

.track-viewport::-webkit-scrollbar {
  display: none;
}

.track {
  display: flex;
  width: max-content;
  gap: 4px;
  padding: 2px calc(50% - 28px);
}

.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px 10px;
}

.cal-title {
  font-size: 15px;
  font-weight: 750;
  color: var(--text);
}

.nav,
.expand {
  border: none;
  background: transparent;
  color: var(--text-2);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.nav {
  width: 44px;
  height: 40px;
  border-radius: 10px;
}

.nav:active,
.expand:active {
  background: var(--accent-soft);
  transform: scale(0.94);
}

.nav:focus-visible,
.expand:focus-visible {
  outline: 2px solid var(--accent-solid);
  outline-offset: 1px;
}

.day {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: none;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 180ms ease, color 180ms ease, border-color 180ms ease;
  scroll-snap-align: center;
}

.track-day {
  width: 52px;
  height: 66px;
  gap: 4px;
  border-radius: 14px;
}

.month-day {
  width: 100%;
  min-height: 48px;
  gap: 4px;
  border-radius: 12px;
}

.day:active {
  transform: scale(0.92);
}

.wd {
  font-size: 11px;
  color: var(--text-3);
}

.dn {
  font-size: 16px;
  line-height: 1;
  font-weight: 720;
  font-variant-numeric: tabular-nums;
}

.progress-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--heat-0);
  flex: none;
}

.level-1 .progress-dot { background: var(--heat-1); }
.level-2 .progress-dot { background: var(--heat-2); }
.level-3 .progress-dot { background: var(--heat-3); }
.level-4 .progress-dot { background: var(--heat-4); }

.day.today .dn {
  color: var(--accent-solid);
}

.day.active {
  color: var(--text);
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent-solid) 70%, transparent);
}

.day.active .dn,
.day.active .wd {
  color: var(--accent-solid);
}

.day.marked {
  box-shadow: inset 0 0 0 1.5px var(--danger);
}

.day.marked .dn {
  color: var(--danger);
}

.day.marked.active {
  box-shadow: inset 0 0 0 2px var(--danger);
}

.month-grid {
  animation: month-in 180ms ease-out both;
}

@keyframes month-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.week-head,
.grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  justify-items: center;
}

.week-head {
  padding: 0 2px 4px;
}

.week-head span {
  font-size: 11px;
  color: var(--text-3);
}

.grid {
  row-gap: 2px;
}

.day.dim {
  opacity: 0.32;
}

.expand {
  width: 48px;
  height: 28px;
  margin: 2px auto 0;
  border-radius: 10px;
  transition: transform 180ms ease, background-color 180ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .day,
  .nav,
  .expand,
  .month-grid {
    transition-duration: 0.01ms;
    animation-duration: 0.01ms;
  }
}
</style>

<template>
  <div class="cal-wrap" data-swipe-ignore>
    <div
      class="cal card"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
      @touchcancel.passive="onTouchCancel"
    >
      <div v-if="expanded" class="cal-head">
        <button class="nav" type="button" aria-label="上一月" @click="shiftMonth(-1)">‹</button>
        <span class="cal-title">{{ monthTitle }}</span>
        <button class="nav" type="button" aria-label="下一月" @click="shiftMonth(1)">›</button>
      </div>

      <div class="grid" :class="{ month: expanded }">
        <template v-if="expanded">
          <span v-for="w in WEEK_HEAD" :key="w" class="wk">{{ w }}</span>
          <button
            v-for="d in monthDates"
            :key="d"
            type="button"
            class="day"
            :class="dayClass(d)"
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
          </button>
        </template>
        <template v-else>
          <button
            v-for="d in weekDates"
            :key="d"
            type="button"
            class="day"
            :class="dayClass(d)"
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
          </button>
        </template>
      </div>

      <button class="expand" type="button" @click="expanded = !expanded">
        <svg
          viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
          :style="{ transform: expanded ? 'rotate(180deg)' : 'none' }"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>
    <div class="hint">左右滑动切换 · 长按某天可标记/取消重要日</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { addDays, todayStr, weekdayCn } from '../lib/date';

const props = defineProps<{
  /** 选中日期 yyyy-MM-dd */
  modelValue: string;
  /** 标记的重要日 */
  markDate: string | null;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
  /** 长按某天：由父级决定设置/取消标记 */
  (e: 'mark', date: string): void;
}>();

const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日'];
const expanded = ref(false);

/** 本周日期（周一 ~ 周日，取选中日期所在周） */
const weekDates = computed(() => {
  const d = new Date(props.modelValue + 'T00:00:00');
  const offset = (d.getDay() + 6) % 7;
  const monday = addDays(props.modelValue, -offset);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
});

/** 月视图固定 6 行 42 格，从当月首日所在周的周一开始 */
const monthDates = computed(() => {
  const first = props.modelValue.slice(0, 8) + '01';
  const offset = (new Date(first + 'T00:00:00').getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
});

const monthTitle = computed(() => {
  const [y, m] = props.modelValue.split('-');
  return `${y}年${Number(m)}月`;
});

function dayClass(d: string) {
  return {
    active: d === props.modelValue,
    today: d === todayStr(),
    marked: d === props.markDate,
    dim: expanded.value && d.slice(0, 7) !== props.modelValue.slice(0, 7),
  };
}

/* ---------- 点击（ swipe / 长按后抑制） ---------- */
let suppressClick = false;

function onDayClick(d: string) {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  emit('update:modelValue', d);
}

/* ---------- 长按标记 ---------- */
const LONG_PRESS = 500;
let pressTimer: ReturnType<typeof setTimeout> | null = null;

function clearPress() {
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
}

function onDayPressStart(d: string) {
  clearPress();
  pressTimer = setTimeout(() => {
    pressTimer = null;
    suppressClick = true;
    emit('mark', d);
  }, LONG_PRESS);
}

function onDayPressMove() {
  // 手指移动视为滑动/滚动，取消长按
  clearPress();
}

function onDayPressEnd() {
  clearPress();
}

/* ---------- 整卡左右滑动：周视图 ±7 天，月视图 ±1 月 ---------- */
const SWIPE_MIN = 48;
let swipeX = 0;
let swipeY = 0;
let swiping = false;

function onTouchStart(e: TouchEvent) {
  const t = e.touches[0];
  swipeX = t.clientX;
  swipeY = t.clientY;
  swiping = true;
}

function onTouchCancel() {
  swiping = false;
}

function onTouchEnd(e: TouchEvent) {
  if (!swiping) return;
  swiping = false;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipeX;
  const dy = t.clientY - swipeY;
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy)) return;
  suppressClick = true;
  if (expanded.value) shiftMonth(dx < 0 ? 1 : -1);
  else emit('update:modelValue', addDays(props.modelValue, dx < 0 ? 7 : -7));
}

/** 月视图切换月份：日号超出目标月天数时钳制到月末 */
function shiftMonth(n: number) {
  const [y, m, d] = props.modelValue.split('-').map(Number);
  const target = new Date(y, m - 1 + n, 1);
  const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, daysInMonth));
  const p = (x: number) => String(x).padStart(2, '0');
  emit('update:modelValue', `${target.getFullYear()}-${p(target.getMonth() + 1)}-${p(target.getDate())}`);
}
</script>

<style scoped>
.cal {
  padding: 10px 8px 4px;
  margin-bottom: 4px;
  overflow: hidden;
}

.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px 8px;
}

.cal-title {
  font-size: 14px;
  font-weight: 700;
}

.nav {
  border: none;
  background: transparent;
  color: var(--text-2);
  font-size: 20px;
  line-height: 1;
  width: 32px;
  height: 28px;
  border-radius: 8px;
  cursor: pointer;
}

.nav:active {
  background: var(--accent-soft);
}

.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  justify-items: center;
  row-gap: 2px;
}

.wk {
  font-size: 11px;
  color: var(--text-3);
  padding: 2px 0 4px;
}

.day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: none;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 12px;
  min-width: 40px;
  /* 长按标记时不触发文本选中/系统菜单 */
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  transition:
    transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 200ms ease,
    color 200ms ease;
}

.day:active {
  transform: scale(0.92);
}

.day .wd {
  font-size: 11px;
}

.day .dn {
  font-size: 15px;
  font-weight: 700;
}

.day.dim {
  opacity: 0.35;
}

.day.today .dn {
  color: var(--accent-solid);
}

.day.active {
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  color: #fff;
}

.day.active .dn {
  color: #fff;
}

/* 标记的重要日：醒目红圈 + 圆点 */
.day.marked {
  box-shadow: inset 0 0 0 2px var(--danger);
  position: relative;
}

.day.marked .dn {
  color: var(--danger);
}

.day.marked::after {
  content: '';
  position: absolute;
  bottom: 3px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--danger);
}

.day.marked.active {
  box-shadow:
    inset 0 0 0 2px #fff,
    0 0 0 2px var(--danger);
}

.day.marked.active .dn {
  color: #fff;
}

.expand {
  display: block;
  margin: 2px auto 0;
  border: none;
  background: transparent;
  color: var(--text-3);
  width: 44px;
  height: 22px;
  cursor: pointer;
}

.expand svg {
  transition: transform 200ms ease;
}

.hint {
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
  margin: 2px 0 6px;
}
</style>

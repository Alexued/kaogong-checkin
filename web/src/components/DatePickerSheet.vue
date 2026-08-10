<template>
  <teleport to="body">
    <div v-if="open" class="date-mask" data-back-dismiss data-back-priority="180" @click.self="cancel">
      <section class="date-sheet card" role="dialog" aria-modal="true" :aria-label="title">
        <div class="date-head">
          <div>
            <div class="date-title">{{ title }}</div>
            <div class="date-value">{{ selected ? formatCn(selected) : '未设置' }}</div>
          </div>
          <button class="close-btn" type="button" aria-label="关闭" @click="cancel">×</button>
        </div>

        <div class="month-nav">
          <button type="button" aria-label="上一月" @click="shiftMonth(-1)">‹</button>
          <strong>{{ monthTitle }}</strong>
          <button type="button" aria-label="下一月" @click="shiftMonth(1)">›</button>
        </div>

        <div class="date-grid">
          <span v-for="w in WEEK_HEAD" :key="w" class="week-head">{{ w }}</span>
          <button
            v-for="day in monthDates"
            :key="day"
            type="button"
            class="date-day"
            :class="{ active: day === selected, today: day === todayStr(), dim: !isCurrentMonth(day) }"
            @click="selected = day"
          >
            {{ Number(day.slice(8)) }}
          </button>
        </div>

        <div class="quick-row">
          <button type="button" @click="pickQuick(todayStr())">今天</button>
          <button type="button" @click="pickQuick(addDays(todayStr(), 7))">一周后</button>
          <button v-if="allowClear" type="button" @click="selected = ''">清除</button>
        </div>

        <div class="date-actions">
          <button class="btn ghost" type="button" @click="cancel">取消</button>
          <button class="btn" type="button" @click="confirm">确认日期</button>
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { addDays, formatCn, todayStr } from '../lib/date';

const props = withDefaults(
  defineProps<{ open: boolean; modelValue: string; title?: string; allowClear?: boolean }>(),
  { title: '选择日期', allowClear: true }
);
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'update:modelValue', value: string): void;
}>();

const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日'];
const selected = ref('');
const viewMonth = ref('');

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    selected.value = props.modelValue || '';
    viewMonth.value = (props.modelValue || todayStr()).slice(0, 7);
  },
  { immediate: true }
);

const monthTitle = computed(() => {
  const [year, month] = viewMonth.value.split('-');
  return `${year}年${Number(month)}月`;
});

const monthDates = computed(() => {
  const first = `${viewMonth.value}-01`;
  const offset = (new Date(`${first}T00:00:00`).getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
});

function isCurrentMonth(day: string) {
  return day.slice(0, 7) === viewMonth.value;
}

function shiftMonth(delta: number) {
  const [year, month] = viewMonth.value.split('-').map(Number);
  const next = new Date(year, month - 1 + delta, 1);
  viewMonth.value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

function pickQuick(day: string) {
  selected.value = day;
  viewMonth.value = day.slice(0, 7);
}

function cancel() {
  emit('update:open', false);
}

function confirm() {
  emit('update:modelValue', selected.value);
  emit('update:open', false);
}
</script>

<style scoped>
.date-mask {
  position: fixed;
  inset: 0;
  z-index: 180;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(8, 13, 22, 0.44);
}

.date-sheet {
  width: 100%;
  max-width: 640px;
  padding: 18px 12px calc(18px + env(safe-area-inset-bottom));
  border-radius: 20px 20px 0 0;
  animation: date-sheet-in 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.date-head,
.month-nav,
.date-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.date-title {
  font-size: 18px;
  font-weight: 800;
}

.date-value {
  margin-top: 3px;
  font-size: 13px;
  color: var(--text-2);
}

.close-btn,
.month-nav button {
  width: 44px;
  height: 44px;
  border: 1px solid var(--card-border);
  border-radius: 12px;
  background: var(--bg-elev);
  color: var(--text-2);
  font-size: 24px;
}

.month-nav {
  margin: 12px 0 8px;
}

.month-nav strong {
  font-size: 15px;
}

.date-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.week-head {
  padding: 5px 0;
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
}

.date-day {
  aspect-ratio: 1;
  min-height: 44px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
}

.date-day.dim { opacity: 0.36; }
.date-day.today { box-shadow: inset 0 0 0 1px var(--accent-solid); }
.date-day.active {
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  color: #fff;
  font-weight: 800;
  box-shadow: none;
}

.quick-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.quick-row button {
  min-height: 44px;
  border: 1px solid var(--card-border);
  border-radius: 11px;
  background: var(--accent-soft);
  color: var(--accent-solid);
  font-size: 13px;
  font-weight: 700;
}

.date-actions {
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}

@keyframes date-sheet-in {
  from { opacity: 0; transform: translateY(44px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .date-sheet { animation-duration: 120ms; }
}
</style>

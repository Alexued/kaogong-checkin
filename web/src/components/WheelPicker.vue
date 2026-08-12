<template>
  <div class="wheel-field">
    <span v-if="label" class="wheel-label">{{ label }}</span>
    <div class="wheel-shell">
      <div class="wheel-guide" aria-hidden="true"></div>
      <div
        ref="scroller"
        class="wheel-scroll"
        role="spinbutton"
        tabindex="0"
        :aria-label="label"
        :aria-valuemin="min"
        :aria-valuemax="max"
        :aria-valuenow="modelValue"
        :aria-valuetext="`${format(modelValue)}${suffix}`"
        @scroll.passive="onScroll"
        @keydown="onKeydown"
      >
        <button
          v-for="value in values"
          :key="value"
          type="button"
          class="wheel-option"
          :class="{ selected: value === modelValue }"
          :aria-label="`${value}${suffix}`"
          @click="select(value, true)"
        >{{ format(value) }}</button>
      </div>
    </div>
    <small v-if="suffix">{{ suffix }}</small>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  modelValue: number;
  min: number;
  max: number;
  step?: number;
  label?: string;
  suffix?: string;
  pad?: number;
}>(), { step: 1, label: '', suffix: '', pad: 2 });
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();
const scroller = ref<HTMLElement | null>(null);
const ROW_HEIGHT = 46;
let scrollTimer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;

const values = computed(() => {
  const result: number[] = [];
  for (let value = props.min; value <= props.max; value += props.step) result.push(value);
  return result;
});

const format = (value: number) => String(value).padStart(props.pad, '0');

function bounded(value: number): number {
  return Math.min(props.max, Math.max(props.min, Math.round((value - props.min) / props.step) * props.step + props.min));
}

function scrollToValue(value: number, smooth = false) {
  const target = scroller.value;
  if (!target) return;
  const index = Math.round((bounded(value) - props.min) / props.step);
  syncing = true;
  target.scrollTo({ top: index * ROW_HEIGHT, behavior: smooth ? 'smooth' : 'auto' });
  requestAnimationFrame(() => { syncing = false; });
}

function select(value: number, smooth = false) {
  const next = bounded(value);
  if (next !== props.modelValue) emit('update:modelValue', next);
  scrollToValue(next, smooth);
}

function onScroll() {
  if (syncing || !scroller.value) return;
  if (scrollTimer) clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    if (!scroller.value) return;
    const index = Math.round(scroller.value.scrollTop / ROW_HEIGHT);
    select(values.value[Math.min(values.value.length - 1, Math.max(0, index))]);
  }, 70);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  select(props.modelValue + (event.key === 'ArrowUp' ? -props.step : props.step), true);
}

onMounted(() => nextTick(() => scrollToValue(props.modelValue)));
watch(() => props.modelValue, (value) => scrollToValue(value));
</script>

<style scoped>
.wheel-field{min-width:0;display:grid;justify-items:center;gap:5px}.wheel-label{color:var(--text-2);font-size:12px;font-weight:750}.wheel-field small{color:var(--text-3);font-size:11px}.wheel-shell{position:relative;width:100%;height:230px;overflow:hidden;mask-image:linear-gradient(to bottom,transparent 0,#000 24%,#000 76%,transparent 100%)}.wheel-guide{position:absolute;z-index:0;left:4px;right:4px;top:92px;height:46px;border-top:1px solid var(--card-border);border-bottom:1px solid var(--card-border);background:var(--accent-soft);border-radius:6px;pointer-events:none}.wheel-scroll{position:relative;z-index:1;width:100%;height:100%;overflow-y:auto;overscroll-behavior:contain;scroll-snap-type:y mandatory;scrollbar-width:none;padding:92px 0}.wheel-scroll::-webkit-scrollbar{display:none}.wheel-option{display:block;width:100%;height:46px;scroll-snap-align:center;border:0;background:transparent;color:var(--text-3);font-size:23px;font-weight:650;font-variant-numeric:tabular-nums;transition:color 120ms ease,transform 120ms ease}.wheel-option.selected{color:var(--text);font-size:31px;font-weight:850;transform:scale(1.03)}.wheel-scroll:focus-visible{outline:2px solid var(--accent-solid);outline-offset:-2px;border-radius:8px}
</style>

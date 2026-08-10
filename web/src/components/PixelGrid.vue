<template>
  <span
    ref="root"
    class="pixel-grid"
    :style="rootStyle"
    :data-preset="preset"
    :data-animated="active && !reducedMotion && !pageHidden ? 'true' : 'false'"
    :role="decorative ? undefined : 'status'"
    :aria-label="decorative ? undefined : label"
    :aria-hidden="decorative ? 'true' : undefined"
  >
    <span class="pixel-grid__layer pixel-grid__bloom" aria-hidden="true">
      <i v-for="index in 9" :key="`bloom-${index}`" :style="cellStyle(index - 1)"></i>
    </span>
    <span class="pixel-grid__layer pixel-grid__off" aria-hidden="true">
      <i v-for="index in 9" :key="`off-${index}`"></i>
    </span>
    <span class="pixel-grid__layer pixel-grid__on" aria-hidden="true">
      <i v-for="index in 9" :key="`on-${index}`" :style="cellStyle(index - 1)"></i>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  pixelGridCycleDuration,
  pixelGridIntensitiesAt,
  type PixelGridPreset,
} from '../lib/pixelGrid';

const props = withDefaults(defineProps<{
  active?: boolean;
  preset?: PixelGridPreset;
  label?: string;
  size?: number;
  once?: boolean;
  decorative?: boolean;
}>(), {
  active: true,
  preset: 'wave',
  label: '处理中',
  size: 19,
  once: false,
  decorative: false,
});

const root = ref<HTMLElement | null>(null);
const reducedMotion = ref(false);
const pageHidden = ref(false);
const rootStyle = computed(() => ({
  '--pixel-grid-size': `${Math.min(Math.max(props.size, 11), 160)}px`,
}));
const cellStyle = (index: number) => ({
  '--intensity': `var(--pixel-${index}, 0)`,
});

const values = new Array<number>(9).fill(0);
let animationFrame: number | null = null;
let epoch = 0;
let lastPaint = Number.NEGATIVE_INFINITY;
let mediaQuery: MediaQueryList | null = null;
let lowEndDevice = false;

function stopFrameLoop() {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
}

function applyFrame(frame: number[]) {
  const style = root.value?.style;
  if (!style) return;
  for (let index = 0; index < 9; index += 1) {
    style.setProperty(`--pixel-${index}`, frame[index].toFixed(4));
  }
}

function applyStaticFrame(value: 0 | 1) {
  values.fill(value);
  applyFrame(values);
}

function tick(now: number) {
  if (!props.active || reducedMotion.value || pageHidden.value) {
    stopFrameLoop();
    return;
  }

  const elapsed = Math.max(0, now - epoch) / 1000;
  if (props.once && elapsed >= pixelGridCycleDuration(props.preset)) {
    applyStaticFrame(1);
    animationFrame = null;
    return;
  }

  if (!lowEndDevice || now - lastPaint >= 1000 / 30) {
    pixelGridIntensitiesAt(elapsed, props.preset, { active: true }, values);
    applyFrame(values);
    lastPaint = now;
  }
  animationFrame = requestAnimationFrame(tick);
}

function startFrameLoop(restart: boolean) {
  stopFrameLoop();
  if (!props.active) {
    applyStaticFrame(0);
    return;
  }

  const now = performance.now();
  if (restart || epoch === 0) epoch = now;
  if (reducedMotion.value) {
    applyStaticFrame(1);
    return;
  }
  if (pageHidden.value) return;

  lastPaint = Number.NEGATIVE_INFINITY;
  tick(now);
}

function handleMotionPreference(event: MediaQueryListEvent) {
  reducedMotion.value = event.matches;
  startFrameLoop(true);
}

function handleVisibilityChange() {
  pageHidden.value = document.hidden;
  if (pageHidden.value) stopFrameLoop();
  else startFrameLoop(false);
}

watch(
  () => [props.active, props.preset, props.once],
  () => startFrameLoop(true),
);

onMounted(() => {
  mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion.value = mediaQuery.matches;
  pageHidden.value = document.hidden;
  const navigatorHints = navigator as Navigator & { deviceMemory?: number };
  lowEndDevice = navigatorHints.deviceMemory !== undefined
    ? navigatorHints.deviceMemory <= 2
    : navigator.hardwareConcurrency <= 4;
  mediaQuery.addEventListener('change', handleMotionPreference);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  startFrameLoop(true);
});

onBeforeUnmount(() => {
  stopFrameLoop();
  mediaQuery?.removeEventListener('change', handleMotionPreference);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>

<style scoped>
.pixel-grid {
  --cell-size: calc(var(--pixel-grid-size) * 3 / 11);
  --cell-gap: calc(var(--pixel-grid-size) / 11);
  position: relative;
  display: inline-block;
  flex: 0 0 auto;
  width: var(--pixel-grid-size);
  height: var(--pixel-grid-size);
  color: var(--accent-solid);
  contain: layout style;
  isolation: isolate;
  overflow: visible;
  vertical-align: middle;
}

.pixel-grid__layer {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(3, var(--cell-size));
  grid-template-rows: repeat(3, var(--cell-size));
  gap: var(--cell-gap);
  pointer-events: none;
}

.pixel-grid__layer i {
  display: block;
  width: var(--cell-size);
  height: var(--cell-size);
  border-radius: max(1px, calc(var(--pixel-grid-size) * 0.025));
}

.pixel-grid__bloom i {
  background: currentColor;
  opacity: var(--intensity);
  transform: scale(1.42);
  box-shadow: 0 0 calc(var(--pixel-grid-size) * 0.28) currentColor;
}

.pixel-grid__bloom {
  opacity: 0.38;
}

.pixel-grid__off i {
  background: currentColor;
  opacity: 0.16;
}

.pixel-grid__on i {
  background: currentColor;
  opacity: var(--intensity);
}

@media (prefers-reduced-motion: reduce) {
  .pixel-grid__bloom i {
    opacity: var(--intensity);
  }

  .pixel-grid__bloom { opacity: 0.18; }
}
</style>

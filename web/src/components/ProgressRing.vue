<template>
  <div class="ring" :style="{ width: size + 'px', height: size + 'px' }">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
      <defs>
        <linearGradient :id="gradId" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="var(--accent-from)" />
          <stop offset="100%" stop-color="var(--accent-to)" />
        </linearGradient>
      </defs>
      <circle
        :cx="c" :cy="c" :r="r" fill="none"
        stroke="var(--heat-0)" :stroke-width="stroke"
      />
      <circle
        class="fg"
        :cx="c" :cy="c" :r="r" fill="none"
        :stroke="`url(#${gradId})`" :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="offset"
        :transform="`rotate(-90 ${c} ${c})`"
      />
    </svg>
    <div class="center"><slot /></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ percent: number; size?: number; stroke?: number }>(), {
  size: 84,
  stroke: 8,
});

const gradId = `ring-grad-${Math.random().toString(36).slice(2, 8)}`;
const c = computed(() => props.size / 2);
const r = computed(() => (props.size - props.stroke) / 2);
const circumference = computed(() => 2 * Math.PI * r.value);
const offset = computed(() => {
  const p = Math.max(0, Math.min(1, props.percent));
  return circumference.value * (1 - p);
});
</script>

<style scoped>
.ring {
  position: relative;
  flex: none;
}

.center {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

/* 进度环弹性增长 */
.fg {
  transition: stroke-dashoffset 640ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
</style>

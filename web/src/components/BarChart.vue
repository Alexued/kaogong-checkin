<template>
  <div class="bar-chart">
    <div class="chart-visual" role="img" :aria-label="ariaLabel" :aria-describedby="descriptionId">
      <div v-if="bars.length" class="chart-frame">
      <div class="guide guide-top"><span v-if="showScale">{{ formatScale(maximum) }}</span></div>
      <div class="guide guide-mid"><span v-if="showScale">{{ formatScale(maximum / 2) }}</span></div>
      <div class="guide guide-base"><span v-if="showScale">0</span></div>
      <div
        v-if="average !== null && average !== undefined"
        class="average-line"
        :style="{ bottom: `${24 + heightPercent(average) * 1.54}px` }"
      >
        <span>{{ averageLabel }}</span>
      </div>
      <div class="bar-slots" :style="{ '--bar-count': bars.length }">
        <div v-for="(bar, index) in bars" :key="bar.id" class="bar-slot">
          <div class="bar-area" :title="`${bar.title || bar.label}：${bar.valueLabel}`">
            <div
              class="bar-fill"
              :class="{ highlight: bar.highlight }"
              :style="{
                height: `${heightPercent(bar.value)}%`,
                '--enter-delay': `${Math.min(index, 12) * 24}ms`,
              }"
            ></div>
          </div>
          <span class="bar-label">{{ bar.label }}</span>
        </div>
      </div>
      </div>
      <div v-else class="chart-empty">{{ emptyText }}</div>
    </div>

    <ul :id="descriptionId" class="visual-only-text">
      <li v-for="bar in bars" :key="bar.id">
        {{ bar.title || bar.label }}，{{ bar.valueLabel }}{{ bar.highlight ? '，重点记录' : '' }}
      </li>
      <li v-if="average !== null && average !== undefined">{{ averageLabel }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';

export interface ChartBar {
  id: string;
  label: string;
  value: number;
  valueLabel: string;
  title?: string;
  highlight?: boolean;
}

const props = withDefaults(defineProps<{
  bars: ChartBar[];
  ariaLabel: string;
  maxValue?: number;
  average?: number | null;
  averageLabel?: string;
  emptyText?: string;
  showScale?: boolean;
  scaleSuffix?: string;
}>(), {
  maxValue: 0,
  average: null,
  averageLabel: '平均值',
  emptyText: '暂无记录',
  showScale: false,
  scaleSuffix: '',
});
const descriptionId = `chart-description-${useId()}`;

const maximum = computed(() => {
  if (props.maxValue > 0) return props.maxValue;
  return Math.max(1, props.average || 0, ...props.bars.map((bar) => bar.value));
});

function heightPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(100, Math.max(0, value / maximum.value * 100));
}

function formatScale(value: number): string {
  return `${Math.round(value)}${props.scaleSuffix}`;
}
</script>

<style scoped>
.bar-chart {
  position: relative;
  min-width: 0;
  height: 188px;
}

.chart-visual,
.chart-frame,
.chart-empty {
  height: 188px;
}

.chart-frame {
  position: relative;
  padding: 10px 2px 24px 28px;
  overflow: hidden;
}

.guide {
  position: absolute;
  inset-inline: 28px 2px;
  height: 1px;
  background: var(--card-border);
  pointer-events: none;
}

.guide-top { top: 10px; }
.guide-mid { top: 87px; }
.guide-base { bottom: 24px; }

.guide span {
  position: absolute;
  inset-inline-end: calc(100% + 5px);
  translate: 0 -50%;
  color: var(--text-3);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.bar-slots {
  position: absolute;
  inset: 10px 2px 4px 28px;
  display: grid;
  grid-template-columns: repeat(var(--bar-count), minmax(0, 1fr));
  gap: clamp(3px, 1.2vw, 8px);
  align-items: stretch;
}

.bar-slot {
  min-width: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) 20px;
  align-items: end;
}

.bar-area {
  height: 100%;
  min-width: 0;
  display: flex;
  align-items: flex-end;
}

.bar-fill {
  width: 100%;
  min-height: 0;
  border-radius: 5px 5px 2px 2px;
  background: var(--heat-2);
  transform-origin: bottom;
  animation: bar-rise 320ms cubic-bezier(.16, 1, .3, 1) var(--enter-delay) both;
}

.bar-fill.highlight {
  background: var(--accent-solid);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-solid) 64%, transparent);
}

.bar-label {
  align-self: end;
  overflow: hidden;
  color: var(--text-3);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  line-height: 18px;
  text-align: center;
  white-space: nowrap;
}

.average-line {
  position: absolute;
  z-index: 2;
  inset-inline: 28px 2px;
  height: 1px;
  border-top: 1px dashed var(--warn);
  pointer-events: none;
}

.average-line span {
  position: absolute;
  inset-inline-end: 2px;
  inset-block-end: 4px;
  max-width: calc(100% - 4px);
  overflow: hidden;
  color: var(--warn);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  text-overflow: clip;
  white-space: nowrap;
}

.chart-empty {
  display: grid;
  place-items: center;
  color: var(--text-3);
  font-size: 13px;
  text-align: center;
}

.visual-only-text {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@keyframes bar-rise {
  from { opacity: 0; transform: scaleY(0); }
  to { opacity: 1; transform: scaleY(1); }
}

@media (max-width: 360px) {
  .chart-frame { padding-inline-start: 25px; }
  .guide,
  .average-line { inset-inline-start: 25px; }
  .bar-slots { inset-inline-start: 25px; gap: 3px; }
  .bar-label { font-size: 8px; }
}

@media (max-width: 260px) {
  .bar-slot:nth-child(even) .bar-label { visibility: hidden; }
}

@media (prefers-reduced-motion: reduce) {
  .bar-fill { animation: none; }
}
</style>

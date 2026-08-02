<template>
  <span class="pixel-grid" :class="[`preset-${preset}`, { active }]" role="status" :aria-label="label">
    <i v-for="cell in 9" :key="cell" :style="{ '--cell': cell - 1 }"></i>
  </span>
</template>
<script setup lang="ts">
withDefaults(defineProps<{ active?: boolean; preset?: 'wave' | 'spiral' | 'pulse'; label?: string }>(), { active: true, preset: 'wave', label: '处理中' });
</script>
<style scoped>
.pixel-grid { display:inline-grid; grid-template-columns:repeat(3,5px); grid-template-rows:repeat(3,5px); gap:3px; width:max-content; }
.pixel-grid i { width:5px; height:5px; border-radius:1px; background:currentColor; opacity:.22; transform:scale(.72); }
.pixel-grid.active i { animation:pixel-bloom 900ms ease-in-out infinite; animation-delay:calc(var(--cell) * 65ms); }
.pixel-grid.preset-wave i:nth-child(4),.pixel-grid.preset-wave i:nth-child(5),.pixel-grid.preset-wave i:nth-child(6){animation-delay:calc((var(--cell) - 2) * 65ms)}
.pixel-grid.preset-wave i:nth-child(7),.pixel-grid.preset-wave i:nth-child(8),.pixel-grid.preset-wave i:nth-child(9){animation-delay:calc((var(--cell) - 4) * 65ms)}
.pixel-grid.preset-spiral i:nth-child(1){animation-delay:0ms}.pixel-grid.preset-spiral i:nth-child(2){animation-delay:70ms}.pixel-grid.preset-spiral i:nth-child(3){animation-delay:140ms}.pixel-grid.preset-spiral i:nth-child(6){animation-delay:210ms}.pixel-grid.preset-spiral i:nth-child(9){animation-delay:280ms}.pixel-grid.preset-spiral i:nth-child(8){animation-delay:350ms}.pixel-grid.preset-spiral i:nth-child(7){animation-delay:420ms}.pixel-grid.preset-spiral i:nth-child(4){animation-delay:490ms}.pixel-grid.preset-spiral i:nth-child(5){animation-delay:560ms}
@keyframes pixel-bloom { 0%,100%{opacity:.2;transform:scale(.72)} 45%{opacity:1;transform:scale(1);box-shadow:0 0 6px currentColor} }
@media (prefers-reduced-motion:reduce){.pixel-grid.active i{animation:none;opacity:.75;transform:scale(1)}.pixel-grid.active i:nth-child(5){opacity:1}}
</style>

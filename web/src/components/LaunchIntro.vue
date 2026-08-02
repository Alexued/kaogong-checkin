<template>
  <teleport to="body">
    <div class="launch-intro" :class="{ reduced }" aria-hidden="true">
      <img src="../assets/app-icon.png" alt="" />
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

const emit = defineEmits<{ (e: 'done'): void }>();
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let timer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  timer = setTimeout(() => emit('done'), reduced ? 180 : 560);
});

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<style scoped>
.launch-intro {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  background: var(--bg);
  pointer-events: none;
  animation: intro-exit 360ms cubic-bezier(0.22, 1, 0.36, 1) 180ms both;
}

.launch-intro img {
  width: 76px;
  height: 76px;
  border-radius: 20px;
  box-shadow: 0 16px 34px color-mix(in srgb, var(--accent-solid) 28%, transparent);
  animation: icon-arrive 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes icon-arrive {
  from { opacity: 0; transform: scale(0.82); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes intro-exit {
  from { opacity: 1; }
  to { opacity: 0; }
}

.launch-intro.reduced {
  animation: intro-exit 160ms ease-out both;
}

.launch-intro.reduced img {
  animation: none;
}
</style>

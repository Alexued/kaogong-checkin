<template>
  <teleport to="body">
    <div class="launch-intro" :class="{ reduced, paused: pageHidden }" aria-hidden="true">
      <div class="launch-lockup">
        <PixelGrid preset="wave" :size="44" once decorative />
        <span class="launch-wordmark">格记</span>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import PixelGrid from './PixelGrid.vue';

const emit = defineEmits<{ (e: 'done'): void }>();
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pageHidden = ref(document.hidden);
let timer: ReturnType<typeof setTimeout> | null = null;
let remaining = reduced ? 180 : 560;
let timerStartedAt = 0;

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function scheduleDone() {
  if (pageHidden.value || remaining <= 0) return;
  timerStartedAt = performance.now();
  timer = setTimeout(() => {
    remaining = 0;
    timer = null;
    emit('done');
  }, remaining);
}

function handleVisibilityChange() {
  pageHidden.value = document.hidden;
  if (pageHidden.value) {
    if (timer) remaining = Math.max(0, remaining - (performance.now() - timerStartedAt));
    clearTimer();
  } else {
    scheduleDone();
  }
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  scheduleDone();
});

onBeforeUnmount(() => {
  clearTimer();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
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
  animation: intro-exit 220ms cubic-bezier(0.22, 1, 0.36, 1) 340ms both;
}

.launch-lockup {
  display: grid;
  justify-items: center;
  gap: 15px;
  color: var(--accent-solid);
  animation: lockup-arrive 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.launch-wordmark {
  color: var(--text);
  font-size: 18px;
  font-weight: 750;
  letter-spacing: 0;
}

@keyframes lockup-arrive {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes intro-exit {
  from { opacity: 1; }
  to { opacity: 0; }
}

.launch-intro.reduced {
  animation: intro-exit 120ms ease-out 60ms both;
}

.launch-intro.reduced .launch-lockup {
  animation: none;
}

.launch-intro.paused,
.launch-intro.paused .launch-lockup {
  animation-play-state: paused;
}
</style>

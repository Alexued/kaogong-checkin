<template>
  <teleport to="body">
    <div
      v-if="show"
      ref="mask"
      class="mask"
      :class="{ paused: pageHidden }"
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-message"
      aria-describedby="celebration-hint"
      tabindex="-1"
      data-back-dismiss
      data-back-priority="200"
      @click="emit('close')"
      @keydown.esc="emit('close')"
    >
      <div
        class="card celebrate"
      >
        <PixelGrid preset="spiral" :size="52" once decorative />
        <div id="celebration-message" class="msg">{{ message }}</div>
        <div id="celebration-hint" class="hint">点击任意处关闭</div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import confetti from 'canvas-confetti';
import { useAppStore } from '../stores/app';
import type { AppMode } from '../types';
import PixelGrid from './PixelGrid.vue';

const props = defineProps<{ show: boolean; appMode?: AppMode }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const store = useAppStore();
const resolvedMode = computed(() => props.appMode ?? store.settings.appMode);
const mask = ref<HTMLElement | null>(null);
const pageHidden = ref(document.hidden);

const MESSAGES: Record<AppMode, readonly string[]> = {
  exam: [
    '今日计划清零，离目标又近了一步。',
    '今日任务全部完成，稳稳推进一程。',
    '今日圆满收官，把节奏保持住。',
    '该做的都做完了，明天继续。',
  ],
  general: [
    '今日习惯全部完成，节律很稳。',
    '今天的每一项都落地了。',
    '今日清单清零，好好收尾。',
    '节奏已经记下，明天继续。',
  ],
};

const message = ref(MESSAGES.exam[0]);

let timer: ReturnType<typeof setTimeout> | null = null;
let remaining = 3000;
let timerStartedAt = 0;
let confettiStarted = false;
let previousFocus: HTMLElement | null = null;
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function startConfetti() {
  if (confettiStarted || motionQuery.matches || pageHidden.value) return;
  confettiStarted = true;
  confetti({
    particleCount: 72,
    spread: 76,
    startVelocity: 32,
    scalar: 0.82,
    ticks: 150,
    origin: { y: 0.62 },
    colors: ['#14b8a6', '#3b82f6', '#f59e0b', '#ef5da8'],
    disableForReducedMotion: true,
  });
}

function scheduleClose() {
  if (!props.show || pageHidden.value || remaining <= 0) return;
  timerStartedAt = performance.now();
  timer = setTimeout(() => {
    remaining = 0;
    timer = null;
    emit('close');
  }, remaining);
}

function handleVisibilityChange() {
  pageHidden.value = document.hidden;
  if (pageHidden.value) {
    if (timer) remaining = Math.max(0, remaining - (performance.now() - timerStartedAt));
    clearTimer();
    confetti.reset();
  } else if (props.show) {
    startConfetti();
    scheduleClose();
  }
}

function handleMotionPreference(event: MediaQueryListEvent) {
  if (event.matches) confetti.reset();
}

watch(
  () => props.show,
  async (visible) => {
    clearTimer();
    if (visible) {
      const choices = MESSAGES[resolvedMode.value];
      message.value = choices[Math.floor(Math.random() * choices.length)];
      remaining = 3000;
      confettiStarted = false;
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await nextTick();
      mask.value?.focus({ preventScroll: true });
      startConfetti();
      scheduleClose();
    } else {
      confetti.reset();
      previousFocus?.focus({ preventScroll: true });
      previousFocus = null;
    }
  },
  { immediate: true },
);

document.addEventListener('visibilitychange', handleVisibilityChange);
motionQuery.addEventListener('change', handleMotionPreference);

onBeforeUnmount(() => {
  clearTimer();
  confetti.reset();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  motionQuery.removeEventListener('change', handleMotionPreference);
});
</script>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: grid;
  place-items: center;
  z-index: 200;
}

.celebrate {
  display: grid;
  justify-items: center;
  width: min(320px, calc(100vw - 40px));
  padding: 30px 32px 26px;
  text-align: center;
  box-shadow: var(--shadow-lg);
  animation: celebrate-enter 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.msg {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.6;
  margin-top: 18px;
}

.hint {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 14px;
}

@keyframes celebrate-enter {
  from { opacity: 0; transform: translateY(12px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.mask.paused .celebrate {
  animation-play-state: paused;
}

@media (prefers-reduced-motion: reduce) {
  .celebrate {
    animation: celebrate-fade 120ms ease-out both;
  }

  @keyframes celebrate-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}
</style>

<template>
  <button
    class="check"
    :class="{ done }"
    type="button"
    aria-label="打卡"
    @click.stop="$emit('toggle', $event)"
  >
    <svg viewBox="0 0 24 24" width="15" height="15">
      <path
        class="tick"
        d="m5 12.5 4.5 4.5L19 7.5"
        fill="none"
        stroke="#fff"
        stroke-width="2.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>
</template>

<script setup lang="ts">
defineProps<{ done: boolean }>();
defineEmits<{ (e: 'toggle', ev: MouseEvent): void }>();
</script>

<style scoped>
.check {
  flex: none;
  position: relative;
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
}

.check::before {
  content: '';
  position: absolute;
  width: 28px;
  height: 28px;
  border: 2px solid var(--text-3);
  border-radius: 50%;
  background: transparent;
  transition:
    transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 200ms ease,
    border-color 200ms ease;
}

.check:active::before {
  transform: scale(0.85);
}

.check.done::before {
  border-color: transparent;
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  animation: pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.check svg {
  position: relative;
  z-index: 1;
}

@keyframes pop {
  0% {
    transform: scale(0.6);
  }
  60% {
    transform: scale(1.18);
  }
  100% {
    transform: scale(1);
  }
}

.tick {
  stroke-dasharray: 22;
  stroke-dashoffset: 22;
}

.check.done .tick {
  /* SVG 对勾描边动画 */
  animation: draw 320ms ease-out 90ms forwards;
}

@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .check,
  .check::before,
  .check.done::before,
  .check.done .tick {
    transition-duration: 0.01ms;
    animation-duration: 0.01ms;
    animation-delay: 0ms;
  }
}
</style>

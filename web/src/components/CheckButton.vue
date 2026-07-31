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
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--text-3);
  background: transparent;
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  transition:
    transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 200ms ease,
    border-color 200ms ease;
}

.check:active {
  transform: scale(0.85);
}

.check.done {
  border-color: transparent;
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  animation: pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1);
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
</style>

<template>
  <teleport to="body">
    <div v-if="show" class="mask" data-back-dismiss data-back-priority="200" @click="$emit('close')">
      <div
        v-motion
        class="card celebrate"
        :initial="{ opacity: 0, scale: 0.5, y: 40 }"
        :enter="{
          opacity: 1,
          scale: 1,
          y: 0,
          transition: { type: 'spring', stiffness: 320, damping: 17 },
        }"
      >
        <div class="emoji">🎉</div>
        <div class="msg">{{ message }}</div>
        <div class="hint">点击任意处关闭</div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import confetti from 'canvas-confetti';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const MESSAGES = [
  '今日任务全部完成！保持住，离上岸又近一步 🎉',
  '全部搞定！今天的你没有辜负自己 💪',
  '任务清零！这份坚持，终将上岸 🌟',
  '今日圆满收官，明天继续冲 🚀',
];

const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

let timer: ReturnType<typeof setTimeout> | null = null;

/** 大规模多发连射 */
function barrage() {
  const colors = ['#14b8a6', '#3b82f6', '#f59e0b', '#f472b6', '#a78bfa'];
  confetti({ particleCount: 160, spread: 100, startVelocity: 42, origin: { y: 0.6 }, colors });
  const end = Date.now() + 1200;
  const iv = setInterval(() => {
    confetti({ particleCount: 40, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors });
    confetti({ particleCount: 40, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors });
    if (Date.now() > end) clearInterval(iv);
  }, 200);
}

watch(
  () => props.show,
  (v) => {
    if (timer) clearTimeout(timer);
    if (v) {
      barrage();
      timer = setTimeout(() => emit('close'), 3000);
    }
  }
);
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
  padding: 34px 40px;
  text-align: center;
  max-width: 320px;
  box-shadow: var(--shadow-lg);
}

.emoji {
  font-size: 46px;
}

.msg {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.6;
  margin-top: 12px;
}

.hint {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 14px;
}
</style>

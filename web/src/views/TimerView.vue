<template>
  <div class="page timer-page">
    <h1 class="page-title small">计时</h1>

    <!-- 主计时区：占据剩余空间，时钟居中放大 -->
    <div class="timer-stage">
      <div class="clock">{{ clockText }}</div>

      <!-- 计时中打点列表：占满时钟与按钮之间的剩余空间 -->
      <div v-if="sw.lapsElapsed.length" class="laps-area">
        <div class="laps-head">
          <span class="laps-title">打点（{{ sw.lapsElapsed.length }}）</span>
          <div class="font-ctl">
            <button class="font-btn" :disabled="lapsFont <= 13" @click="adjustFont(-1)">A−</button>
            <button class="font-btn" :disabled="lapsFont >= 24" @click="adjustFont(1)">A＋</button>
          </div>
        </div>
        <div ref="lapsEl" class="laps-scroll" data-swipe-ignore>
          <div
            v-for="(lap, i) in currentLaps"
            :key="i"
            class="lap"
            :style="{ fontSize: lapsFont + 'px' }"
          >
            <span class="lap-no" :style="{ background: lapColor(i) }">{{ i + 1 }}</span>
            <span class="lap-split" :style="{ color: lapColor(i) }">+{{ fmtDuration(lap.splitMs) }}</span>
            <span class="lap-elapsed">{{ fmtDuration(lap.elapsedMs) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 操作按钮组：屏幕中下方 -->
    <div class="controls">
      <button v-if="!sw.startedAt" class="round-btn main start" @click="start">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>
        <span>开始</span>
      </button>
      <template v-else>
        <button class="round-btn sub stop" @click="finishing = true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
          <span>结束</span>
        </button>
        <button v-if="sw.running" class="round-btn main pause" @click="sw.pause()">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><rect x="6" y="5" width="4.5" height="14" rx="1.5"/><rect x="13.5" y="5" width="4.5" height="14" rx="1.5"/></svg>
          <span>暂停</span>
        </button>
        <button v-else class="round-btn main start" @click="resume">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>
          <span>继续</span>
        </button>
        <button class="round-btn lap" :disabled="!sw.running" @click="sw.lap()">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          <span>打点</span>
        </button>
      </template>
    </div>

    <!-- 历史记录入口（二级页） -->
    <router-link to="/timer/history" class="card history-entry">
      <span class="he-label">历史记录</span>
      <span class="he-count">{{ recordsCount }} 条</span>
      <span class="he-arrow">›</span>
    </router-link>

    <!-- 结束保存面板（底部弹层） -->
    <teleport to="body">
      <div v-if="finishing" class="sheet-mask" @click.self="finishing = false">
        <div
          v-motion
          class="sheet card"
          :initial="{ opacity: 0, y: 60 }"
          :enter="{
            opacity: 1,
            y: 0,
            transition: { type: 'spring', stiffness: 280, damping: 26 },
          }"
        >
          <h2 class="sheet-title">保存计时记录</h2>
          <label class="field">
            <span>备注标签（如：资料分析 20 题）</span>
            <input v-model="label" class="input" placeholder="这次在做什么？" />
          </label>
          <label class="field">
            <span>关联任务（可空）</span>
            <select v-model="taskId" class="input">
              <option value="">不关联</option>
              <option v-for="t in linkableTasks" :key="t.id" :value="t.id">{{ t.title }}</option>
            </select>
          </label>
          <div class="save-summary">
            总时长 <strong>{{ fmtDuration(sw.elapsedMs()) }}</strong> · {{ sw.lapsElapsed.length }} 次打点
          </div>
          <div class="row-end">
            <button class="btn ghost" @click="finishing = false">再想想</button>
            <div class="gap"></div>
            <button class="btn danger" @click="discard">丢弃</button>
            <button class="btn" @click="save">保存记录</button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAppStore } from '../stores/app';
import { stopwatch as sw, fmtClock, fmtDuration } from '../lib/stopwatch';
import { toLocalDateStr } from '../lib/date';

const store = useAppStore();

// ---------- 计时显示（rAF 驱动） ----------
const clockText = ref(fmtClock(sw.elapsedMs()));
let raf = 0;
function tick() {
  clockText.value = fmtClock(sw.elapsedMs());
  if (sw.running) raf = requestAnimationFrame(tick);
}
onMounted(() => {
  if (sw.running) raf = requestAnimationFrame(tick);
});
onBeforeUnmount(() => cancelAnimationFrame(raf));

function start() {
  sw.start();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

function resume() {
  sw.resume();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

const currentLaps = computed(() => sw.laps());

// ---------- 打点区：循环色板 + 字号调节 + 自动滚动 ----------
/** 循环色板（深浅主题均有足够对比度） */
const LAP_COLORS = ['#14b8a6', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#22c55e'];
function lapColor(i: number): string {
  return LAP_COLORS[i % LAP_COLORS.length];
}

const lapsEl = ref<HTMLElement | null>(null);
// 新打点自动滚动到可见
watch(
  () => sw.lapsElapsed.length,
  async () => {
    await nextTick();
    const el = lapsEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  }
);

// 打点区字号：13~24px，localStorage 持久化
const FONT_KEY = 'kgc-laps-font-size';
const lapsFont = ref(Math.min(24, Math.max(13, Number(localStorage.getItem(FONT_KEY)) || 17)));
function adjustFont(delta: number) {
  lapsFont.value = Math.min(24, Math.max(13, lapsFont.value + delta));
  localStorage.setItem(FONT_KEY, String(lapsFont.value));
}

// ---------- 保存 ----------
const finishing = ref(false);
const label = ref('');
const taskId = ref('');

const linkableTasks = computed(() => store.tasks.filter((t) => !t.archived));

function save() {
  const startedAt = sw.startedAt!;
  store.saveTimer({
    label: label.value.trim(),
    taskId: taskId.value || null,
    date: toLocalDateStr(new Date(startedAt)),
    startedAt,
    durationMs: Math.round(sw.elapsedMs()),
    laps: sw.laps(),
  });
  sw.reset();
  finishing.value = false;
  label.value = '';
  taskId.value = '';
  clockText.value = fmtClock(0);
}

function discard() {
  sw.reset();
  finishing.value = false;
  label.value = '';
  taskId.value = '';
  clockText.value = fmtClock(0);
}

// ---------- 历史入口计数 ----------
const recordsCount = computed(() => store.timers.filter((t) => !t.deleted).length);
</script>

<style scoped>
/* 整页 flex：页面根节点经 #app 高度链撑满视口；
   时钟区 flex:1 占剩余空间，按钮组在其下，历史入口紧贴 Tab Bar 上沿 */
.timer-page {
  display: flex;
  flex-direction: column;
}

.page-title.small {
  font-size: 20px;
  margin-bottom: 0;
}

.timer-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 0;
  padding: 12px 0;
}

/* 时钟数字自适应宽度，尽量大 */
.clock {
  text-align: center;
  font-size: clamp(72px, 21vw, 108px);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
  line-height: 1.1;
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* 打点区：占满时钟与按钮之间的剩余空间，内部滚动 */
.laps-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 420px;
  margin: 10px auto 0;
}

.laps-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 6px;
}

.laps-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-3);
}

.font-ctl {
  display: flex;
  gap: 6px;
}

.font-btn {
  border: 1px solid var(--card-border);
  background: var(--card);
  color: var(--text-2);
  border-radius: 9px;
  padding: 3px 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.font-btn:active {
  transform: scale(0.92);
}

.font-btn:disabled {
  opacity: 0.4;
}

.laps-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.lap {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 8px;
  font-variant-numeric: tabular-nums;
}

/* 序号徽标：循环色板底色圆点 */
.lap-no {
  width: 1.7em;
  height: 1.7em;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 0.78em;
  font-weight: 800;
  flex: none;
}

.lap-split {
  font-weight: 700;
  flex: 1;
}

.lap-elapsed {
  color: var(--text-2);
}

/* 大圆钮组：中下方 */
.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 24px;
  padding: 10px 0 18px;
}

.round-btn {
  border: none;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: #fff;
  cursor: pointer;
  transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.round-btn span {
  font-size: 12px;
  font-weight: 700;
}

.round-btn:active {
  transform: scale(0.92);
}

.round-btn:disabled {
  opacity: 0.45;
}

.round-btn.main {
  width: 96px;
  height: 96px;
}

.round-btn.lap {
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.35);
}

.round-btn.sub {
  width: 64px;
  height: 64px;
}

/* 主按钮更明显的阴影/发光 */
.round-btn.start {
  background: linear-gradient(135deg, #34d399, #10b981);
  box-shadow: 0 10px 30px rgba(16, 185, 129, 0.45);
}

.round-btn.pause {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  box-shadow: 0 10px 30px rgba(245, 158, 11, 0.45);
}

.round-btn.stop {
  background: linear-gradient(135deg, #f87171, #64748b);
  box-shadow: 0 6px 18px rgba(100, 116, 139, 0.35);
}

/* 历史记录入口行 */
.history-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px 18px;
  text-decoration: none;
  color: var(--text);
  transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.history-entry:active {
  transform: scale(0.98);
}

.he-label {
  flex: 1;
  font-size: 15.5px;
  font-weight: 600;
}

.he-count {
  font-size: 13px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.he-arrow {
  font-size: 20px;
  color: var(--text-3);
  line-height: 1;
}

/* 保存面板底部弹层 */
.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
}

.sheet {
  width: 100%;
  max-width: 640px;
  max-height: 82vh;
  overflow-y: auto;
  border-radius: 20px 20px 0 0;
  padding: 20px 18px calc(20px + env(safe-area-inset-bottom));
}

.sheet-title {
  margin: 0 0 14px;
  font-size: 18px;
}

.field {
  display: block;
  margin-bottom: 12px;
}

.field > span {
  display: block;
  font-size: 13px;
  color: var(--text-2);
  margin-bottom: 6px;
}

.save-summary {
  font-size: 14px;
  color: var(--text-2);
  margin-bottom: 12px;
}

.row-end {
  display: flex;
  align-items: center;
}

.row-end .gap {
  flex: 1;
}

.row-end .btn + .btn {
  margin-left: 8px;
}
</style>

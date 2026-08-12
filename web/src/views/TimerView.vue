<template>
  <div class="page timer-page">
    <div class="timer-heading">
      <h1 class="sr-only">计时</h1>
      <div class="timer-mode" role="tablist" aria-label="计时模式">
        <button type="button" :class="{ on: mode === 'stopwatch' }" :disabled="sessionActive" @click="mode = 'stopwatch'">计时</button>
        <button type="button" :class="{ on: mode === 'countdown' }" :disabled="sessionActive" @click="mode = 'countdown'">倒计时</button>
        <button type="button" :class="{ on: mode === 'pomodoro' }" :disabled="sessionActive" @click="mode = 'pomodoro'">番茄钟</button>
      </div>
    </div>

    <div class="timer-stage">
      <div v-if="mode === 'pomodoro'" class="pomodoro-stage">
        <div class="pomo-meta">
          <span>{{ pomoStageLabel }}</span>
          <div class="pomo-dots" :aria-label="`已完成 ${pomodoro.focusesCompleted} 个番茄`">
            <i v-for="dot in pomodoro.longBreakEvery" :key="dot" :class="{ on: dot <= pomodoro.focusesCompleted % pomodoro.longBreakEvery }"></i>
          </div>
          <small>第 {{ pomodoro.focusesCompleted + 1 }} 轮</small>
        </div>
        <div class="countdown-clock-wrap">
          <svg class="countdown-ring" viewBox="0 0 220 220" aria-hidden="true">
            <circle class="ring-track" cx="110" cy="110" r="98" />
            <circle class="ring-value" cx="110" cy="110" r="98" :style="{ strokeDashoffset: `${RING_LENGTH * (1 - pomodoroProgress)}` }" />
          </svg>
          <div class="clock">{{ clockText }}</div>
        </div>
        <div v-if="!pomodoro.startedAt && pomodoro.stage === 'focus'" class="pomo-settings card">
          <label><span>专注</span><input v-model.number="focusMinutes" type="number" min="1" max="180" inputmode="numeric" /><small>分</small></label>
          <label><span>短休息</span><input v-model.number="shortBreakMinutes" type="number" min="1" max="60" inputmode="numeric" /><small>分</small></label>
          <label><span>长休息</span><input v-model.number="longBreakMinutes" type="number" min="1" max="120" inputmode="numeric" /><small>分</small></label>
          <label><span>轮次</span><input v-model.number="longBreakEvery" type="number" min="2" max="12" inputmode="numeric" /><small>轮</small></label>
          <label class="pomo-task"><span>关联{{ isGeneral ? '打卡项' : '任务' }}</span><select v-model="pomoTaskId" class="input"><option value="">不关联</option><option v-for="t in linkableTasks" :key="t.id" :value="t.id">{{ t.title }}</option></select></label>
        </div>
      </div>
      <template v-else>
      <div v-if="mode === 'countdown' && !sessionActive" class="countdown-setup">
        <div class="preset-row">
          <button v-for="preset in presets" :key="preset" type="button" @click="setPreset(preset)">{{ preset }} 分钟</button>
        </div>
        <div class="duration-inputs">
          <label><input v-model.number="countdownMinutes" type="number" min="0" max="999" inputmode="numeric" /><span>分</span></label>
          <span class="duration-colon">:</span>
          <label><input v-model.number="countdownSeconds" type="number" min="0" max="59" inputmode="numeric" /><span>秒</span></label>
        </div>
      </div>
      <div v-else class="countdown-clock-wrap" :class="{ completed: countdown.completed }">
        <svg v-if="mode === 'countdown'" class="countdown-ring" viewBox="0 0 220 220" aria-hidden="true">
          <circle class="ring-track" cx="110" cy="110" r="98" />
          <circle class="ring-value" cx="110" cy="110" r="98" :style="{ strokeDashoffset: `${RING_LENGTH * (1 - countdownProgress)}` }" />
        </svg>
        <div class="clock">{{ clockText }}</div>
      </div>

      <div v-if="mode === 'stopwatch' && sw.lapsElapsed.length" class="laps-area">
        <div class="laps-head"><span class="laps-title">打点（{{ sw.lapsElapsed.length }}）</span><div class="font-ctl"><button class="font-btn" :disabled="lapsFont <= 13" @click="adjustFont(-1)">A−</button><button class="font-btn" :disabled="lapsFont >= 24" @click="adjustFont(1)">A＋</button></div></div>
        <div ref="lapsEl" class="laps-scroll" data-swipe-ignore>
          <div v-for="(lap, i) in currentLaps" :key="i" class="lap" :style="{ fontSize: lapsFont + 'px' }"><span class="lap-no" :style="{ background: lapColor(i) }">{{ i + 1 }}</span><span class="lap-split" :style="{ color: lapColor(i) }">+{{ fmtDuration(lap.splitMs) }}</span><span class="lap-elapsed">{{ fmtDuration(lap.elapsedMs) }}</span></div>
        </div>
      </div>
      </template>
    </div>

    <div class="controls">
      <template v-if="mode === 'pomodoro'">
        <button v-if="pomodoro.stage !== 'focus' && !pomodoro.startedAt" class="round-btn sub stop" @click="skipPomodoroBreak"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 5 8 7-8 7z"/><path d="M18 5v14"/></svg><span>跳过</span></button>
        <button v-if="!pomodoro.startedAt" class="round-btn main start" @click="startPomodoro"><svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg><span>开始{{ pomoStageLabel }}</span></button>
        <template v-else>
          <button class="round-btn sub stop" @click="stopPomodoro"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg><span>结束</span></button>
          <button v-if="pomodoro.running" class="round-btn main pause" @click="pausePomodoro"><svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><rect x="6" y="5" width="4.5" height="14" rx="1.5"/><rect x="13.5" y="5" width="4.5" height="14" rx="1.5"/></svg><span>暂停</span></button>
          <button v-else class="round-btn main start" @click="resumePomodoro"><svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg><span>继续</span></button>
        </template>
      </template>
      <template v-else>
      <button v-if="!sessionActive" class="round-btn main start" :disabled="mode === 'countdown' && configuredDurationMs < 1000" @click="start"><svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg><span>开始</span></button>
      <template v-else>
        <button class="round-btn sub stop" @click="beginFinish"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg><span>结束</span></button>
        <button v-if="isRunning" class="round-btn main pause" @click="pause"><svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4.5" height="14" rx="1.5"/><rect x="13.5" y="5" width="4.5" height="14" rx="1.5"/></svg><span>暂停</span></button>
        <button v-else class="round-btn main start" :disabled="countdown.completed" @click="resume"><svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg><span>继续</span></button>
        <button v-if="mode === 'stopwatch'" class="round-btn lap" :disabled="!sw.running" @click="sw.lap"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg><span>打点</span></button>
      </template>
      </template>
    </div>

    <router-link to="/timer/history" class="card history-entry"><span class="he-label">历史记录</span><span class="he-count">{{ recordsCount }} 条</span><span class="he-arrow">›</span></router-link>

    <teleport to="body">
      <Transition name="timer-sheet">
        <div v-if="finishing" class="sheet-mask" data-back-dismiss data-back-priority="100" @click.self="finishing = false">
          <div class="sheet card">
            <div class="sheet-heading"><h2 class="sheet-title">保存{{ mode === 'countdown' ? '倒计时' : '计时' }}记录</h2><PixelGrid v-if="mode === 'countdown' && countdown.completed" preset="spiral" label="倒计时完成" once /></div>
            <label class="field"><span>备注标签（如：{{ isGeneral ? '阅读、运动或冥想' : '资料分析 20 题' }}）</span><input v-model="label" class="input" placeholder="这次在做什么？" /></label>
            <label class="field"><span>关联{{ isGeneral ? '打卡项' : '任务' }}（可空）</span><select v-model="taskId" class="input"><option value="">不关联</option><option v-for="t in linkableTasks" :key="t.id" :value="t.id">{{ t.title }}</option></select></label>
            <div class="save-summary">{{ mode === 'countdown' ? '已用时' : '总时长' }} <strong>{{ fmtDuration(activeElapsedForSave) }}</strong><span v-if="mode === 'stopwatch'"> · {{ sw.lapsElapsed.length }} 次打点</span></div>
            <div class="row-end"><button class="btn ghost" @click="finishing = false">再想想</button><div class="gap"></div><button class="btn danger" @click="discard">丢弃</button><button class="btn" @click="save">保存记录</button></div>
          </div>
        </div>
      </Transition>
      <Transition name="timer-sheet">
        <div v-if="pomodoroCompleted" class="sheet-mask" data-back-dismiss data-back-priority="110">
          <div class="sheet card pomo-complete-sheet">
            <PixelGrid pattern="confirm" :size="82" once label="番茄阶段完成" />
            <h2>{{ completedStage === 'focus' ? '完成一个番茄' : '休息结束' }}</h2>
            <p>{{ completedStage === 'focus' ? '专注记录已经自动保存。让大脑短暂离开任务，再回来继续。' : '状态已经恢复，可以开始下一轮专注。' }}</p>
            <button class="btn" type="button" @click="continueAfterPomodoro">{{ pomodoro.stage === 'focus' ? '开始下一轮' : `开始${pomoStageLabel}` }}</button>
            <button v-if="pomodoro.stage !== 'focus'" class="btn ghost" type="button" @click="skipAfterPomodoro">跳过休息</button>
          </div>
        </div>
      </Transition>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAppStore } from '../stores/app';
import { countdown, fmtClock, fmtCountdown, fmtDuration, stopwatch as sw } from '../lib/stopwatch';
import { pomodoro, pomodoroStageLabel as stageLabel } from '../lib/pomodoro';
import { toLocalDateStr } from '../lib/date';
import PixelGrid from '../components/PixelGrid.vue';
import { confirmDialog } from '../lib/appDialog';

const store = useAppStore();
const isGeneral = computed(() => store.settings.appMode === 'general');
const mode = ref<'stopwatch' | 'countdown' | 'pomodoro'>(pomodoro.startedAt ? 'pomodoro' : countdown.startedAt ? 'countdown' : 'stopwatch');
const countdownMinutes = ref(25);
const countdownSeconds = ref(0);
const presets = [5, 15, 25];
const RING_LENGTH = 2 * Math.PI * 98;
const sessionActive = computed(() => mode.value === 'pomodoro' ? !!pomodoro.startedAt : mode.value === 'countdown' ? !!countdown.startedAt : !!sw.startedAt);
const isRunning = computed(() => mode.value === 'pomodoro' ? pomodoro.running : mode.value === 'countdown' ? countdown.running : sw.running);
const remainingDisplay = ref(mode.value === 'pomodoro' ? pomodoro.remainingMs() : countdown.remainingMs());
const clockText = ref(mode.value === 'pomodoro' ? fmtCountdown(remainingDisplay.value) : mode.value === 'countdown' ? fmtCountdown(remainingDisplay.value) : fmtClock(0));
const countdownProgress = computed(() => countdown.durationMs > 0 ? Math.max(0, Math.min(1, remainingDisplay.value / countdown.durationMs)) : 0);
const configuredDurationMs = computed(() => Math.max(0, Number(countdownMinutes.value) || 0) * 60000 + Math.max(0, Math.min(59, Number(countdownSeconds.value) || 0)) * 1000);
const activeElapsedForSave = computed(() => mode.value === 'countdown' ? Math.max(0, countdown.durationMs - remainingDisplay.value) : sw.elapsedMs());
const focusMinutes = ref(pomodoro.focusMinutes);
const shortBreakMinutes = ref(pomodoro.shortBreakMinutes);
const longBreakMinutes = ref(pomodoro.longBreakMinutes);
const longBreakEvery = ref(pomodoro.longBreakEvery);
const pomoTaskId = ref(pomodoro.taskId);
const pomoStageLabel = computed(() => stageLabel(pomodoro.stage));
const pomodoroProgress = computed(() => pomodoro.durationMs > 0 ? Math.max(0, Math.min(1, remainingDisplay.value / pomodoro.durationMs)) : 0);
const pomodoroCompleted = ref(false);
const completedStage = ref<'focus' | 'shortBreak' | 'longBreak'>('focus');
let raf = 0;

function tick() {
  if (mode.value === 'pomodoro') {
    remainingDisplay.value = pomodoro.remainingMs();
    clockText.value = fmtCountdown(remainingDisplay.value);
    if (pomodoro.running && remainingDisplay.value <= 0) completePomodoroStage();
  } else if (mode.value === 'countdown') {
    remainingDisplay.value = countdown.remainingMs();
    clockText.value = fmtCountdown(remainingDisplay.value);
    if (countdown.running && remainingDisplay.value <= 0) {
      countdown.complete();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.([18, 60, 18]);
      beginFinish();
    }
  } else clockText.value = fmtClock(sw.elapsedMs());
  if (sw.running || countdown.running || pomodoro.running) raf = requestAnimationFrame(tick);
}
onMounted(() => { if (sw.running || countdown.running || pomodoro.running) raf = requestAnimationFrame(tick); else tick(); });
onBeforeUnmount(() => cancelAnimationFrame(raf));

function start() {
  if (mode.value === 'countdown') {
    const duration = configuredDurationMs.value;
    if (duration < 1000) return;
    countdown.start(duration);
    remainingDisplay.value = duration;
    clockText.value = fmtCountdown(duration);
  } else { sw.start(); clockText.value = fmtClock(0); }
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}
function pause() { if (mode.value === 'countdown') countdown.pause(); else sw.pause(); cancelAnimationFrame(raf); tick(); }
function resume() { if (mode.value === 'countdown') countdown.resume(); else sw.resume(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); }
function beginFinish() { if (mode.value === 'countdown') countdown.pause(); else sw.pause(); cancelAnimationFrame(raf); tick(); finishing.value = true; }
function setPreset(minutes: number) { countdownMinutes.value = minutes; countdownSeconds.value = 0; }

function scheduleTick() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

function startPomodoro() {
  pomodoro.configure(focusMinutes.value, shortBreakMinutes.value, longBreakMinutes.value, longBreakEvery.value, pomoTaskId.value);
  pomodoro.start();
  remainingDisplay.value = pomodoro.remainingMs();
  scheduleTick();
}

function pausePomodoro() { pomodoro.pause(); cancelAnimationFrame(raf); tick(); }
function resumePomodoro() { pomodoro.resume(); scheduleTick(); }

async function stopPomodoro() {
  const accepted = await confirmDialog({ title: `结束本次${pomoStageLabel.value}？`, message: pomodoro.stage === 'focus' ? '未完成的专注阶段不会写入历史记录。' : '结束后会回到当前阶段的起点。', confirmLabel: '结束阶段', variant: 'danger' });
  if (!accepted) return;
  pomodoro.resetCurrent(); cancelAnimationFrame(raf); remainingDisplay.value = pomodoro.remainingMs(); clockText.value = fmtCountdown(remainingDisplay.value);
}

function skipPomodoroBreak() { pomodoro.skipBreak(); remainingDisplay.value = pomodoro.remainingMs(); clockText.value = fmtCountdown(remainingDisplay.value); }

function completePomodoroStage() {
  const completed = pomodoro.completeStage();
  completedStage.value = completed.stage;
  if (completed.stage === 'focus') {
    store.saveTimer({ label: `番茄专注 · 第 ${completed.round} 轮`, taskId: completed.taskId, date: toLocalDateStr(new Date(completed.startedAt)), startedAt: completed.startedAt, durationMs: completed.durationMs, laps: [], mode: 'pomodoro' });
  }
  pomodoroCompleted.value = true;
  remainingDisplay.value = pomodoro.remainingMs(); clockText.value = fmtCountdown(remainingDisplay.value);
  if ('vibrate' in navigator) navigator.vibrate?.([22, 60, 22, 60, 34]);
}

function continueAfterPomodoro() { pomodoroCompleted.value = false; pomodoro.start(); scheduleTick(); }
function skipAfterPomodoro() { pomodoroCompleted.value = false; pomodoro.skipBreak(); remainingDisplay.value = pomodoro.remainingMs(); clockText.value = fmtCountdown(remainingDisplay.value); }

const currentLaps = computed(() => sw.laps());
const LAP_COLORS = ['#14b8a6', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#22c55e'];
const lapColor = (i: number) => LAP_COLORS[i % LAP_COLORS.length];
const lapsEl = ref<HTMLElement | null>(null);
watch(() => sw.lapsElapsed.length, async () => { await nextTick(); if (lapsEl.value) lapsEl.value.scrollTop = lapsEl.value.scrollHeight; });
const FONT_KEY = 'kgc-laps-font-size';
const lapsFont = ref(Math.min(24, Math.max(13, Number(localStorage.getItem(FONT_KEY)) || 17)));
function adjustFont(delta: number) { lapsFont.value = Math.min(24, Math.max(13, lapsFont.value + delta)); localStorage.setItem(FONT_KEY, String(lapsFont.value)); }

const finishing = ref(false);
const label = ref('');
const taskId = ref('');
const linkableTasks = computed(() => store.tasks.filter((t) => !t.archived));
watch(mode, (next) => {
  if (next === 'pomodoro') remainingDisplay.value = pomodoro.remainingMs();
  else if (next === 'countdown') remainingDisplay.value = countdown.remainingMs();
  clockText.value = next === 'stopwatch' ? fmtClock(sw.elapsedMs()) : fmtCountdown(remainingDisplay.value);
});
function save() {
  const startedAt = (mode.value === 'countdown' ? countdown.startedAt : sw.startedAt)!;
  store.saveTimer({ label: label.value.trim(), taskId: taskId.value || null, date: toLocalDateStr(new Date(startedAt)), startedAt, durationMs: Math.round(activeElapsedForSave.value), laps: mode.value === 'countdown' ? [] : sw.laps(), mode: mode.value });
  if (mode.value === 'countdown') countdown.reset(); else sw.reset();
  finishing.value = false; label.value = ''; taskId.value = ''; remainingDisplay.value = 0; clockText.value = mode.value === 'countdown' ? fmtCountdown(0) : fmtClock(0);
}
function discard() { if (mode.value === 'countdown') countdown.reset(); else sw.reset(); finishing.value = false; label.value = ''; taskId.value = ''; remainingDisplay.value = 0; clockText.value = mode.value === 'countdown' ? fmtCountdown(0) : fmtClock(0); }
const recordsCount = computed(() => store.timers.filter((t) => !t.deleted).length);
</script>

<style scoped>
.timer-page { display: flex; flex-direction: column; }
.timer-heading { display: flex; align-items: center; justify-content: flex-start; min-height: 44px; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
.timer-mode { display: flex; gap: 3px; padding: 3px; border-radius: 12px; background: var(--accent-soft); }
.timer-mode button { min-width: 44px; min-height: 44px; border: 0; border-radius: 9px; background: transparent; color: var(--text-2); padding: 7px 10px; font-size: 12px; font-weight: 700; }
.timer-mode button.on { background: var(--card); color: var(--accent-solid); box-shadow: var(--shadow); }
.timer-mode button:disabled { opacity: .65; }
.timer-stage { flex: 1; display: flex; flex-direction: column; justify-content: center; min-height: 0; padding: 12px 0; }
.countdown-clock-wrap { position: relative; display: grid; place-items: center; width: min(78vw, 300px); aspect-ratio: 1; margin: 0 auto; }
.clock { text-align: center; font-size: clamp(72px, 21vw, 108px); font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: 1px; line-height: 1.1; background: linear-gradient(135deg, var(--accent-from), var(--accent-to)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.countdown-clock-wrap .clock { position: relative; z-index: 1; font-size: clamp(52px, 16vw, 88px); }
.countdown-ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.countdown-ring circle { fill: none; stroke-width: 7; }
.ring-track { stroke: var(--card-border); }.ring-value { stroke: var(--accent-solid); stroke-linecap: round; stroke-dasharray: 615.75; transition: stroke-dashoffset 180ms linear; }
.countdown-clock-wrap.completed { animation: countdown-pulse 620ms cubic-bezier(0.22, 1, 0.36, 1); }
@keyframes countdown-pulse { 50% { transform: scale(1.045); } }
.countdown-setup { display: grid; gap: 18px; place-items: center; }.preset-row { display: flex; gap: 8px; }.preset-row button { border: 1px solid var(--card-border); border-radius: 10px; background: var(--card); color: var(--text-2); padding: 8px 12px; font-size: 12px; }
.duration-inputs { display: flex; align-items: center; gap: 8px; }.duration-inputs label { display: flex; align-items: baseline; gap: 5px; color: var(--text-2); }.duration-inputs input { width: 78px; border: 1px solid var(--card-border); border-radius: 12px; background: var(--bg-elev); color: var(--text); padding: 11px 8px; text-align: center; font-size: 28px; font-variant-numeric: tabular-nums; }.duration-colon { font-size: 28px; color: var(--text-3); }
.pomodoro-stage { display:flex; flex-direction:column; align-items:center; gap:8px; width:100%; }.pomo-meta { width:min(78vw,300px); display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:8px; color:var(--text-2); font-size:13px; font-weight:750; }.pomo-meta small { text-align:right; color:var(--text-3); }.pomo-dots { display:flex; gap:5px; }.pomo-dots i { width:8px; height:8px; border-radius:2px; background:var(--card-border); }.pomo-dots i.on { background:var(--accent-solid); }.pomo-settings { width:min(100%,430px); display:grid; grid-template-columns:repeat(4,1fr); gap:8px; padding:10px; }.pomo-settings label { min-width:0; display:grid; grid-template-columns:1fr auto; gap:3px; align-items:end; color:var(--text-3); font-size:10px; }.pomo-settings label>span { grid-column:1/-1; }.pomo-settings input { min-width:0; width:100%; border:1px solid var(--card-border); border-radius:8px; background:var(--bg-elev); color:var(--text); padding:7px 4px; text-align:center; font-size:17px; font-weight:750; }.pomo-settings small { padding-bottom:7px; }.pomo-settings .pomo-task { grid-column:1/-1; display:block; }.pomo-task .input { width:100%; margin-top:3px; font-size:12px; padding:7px 9px; }.pomo-complete-sheet { text-align:center; }.pomo-complete-sheet h2 { margin:12px 0 7px; font-size:22px; }.pomo-complete-sheet p { color:var(--text-2); font-size:13px; line-height:1.6; }.pomo-complete-sheet .btn { width:100%; margin-top:8px; }
.laps-area { flex: 1; min-height: 0; display: flex; flex-direction: column; width: 100%; max-width: 420px; margin: 10px auto 0; }.laps-head { display: flex; align-items: center; justify-content: space-between; padding: 0 8px 6px; }.laps-title { font-size: 13px; font-weight: 700; color: var(--text-3); }.font-ctl { display: flex; gap: 6px; }.font-btn { border: 1px solid var(--card-border); background: var(--card); color: var(--text-2); border-radius: 9px; padding: 3px 10px; font-size: 13px; font-weight: 700; }.font-btn:disabled { opacity: .4; }.laps-scroll { flex: 1; min-height: 0; overflow-y: auto; }.lap { display: flex; align-items: center; gap: 14px; padding: 6px 8px; font-variant-numeric: tabular-nums; }.lap-no { width: 1.7em; height: 1.7em; border-radius: 50%; display: grid; place-items: center; color: #fff; font-size: .78em; font-weight: 800; flex: none; }.lap-split { font-weight: 700; flex: 1; }.lap-elapsed { color: var(--text-2); }
.controls { display: flex; justify-content: center; align-items: center; gap: 24px; padding: 10px 0 18px; }.round-btn { border: none; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: #fff; cursor: pointer; transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1); }.round-btn span { font-size: 12px; font-weight: 700; }.round-btn:active { transform: scale(.92); }.round-btn:disabled { opacity: .45; }.round-btn.main { width: 96px; height: 96px; }.round-btn.lap { width: 80px; height: 80px; background: linear-gradient(135deg,#3b82f6,#6366f1); box-shadow: 0 8px 24px rgba(59,130,246,.35); }.round-btn.sub { width: 64px; height: 64px; }.round-btn.start { background: linear-gradient(135deg,#34d399,#10b981); box-shadow: 0 10px 30px rgba(16,185,129,.45); }.round-btn.pause { background: linear-gradient(135deg,#fbbf24,#f59e0b); box-shadow: 0 10px 30px rgba(245,158,11,.45); }.round-btn.stop { background: linear-gradient(135deg,#f87171,#64748b); box-shadow: 0 6px 18px rgba(100,116,139,.35); }
.history-entry { display: flex; align-items: center; gap: 10px; padding: 15px 18px; text-decoration: none; color: var(--text); }.he-label { flex: 1; font-size: 15.5px; font-weight: 600; }.he-count { font-size: 13px; color: var(--text-3); }.he-arrow { font-size: 20px; color: var(--text-3); }
.sheet-mask { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: flex-end; justify-content: center; z-index: 100; }.sheet { width: 100%; max-width: 640px; max-height: 82vh; overflow-y: auto; border-radius: 20px 20px 0 0; padding: 20px 18px calc(20px + env(safe-area-inset-bottom)); }.sheet-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; color:var(--accent-solid); }.sheet-title { margin: 0; font-size: 18px; color:var(--text); }.field { display: block; margin-bottom: 12px; }.field>span { display:block; font-size:13px; color:var(--text-2); margin-bottom:6px; }.save-summary { font-size:14px; color:var(--text-2); margin-bottom:12px; }.row-end { display:flex; align-items:center; }.row-end .gap { flex:1; }.row-end .btn+.btn { margin-left:8px; }
.timer-sheet-enter-active,.timer-sheet-leave-active { transition: background-color 260ms cubic-bezier(.22,1,.36,1); }.timer-sheet-enter-active .sheet,.timer-sheet-leave-active .sheet { transition: transform 320ms cubic-bezier(.22,1,.36,1),opacity 240ms ease; }.timer-sheet-enter-from,.timer-sheet-leave-to { background-color: transparent; }.timer-sheet-enter-from .sheet,.timer-sheet-leave-to .sheet { transform: translateY(72px); opacity:0; }
@media (prefers-reduced-motion: reduce) { .countdown-clock-wrap.completed { animation:none; }.ring-value { transition-duration:.01ms; }.timer-sheet-enter-active,.timer-sheet-leave-active,.timer-sheet-enter-active .sheet,.timer-sheet-leave-active .sheet { transition-duration:.01ms; } }
</style>

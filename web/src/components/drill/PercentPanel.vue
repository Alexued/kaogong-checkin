<template>
  <div>
    <!-- 完整对照表（可展开；多列排版；支持隐藏答案的默写版） -->
    <RefTable
      title="百化分对照表"
      label-header="百分数"
      answer-header="分数"
      :pairs-per-row="2"
      :items="refItems"
    />

    <!-- 开始设置 -->
    <div v-if="phase === 'setup'" class="card block">
      <div class="seg">
        <button :class="{ on: mode === 'full' }" @click="mode = 'full'">
          完整背诵（{{ DRILL_TABLE.length }} 题）
        </button>
        <button :class="{ on: mode === 'random' }" @click="mode = 'random'">随机抽取</button>
      </div>
      <label v-if="mode === 'random'" class="field">
        <span>抽题数量</span>
        <input v-model.number="randomCount" type="number" min="1" max="50" class="input" />
      </label>
      <button class="btn start-btn" @click="startSession">开始</button>
    </div>

    <!-- 答题中 -->
    <div v-else-if="phase === 'playing' && current" class="play">
      <div class="play-top">
        <button class="exit-btn" @click="onExit">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
            stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          退出
        </button>
        <span class="progress-text">剩余 {{ queue.length + 1 }} 题 · 已答 {{ attempts }} 次</span>
      </div>
      <div
        :key="current.percent + '@' + roundKey"
        v-motion
        class="card question"
        :initial="{ opacity: 0, x: 60 }"
        :enter="{
          opacity: 1,
          x: 0,
          transition: { type: 'spring', stiffness: 280, damping: 24 },
        }"
      >
        <div class="percent">{{ current.percent }}%</div>
        <template v-if="!answered">
          <input
            v-model="input"
            class="input answer-input"
            placeholder="分数，如 1/8 或 0.125"
            enterkeyhint="done"
            @keyup.enter="confirm"
          />
          <button class="btn confirm-btn" :disabled="!input.trim()" @click="confirm">确认</button>
        </template>
        <div
          v-else
          v-motion
          class="result"
          :class="lastCorrect ? 'ok' : 'bad'"
          :initial="{ opacity: 0, scale: 0.8 }"
          :enter="{
            opacity: 1,
            scale: 1,
            transition: { type: 'spring', stiffness: 340, damping: 18 },
          }"
        >
          <div class="verdict">{{ lastCorrect ? '✓ 回答正确' : '✗ 回答错误' }}</div>
          <div v-if="!lastCorrect" class="feedback">{{ gradeMessage }}</div>
          <div class="std">标准答案：<strong>{{ current.answer }}</strong></div>
          <div v-if="current.approximations.length" class="accepted">
            也接受：{{ acceptedAnswers(current).slice(1).join('、') }}
          </div>
          <div v-if="!lastCorrect" class="requeue">已插回队列，稍后再考一次</div>
          <button class="btn confirm-btn" @click="next">下一题</button>
        </div>
      </div>
    </div>

    <!-- 本场总结 -->
    <div v-else-if="phase === 'done'" class="card block summary">
      <div class="summary-rate">{{ Math.round((correctAttempts / Math.max(1, attempts)) * 100) }}%</div>
      <div class="summary-sub">本场正确率 · 共作答 {{ attempts }} 次（答对 {{ correctAttempts }} 次）</div>
      <template v-if="wrongList.length">
        <div class="section-title">错题（{{ wrongList.length }}）</div>
        <div v-for="w in wrongList" :key="w.percent" class="wrong-row">
          <span class="w-percent">{{ w.percent }}%</span>
          <span class="w-answer">{{ w.answer }}</span>
        </div>
      </template>
      <div v-else class="perfect">零失误，漂亮！</div>
      <button class="btn start-btn" @click="phase = 'setup'">再来一场</button>
    </div>

    <!-- 历史场次 -->
    <template v-if="phase === 'setup' && sessions.length">
      <div class="section-title">历史场次</div>
      <div
        v-for="(s, i) in sessions"
        :key="s.sessionId"
        v-motion
        class="card session"
        :initial="{ opacity: 0, y: 18 }"
        :enter="{
          opacity: 1,
          y: 0,
          transition: { type: 'spring', stiffness: 260, damping: 26, delay: i * 40 },
        }"
        @click="expanded = expanded === s.sessionId ? '' : s.sessionId"
      >
        <div class="session-head">
          <div>
            <span class="badge">{{ s.mode === 'full' ? '完整' : '随机' }}</span>
            <span class="session-time">{{ formatDateTime(s.time) }}</span>
          </div>
          <div class="session-rate" :class="s.rate < 0.6 ? 'weak' : s.rate < 0.85 ? 'mid' : 'good'">
            {{ s.correct }}/{{ s.count }} · {{ Math.round(s.rate * 100) }}%
          </div>
        </div>
        <div v-if="expanded === s.sessionId" class="session-detail">
          <div v-for="d in s.records" :key="d.id" class="detail-row">
            <span class="d-percent">{{ d.percent }}%</span>
            <span class="d-yours">你的答案：{{ d.userAnswer }}</span>
            <span class="d-std">{{ answerOf(d.percent) }}</span>
            <span class="d-mark" :class="d.correct ? 'ok' : 'bad'">{{ d.correct ? '✓' : '✗' }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 各百分数历史正确率 -->
    <div class="section-title row-between">
      <span>各百分数历史正确率</span>
      <button v-if="store.drills.some((d) => !d.deleted)" class="mini danger" @click="onClear">
        清空记录
      </button>
    </div>
    <div class="card block stats">
      <div v-for="s in perPercentStats" :key="s.percent" class="stat-row">
        <span class="s-percent">{{ s.percent }}%</span>
        <div class="s-track">
          <div
            v-if="s.attempts"
            class="s-bar"
            :class="s.rate < 0.6 ? 'weak' : s.rate < 0.85 ? 'mid' : 'good'"
            :style="{ width: Math.round(s.rate * 100) + '%' }"
          ></div>
        </div>
        <span class="s-text">
          {{ s.attempts ? `${Math.round(s.rate * 100)}% · ${s.attempts}次` : '未练' }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppStore } from '../../stores/app';
import {
  DRILL_TABLE,
  acceptedAnswers,
  gradeAnswer,
  shuffle,
  type DrillItem,
} from '../../lib/drill';
import { formatDateTime } from '../../lib/date';
import RefTable from './RefTable.vue';
import type { DrillRecord } from '../../types';

const store = useAppStore();

/** 完整对照表条目（百分数 → 分数） */
const refItems = DRILL_TABLE.map((item) => ({
  label: `${item.percent}%`,
  answer: item.answer,
  note: item.approximations.length
    ? `常用近似：${acceptedAnswers(item).slice(1).join('、')}`
    : undefined,
}));

const phase = ref<'setup' | 'playing' | 'done'>('setup');
const mode = ref<'full' | 'random'>('full');
const randomCount = ref(10);

const queue = ref<DrillItem[]>([]);
const current = ref<DrillItem | null>(null);
const roundKey = ref(0);
const input = ref('');
const answered = ref(false);
const lastCorrect = ref(false);
const gradeMessage = ref('');

const sessionId = ref('');
const attempts = ref(0);
const correctAttempts = ref(0);
const wrongMap = new Map<number, DrillItem>();

const wrongList = computed(() => [...wrongMap.values()]);

function startSession() {
  const items =
    mode.value === 'full'
      ? DRILL_TABLE.slice()
      : shuffle(DRILL_TABLE).slice(0, Math.max(1, Math.min(50, randomCount.value || 10)));
  queue.value = items.slice(1);
  current.value = items[0] || null;
  roundKey.value = 0;
  input.value = '';
  answered.value = false;
  gradeMessage.value = '';
  sessionId.value = crypto.randomUUID();
  attempts.value = 0;
  correctAttempts.value = 0;
  wrongMap.clear();
  phase.value = 'playing';
}

function onExit() {
  if (window.confirm('退出后本场进度不保留，已答题目成绩已记录')) {
    phase.value = 'setup';
    current.value = null;
    queue.value = [];
    input.value = '';
    answered.value = false;
    gradeMessage.value = '';
  }
}

function confirm() {
  const item = current.value;
  if (!item || answered.value || !input.value.trim()) return;
  const grade = gradeAnswer(item, input.value);
  const ok = grade.correct;
  lastCorrect.value = ok;
  gradeMessage.value = grade.message;
  answered.value = true;
  attempts.value++;
  if (ok) correctAttempts.value++;
  else wrongMap.set(item.percent, item);
  store.saveDrill({
    percent: item.percent,
    userAnswer: input.value.trim(),
    correct: ok,
    mode: mode.value,
    sessionId: sessionId.value,
  });
}

function next() {
  const item = current.value!;
  // 答错插回队列尾部再考一次
  if (!lastCorrect.value) queue.value.push(item);
  current.value = queue.value.shift() || null;
  roundKey.value++;
  input.value = '';
  answered.value = false;
  gradeMessage.value = '';
  if (!current.value) phase.value = 'done';
}

// ---------- 历史场次 ----------
const expanded = ref('');

interface Session {
  sessionId: string;
  time: string;
  mode: 'full' | 'random';
  count: number;
  correct: number;
  rate: number;
  records: DrillRecord[];
}

const sessions = computed<Session[]>(() => {
  const map = new Map<string, DrillRecord[]>();
  for (const d of store.drills) {
    if (d.deleted) continue;
    const arr = map.get(d.sessionId);
    if (arr) arr.push(d);
    else map.set(d.sessionId, [d]);
  }
  return [...map.entries()]
    .map(([sid, rs]) => {
      rs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const correct = rs.filter((r) => r.correct).length;
      return {
        sessionId: sid,
        time: rs[0].createdAt,
        mode: rs[0].mode,
        count: rs.length,
        correct,
        rate: rs.length ? correct / rs.length : 0,
        records: rs,
      };
    })
    .sort((a, b) => b.time.localeCompare(a.time));
});

function answerOf(percent: number): string {
  return DRILL_TABLE.find((t) => t.percent === percent)?.answer || '';
}

// ---------- 各百分数历史统计 ----------
const perPercentStats = computed(() => {
  const map = new Map<number, { attempts: number; correct: number }>();
  for (const d of store.drills) {
    if (d.deleted) continue;
    const s = map.get(d.percent) || { attempts: 0, correct: 0 };
    s.attempts++;
    if (d.correct) s.correct++;
    map.set(d.percent, s);
  }
  return DRILL_TABLE.map((t) => {
    const s = map.get(t.percent) || { attempts: 0, correct: 0 };
    return {
      percent: t.percent,
      attempts: s.attempts,
      rate: s.attempts ? s.correct / s.attempts : 0,
    };
  });
});

function onClear() {
  if (window.confirm('清空全部背诵记录？')) store.clearDrills();
}
</script>

<style scoped>
.block {
  padding: 16px;
}

.seg {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.seg button {
  flex: 1;
  border: 1px solid var(--card-border);
  background: transparent;
  color: var(--text-2);
  border-radius: 12px;
  padding: 10px 0;
  font-size: 14px;
  cursor: pointer;
  transition: all 200ms ease;
}

.seg button.on {
  background: var(--accent-soft);
  border-color: var(--accent-solid);
  color: var(--accent-solid);
  font-weight: 600;
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

.start-btn {
  width: 100%;
}

.play-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.exit-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--card-border);
  background: var(--card);
  color: var(--text-2);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.exit-btn:active {
  transform: scale(0.94);
}

.progress-text {
  font-size: 13px;
  color: var(--text-3);
}

.question {
  padding: 30px 20px 22px;
  text-align: center;
}

.percent {
  font-size: 52px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  margin-bottom: 18px;
}

.answer-input {
  text-align: center;
  font-size: 18px;
  margin-bottom: 12px;
}

.confirm-btn {
  width: 100%;
}

.btn:disabled {
  opacity: 0.45;
}

.result {
  border-radius: 14px;
  padding: 16px;
}

.result.ok {
  background: var(--accent-soft);
}

.result.bad {
  background: var(--warn-soft);
}

.verdict {
  font-size: 17px;
  font-weight: 700;
}

.result.ok .verdict {
  color: var(--accent-solid);
}

.result.bad .verdict {
  color: var(--warn);
}

.std {
  margin: 8px 0;
  font-size: 15px;
}

.feedback,
.accepted {
  font-size: 12.5px;
  color: var(--text-2);
}

.feedback {
  margin-top: 6px;
}

.accepted {
  margin: -4px 0 10px;
}

.requeue {
  font-size: 12.5px;
  color: var(--text-2);
  margin-bottom: 12px;
}

.summary {
  text-align: center;
}

.summary-rate {
  font-size: 48px;
  font-weight: 800;
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.summary-sub {
  font-size: 13px;
  color: var(--text-2);
  margin: 6px 0 8px;
}

.wrong-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 6px;
  border-bottom: 1px solid var(--card-border);
  font-size: 15px;
}

.w-percent {
  font-weight: 700;
  color: var(--warn);
}

.perfect {
  color: var(--accent-solid);
  font-weight: 600;
  margin: 10px 0;
}

.row-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mini {
  border: 1px solid var(--card-border);
  background: transparent;
  color: var(--text-2);
  border-radius: 9px;
  padding: 5px 10px;
  font-size: 12.5px;
  cursor: pointer;
}

.mini.danger {
  color: var(--danger);
}

/* 历史场次 */
.session {
  padding: 13px 16px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.session:active {
  transform: scale(0.98);
}

.session-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.session-time {
  font-size: 13px;
  color: var(--text-2);
  margin-left: 8px;
}

.session-rate {
  font-size: 13.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.session-rate.good {
  color: var(--accent-solid);
}

.session-rate.mid {
  color: var(--warn);
}

.session-rate.weak {
  color: var(--danger);
}

.session-detail {
  margin-top: 12px;
  border-top: 1px solid var(--card-border);
  padding-top: 8px;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  font-size: 13.5px;
}

.d-percent {
  width: 48px;
  flex: none;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.d-yours {
  flex: 1;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.d-std {
  color: var(--text-3);
  font-size: 12.5px;
}

.d-mark {
  width: 18px;
  flex: none;
  text-align: center;
  font-weight: 700;
}

.d-mark.ok {
  color: var(--accent-solid);
}

.d-mark.bad {
  color: var(--danger);
}

/* 各百分数统计 */
.stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.s-percent {
  width: 48px;
  flex: none;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.s-track {
  flex: 1;
  height: 10px;
  background: var(--heat-0);
  border-radius: 5px;
  overflow: hidden;
}

.s-bar {
  height: 100%;
  border-radius: 5px;
  transition: width 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.s-bar.good {
  background: linear-gradient(90deg, var(--accent-from), var(--accent-to));
}

.s-bar.mid {
  background: var(--warn);
}

.s-bar.weak {
  background: var(--danger);
}

.s-text {
  width: 86px;
  flex: none;
  text-align: right;
  font-size: 11.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
</style>

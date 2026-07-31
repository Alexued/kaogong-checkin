<template>
  <div>
    <!-- 完整公式表（可展开；多列排版；支持隐藏答案的默写版） -->
    <RefTable
      title="公式对照表"
      label-header="名称"
      answer-header="公式"
      :pairs-per-row="2"
      :min-width="640"
      :items="refItems"
    />

    <!-- 开始设置 -->
    <div v-if="phase === 'setup'" class="card block">
      <div class="seg">
        <button :class="{ on: mode === 'full' }" @click="mode = 'full'">
          完整顺序（{{ FORMULA_TABLE.length }} 个）
        </button>
        <button :class="{ on: mode === 'random' }" @click="mode = 'random'">随机抽取</button>
      </div>
      <label v-if="mode === 'random'" class="field">
        <span>抽取数量</span>
        <input v-model.number="randomCount" type="number" min="1" max="50" class="input" />
      </label>
      <button class="btn start-btn" @click="startSession">开始</button>
      <div class="symbols-hint">{{ FORMULA_SYMBOLS }}</div>
    </div>

    <!-- 背诵中 -->
    <div v-else-if="phase === 'playing' && current" class="play">
      <div class="play-top">
        <button class="exit-btn" @click="onExit">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
            stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          退出
        </button>
        <span class="progress-text">剩余 {{ queue.length + 1 }} 个 · 已评 {{ attempts }} 次</span>
      </div>
      <div
        :key="current.key + '@' + roundKey"
        v-motion
        class="card question"
        :initial="{ opacity: 0, x: 60 }"
        :enter="{
          opacity: 1,
          x: 0,
          transition: { type: 'spring', stiffness: 280, damping: 24 },
        }"
      >
        <div class="fname">{{ current.name }}</div>
        <template v-if="!revealed">
          <div class="flip-hint">回忆公式，点击卡片翻面</div>
          <button class="btn flip-btn" @click="revealed = true">翻面</button>
        </template>
        <div
          v-else
          v-motion
          :initial="{ opacity: 0, scale: 0.9, rotateX: -40 }"
          :enter="{
            opacity: 1,
            scale: 1,
            rotateX: 0,
            transition: { type: 'spring', stiffness: 300, damping: 22 },
          }"
        >
          <div class="formula">{{ current.formula }}</div>
          <div v-if="current.note" class="note">{{ current.note }}</div>
          <div class="judge">
            <button class="judge-btn known" @click="judge(true)">记住了</button>
            <button class="judge-btn unknown" @click="judge(false)">没记住</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 本场总结 -->
    <div v-else-if="phase === 'done'" class="card block summary">
      <div class="summary-rate">{{ Math.round((knownAttempts / Math.max(1, attempts)) * 100) }}%</div>
      <div class="summary-sub">本场记住率 · 共自评 {{ attempts }} 次（记住 {{ knownAttempts }} 次）</div>
      <template v-if="unknownList.length">
        <div class="section-title">没记住（{{ unknownList.length }}）</div>
        <div v-for="f in unknownList" :key="f.key" class="unknown-row">
          <span class="u-name">{{ f.name }}</span>
          <span class="u-formula">{{ f.formula }}</span>
        </div>
      </template>
      <div v-else class="perfect">全部记住，漂亮！</div>
      <button class="btn start-btn" @click="phase = 'setup'">再来一场</button>
    </div>

    <!-- 各公式历史掌握度 -->
    <div class="section-title">各公式历史掌握度</div>
    <div class="card block stats">
      <div v-for="s in perFormulaStats" :key="s.key" class="stat-row">
        <span class="s-name" :title="s.name">{{ s.name }}</span>
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
import { FORMULA_SYMBOLS, FORMULA_TABLE, type FormulaItem } from '../../lib/formula';
import { shuffle } from '../../lib/drill';
import RefTable from './RefTable.vue';

const store = useAppStore();

/** 完整对照表条目（名称 / 公式 / 备注） */
const refItems = FORMULA_TABLE.map((f) => ({ label: f.name, answer: f.formula, note: f.note }));

const phase = ref<'setup' | 'playing' | 'done'>('setup');
const mode = ref<'full' | 'random'>('full');
const randomCount = ref(10);

const queue = ref<FormulaItem[]>([]);
const current = ref<FormulaItem | null>(null);
const roundKey = ref(0);
const revealed = ref(false);

const sessionId = ref('');
const attempts = ref(0);
const knownAttempts = ref(0);
const unknownMap = new Map<string, FormulaItem>();

const unknownList = computed(() => [...unknownMap.values()]);

function startSession() {
  const items =
    mode.value === 'full'
      ? FORMULA_TABLE.slice()
      : shuffle(FORMULA_TABLE).slice(0, Math.max(1, Math.min(50, randomCount.value || 10)));
  queue.value = items.slice(1);
  current.value = items[0] || null;
  roundKey.value = 0;
  revealed.value = false;
  sessionId.value = crypto.randomUUID();
  attempts.value = 0;
  knownAttempts.value = 0;
  unknownMap.clear();
  phase.value = 'playing';
}

function onExit() {
  if (window.confirm('退出后本场进度不保留，已评成绩已记录')) {
    phase.value = 'setup';
    current.value = null;
    queue.value = [];
    revealed.value = false;
  }
}

function judge(known: boolean) {
  const item = current.value;
  if (!item) return;
  attempts.value++;
  if (known) knownAttempts.value++;
  else {
    unknownMap.set(item.key, item);
    // 没记住插回队列尾部重考
    queue.value.push(item);
  }
  store.saveFormulaDrill({
    formulaKey: item.key,
    known,
    mode: mode.value,
    sessionId: sessionId.value,
  });
  current.value = queue.value.shift() || null;
  roundKey.value++;
  revealed.value = false;
  if (!current.value) phase.value = 'done';
}

// ---------- 历史掌握度 ----------
const perFormulaStats = computed(() => {
  const map = new Map<string, { attempts: number; known: number }>();
  for (const d of store.formulaDrills) {
    if (d.deleted) continue;
    const s = map.get(d.formulaKey) || { attempts: 0, known: 0 };
    s.attempts++;
    if (d.known) s.known++;
    map.set(d.formulaKey, s);
  }
  return FORMULA_TABLE.map((f) => {
    const s = map.get(f.key) || { attempts: 0, known: 0 };
    return {
      key: f.key,
      name: f.name,
      attempts: s.attempts,
      rate: s.attempts ? s.known / s.attempts : 0,
    };
  });
});
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

.fname {
  font-size: 34px;
  font-weight: 800;
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  margin-bottom: 14px;
}

.flip-hint {
  font-size: 13px;
  color: var(--text-3);
  margin-bottom: 16px;
}

.flip-btn {
  width: 100%;
}

.formula {
  font-size: 16.5px;
  font-weight: 600;
  line-height: 1.7;
  padding: 14px;
  border-radius: 14px;
  background: var(--accent-soft);
  white-space: pre-line;
}

.note {
  font-size: 12.5px;
  color: var(--text-2);
  margin-top: 10px;
}

.symbols-hint {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-2);
  text-align: center;
}

.judge {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.judge-btn {
  flex: 1;
  border: none;
  border-radius: 14px;
  padding: 14px 0;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.judge-btn:active {
  transform: scale(0.95);
}

.judge-btn.known {
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
}

.judge-btn.unknown {
  background: linear-gradient(135deg, #f59e0b, #f97316);
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

.unknown-row {
  padding: 10px 6px;
  border-bottom: 1px solid var(--card-border);
  text-align: left;
}

.u-name {
  display: block;
  font-weight: 700;
  color: var(--warn);
  font-size: 14.5px;
}

.u-formula {
  display: block;
  font-size: 13px;
  color: var(--text-2);
  margin-top: 3px;
  white-space: pre-line;
}

.perfect {
  color: var(--accent-solid);
  font-weight: 600;
  margin: 10px 0;
}

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

.s-name {
  width: 84px;
  flex: none;
  font-size: 12.5px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

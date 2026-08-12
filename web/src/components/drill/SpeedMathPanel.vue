<template>
  <section class="speed-panel">
    <div v-if="stage === 'setup'" class="setup-stack">
      <div class="card hero-card">
        <div>
          <div class="eyebrow">速算练习</div>
          <h2>让计算变成肌肉记忆</h2>
          <p>基础速算与资料分析填空，全部离线生成、即时判分。</p>
        </div>
        <PixelGrid pattern="arrival" :size="58" decorative />
      </div>

      <div class="card config-card">
        <label class="field-title" for="speed-category">练习类型</label>
        <select id="speed-category" v-model="categoryKey" class="input select-input">
          <optgroup label="基础速算">
            <option v-for="item in basicCategories" :key="item.key" :value="item.key">{{ item.label }}</option>
          </optgroup>
          <optgroup label="资料分析填空">
            <option v-for="item in dataCategories" :key="item.key" :value="item.key">{{ item.label }}</option>
          </optgroup>
        </select>

        <div class="field-title">难度</div>
        <div class="choice-row three">
          <button v-for="item in difficulties" :key="item.key" type="button" :class="{ on: difficulty === item.key }" @click="difficulty = item.key">{{ item.label }}</button>
        </div>

        <div class="field-title">题量</div>
        <div class="choice-row count-row">
          <button v-for="count in counts" :key="count" type="button" :class="{ on: questionCount === count }" @click="questionCount = count">{{ count }} 题</button>
        </div>

        <button class="btn start-btn" type="button" @click="startSession">开始练习</button>
      </div>

      <div class="history-head">
        <div><strong>最近练习</strong><span>{{ visibleRecords.length }} 次作答</span></div>
        <button v-if="visibleRecords.length" class="mini danger" type="button" @click="clearHistory">清空</button>
      </div>
      <div v-if="!sessionHistory.length" class="empty card">还没有速算记录</div>
      <div v-for="session in sessionHistory" :key="session.id" class="card history-card">
        <div><strong>{{ session.label }}</strong><span>{{ session.time }}</span></div>
        <div class="history-stats"><b>{{ session.correct }}/{{ session.total }}</b><span>{{ session.accuracy }}%</span><span>均时 {{ session.average }} 秒</span></div>
      </div>
    </div>

    <div v-else-if="stage === 'practice' && current" class="practice-stack">
      <div class="practice-top">
        <button class="mini" type="button" @click="quitSession">退出</button>
        <div class="progress-copy">{{ index + 1 }} / {{ questions.length }}</div>
        <div class="accuracy-copy">正确 {{ correctCount }}</div>
      </div>
      <div class="progress-track"><i :style="{ width: `${((index + (answered ? 1 : 0)) / questions.length) * 100}%` }"></i></div>

      <div class="card question-card" :class="{ answered, correct: answered && lastCorrect, wrong: answered && !lastCorrect }">
        <div class="question-meta"><span>{{ current.categoryLabel }}</span><span>{{ difficultyLabel }}</span></div>
        <p class="question-prompt">{{ current.prompt }}</p>
        <div class="expression">{{ current.expression }}</div>
        <div v-if="answered" class="feedback-grid">
          <PixelGrid :key="feedbackNonce" :pattern="lastCorrect ? 'confirm' : 'dissolve'" :size="64" once :label="lastCorrect ? '回答正确' : '回答错误'" />
          <div><strong>{{ lastCorrect ? '正确' : '再检查一步' }}</strong><span>答案 {{ current.answerDisplay }}{{ current.suffix }}</span></div>
        </div>
      </div>

      <div v-if="!answered" class="answer-area">
        <div v-if="current.options" class="option-row">
          <button v-for="option in current.options" :key="option" class="option-btn" type="button" @click="submitAnswer(option)">{{ option }}</button>
        </div>
        <form v-else class="answer-form" @submit.prevent="submitAnswer(answer)">
          <div class="answer-input-wrap"><input ref="answerInput" v-model="answer" class="input answer-input" inputmode="decimal" autocomplete="off" placeholder="输入答案" /><span>{{ current.suffix }}</span></div>
          <button class="btn" type="submit" :disabled="!answer.trim()">提交</button>
        </form>
      </div>
      <div v-else class="answer-area explained">
        <p>{{ current.explanation }}</p>
        <button class="btn" type="button" @click="nextQuestion">{{ index + 1 >= questions.length ? '查看结果' : '下一题' }}</button>
      </div>
    </div>

    <div v-else class="summary-stack">
      <div class="card result-card">
        <PixelGrid pattern="spiral" :size="86" once label="速算练习完成" />
        <div class="eyebrow">本场完成</div>
        <h2>{{ correctCount }} / {{ results.length }}</h2>
        <p>正确率 {{ accuracy }}% · 平均用时 {{ averageSeconds }} 秒</p>
      </div>
      <div v-if="wrongResults.length" class="card wrong-card">
        <h3>本场错题</h3>
        <div v-for="item in wrongResults" :key="item.prompt + item.userAnswer" class="wrong-row">
          <div><strong>{{ item.expression }}</strong><span>你的答案 {{ item.userAnswer || '未作答' }} · 正确答案 {{ item.answerDisplay }}{{ item.suffix }}</span></div>
          <p>{{ item.explanation }}</p>
        </div>
      </div>
      <button class="btn" type="button" @click="restartSame">再练一组</button>
      <button class="btn ghost" type="button" @click="stage = 'setup'">返回设置</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import PixelGrid from '../PixelGrid.vue';
import { SPEED_CATEGORIES, generateSpeedQuestion, judgeSpeedAnswer, type SpeedQuestion } from '../../lib/speedMath';
import { useAppStore } from '../../stores/app';
import { confirmDialog } from '../../lib/appDialog';
import type { SpeedDifficulty } from '../../types';

interface Result extends SpeedQuestion { userAnswer: string; correct: boolean; elapsedMs: number }

const store = useAppStore();
const stage = ref<'setup' | 'practice' | 'summary'>('setup');
const categoryKey = ref('two-add-sub');
const difficulty = ref<SpeedDifficulty>('normal');
const questionCount = ref(10);
const counts = [5, 10, 15, 20, 25];
const difficulties = [{ key: 'easy' as const, label: '简单' }, { key: 'normal' as const, label: '一般' }, { key: 'hard' as const, label: '困难' }];
const basicCategories = SPEED_CATEGORIES.filter((item) => item.group === 'basic');
const dataCategories = SPEED_CATEGORIES.filter((item) => item.group === 'data');
const questions = ref<SpeedQuestion[]>([]);
const results = ref<Result[]>([]);
const index = ref(0);
const answer = ref('');
const answered = ref(false);
const lastCorrect = ref(false);
const feedbackNonce = ref(0);
const answerInput = ref<HTMLInputElement | null>(null);
let questionStartedAt = 0;
let sessionId = '';

const current = computed(() => questions.value[index.value]);
const correctCount = computed(() => results.value.filter((item) => item.correct).length);
const accuracy = computed(() => results.value.length ? Math.round(correctCount.value / results.value.length * 100) : 0);
const averageSeconds = computed(() => results.value.length ? (results.value.reduce((sum, item) => sum + item.elapsedMs, 0) / results.value.length / 1000).toFixed(1) : '0.0');
const wrongResults = computed(() => results.value.filter((item) => !item.correct));
const difficultyLabel = computed(() => difficulties.find((item) => item.key === difficulty.value)?.label || '一般');
const visibleRecords = computed(() => store.speedDrills.filter((record) => !record.deleted));
const sessionHistory = computed(() => {
  const groups = new Map<string, typeof visibleRecords.value>();
  for (const record of visibleRecords.value) {
    const list = groups.get(record.sessionId) || [];
    list.push(record); groups.set(record.sessionId, list);
  }
  return [...groups.entries()].map(([id, records]) => {
    const sorted = records.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const correct = records.filter((record) => record.correct).length;
    return { id, label: sorted[0]?.categoryLabel || '速算练习', time: new Date(sorted.at(-1)?.createdAt || '').toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }), total: records.length, correct, accuracy: Math.round(correct / records.length * 100), average: (records.reduce((sum, record) => sum + record.elapsedMs, 0) / records.length / 1000).toFixed(1) };
  }).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 8);
});

function startSession() {
  sessionId = crypto.randomUUID();
  questions.value = Array.from({ length: questionCount.value }, () => generateSpeedQuestion(categoryKey.value, difficulty.value));
  results.value = []; index.value = 0; answer.value = ''; answered.value = false; stage.value = 'practice'; questionStartedAt = Date.now();
  nextTick(() => answerInput.value?.focus());
}

function submitAnswer(value: string) {
  if (!current.value || answered.value || !value.trim()) return;
  const elapsedMs = Math.max(0, Date.now() - questionStartedAt);
  const correct = judgeSpeedAnswer(current.value, value);
  const result: Result = { ...current.value, userAnswer: value.trim(), correct, elapsedMs };
  results.value.push(result); lastCorrect.value = correct; answered.value = true; feedbackNonce.value += 1;
  store.saveSpeedDrill({ categoryKey: result.categoryKey, categoryLabel: result.categoryLabel, difficulty: difficulty.value, prompt: result.prompt, expression: result.expression, correctAnswer: result.answerDisplay, userAnswer: result.userAnswer, correct, elapsedMs, sessionId });
  if ('vibrate' in navigator) navigator.vibrate?.(correct ? 16 : [18, 45, 18]);
}

function nextQuestion() {
  if (index.value + 1 >= questions.value.length) { stage.value = 'summary'; return; }
  index.value += 1; answer.value = ''; answered.value = false; questionStartedAt = Date.now();
  nextTick(() => answerInput.value?.focus());
}

async function quitSession() {
  const accepted = await confirmDialog({ title: '退出本场速算？', message: '已完成的题目会保留在历史记录中，未完成的题目不会计入。', confirmLabel: '退出练习', variant: 'danger' });
  if (accepted) stage.value = 'setup';
}

function restartSame() { startSession(); }

async function clearHistory() {
  const accepted = await confirmDialog({ title: '清空速算记录', message: '全部速算历史会从统计和设备同步记录中移除。', confirmLabel: '清空记录', variant: 'danger' });
  if (accepted) store.clearSpeedDrills();
}
</script>

<style scoped>
.setup-stack,.practice-stack,.summary-stack{display:grid;gap:14px}.hero-card{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px;background:linear-gradient(135deg,var(--accent-soft),var(--card))}.hero-card h2,.result-card h2{margin:4px 0 6px;font-size:24px}.hero-card p,.result-card p{margin:0;color:var(--text-2);font-size:13px;line-height:1.55}.eyebrow{color:var(--accent-solid);font-size:12px;font-weight:800;letter-spacing:.12em}.config-card{padding:16px}.field-title{display:block;margin:4px 0 8px;color:var(--text-2);font-size:13px;font-weight:700}.select-input{width:100%;margin-bottom:14px}.choice-row{display:grid;gap:8px;margin-bottom:14px}.choice-row.three{grid-template-columns:repeat(3,1fr)}.count-row{grid-template-columns:repeat(3,1fr)}.choice-row button,.option-btn{min-height:44px;border:1px solid var(--card-border);border-radius:11px;background:var(--bg-elev);color:var(--text-2);font-weight:700}.choice-row button.on{border-color:var(--accent-solid);background:var(--accent-soft);color:var(--accent-solid)}.start-btn{width:100%;margin-top:2px}.history-head{display:flex;align-items:center;justify-content:space-between}.history-head div{display:flex;align-items:baseline;gap:8px}.history-head span{font-size:12px;color:var(--text-3)}.history-card{display:flex;align-items:center;justify-content:space-between;padding:13px 15px}.history-card>div:first-child{display:grid;gap:3px}.history-card span{font-size:12px;color:var(--text-3)}.history-stats{display:flex;align-items:center;gap:8px}.history-stats b{font-size:18px;color:var(--accent-solid)}.practice-top{display:flex;align-items:center;justify-content:space-between}.progress-copy{font-weight:800}.accuracy-copy{font-size:12px;color:var(--text-3)}.progress-track{height:7px;border-radius:999px;background:var(--heat-0);overflow:hidden}.progress-track i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--accent-from),var(--accent-to));transition:width 280ms cubic-bezier(.16,1,.3,1)}.question-card{min-height:260px;padding:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;transition:border-color 180ms ease}.question-card.correct{border-color:rgba(16,185,129,.55)}.question-card.wrong{border-color:rgba(239,68,68,.5)}.question-meta{position:absolute;align-self:stretch;top:18px;display:flex;justify-content:space-between;color:var(--text-3);font-size:12px}.question-card{position:relative}.question-prompt{white-space:pre-line;color:var(--text-2);font-size:14px}.expression{white-space:pre-line;font-size:clamp(26px,8vw,40px);font-weight:850;font-variant-numeric:tabular-nums;line-height:1.35}.feedback-grid{display:flex;align-items:center;gap:16px;margin-top:24px;text-align:left}.feedback-grid div{display:grid;gap:4px}.feedback-grid strong{font-size:20px}.feedback-grid span{color:var(--text-2);font-size:13px}.answer-area{display:grid;gap:10px}.answer-form{display:grid;grid-template-columns:1fr auto;gap:10px}.answer-input-wrap{display:flex;align-items:center;border:1px solid var(--card-border);border-radius:12px;background:var(--card);padding-right:14px}.answer-input{border:0;background:transparent;font-size:22px;font-weight:750;min-width:0}.answer-input-wrap span{color:var(--text-3)}.option-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.option-btn{font-size:20px;color:var(--accent-solid);background:var(--accent-soft)}.explained{padding:14px;border-radius:14px;background:var(--accent-soft)}.explained p{margin:0;color:var(--text-2);font-size:13px;line-height:1.6}.result-card{text-align:center;padding:26px 18px}.wrong-card{padding:16px}.wrong-card h3{margin:0 0 10px}.wrong-row{padding:11px 0;border-top:1px solid var(--card-border)}.wrong-row:first-of-type{border-top:0}.wrong-row div{display:grid;gap:4px}.wrong-row span,.wrong-row p{color:var(--text-2);font-size:12px}.wrong-row p{margin:7px 0 0;line-height:1.5}.mini{min-height:44px;border:1px solid var(--card-border);border-radius:10px;background:var(--card);color:var(--text-2);padding:7px 12px}.mini.danger{color:var(--danger)}@media(max-width:380px){.history-card{align-items:flex-start;gap:8px}.history-stats{display:grid;text-align:right}.expression{font-size:25px}}
</style>

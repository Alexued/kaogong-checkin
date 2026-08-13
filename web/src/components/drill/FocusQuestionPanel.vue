<template>
  <section ref="panelEl" class="focus-panel">
    <div v-if="stage === 'setup'" class="setup-stack">
      <div class="card focus-hero">
        <div><span class="eyebrow">专注答题</span><h2>做题时，只保留下一步</h2><p>题目、选项和计时集中在一页，先答题，再交给 Skills 复盘。</p></div>
        <PixelGrid pattern="arrival" :size="64" decorative />
      </div>
      <div class="card setup-card">
        <div class="setup-line"><div><strong>题库专注</strong><span>陪陪刷 · 资料分析题库</span></div><b>{{ bankCount }} 道</b></div>
        <button class="btn" type="button" @click="questionBankOpen = true">选择题目开始</button>
        <button class="btn ghost" type="button" @click="startRandom">随机开始一题</button>
      </div>
      <div class="card focus-note"><span>建议节奏</span><strong>1 题 · 3 分钟</strong><small>先独立完成，再查看答案和方法。你可以随时跳过，稍后回到题目面板。</small></div>
    </div>

    <div v-else class="question-stage">
      <div class="focus-toolbar">
        <button class="icon-command" type="button" aria-label="退出专注答题" @click="leaveSession"><span aria-hidden="true">‹</span><small>退出</small></button>
        <button class="progress-command" type="button" @click="questionListOpen = !questionListOpen"><span aria-hidden="true">☷</span><strong>{{ index + 1 }} / {{ questions.length }}</strong></button>
        <div class="focus-clock" :class="{ active: !answered }"><span aria-hidden="true">◷</span>{{ fmtElapsed(elapsedMs) }}</div>
      </div>

      <div v-if="questionListOpen" class="card question-map" aria-label="题目面板">
        <div class="map-head"><strong>题目面板</strong><button class="icon-command" type="button" aria-label="关闭题目面板" @click="questionListOpen = false">×</button></div>
        <div class="map-grid">
          <button v-for="(item, itemIndex) in questions" :key="item.id" class="map-cell" :class="{ current: itemIndex === index, done: !!responses[item.id], skipped: responses[item.id]?.skipped }" type="button" @click="jumpTo(itemIndex)">{{ itemIndex + 1 }}</button>
        </div>
        <small>绿色表示已完成，灰色表示跳过，点击题号可返回。</small>
      </div>

      <article v-if="current" class="card focus-question">
        <div class="question-meta"><span>{{ current.category }}</span><span>{{ current.difficulty }}</span></div>
        <strong class="question-number">第 {{ index + 1 }} 题</strong>
        <h2>{{ current.stem }}</h2>
        <details v-if="current.material" class="material-block">
          <summary>查看材料</summary>
          <p>{{ current.material }}</p>
        </details>
        <div class="options" aria-label="答案选项">
          <button v-for="(option, optionIndex) in visibleOptions" :key="`${current.id}-${optionIndex}`" class="option" :class="{ selected: answer === option, correct: answered && optionLetter(optionIndex) === current.answer, wrong: answered && answer === option && optionLetter(optionIndex) !== current.answer }" type="button" :disabled="answered" @click="selectAnswer(option)">
            <span>{{ optionLetter(optionIndex) }}</span><strong>{{ option || '暂无选项文字' }}</strong>
          </button>
        </div>
        <input v-if="!visibleOptions.length" v-model="answer" class="input free-answer" inputmode="text" :disabled="answered" placeholder="题库没有选项文字，请输入答案字母" />
        <div v-if="answered" class="answer-feedback" :class="{ correct: lastCorrect }">
          <PixelGrid :pattern="lastCorrect ? 'confirm' : 'dissolve'" :size="42" once :label="lastCorrect ? '回答正确' : '需要复盘'" />
          <div><strong>{{ lastCorrect ? '回答正确' : '先记下这个易错点' }}</strong><span>参考答案：{{ current.answer }}</span></div>
        </div>
      </article>

      <div v-if="current" class="focus-actions">
        <div class="question-tools">
          <button type="button" :class="{ on: isFavorite }" @click="toggleFavorite"><span aria-hidden="true">★</span>收藏</button>
          <button type="button" :class="{ on: isFlagged }" @click="toggleFlag"><span aria-hidden="true">⚑</span>标记</button>
          <button type="button" :class="{ on: !!draft }" @click="draftOpen = !draftOpen"><span aria-hidden="true">✎</span>草稿</button>
        </div>
        <textarea v-if="draftOpen" v-model="draft" class="input draft-input" rows="3" placeholder="记下判断依据、卡住的步骤或待复盘点"></textarea>
        <div v-if="!answered" class="nav-actions"><button class="btn ghost" type="button" @click="skipQuestion">跳过</button><button class="btn" type="button" :disabled="!answer" @click="submitAnswer">提交答案</button></div>
        <div v-else class="nav-actions"><button class="btn ghost" type="button" @click="goPrevious" :disabled="index === 0">上一题</button><button class="btn" type="button" @click="goNext">{{ index + 1 >= questions.length ? '完成本场' : '下一题' }}</button></div>
        <button v-if="answered" class="review-link" type="button" @click="openReview">用 Skills 复盘这道题 <span aria-hidden="true">→</span></button>
      </div>
    </div>

    <QuestionBankPicker v-model:open="questionBankOpen" @select="startQuestion" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import PixelGrid from '../PixelGrid.vue';
import QuestionBankPicker from './QuestionBankPicker.vue';
import { ANALYSIS_BANK_COUNT, searchAnalysisQuestionBank, type AnalysisBankQuestion } from '../../lib/questionBank';

interface ResponseState { answer: string; correct: boolean; elapsedMs: number; skipped?: boolean }
const emit = defineEmits<{ review: [question: AnalysisBankQuestion, answer: string] }>();
const bankCount = ANALYSIS_BANK_COUNT;
const panelEl = ref<HTMLElement | null>(null);
const questionBankOpen = ref(false);
const questionListOpen = ref(false);
const draftOpen = ref(false);
const questions = ref<AnalysisBankQuestion[]>([]);
const index = ref(0);
const answer = ref('');
const elapsedMs = ref(0);
const responses = ref<Record<string, ResponseState>>({});
const favorites = ref<string[]>(loadList('favorite'));
const flags = ref<string[]>(loadList('flag'));
const draft = ref('');
let timer: ReturnType<typeof setInterval> | null = null;
let questionStartedAt = 0;

const stage = computed(() => questions.value.length ? 'practice' : 'setup');
const current = computed(() => questions.value[index.value]);
const currentResponse = computed(() => current.value ? responses.value[current.value.id] : undefined);
const answered = computed(() => !!currentResponse.value && !currentResponse.value.skipped);
const lastCorrect = computed(() => currentResponse.value?.correct ?? false);
const visibleOptions = computed(() => (current.value?.options || []).filter((option) => option !== undefined));
const isFavorite = computed(() => !!current.value && favorites.value.includes(current.value.id));
const isFlagged = computed(() => !!current.value && flags.value.includes(current.value.id));

function loadList(kind: 'favorite' | 'flag'): string[] {
  try { return JSON.parse(localStorage.getItem(`kgc-focus-${kind}`) || '[]'); } catch { return []; }
}
function saveList(kind: 'favorite' | 'flag', values: string[]) { localStorage.setItem(`kgc-focus-${kind}`, JSON.stringify(values)); }
function optionLetter(indexValue: number): string { return String.fromCharCode(65 + indexValue); }
function fmtElapsed(ms: number): string { const seconds = Math.floor(ms / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function resetClock() { questionStartedAt = Date.now(); elapsedMs.value = 0; if (timer) clearInterval(timer); timer = setInterval(() => { elapsedMs.value = Date.now() - questionStartedAt; }, 250); }
async function scrollSessionTop() {
  await nextTick();
  const scroller = panelEl.value?.closest<HTMLElement>('.swipe-page');
  if (scroller) scroller.scrollTo({ top: 0, behavior: 'auto' });
  else window.scrollTo({ top: 0, behavior: 'auto' });
}
function startQuestion(question: AnalysisBankQuestion) {
  const related = searchAnalysisQuestionBank(question.source, '', 8).filter((item) => item.source === question.source);
  questions.value = related.length ? related : [question];
  index.value = Math.max(0, questions.value.findIndex((item) => item.id === question.id));
  responses.value = {}; answer.value = ''; draft.value = ''; draftOpen.value = false; questionListOpen.value = false; resetClock();
  void scrollSessionTop();
}
function startRandom() { const bank = searchAnalysisQuestionBank('', '', bankCount); startQuestion(bank[Math.floor(Math.random() * bank.length)]); }
function selectAnswer(value: string) { if (!answered.value) answer.value = value; }
function submitAnswer() {
  if (!current.value || !answer.value || answered.value) return;
  const correct = visibleOptions.value.length
    ? optionLetter(visibleOptions.value.indexOf(answer.value)) === current.value.answer
    : answer.value.trim().toUpperCase() === current.value.answer.trim().toUpperCase();
  responses.value = { ...responses.value, [current.value.id]: { answer: answer.value, correct, elapsedMs: elapsedMs.value } };
  if (timer) { clearInterval(timer); timer = null; }
}
function skipQuestion() {
  if (!current.value) return;
  responses.value = { ...responses.value, [current.value.id]: { answer: '', correct: false, elapsedMs: elapsedMs.value, skipped: true } };
  goNext();
}
function loadCurrent() {
  if (!current.value) return;
  const response = responses.value[current.value.id]; answer.value = response?.answer || ''; draft.value = localStorage.getItem(`kgc-focus-draft-${current.value.id}`) || ''; draftOpen.value = !!draft.value; questionStartedAt = Date.now(); elapsedMs.value = response?.elapsedMs || 0;
  if (!response || response.skipped) resetClock();
}
function jumpTo(nextIndex: number) { index.value = nextIndex; questionListOpen.value = false; loadCurrent(); }
function goPrevious() { if (index.value > 0) { index.value -= 1; loadCurrent(); } }
function goNext() { if (index.value + 1 < questions.value.length) { index.value += 1; loadCurrent(); } else { questions.value = []; if (timer) clearInterval(timer); } }
function leaveSession() { questions.value = []; if (timer) { clearInterval(timer); timer = null; } }
function toggleFavorite() { if (!current.value) return; favorites.value = isFavorite.value ? favorites.value.filter((id) => id !== current.value!.id) : [...favorites.value, current.value.id]; saveList('favorite', favorites.value); }
function toggleFlag() { if (!current.value) return; flags.value = isFlagged.value ? flags.value.filter((id) => id !== current.value!.id) : [...flags.value, current.value.id]; saveList('flag', flags.value); }
function openReview() { if (current.value) emit('review', current.value, answer.value); }
watch(draft, (value) => { if (current.value) localStorage.setItem(`kgc-focus-draft-${current.value.id}`, value); });
watch(stage, (value) => {
  document.body.classList.toggle('focus-session-open', value === 'practice');
}, { immediate: true });
onActivated(() => document.body.classList.toggle('focus-session-open', stage.value === 'practice'));
onDeactivated(() => document.body.classList.remove('focus-session-open'));
onBeforeUnmount(() => {
  document.body.classList.remove('focus-session-open');
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.focus-panel,.setup-stack,.question-stage{display:grid;gap:14px}.question-stage{padding-bottom:calc(90px + env(safe-area-inset-bottom))}.focus-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px;background:linear-gradient(135deg,var(--accent-soft),var(--card))}.focus-hero h2{margin:4px 0 6px;font-size:21px}.focus-hero p{margin:0;color:var(--text-2);font-size:13px;line-height:1.5}.eyebrow{color:var(--accent-solid);font-size:12px;font-weight:800;letter-spacing:.1em}.setup-card{display:grid;gap:10px;padding:16px}.setup-line{display:flex;align-items:center;justify-content:space-between;gap:12px}.setup-line div{display:grid;gap:4px}.setup-line span{color:var(--text-3);font-size:11px}.setup-line b{color:var(--accent-solid);font-size:20px}.focus-note{display:grid;gap:4px;padding:14px}.focus-note span{color:var(--accent-solid);font-size:11px;font-weight:800}.focus-note strong{font-size:15px}.focus-note small{color:var(--text-2);font-size:12px;line-height:1.5}.focus-toolbar{display:grid;grid-template-columns:52px 1fr auto;align-items:center;gap:10px}.icon-command,.progress-command{min-height:44px;border:0;background:transparent;color:var(--text-2);font:inherit}.icon-command{display:inline-flex;align-items:center;gap:4px}.icon-command span{font-size:27px;line-height:1}.icon-command small{font-size:11px}.progress-command{justify-self:center;display:flex;align-items:center;gap:7px;color:var(--text)}.focus-clock{min-height:38px;display:inline-flex;align-items:center;gap:5px;padding:0 8px;border-radius:8px;background:var(--bg-elev);color:var(--text-2);font-size:12px;font-variant-numeric:tabular-nums}.focus-clock.active{color:var(--accent-solid);font-weight:800}.question-map{padding:13px}.map-head{display:flex;align-items:center;justify-content:space-between}.map-head .icon-command{width:36px;min-height:36px;justify-content:center;font-size:22px}.map-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:7px;margin:12px 0}.map-cell{aspect-ratio:1;border:1px solid var(--card-border);border-radius:7px;background:var(--bg-elev);color:var(--text-2);font:inherit;font-size:12px}.map-cell.current{border-color:var(--accent-solid);color:var(--accent-solid);font-weight:800}.map-cell.done{background:var(--accent-solid);border-color:var(--accent-solid);color:#fff}.map-cell.skipped{background:var(--heat-0)}.question-map small{color:var(--text-3);font-size:10px}.focus-question{padding:17px}.question-meta{display:flex;justify-content:space-between;color:var(--accent-solid);font-size:11px;font-weight:800}.question-number{display:block;margin-top:18px;color:var(--text-3);font-size:11px}.focus-question h2{margin:7px 0 13px;font-size:18px;line-height:1.55}.material-block{margin:0 0 13px;padding:10px;border-radius:8px;background:var(--bg-elev);color:var(--text-2);font-size:12px;line-height:1.65}.material-block summary{color:var(--accent-solid);font-weight:800;cursor:pointer}.material-block p{white-space:pre-line;margin:8px 0 0}.options{display:grid;gap:9px}.option{min-height:50px;display:grid;grid-template-columns:30px minmax(0,1fr);align-items:center;gap:7px;border:1px solid var(--card-border);border-radius:10px;padding:8px 10px;background:var(--bg-elev);color:var(--text);font:inherit;text-align:left}.option>span{width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:var(--heat-0);color:var(--text-2);font-size:12px;font-weight:800}.option.selected{border-color:var(--accent-solid);background:var(--accent-soft)}.option.correct{border-color:#16a34a;background:color-mix(in srgb,#16a34a 11%,var(--card))}.option.wrong{border-color:var(--danger);background:color-mix(in srgb,var(--danger) 10%,var(--card))}.free-answer{margin-top:10px}.answer-feedback{display:flex;align-items:center;gap:12px;margin-top:14px;padding:10px;border-radius:9px;background:var(--warn-soft)}.answer-feedback.correct{background:var(--accent-soft)}.answer-feedback div{display:grid;gap:3px}.answer-feedback strong{font-size:14px}.answer-feedback span{color:var(--text-2);font-size:12px}.focus-actions{display:grid;gap:10px}.question-tools{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.question-tools button{min-height:44px;border:1px solid var(--card-border);border-radius:9px;background:var(--card);color:var(--text-2);font:inherit;font-size:12px}.question-tools button.on{border-color:var(--accent-solid);background:var(--accent-soft);color:var(--accent-solid)}.question-tools span{margin-right:4px}.draft-input{font-size:13px;line-height:1.5}.nav-actions{display:grid;grid-template-columns:1fr 1.5fr;gap:9px}.nav-actions .btn{width:100%}.review-link{min-height:42px;border:0;background:transparent;color:var(--accent-solid);font:inherit;font-size:12px;font-weight:800}.review-link span{font-size:17px;margin-left:3px}.btn.ghost{color:var(--text-2)}@media(max-width:380px){.focus-hero :deep(.pixel-grid){display:none}.focus-toolbar{grid-template-columns:44px 1fr auto}.focus-question h2{font-size:16px}.map-grid{grid-template-columns:repeat(6,minmax(0,1fr))}}
</style>

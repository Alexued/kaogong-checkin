<template>
  <teleport to="body">
    <Transition name="bank-sheet">
      <div v-if="open" class="bank-mask" data-back-dismiss data-back-priority="170" @click.self="close">
        <section class="bank-sheet card" role="dialog" aria-modal="true" aria-labelledby="bank-title">
          <div class="bank-head">
            <div><span>来自“陪陪刷”资料分析题库</span><h2 id="bank-title">选择一道题</h2></div>
            <button type="button" aria-label="关闭题库" @click="close">×</button>
          </div>
          <label class="search-field">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/></svg>
            <input v-model="query" type="search" placeholder="搜索年份、主体、题干或来源" autocomplete="off" />
          </label>
          <div class="category-row" data-swipe-ignore>
            <button type="button" :class="{ on: !category }" @click="category = ''">全部</button>
            <button v-for="item in categories" :key="item" type="button" :class="{ on: category === item }" @click="category = item">{{ item }}</button>
          </div>
          <div class="bank-summary">{{ results.length }} 条匹配，题库共 {{ total }} 题</div>
          <div class="bank-results" data-swipe-ignore>
            <button v-for="question in results" :key="question.id" type="button" class="question-row" @click="choose(question)">
              <span>{{ question.category }}</span>
              <strong>{{ question.stem }}</strong>
              <small>{{ question.source }}</small>
            </button>
            <div v-if="!results.length" class="bank-empty">没有匹配题目，请减少关键词或切换分类</div>
          </div>
        </section>
      </div>
    </Transition>
  </teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ANALYSIS_BANK_CATEGORIES, ANALYSIS_BANK_COUNT, searchAnalysisQuestionBank, type AnalysisBankQuestion } from '../../lib/questionBank';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean]; select: [question: AnalysisBankQuestion] }>();
const query = ref('');
const category = ref('');
const categories = ANALYSIS_BANK_CATEGORIES;
const total = ANALYSIS_BANK_COUNT;
const results = computed(() => searchAnalysisQuestionBank(query.value, category.value));
watch(() => props.open, (open) => { if (open) { query.value = ''; category.value = ''; } });
const close = () => emit('update:open', false);
function choose(question: AnalysisBankQuestion) { emit('select', question); close(); }
</script>

<style scoped>
.bank-mask{position:fixed;inset:0;z-index:180;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.48)}.bank-sheet{width:100%;max-width:640px;height:min(88vh,760px);display:flex;flex-direction:column;border-radius:18px 18px 0 0;padding:18px 16px calc(16px + env(safe-area-inset-bottom));overflow:hidden}.bank-head{display:flex;align-items:flex-start;justify-content:space-between}.bank-head span{color:var(--accent-solid);font-size:11px;font-weight:800}.bank-head h2{margin:3px 0 0;font-size:20px}.bank-head>button{width:44px;height:44px;border:0;border-radius:8px;background:var(--bg-elev);color:var(--text-2);font-size:25px}.search-field{min-height:46px;display:flex;align-items:center;gap:9px;margin-top:13px;border:1px solid var(--card-border);border-radius:9px;padding:0 12px;background:var(--bg-elev);color:var(--text-3)}.search-field input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--text);font-size:14px}.category-row{display:flex;gap:7px;margin-top:10px;overflow-x:auto;scrollbar-width:none}.category-row::-webkit-scrollbar{display:none}.category-row button{flex:none;min-height:40px;border:1px solid var(--card-border);border-radius:8px;padding:0 12px;background:var(--card);color:var(--text-2);font-size:12px}.category-row button.on{border-color:var(--accent-solid);background:var(--accent-soft);color:var(--accent-solid);font-weight:750}.bank-summary{margin:10px 2px 6px;color:var(--text-3);font-size:11px}.bank-results{flex:1;overflow-y:auto;overscroll-behavior:contain}.question-row{width:100%;display:grid;gap:5px;border:0;border-top:1px solid var(--card-border);padding:12px 3px;background:transparent;color:var(--text);text-align:left}.question-row>span{color:var(--accent-solid);font-size:10px;font-weight:800}.question-row>strong{font-size:13px;line-height:1.55}.question-row>small{color:var(--text-3);font-size:10px;line-height:1.4}.question-row:active{background:var(--accent-soft)}.bank-empty{padding:40px 10px;text-align:center;color:var(--text-3);font-size:13px}.bank-sheet-enter-active,.bank-sheet-leave-active{transition:opacity 200ms ease}.bank-sheet-enter-active .bank-sheet,.bank-sheet-leave-active .bank-sheet{transition:transform 300ms cubic-bezier(.16,1,.3,1)}.bank-sheet-enter-from,.bank-sheet-leave-to{opacity:0}.bank-sheet-enter-from .bank-sheet,.bank-sheet-leave-to .bank-sheet{transform:translateY(55px)}
</style>

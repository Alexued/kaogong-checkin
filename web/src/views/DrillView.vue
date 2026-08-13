<template>
  <StatsView v-if="isGeneral" />
  <div v-else class="page">
    <h1 class="page-title">背诵与练习</h1>
    <p class="page-sub">资料分析速算、专注答题与方法复盘</p>

    <div class="module-seg">
      <button :class="{ on: module === 'percent' }" @click="module = 'percent'">百化分</button>
      <button :class="{ on: module === 'formula' }" @click="module = 'formula'">公式</button>
      <button :class="{ on: module === 'speed' }" @click="module = 'speed'">速算</button>
      <button :class="{ on: module === 'focus' }" @click="module = 'focus'">专注答题</button>
      <button :class="{ on: module === 'review' }" @click="module = 'review'">题目复盘</button>
    </div>

    <!-- keep-alive：切换子模块不丢本场进度 -->
    <keep-alive>
      <PercentPanel v-if="module === 'percent'" />
      <FormulaPanel v-else-if="module === 'formula'" />
      <SpeedMathPanel v-else-if="module === 'speed'" />
      <FocusQuestionPanel v-else-if="module === 'focus'" @review="openReview" />
      <AnalysisReviewPanel v-else :seed="reviewSeed" />
    </keep-alive>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import PercentPanel from '../components/drill/PercentPanel.vue';
import FormulaPanel from '../components/drill/FormulaPanel.vue';
import SpeedMathPanel from '../components/drill/SpeedMathPanel.vue';
import AnalysisReviewPanel from '../components/drill/AnalysisReviewPanel.vue';
import FocusQuestionPanel from '../components/drill/FocusQuestionPanel.vue';
import StatsView from './StatsView.vue';
import { useAppStore } from '../stores/app';
import type { AnalysisBankQuestion } from '../lib/questionBank';

const store = useAppStore();
const route = useRoute();
const isGeneral = computed(() => store.settings.appMode === 'general');
const module = ref<'percent' | 'formula' | 'speed' | 'focus' | 'review'>('percent');
const reviewSeed = ref<{ question: AnalysisBankQuestion; answer: string } | null>(null);

watch(() => route.query.module, (value) => {
  if (value === 'review' || value === 'focus' || value === 'speed' || value === 'formula' || value === 'percent') {
    module.value = value;
  }
}, { immediate: true });

function openReview(question: AnalysisBankQuestion, answer: string) {
  reviewSeed.value = { question, answer };
  module.value = 'review';
}
</script>

<style scoped>
.module-seg {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
  scrollbar-width: none;
}
.module-seg::-webkit-scrollbar { display: none; }

.module-seg button {
  flex: 1 0 auto;
  min-width: 76px;
  border: 1px solid var(--card-border);
  background: var(--card);
  color: var(--text-2);
  border-radius: 12px;
  padding: 10px 0;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 200ms ease;
}

.module-seg button.on {
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  border-color: transparent;
  color: #fff;
}
</style>

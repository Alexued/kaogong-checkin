<template>
  <div class="page">
    <h1 class="page-title">背诵</h1>
    <p class="page-sub">资料分析速算基本功</p>

    <div class="module-seg">
      <button :class="{ on: module === 'percent' }" @click="module = 'percent'">百化分</button>
      <button :class="{ on: module === 'formula' }" @click="module = 'formula'">公式</button>
    </div>

    <!-- keep-alive：切换子模块不丢本场进度 -->
    <keep-alive>
      <PercentPanel v-if="module === 'percent'" />
      <FormulaPanel v-else />
    </keep-alive>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import PercentPanel from '../components/drill/PercentPanel.vue';
import FormulaPanel from '../components/drill/FormulaPanel.vue';

const module = ref<'percent' | 'formula'>('percent');
</script>

<style scoped>
.module-seg {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.module-seg button {
  flex: 1;
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

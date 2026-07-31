<template>
  <div class="card reftable">
    <button class="ref-head" type="button" @click="open = !open">
      <span class="ref-title">{{ title }}</span>
      <span class="ref-count">{{ items.length }} 条</span>
      <svg
        class="chev" :class="{ open }"
        viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
        stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <template v-if="open">
      <div class="ref-tools">
        <button class="mini" :class="{ on: hideAnswers }" type="button" @click="hideAnswers = !hideAnswers">
          {{ hideAnswers ? '显示答案' : '默写版（隐藏答案）' }}
        </button>
      </div>
      <div class="table-wrap">
        <table :style="minWidth ? { minWidth: minWidth + 'px' } : undefined">
          <thead>
            <tr>
              <template v-for="p in pairsPerRow" :key="p">
                <th>{{ labelHeader }}</th>
                <th>{{ answerHeader }}</th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in gridRows" :key="i">
              <template v-for="(item, j) in row" :key="j">
                <td class="label-cell">{{ item ? item.label : '' }}</td>
                <td class="answer-cell">
                  <template v-if="item">
                    <span v-if="hideAnswers" class="blank">&nbsp;</span>
                    <template v-else>
                      {{ item.answer }}
                      <span v-if="item.note" class="note">{{ item.note }}</span>
                    </template>
                  </template>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

interface RefItem {
  label: string;
  answer: string;
  note?: string;
}

const props = withDefaults(
  defineProps<{
    title: string;
    /** 每行并排的 "标签+答案" 对数（表格总列数 = 2 × pairsPerRow） */
    pairsPerRow?: number;
    labelHeader: string;
    answerHeader: string;
    items: RefItem[];
    /** 表格最小宽度 px（超出则横向滚动，避免长公式被压变形） */
    minWidth?: number;
  }>(),
  { pairsPerRow: 2, minWidth: 0 }
);

const open = ref(false);
const hideAnswers = ref(false);

/** 把条目按 pairsPerRow 切成多列表格的行 */
const gridRows = computed<(RefItem | null)[][]>(() => {
  const n = Math.max(1, props.pairsPerRow);
  const rows: (RefItem | null)[][] = [];
  for (let i = 0; i < props.items.length; i += n) {
    const row: (RefItem | null)[] = props.items.slice(i, i + n);
    while (row.length < n) row.push(null);
    rows.push(row);
  }
  return rows;
});
</script>

<style scoped>
.reftable {
  margin-bottom: 14px;
  overflow: hidden;
}

.ref-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text);
  padding: 13px 16px;
  font-size: 14.5px;
  font-weight: 700;
  cursor: pointer;
}

.ref-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
}

.chev {
  margin-left: auto;
  color: var(--text-3);
  transition: transform 200ms ease;
}

.chev.open {
  transform: rotate(180deg);
}

.ref-tools {
  display: flex;
  justify-content: flex-end;
  padding: 0 16px 10px;
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

.mini.on {
  background: var(--accent-soft);
  border-color: var(--accent-solid);
  color: var(--accent-solid);
  font-weight: 600;
}

/* 横向可滚动；overflow-y:hidden 避免成为竖向滚动容器吞掉页面滚动手势 */
.table-wrap {
  overflow-x: auto;
  overflow-y: hidden;
  border-top: 1px solid var(--card-border);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
  table-layout: fixed;
}

th,
td {
  text-align: left;
  padding: 9px 12px;
  vertical-align: top;
  overflow-wrap: break-word;
}

th {
  font-size: 11.5px;
  color: var(--text-3);
  font-weight: 600;
  border-bottom: 1px solid var(--card-border);
  white-space: nowrap;
}

tbody tr + tr td {
  border-top: 1px solid var(--card-border);
}

tbody tr:nth-child(even) {
  background: color-mix(in srgb, var(--text) 3%, transparent);
}

.label-cell {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.answer-cell {
  white-space: pre-line;
}

.note {
  display: block;
  color: var(--text-3);
  font-size: 11.5px;
  margin-top: 2px;
}

/* 默写版：答案列保留下划线空位，排版不错位 */
.blank {
  display: inline-block;
  min-width: 48px;
  border-bottom: 1.5px solid var(--text-3);
}
</style>

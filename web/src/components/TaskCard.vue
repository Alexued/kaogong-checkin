<template>
  <div
    v-motion
    class="card task-card"
    :class="{ done: item.done, carried: item.overdueDays > 0, sorting: reorder }"
    :initial="{ opacity: 0, y: 18 }"
    :enter="{
      opacity: 1,
      y: 0,
      transition: { type: 'spring', stiffness: 260, damping: 26, delay: index * 55 },
    }"
    @click="onCardClick"
  >
    <div class="main-row">
      <CheckButton :done="item.done" @toggle="onToggle" />
      <div class="body">
        <div class="title">{{ item.task.title }}</div>
        <div class="meta">
          <span v-if="item.overdueDays > 0" class="badge warn">逾期 {{ item.overdueDays }} 天</span>
          <span v-if="item.overdueDays > 0" class="date">{{ item.date }} 应完成</span>
          <span v-else class="badge">{{ item.task.type === 'daily' ? '每日' : '截止' }}</span>
          <span v-if="subItems.length" class="badge sub">
            子任务 {{ subDoneCount }}/{{ subItems.length }}
          </span>
        </div>
      </div>
      <svg
        v-if="subItems.length && !reorder"
        class="chev" :class="{ open: expanded }"
        viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
        stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
      <div v-if="reorder" class="reorder-btns" @click.stop>
        <button type="button" :disabled="first" aria-label="上移" @click="emit('move', item, -1)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
            stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 14 6-6 6 6" />
          </svg>
        </button>
        <button type="button" :disabled="last" aria-label="下移" @click="emit('move', item, 1)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
            stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 10 6 6 6-6" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 子任务清单（展开时） -->
    <div v-if="subItems.length && expanded && !reorder" class="subs" @click.stop>
      <div
        v-for="s in subItems"
        :key="s.id"
        class="sub-row"
        :class="{ done: s.done }"
        @click="emit('toggle-sub', s, $event)"
      >
        <CheckButton class="sub-check" :done="s.done" @toggle="(ev) => emit('toggle-sub', s, ev)" />
        <span class="sub-title">{{ s.title }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PlanItem } from '../lib/plan';
import CheckButton from './CheckButton.vue';

interface SubItem {
  id: string;
  title: string;
  done: boolean;
  checkinId?: string;
}

const props = withDefaults(
  defineProps<{
    item: PlanItem;
    index: number;
    /** 排序模式：整条点击不再切换打卡，右侧显示上移/下移按钮 */
    reorder?: boolean;
    first?: boolean;
    last?: boolean;
    /** 子任务清单（有子任务时点击卡片展开/收起） */
    subItems?: SubItem[];
    expanded?: boolean;
  }>(),
  { reorder: false, first: false, last: false, subItems: () => [], expanded: false }
);
const emit = defineEmits<{
  (e: 'toggle', item: PlanItem, ev: MouseEvent): void;
  (e: 'move', item: PlanItem, dir: -1 | 1): void;
  (e: 'toggle-sub', sub: SubItem, ev: MouseEvent): void;
  (e: 'toggle-expand', item: PlanItem): void;
}>();

const subDoneCount = computed(() => props.subItems.filter((s) => s.done).length);

function onToggle(ev: MouseEvent) {
  emit('toggle', props.item, ev);
}

/** 整条卡片点击：有子任务时展开/收起，否则切换打卡/恢复；排序模式下不响应 */
function onCardClick(ev: MouseEvent) {
  if (props.reorder) return;
  if (props.subItems.length) emit('toggle-expand', props.item);
  else emit('toggle', props.item, ev);
}
</script>

<style scoped>
.task-card {
  padding: 14px 16px;
  margin-bottom: 10px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition:
    transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 280ms ease,
    opacity 300ms ease;
}

/* 卡片按压缩放回弹 */
.task-card:active {
  transform: scale(0.97);
}

.main-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.body {
  min-width: 0;
  flex: 1;
}

.title {
  font-size: 15.5px;
  font-weight: 600;
  transition: color 200ms ease;
}

.task-card.done .title {
  color: var(--text-3);
  text-decoration: line-through;
}

.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.badge.sub {
  background: var(--bg-elev);
  color: var(--text-2);
  border: 1px solid var(--card-border);
}

.date {
  font-size: 12px;
  color: var(--text-3);
}

.task-card.carried {
  border-color: color-mix(in srgb, var(--warn) 35%, var(--card-border));
}

.chev {
  flex: none;
  color: var(--text-3);
  transition: transform 200ms ease;
}

.chev.open {
  transform: rotate(180deg);
}

/* 子任务清单 */
.subs {
  margin-top: 10px;
  padding-top: 6px;
  border-top: 1px dashed var(--card-border);
}

.sub-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 2px;
  border-radius: 10px;
  cursor: pointer;
  transition: background-color 160ms ease;
}

.sub-row:active {
  background: var(--accent-soft);
}

.sub-check {
  transform: scale(0.82);
  margin: -3px 0;
}

.sub-title {
  font-size: 14px;
  color: var(--text-2);
  transition: color 200ms ease;
}

.sub-row.done .sub-title {
  color: var(--text-3);
  text-decoration: line-through;
}

.reorder-btns {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: none;
}

.reorder-btns button {
  border: 1px solid var(--card-border);
  background: var(--bg-elev);
  color: var(--text-2);
  border-radius: 9px;
  width: 34px;
  height: 26px;
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.reorder-btns button:active {
  transform: scale(0.9);
}

.reorder-btns button:disabled {
  opacity: 0.3;
}
</style>

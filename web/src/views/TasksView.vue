<template>
  <div class="page">
    <header class="tasks-heading">
      <button class="back-button" type="button" aria-label="返回今日" title="返回今日" @click="navigateToParent(router)">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <div>
        <h1 class="page-title">任务管理</h1>
        <p class="page-sub">每日重复或截止型任务</p>
      </div>
    </header>

    <button class="btn add-btn" @click="openEditor()">+ 新建任务</button>

    <div
      v-for="(t, i) in activeTasks"
      :key="t.id"
      v-motion
      class="card row"
      :initial="{ opacity: 0, y: 18 }"
      :enter="{
        opacity: 1,
        y: 0,
        transition: { type: 'spring', stiffness: 260, damping: 26, delay: i * 50 },
      }"
    >
      <div class="row-body">
        <div class="row-title">{{ t.title }}</div>
        <div class="row-meta">
          <span class="badge">{{ t.type === 'daily' ? '每日' : '截止' }}</span>
          <span v-if="t.target > 1" class="badge quantity">{{ t.target }}{{ t.unit || '次' }}</span>
          <span v-else-if="store.subtasks.some((subtask) => subtask.taskId === t.id)" class="badge">
            清单
          </span>
          <span v-if="t.endDate" class="date">
            {{ t.type === 'daily' ? '结束于' : '截止' }} {{ t.endDate }}
          </span>
        </div>
      </div>
      <div class="row-actions">
        <button class="mini" @click="openEditor(t)">编辑</button>
        <button class="mini" @click="store.setArchived(t.id, true)">归档</button>
        <button class="mini danger" @click="onDelete(t)">删除</button>
      </div>
    </div>

    <template v-if="archivedTasks.length">
      <div class="section-title">已归档</div>
      <div v-for="t in archivedTasks" :key="t.id" class="card row archived">
        <div class="row-body">
          <div class="row-title">{{ t.title }}</div>
        </div>
        <div class="row-actions">
          <button class="mini" @click="store.setArchived(t.id, false)">恢复</button>
          <button class="mini danger" @click="onDelete(t)">删除</button>
        </div>
      </div>
    </template>

    <div v-if="!store.tasks.length" class="empty">还没有任务，点上方按钮新建一个</div>

    <TaskEditorSheet
      v-model:open="sheetOpen"
      :task="editingTask"
      :subtasks="editingSubtasks"
      @save="onSave"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { navigateToParent } from '../lib/backNavigation';
import TaskEditorSheet from '../components/TaskEditorSheet.vue';
import type { Task } from '../types';

const store = useAppStore();
const router = useRouter();

const activeTasks = computed(() =>
  store.tasks.filter((t) => !t.archived).sort((a, b) => a.order - b.order)
);
const archivedTasks = computed(() => store.tasks.filter((t) => t.archived));

const sheetOpen = ref(false);
const editingTask = ref<Task | null>(null);

/** 正在编辑任务的现有子任务（按顺序） */
const editingSubtasks = computed(() =>
  editingTask.value
    ? store.subtasks
        .filter((s) => s.taskId === editingTask.value!.id)
        .sort((a, b) => a.order - b.order)
    : []
);

function openEditor(t?: Task) {
  editingTask.value = t || null;
  sheetOpen.value = true;
}

function onSave(form: {
  id?: string;
  title: string;
  type: Task['type'];
  endDate: string;
  target: number;
  unit: string;
  subs: { id?: string; title: string }[];
}) {
  const id = store.saveTask({
    id: form.id,
    title: form.title,
    type: form.type,
    endDate: form.endDate || null,
    target: form.target,
    unit: form.unit,
  });
  if (id) store.saveSubtasks(id, form.subs);
}

function onDelete(t: Task) {
  if (window.confirm(`确定删除任务「${t.title}」？相关打卡记录会保留。`)) {
    store.deleteTask(t.id);
  }
}
</script>

<style scoped>
.tasks-heading {
  display: flex;
  align-items: center;
  gap: 11px;
  margin: 2px 0 16px;
}

.tasks-heading .page-title { margin: 0 0 3px; }
.tasks-heading .page-sub { margin: 0; }

.back-button {
  width: 44px;
  height: 44px;
  flex: none;
  display: grid;
  place-items: center;
  border: 1px solid var(--card-border);
  border-radius: 50%;
  background: var(--card);
  color: var(--text-2);
  cursor: pointer;
}

.back-button:active { transform: scale(.94); }
.back-button:focus-visible { outline: 2px solid var(--accent-solid); outline-offset: 2px; }

.add-btn {
  width: 100%;
  margin-bottom: 16px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  margin-bottom: 10px;
  transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.row:active {
  transform: scale(0.98);
}

.row.archived {
  opacity: 0.6;
}

.row-title {
  font-size: 15.5px;
  font-weight: 600;
}

.row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.date {
  font-size: 12px;
  color: var(--text-3);
}

.badge.quantity {
  background: var(--accent-soft);
  color: var(--accent-solid);
}

.row-actions {
  display: flex;
  gap: 6px;
  flex: none;
}

.mini {
  border: 1px solid var(--card-border);
  background: transparent;
  color: var(--text-2);
  border-radius: 9px;
  padding: 5px 10px;
  font-size: 12.5px;
  cursor: pointer;
  transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.mini:active {
  transform: scale(0.94);
}

.mini.danger {
  color: var(--danger);
}
</style>

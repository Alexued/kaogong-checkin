<template>
  <teleport to="body">
    <div v-if="form" class="sheet-mask" @click.self="close">
      <div class="sheet card">
        <h2 class="sheet-title">{{ form.id ? '编辑任务' : '新建任务' }}</h2>
        <label class="field">
          <span>标题</span>
          <input v-model="form.title" class="input" placeholder="如：行测刷题 50 道" />
        </label>
        <label class="field">
          <span>类型</span>
          <div class="seg">
            <button :class="{ on: form.type === 'daily' }" @click="form!.type = 'daily'">
              每日重复
            </button>
            <button :class="{ on: form.type === 'deadline' }" @click="form!.type = 'deadline'">
              截止型
            </button>
          </div>
        </label>
        <label class="field">
          <span>{{ form.type === 'daily' ? '结束日期（可空）' : '截止日期' }}</span>
          <input v-model="form.endDate" type="date" class="input" />
        </label>
        <label class="field">
          <span>子任务（可空，在今日页点主任务展开）</span>
          <div v-for="(s, i) in form.subs" :key="i" class="sub-edit-row">
            <input v-model="s.title" class="input" placeholder="子任务标题" />
            <button class="sub-del" type="button" aria-label="删除子任务" @click="form!.subs.splice(i, 1)">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
                stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <button class="sub-add" type="button" @click="form!.subs.push({ title: '' })">
            ＋ 添加子任务
          </button>
        </label>
        <div class="sheet-actions">
          <button class="btn ghost" @click="close">取消</button>
          <button class="btn" :disabled="!canSave" @click="save">保存</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Task, Subtask } from '../types';

interface SubEdit {
  id?: string;
  title: string;
}

interface TaskEditState {
  id?: string;
  title: string;
  type: 'daily' | 'deadline';
  endDate: string;
  subs: SubEdit[];
}

/** 传入要编辑的任务及其现有子任务；不传（null/undefined）表示新建；closed 由 v-model:open 控制 */
const props = defineProps<{ open: boolean; task?: Task | null; subtasks?: Subtask[] }>();
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'save', form: TaskEditState): void;
}>();

const form = ref<TaskEditState | null>(null);

watch(
  () => props.open,
  (open) => {
    if (!open) {
      form.value = null;
      return;
    }
    const t = props.task;
    form.value = t
      ? {
          id: t.id,
          title: t.title,
          type: t.type,
          endDate: t.endDate || '',
          subs: (props.subtasks || []).map((s) => ({ id: s.id, title: s.title })),
        }
      : { title: '', type: 'daily', endDate: '', subs: [] };
  },
  { immediate: true }
);

const canSave = computed(() => {
  const f = form.value;
  if (!f || !f.title.trim()) return false;
  if (f.type === 'deadline' && !f.endDate) return false;
  return true;
});

function close() {
  emit('update:open', false);
}

function save() {
  const f = form.value;
  if (!f || !canSave.value) return;
  emit('save', {
    id: f.id,
    title: f.title.trim(),
    type: f.type,
    endDate: f.endDate,
    subs: f.subs.filter((s) => s.title.trim()),
  });
  emit('update:open', false);
}
</script>

<style scoped>
.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
}

.sheet {
  width: 100%;
  max-width: 640px;
  border-radius: 20px 20px 0 0;
  padding: 20px 18px calc(20px + env(safe-area-inset-bottom));
  animation: slide-up 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes slide-up {
  from {
    transform: translateY(60px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.sheet-title {
  margin: 0 0 14px;
  font-size: 18px;
}

.field {
  display: block;
  margin-bottom: 14px;
}

.field > span {
  display: block;
  font-size: 13px;
  color: var(--text-2);
  margin-bottom: 6px;
}

.seg {
  display: flex;
  gap: 8px;
}

.seg button {
  flex: 1;
  border: 1px solid var(--card-border);
  background: transparent;
  color: var(--text-2);
  border-radius: 12px;
  padding: 9px 0;
  font-size: 14px;
  cursor: pointer;
}

.seg button.on {
  background: var(--accent-soft);
  border-color: var(--accent-solid);
  color: var(--accent-solid);
  font-weight: 600;
}

.sheet-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
}

.sub-edit-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.sub-del {
  flex: none;
  width: 32px;
  height: 32px;
  border: 1px solid var(--card-border);
  background: transparent;
  color: var(--danger);
  border-radius: 9px;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.sub-add {
  border: 1px dashed var(--card-border);
  background: transparent;
  color: var(--text-2);
  border-radius: 12px;
  padding: 9px 0;
  width: 100%;
  font-size: 13.5px;
  cursor: pointer;
}

.sub-add:active {
  background: var(--accent-soft);
}

.btn:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>

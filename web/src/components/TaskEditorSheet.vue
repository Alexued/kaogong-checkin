<template>
  <teleport to="body">
    <Transition name="editor-sheet">
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
          <button class="date-trigger" type="button" @click="datePickerOpen = true">
            <span :class="{ placeholder: !form.endDate }">
              {{ form.endDate ? formatCn(form.endDate) : '选择日期' }}
            </span>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="17" rx="3" />
              <path d="M8 2v4M16 2v4M3 10h18" />
            </svg>
          </button>
        </label>
        <label class="field">
          <span>完成方式</span>
          <div class="seg">
            <button type="button" :class="{ on: form.target === 1 }" @click="setChecklistMode">
              清单
            </button>
            <button
              type="button"
              :disabled="form.subs.length > 0"
              :class="{ on: form.target > 1 }"
              @click="setQuantityMode"
            >
              数量
            </button>
          </div>
          <small v-if="form.subs.length" class="field-note">有子任务时固定为清单模式</small>
        </label>
        <div v-if="form.target > 1" class="quantity-fields">
          <label class="field">
            <span>每日目标</span>
            <input v-model.number="form.target" class="input" type="number" min="2" step="1" inputmode="numeric" />
          </label>
          <label class="field">
            <span>单位（可空）</span>
            <input v-model="form.unit" class="input" maxlength="12" placeholder="如：题、页、分钟" />
          </label>
        </div>
        <label class="field">
          <span>子任务（可空，在今日页点主任务展开）</span>
          <div v-for="(s, i) in form.subs" :key="i" class="sub-edit-row">
            <input v-model="s.title" class="input" placeholder="子任务标题" />
            <button class="sub-del" type="button" aria-label="删除子任务" @click="form!.subs.splice(i, 1)">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
                stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <button class="sub-add" type="button" @click="addSubtask">
            ＋ 添加子任务
          </button>
        </label>
        <div class="sheet-actions">
          <button class="btn ghost" @click="close">取消</button>
          <button class="btn" :disabled="!canSave" @click="save">保存</button>
        </div>
        </div>
      </div>
    </Transition>
    <DatePickerSheet
      v-if="form"
      v-model:open="datePickerOpen"
      v-model="form.endDate"
      :title="form.type === 'daily' ? '选择结束日期' : '选择截止日期'"
      :allow-clear="form.type === 'daily'"
    />
  </teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Task, Subtask } from '../types';
import DatePickerSheet from './DatePickerSheet.vue';
import { formatCn } from '../lib/date';

interface SubEdit {
  id?: string;
  title: string;
}

interface TaskEditState {
  id?: string;
  title: string;
  type: 'daily' | 'deadline';
  endDate: string;
  target: number;
  unit: string;
  subs: SubEdit[];
}

/** 传入要编辑的任务及其现有子任务；不传（null/undefined）表示新建；closed 由 v-model:open 控制 */
const props = defineProps<{ open: boolean; task?: Task | null; subtasks?: Subtask[] }>();
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'save', form: TaskEditState): void;
}>();

const form = ref<TaskEditState | null>(null);
const datePickerOpen = ref(false);

watch(
  () => props.open,
  (open) => {
    if (!open) {
      form.value = null;
      datePickerOpen.value = false;
      return;
    }
    const t = props.task;
    form.value = t
      ? {
          id: t.id,
          title: t.title,
          type: t.type,
          endDate: t.endDate || '',
          target: t.target || 1,
          unit: t.unit || '',
          subs: (props.subtasks || []).map((s) => ({ id: s.id, title: s.title })),
        }
      : { title: '', type: 'daily', endDate: '', target: 1, unit: '', subs: [] };
  },
  { immediate: true }
);

const canSave = computed(() => {
  const f = form.value;
  if (!f || !f.title.trim()) return false;
  if (f.type === 'deadline' && !f.endDate) return false;
  if (!Number.isSafeInteger(f.target) || f.target < 1) return false;
  if (Array.from(f.unit.trim()).length > 12) return false;
  return true;
});

function setChecklistMode() {
  if (!form.value) return;
  form.value.target = 1;
  form.value.unit = '';
}

function setQuantityMode() {
  if (!form.value || form.value.subs.length) return;
  form.value.target = Math.max(2, form.value.target || 2);
}

function addSubtask() {
  const current = form.value;
  if (!current) return;
  if (current.subs.length === 0 && current.target > 1) {
    const confirmed = window.confirm('添加子任务会把数量目标重置为清单模式，是否继续？');
    if (!confirmed) return;
    current.target = 1;
    current.unit = '';
  }
  current.subs.push({ title: '' });
}

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
    target: f.subs.length ? 1 : f.target,
    unit: f.subs.length || f.target === 1 ? '' : Array.from(f.unit.trim()).slice(0, 12).join(''),
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
}

.editor-sheet-enter-active,
.editor-sheet-leave-active {
  transition: background-color 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.editor-sheet-enter-active .sheet,
.editor-sheet-leave-active .sheet {
  transition:
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 240ms ease;
}

.editor-sheet-enter-active .sheet {
  transition-delay: 40ms;
}

.editor-sheet-enter-from,
.editor-sheet-leave-to {
  background-color: transparent;
}

.editor-sheet-enter-from .sheet,
.editor-sheet-leave-to .sheet {
  transform: translateY(72px) scale(0.985);
  opacity: 0;
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

.date-trigger {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 0 12px;
  background: var(--bg-elev);
  color: var(--text);
  font-size: 15px;
}

.date-trigger .placeholder {
  color: var(--text-3);
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

.seg button:disabled {
  opacity: 0.4;
  cursor: default;
}

.field-note {
  display: block;
  margin-top: 6px;
  color: var(--text-3);
  font-size: 12px;
}

.quantity-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
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

@media (prefers-reduced-motion: reduce) {
  .editor-sheet-enter-active,
  .editor-sheet-leave-active,
  .editor-sheet-enter-active .sheet,
  .editor-sheet-leave-active .sheet {
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
  }
}

@media (max-width: 380px) {
  .quantity-fields {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>

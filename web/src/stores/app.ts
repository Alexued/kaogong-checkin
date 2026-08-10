import { defineStore } from 'pinia';
import type { AppState, Task, Subtask, Checkin, Settings, SyncMessage, TimerRecord, DrillRecord, FormulaDrillRecord } from '../types';
import { enqueue } from '../api/sync';
import { buildProgressCheckin } from '../lib/plan';
import {
  STATE_SCHEMA_VERSION,
  normalizeAppMode,
  normalizeCheckinRecord,
  normalizeTarget,
  normalizeTaskRecord,
  normalizeUnit,
} from '../lib/stateMigration';

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

const ENTITY_KEY: Record<string, 'tasks' | 'subtasks' | 'checkins' | 'timers' | 'drills' | 'formulaDrills'> = {
  task: 'tasks',
  subtask: 'subtasks',
  checkin: 'checkins',
  timer: 'timers',
  drill: 'drills',
  formulaDrill: 'formulaDrills',
};

/** 与服务器一致的 last-write-wins 应用逻辑（按 updatedAt 字符串比较） */
function applyMsg(state: AppState, msg: SyncMessage) {
  const { kind, entity, payload } = msg;
  if (entity === 'settings') {
    if (kind === 'upsert' && (state.settings.updatedAt || '') <= (payload.updatedAt || '')) {
      const next = { ...state.settings, ...payload };
      state.settings = { ...next, appMode: normalizeAppMode(next.appMode) };
    }
    return;
  }
  const key = ENTITY_KEY[entity];
  if (!key) return;
  const arr = state[key] as { id: string; updatedAt: string }[];
  const idx = arr.findIndex((x) => x.id === payload.id);
  if (kind === 'upsert') {
    let next = idx >= 0 ? { ...arr[idx], ...payload } : payload;
    if (key === 'tasks') next = normalizeTaskRecord(next);
    if (key === 'checkins') next = normalizeCheckinRecord(next);
    if (idx >= 0) {
      if ((arr[idx].updatedAt || '') <= (payload.updatedAt || '')) arr[idx] = next;
    } else {
      arr.push(next);
    }
  } else if (kind === 'delete') {
    if (idx >= 0 && (arr[idx].updatedAt || '') <= (payload.updatedAt || '')) {
      // 软删除便于同步合并；task / subtask 为硬删除
      if (key !== 'tasks' && key !== 'subtasks') {
        const next = { ...arr[idx], ...payload, deleted: true };
        arr[idx] = key === 'checkins' ? normalizeCheckinRecord(next) : next;
      }
      else arr.splice(idx, 1);
    }
  }
}

export const useAppStore = defineStore('app', {
  state: () => ({
    schemaVersion: STATE_SCHEMA_VERSION as 2,
    tasks: [] as Task[],
    subtasks: [] as Subtask[],
    checkins: [] as Checkin[],
    timers: [] as TimerRecord[],
    drills: [] as DrillRecord[],
    formulaDrills: [] as FormulaDrillRecord[],
    settings: { appMode: 'exam', planEndDate: null, theme: 'light', markDate: null } as Settings,
    online: false,
    pendingSyncCount: 0,
    syncPhase: 'local' as 'local' | 'connecting' | 'pairing' | 'offline' | 'online',
    syncPairingRequired: false,
    syncServerId: '',
    syncServerName: '',
    syncProtocolVersion: 1,
    syncStateSchemaVersion: 1,
    syncStateSchemaCompatible: true,
    recoveryRequired: false,
    loaded: false,
  }),
  actions: {
    applySnapshot(s: AppState) {
      const settings = s.settings
        ? {
            ...this.settings,
            ...s.settings,
            appMode: normalizeAppMode((s.settings as Partial<Settings>).appMode),
          }
        : this.settings;
      this.schemaVersion = STATE_SCHEMA_VERSION;
      this.tasks = s.tasks || [];
      this.subtasks = s.subtasks || [];
      this.checkins = s.checkins || [];
      this.timers = s.timers || [];
      this.drills = s.drills || [];
      this.formulaDrills = s.formulaDrills || [];
      this.settings = settings;
    },
    /** 应用服务器广播的变更（其他客户端产生） */
    applyRemote(msg: SyncMessage) {
      applyMsg(this as unknown as AppState, msg);
    },
    /** 本地变更：乐观更新 + 入离线队列 */
    send(msg: SyncMessage) {
      if (this.recoveryRequired) return;
      applyMsg(this as unknown as AppState, msg);
      enqueue(msg);
    },

    /** Set one original due date's progress. Zero soft-deletes an existing record. */
    setProgress(taskId: string, date: string, progress: number, checkinId?: string) {
      const existing = checkinId
        ? this.checkins.find((checkin) => checkin.id === checkinId)
        : this.checkins
            .filter((checkin) => checkin.taskId === taskId && checkin.date === date)
            .sort((left, right) => (right.updatedAt || '').localeCompare(left.updatedAt || ''))[0];
      const task = this.tasks.find((candidate) => candidate.id === taskId);
      const timestamp = now();
      const next = buildProgressCheckin(task, taskId, date, progress, existing, timestamp, uid());
      if (!next) return;
      this.send({ kind: 'upsert', entity: 'checkin', payload: next });
    },

    incrementProgress(taskId: string, date: string, checkinId?: string) {
      const existing = checkinId
        ? this.checkins.find((checkin) => checkin.id === checkinId)
        : this.checkins.find((checkin) => checkin.taskId === taskId && checkin.date === date && !checkin.deleted);
      this.setProgress(taskId, date, (existing?.deleted ? 0 : existing?.progress || 0) + 1, existing?.id);
    },

    decrementProgress(taskId: string, date: string, checkinId?: string) {
      const existing = checkinId
        ? this.checkins.find((checkin) => checkin.id === checkinId)
        : this.checkins.find((checkin) => checkin.taskId === taskId && checkin.date === date && !checkin.deleted);
      this.setProgress(taskId, date, Math.max(0, (existing?.deleted ? 0 : existing?.progress || 0) - 1), existing?.id);
    },

    /** Binary compatibility wrapper. Backfill dates remain traceable. */
    toggleCheckin(taskId: string, date: string, checkinId?: string) {
      const existing = checkinId ? this.checkins.find((checkin) => checkin.id === checkinId) : undefined;
      this.setProgress(taskId, date, existing && !existing.deleted && existing.progress > 0 ? 0 : 1, checkinId);
    },

    /** 保存任务；返回任务 id（新建时为生成的 id，便于继续挂子任务） */
    saveTask(partial: Partial<Task> & { title: string; type: Task['type'] }): string | undefined {
      const t = now();
      if (partial.id) {
        const cur = this.tasks.find((x) => x.id === partial.id);
        if (!cur) return undefined;
        const hasSubtasks = this.subtasks.some((subtask) => subtask.taskId === partial.id);
        const target = hasSubtasks ? 1 : normalizeTarget(partial.target ?? cur.target);
        this.send({
          kind: 'upsert',
          entity: 'task',
          payload: normalizeTaskRecord({
            ...cur,
            ...partial,
            target,
            unit: target === 1 ? '' : normalizeUnit(partial.unit ?? cur.unit),
            updatedAt: t,
          }),
        });
        return partial.id;
      } else {
        const id = uid();
        const order = this.tasks.reduce((m, x) => Math.max(m, x.order), -1) + 1;
        const target = normalizeTarget(partial.target);
        this.send({
          kind: 'upsert',
          entity: 'task',
          payload: {
            id,
            title: partial.title,
            type: partial.type,
            endDate: partial.endDate || null,
            createdAt: t,
            updatedAt: t,
            archived: false,
            order,
            target,
            unit: target === 1 ? '' : normalizeUnit(partial.unit),
          } as Task,
        });
        return id;
      }
    },

    /** 全量保存某任务的子任务列表（编辑器用）：按 id 增删改，order 按数组顺序重写 */
    saveSubtasks(taskId: string, list: { id?: string; title: string }[]) {
      const t = now();
      if (list.some((item) => item.title.trim())) {
        const task = this.tasks.find((candidate) => candidate.id === taskId);
        if (task && (task.target !== 1 || task.unit !== '')) {
          this.send({
            kind: 'upsert',
            entity: 'task',
            payload: { ...task, target: 1, unit: '', updatedAt: t },
          });
        }
      }
      const cur = this.subtasks.filter((s) => s.taskId === taskId);
      const kept = new Set(list.filter((x) => x.id).map((x) => x.id));
      for (const s of cur) {
        if (!kept.has(s.id)) {
          for (const checkin of this.checkins.filter((x) => x.taskId === s.id)) {
            this.send({ kind: 'delete', entity: 'checkin', payload: { ...checkin, updatedAt: t, deleted: true } });
          }
          this.send({ kind: 'delete', entity: 'subtask', payload: { id: s.id, updatedAt: t } });
        }
      }
      list.forEach((x, i) => {
        const title = x.title.trim();
        if (!title) return;
        if (x.id) {
          const old = this.subtasks.find((s) => s.id === x.id);
          if (old && (old.title !== title || old.order !== i)) {
            this.send({
              kind: 'upsert',
              entity: 'subtask',
              payload: { ...old, title, order: i, updatedAt: t },
            });
          }
        } else {
          this.send({
            kind: 'upsert',
            entity: 'subtask',
            payload: { id: uid(), taskId, title, order: i, createdAt: t, updatedAt: t },
          });
        }
      });
    },

    /**
     * 交换两个任务的排序值（今日页排序模式用）。
     * 任务顺序是全局的，每日计划都按它排列，故调整后后续天数顺序同步变化。
     */
    swapTaskOrder(idA: string, idB: string) {
      // 若历史数据存在重复 order，先按当前顺序整体规范化为 0..n-1
      const sorted = this.tasks
        .slice()
        .sort((x, y) => x.order - y.order || x.createdAt.localeCompare(y.createdAt));
      const t = now();
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].order !== i) {
          const cur = this.tasks.find((x) => x.id === sorted[i].id);
          if (cur) {
            this.send({ kind: 'upsert', entity: 'task', payload: { ...cur, order: i, updatedAt: t } });
          }
        }
      }
      const a = this.tasks.find((x) => x.id === idA);
      const b = this.tasks.find((x) => x.id === idB);
      if (!a || !b || a.order === b.order) return;
      this.send({ kind: 'upsert', entity: 'task', payload: { ...a, order: b.order, updatedAt: t } });
      this.send({ kind: 'upsert', entity: 'task', payload: { ...b, order: a.order, updatedAt: t } });
    },

    setArchived(id: string, archived: boolean) {
      const cur = this.tasks.find((x) => x.id === id);
      if (!cur) return;
      this.send({
        kind: 'upsert',
        entity: 'task',
        payload: { ...cur, archived, updatedAt: now() },
      });
    },

    deleteTask(id: string) {
      const t = now();
      // Preserve timer history while tombstoning progress references before hard deletion.
      const subtaskIds = new Set(this.subtasks.filter((x) => x.taskId === id).map((x) => x.id));
      for (const checkin of this.checkins.filter((x) => x.taskId === id || subtaskIds.has(x.taskId))) {
        this.send({ kind: 'delete', entity: 'checkin', payload: { ...checkin, updatedAt: t, deleted: true } });
      }
      for (const timer of this.timers.filter((x) => x.taskId === id)) {
        this.send({ kind: 'upsert', entity: 'timer', payload: { ...timer, taskId: null, updatedAt: t } });
      }
      for (const s of this.subtasks.filter((x) => x.taskId === id)) {
        this.send({ kind: 'delete', entity: 'subtask', payload: { id: s.id, updatedAt: t } });
      }
      this.send({ kind: 'delete', entity: 'task', payload: { id, updatedAt: t } });
    },

    /** 保存一条计时记录（结束后调用） */
    saveTimer(record: Omit<TimerRecord, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>) {
      const t = now();
      this.send({
        kind: 'upsert',
        entity: 'timer',
        payload: { ...record, id: uid(), createdAt: t, updatedAt: t, deleted: false },
      });
    },

    deleteTimer(id: string) {
      this.send({ kind: 'delete', entity: 'timer', payload: { id, updatedAt: now() } });
    },

    /** 记录一次背诵作答 */
    saveDrill(record: Omit<DrillRecord, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>) {
      const t = now();
      this.send({
        kind: 'upsert',
        entity: 'drill',
        payload: { ...record, id: uid(), createdAt: t, updatedAt: t, deleted: false },
      });
    },

    /** 清空全部背诵记录（软删除） */
    clearDrills() {
      const t = now();
      for (const d of this.drills) {
        if (!d.deleted) this.send({ kind: 'delete', entity: 'drill', payload: { id: d.id, updatedAt: t } });
      }
    },

    /** 记录一次公式背诵自评 */
    saveFormulaDrill(record: Omit<FormulaDrillRecord, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>) {
      const t = now();
      this.send({
        kind: 'upsert',
        entity: 'formulaDrill',
        payload: { ...record, id: uid(), createdAt: t, updatedAt: t, deleted: false },
      });
    },

    saveSettings(patch: Partial<Settings>) {
      this.send({
        kind: 'upsert',
        entity: 'settings',
        payload: { ...this.settings, ...patch, updatedAt: now() },
      });
    },
  },
});

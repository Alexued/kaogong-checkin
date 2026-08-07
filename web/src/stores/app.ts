import { defineStore } from 'pinia';
import type { AppState, Task, Subtask, Checkin, Settings, SyncMessage, TimerRecord, DrillRecord, FormulaDrillRecord } from '../types';
import { enqueue } from '../api/sync';

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
      state.settings = payload;
    }
    return;
  }
  const key = ENTITY_KEY[entity];
  if (!key) return;
  const arr = state[key] as { id: string; updatedAt: string }[];
  const idx = arr.findIndex((x) => x.id === payload.id);
  if (kind === 'upsert') {
    if (idx >= 0) {
      if ((arr[idx].updatedAt || '') <= (payload.updatedAt || '')) arr[idx] = payload;
    } else {
      arr.push(payload);
    }
  } else if (kind === 'delete') {
    if (idx >= 0 && (arr[idx].updatedAt || '') <= (payload.updatedAt || '')) {
      // 软删除便于同步合并；task / subtask 为硬删除
      if (key !== 'tasks' && key !== 'subtasks') arr[idx] = { ...arr[idx], ...payload, deleted: true };
      else arr.splice(idx, 1);
    }
  }
}

export const useAppStore = defineStore('app', {
  state: () => ({
    tasks: [] as Task[],
    subtasks: [] as Subtask[],
    checkins: [] as Checkin[],
    timers: [] as TimerRecord[],
    drills: [] as DrillRecord[],
    formulaDrills: [] as FormulaDrillRecord[],
    settings: { planEndDate: null, theme: 'light', markDate: null } as Settings,
    online: false,
    pendingSyncCount: 0,
    syncPhase: 'local' as 'local' | 'connecting' | 'pairing' | 'offline' | 'online',
    syncPairingRequired: false,
    syncServerId: '',
    syncServerName: '',
    syncProtocolVersion: 1,
    loaded: false,
  }),
  actions: {
    applySnapshot(s: AppState) {
      this.tasks = s.tasks || [];
      this.subtasks = s.subtasks || [];
      this.checkins = s.checkins || [];
      this.timers = s.timers || [];
      this.drills = s.drills || [];
      this.formulaDrills = s.formulaDrills || [];
      if (s.settings) this.settings = s.settings;
    },
    /** 应用服务器广播的变更（其他客户端产生） */
    applyRemote(msg: SyncMessage) {
      applyMsg(this as unknown as AppState, msg);
    },
    /** 本地变更：乐观更新 + 入离线队列 */
    send(msg: SyncMessage) {
      applyMsg(this as unknown as AppState, msg);
      enqueue(msg);
    },

    /** 打卡 / 取消打卡。补卡时 date 传原始日期。 */
    toggleCheckin(taskId: string, date: string, checkinId?: string) {
      if (checkinId) {
        const c = this.checkins.find((x) => x.id === checkinId);
        if (c) {
          this.send({
            kind: 'upsert',
            entity: 'checkin',
            payload: { ...c, deleted: true, updatedAt: now() },
          });
        }
      } else {
        const t = now();
        this.send({
          kind: 'upsert',
          entity: 'checkin',
          payload: { id: uid(), taskId, date, createdAt: t, updatedAt: t, deleted: false },
        });
      }
    },

    /** 保存任务；返回任务 id（新建时为生成的 id，便于继续挂子任务） */
    saveTask(partial: Partial<Task> & { title: string; type: Task['type'] }): string | undefined {
      const t = now();
      if (partial.id) {
        const cur = this.tasks.find((x) => x.id === partial.id);
        if (!cur) return undefined;
        this.send({
          kind: 'upsert',
          entity: 'task',
          payload: { ...cur, ...partial, updatedAt: t },
        });
        return partial.id;
      } else {
        const id = uid();
        const order = this.tasks.reduce((m, x) => Math.max(m, x.order), -1) + 1;
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
          } as Task,
        });
        return id;
      }
    },

    /** 全量保存某任务的子任务列表（编辑器用）：按 id 增删改，order 按数组顺序重写 */
    saveSubtasks(taskId: string, list: { id?: string; title: string }[]) {
      const t = now();
      const cur = this.subtasks.filter((s) => s.taskId === taskId);
      const kept = new Set(list.filter((x) => x.id).map((x) => x.id));
      for (const s of cur) {
        if (!kept.has(s.id)) {
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
      // 级联删除其子任务（打卡记录保留）
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

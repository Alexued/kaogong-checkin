import type { AppState, Checkin, SyncMessage } from '../types';
import { migrateAppState, normalizeTarget, normalizeUnit } from '../lib/stateMigration';
import {
  emptyDomainState,
  validateDomainState,
  type DailyProgressV3,
  type DomainStateV3,
  type DrillAttemptV3,
  type SubtaskV3,
  type TaskV3,
  type TimerSessionV3,
} from './v3';

interface JsonRecord {
  [key: string]: any;
}

export interface MigrationReportV3 {
  sourceSchemaVersion: 1 | 2;
  duplicateCount: number;
  normalizedCount: number;
  orphanCount: number;
}

export interface LegacyMigrationResultV3 {
  state: DomainStateV3;
  report: MigrationReportV3;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function timestamp(value: unknown, fallback: string): string {
  const candidate = typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
  if (Number.isNaN(Date.parse(candidate))) throw new Error('INVALID_TIMESTAMP');
  return candidate;
}

function localDate(value: string): string {
  const candidate = value.slice(0, 10);
  const [year, month, day] = candidate.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate) || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error('INVALID_DATE');
  }
  return candidate;
}

function compareRecord(left: JsonRecord, right: JsonRecord): number {
  return String(left.updatedAt || '').localeCompare(String(right.updatedAt || '')) || String(left.id || '').localeCompare(String(right.id || ''));
}

function applyLegacyMessage(state: AppState, message: SyncMessage): void {
  if (!isRecord(message) || (message.kind !== 'upsert' && message.kind !== 'delete') || typeof message.entity !== 'string' || !isRecord(message.payload)) {
    throw new Error('INVALID_LEGACY_QUEUE');
  }
  const payload = message.payload as JsonRecord;
  if (message.entity === 'settings') {
    if (message.kind === 'upsert' && (state.settings.updatedAt || '') <= (payload.updatedAt || '')) state.settings = { ...state.settings, ...clone(payload) };
    return;
  }
  const key = ({ task: 'tasks', subtask: 'subtasks', checkin: 'checkins', timer: 'timers', drill: 'drills', formulaDrill: 'formulaDrills' } as Record<string, keyof AppState>)[message.entity];
  if (!key) throw new Error('INVALID_LEGACY_ENTITY');
  const collection = state[key] as Array<JsonRecord>;
  const index = collection.findIndex((item) => item.id === payload.id);
  if (message.kind === 'upsert') {
    if (index < 0) collection.push(clone(payload));
    else if (compareRecord(collection[index], payload) <= 0) collection[index] = { ...collection[index], ...clone(payload) };
    return;
  }
  if (index < 0) return;
  if (compareRecord(collection[index], payload) > 0) return;
  if (key === 'tasks' || key === 'subtasks') collection.splice(index, 1);
  else collection[index] = { ...collection[index], ...clone(payload), deleted: true };
}

function replayQueue(state: AppState, rawQueue: string): void {
  if (!rawQueue) return;
  const queue = JSON.parse(rawQueue) as unknown;
  if (!Array.isArray(queue)) throw new Error('INVALID_LEGACY_QUEUE');
  for (const message of queue) applyLegacyMessage(state, message as SyncMessage);
}

function chooseWinner(records: JsonRecord[]): JsonRecord | undefined {
  return records.slice().sort(compareRecord).at(-1);
}

function mapTask(source: JsonRecord, subtasks: SubtaskV3[], report: MigrationReportV3): TaskV3 {
  const createdAt = timestamp(source.createdAt, new Date(0).toISOString());
  const updatedAt = timestamp(source.updatedAt, createdAt);
  const startDate = localDate(createdAt);
  let endDate = source.endDate === null || source.endDate === undefined ? null : String(source.endDate);
  if (endDate !== null) {
    try { localDate(`${endDate}T00:00:00.000Z`); } catch { throw new Error('INVALID_DATE'); }
  }
  if (source.type === 'deadline' && endDate === null) {
    endDate = startDate;
    report.normalizedCount += 1;
  }
  const hasSubtasks = subtasks.length > 0;
  const sourceTarget = normalizeTarget(source.target);
  const quantity = !hasSubtasks && sourceTarget > 1;
  return {
    id: String(source.id),
    title: String(source.title || '').trim(),
    schedule: { kind: source.type === 'deadline' ? 'deadline' : 'daily', startDate, endDate },
    completion: { kind: quantity ? 'quantity' : 'checklist', target: quantity ? sourceTarget : 1, unit: quantity ? normalizeUnit(source.unit) : '' },
    subtasks: subtasks.slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    order: Number.isSafeInteger(source.order) && source.order >= 0 ? source.order : 0,
    archivedAt: source.archived ? updatedAt : null,
    deletedAt: null,
    createdAt,
    updatedAt,
  };
}

function mapTimer(source: JsonRecord): TimerSessionV3 {
  const createdAt = timestamp(source.createdAt, new Date(0).toISOString());
  return {
    id: String(source.id),
    label: typeof source.label === 'string' ? source.label : '',
    taskId: source.taskId === null || source.taskId === undefined ? null : String(source.taskId),
    date: localDate(`${String(source.date || createdAt.slice(0, 10))}T00:00:00.000Z`),
    startedAt: timestamp(source.startedAt, createdAt),
    durationMs: Number(source.durationMs),
    laps: Array.isArray(source.laps) ? source.laps.map((lap) => ({ elapsedMs: Number(lap.elapsedMs), splitMs: Number(lap.splitMs) })) : [],
    mode: source.mode === 'countdown' ? 'countdown' : 'stopwatch',
    createdAt,
    updatedAt: timestamp(source.updatedAt, createdAt),
    deletedAt: source.deleted ? timestamp(source.updatedAt, createdAt) : null,
  };
}

function mapAttempts(state: AppState): DrillAttemptV3[] {
  const percent = state.drills.map((source) => ({
    id: String(source.id), kind: 'percent' as const, catalogKey: String(source.percent), sessionId: String(source.sessionId), mode: source.mode,
    answer: typeof source.userAnswer === 'string' ? source.userAnswer : null, correct: Boolean(source.correct), known: null,
    createdAt: source.createdAt, updatedAt: source.updatedAt, deletedAt: source.deleted ? source.updatedAt : null,
  }));
  const formula = state.formulaDrills.map((source) => ({
    id: String(source.id), kind: 'formula' as const, catalogKey: String(source.formulaKey), sessionId: String(source.sessionId), mode: source.mode,
    answer: null, correct: null, known: Boolean(source.known), createdAt: source.createdAt, updatedAt: source.updatedAt, deletedAt: source.deleted ? source.updatedAt : null,
  }));
  return [...percent, ...formula];
}

export function migrateLegacyToV3(rawState: string, rawQueue = ''): LegacyMigrationResultV3 {
  const parsed = JSON.parse(rawState) as unknown;
  if (!isRecord(parsed)) throw new Error('INVALID_STATE_SHAPE');
  const sourceVersion = parsed.schemaVersion === undefined ? 1 : Number(parsed.schemaVersion);
  if (sourceVersion !== 1 && sourceVersion !== 2) throw new Error('UNSUPPORTED_STATE_VERSION');
  const state = migrateAppState(parsed);
  replayQueue(state, rawQueue);
  const report: MigrationReportV3 = { sourceSchemaVersion: sourceVersion, duplicateCount: 0, normalizedCount: 0, orphanCount: 0 };
  const output = emptyDomainState();
  const subtaskParent = new Map<string, string>();
  const subtasksByTask = new Map<string, SubtaskV3[]>();
  for (const source of state.subtasks) {
    if (!state.tasks.some((task) => task.id === source.taskId)) { report.orphanCount += 1; throw new Error('ORPHAN_SUBTASK'); }
    const mapped: SubtaskV3 = {
      id: source.id, title: source.title.trim(), order: Number.isSafeInteger(source.order) && source.order >= 0 ? source.order : 0,
      createdAt: timestamp(source.createdAt, new Date(0).toISOString()), updatedAt: timestamp(source.updatedAt, source.createdAt || new Date(0).toISOString()), deletedAt: null,
    };
    subtaskParent.set(mapped.id, source.taskId);
    const list = subtasksByTask.get(source.taskId) || [];
    list.push(mapped); subtasksByTask.set(source.taskId, list);
  }
  for (const task of state.tasks) output.tasks.push(mapTask(task, subtasksByTask.get(task.id) || [], report));
  const checkinsByGroup = new Map<string, { parent: JsonRecord[]; children: Map<string, JsonRecord[]> }>();
  for (const source of state.checkins as unknown as JsonRecord[]) {
    const parentId = subtaskParent.get(String(source.taskId)) || String(source.taskId);
    if (!state.tasks.some((task) => task.id === parentId)) { report.orphanCount += 1; throw new Error('ORPHAN_CHECKIN'); }
    const date = String(source.date);
    const key = `${parentId}\u0000${date}`;
    const group = checkinsByGroup.get(key) || { parent: [], children: new Map<string, JsonRecord[]>() };
    if (subtaskParent.has(String(source.taskId))) {
      const list = group.children.get(String(source.taskId)) || [];
      list.push(source); group.children.set(String(source.taskId), list);
    } else group.parent.push(source);
    checkinsByGroup.set(key, group);
  }
  for (const [key, group] of checkinsByGroup) {
    const [taskId, date] = key.split('\u0000');
    const task = output.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new Error('ORPHAN_CHECKIN');
    const all = [...group.parent, ...[...group.children.values()].flat()];
    const parent = chooseWinner(group.parent);
    if (group.parent.length > 1 || [...group.children.values()].some((items) => items.length > 1)) report.duplicateCount += 1;
    const targetSnapshot = parent ? normalizeTarget(parent.targetSnapshot) : task.completion.target;
    const completed = parent && !parent.deleted ? Math.min(targetSnapshot, Math.max(0, Number(parent.progress))) : 0;
    const subtaskSnapshot = task.subtasks.map((subtask) => {
      const winner = chooseWinner(group.children.get(subtask.id) || []);
      return { id: subtask.id, title: subtask.title, done: Boolean(winner && !winner.deleted && Number(winner.progress) > 0) };
    });
    const createdAt = all.map((item) => timestamp(item.createdAt, timestamp(item.updatedAt, new Date(0).toISOString()))).sort()[0];
    const updatedAt = all.map((item) => timestamp(item.updatedAt, createdAt)).sort().at(-1) || createdAt;
    const active = Boolean((parent && !parent.deleted && completed > 0) || subtaskSnapshot.some((item) => item.done));
    const progress: DailyProgressV3 = {
      id: parent?.id || `progress-${encodeURIComponent(taskId)}-${encodeURIComponent(date)}`,
      taskId, date, completed, targetSnapshot, unitSnapshot: normalizeUnit(parent?.unitSnapshot ?? task.completion.unit),
      subtaskSnapshot, createdAt, updatedAt, deletedAt: active ? null : updatedAt,
    };
    output.dailyProgress.push(progress);
  }
  output.timerSessions = state.timers.map((timer) => mapTimer(timer as unknown as JsonRecord));
  output.drillAttempts = mapAttempts(state);
  output.settings = {
    planEndDate: state.settings.planEndDate || null,
    theme: state.settings.theme === 'dark' ? 'dark' : 'light',
    markDate: state.settings.markDate || null,
    startupAnimationEnabled: true,
    timerLapFontSize: 17,
  };
  validateDomainState(output);
  return { state: output, report };
}

import type { AppMode } from '../types';

export const DOMAIN_SCHEMA_VERSION = 3 as const;

export interface SubtaskV3 {
  id: string;
  title: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TaskV3 {
  id: string;
  title: string;
  schedule: {
    kind: 'daily' | 'deadline';
    startDate: string;
    endDate: string | null;
  };
  completion: {
    kind: 'checklist' | 'quantity';
    target: number;
    unit: string;
  };
  subtasks: SubtaskV3[];
  order: number;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailyProgressV3 {
  id: string;
  taskId: string;
  date: string;
  completed: number;
  targetSnapshot: number;
  unitSnapshot: string;
  subtaskSnapshot: Array<{ id: string; title: string; done: boolean }>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TimerSessionV3 {
  id: string;
  label: string;
  taskId: string | null;
  date: string;
  startedAt: string;
  durationMs: number;
  laps: Array<{ elapsedMs: number; splitMs: number }>;
  mode: 'stopwatch' | 'countdown';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DrillAttemptV3 {
  id: string;
  kind: 'percent' | 'formula';
  catalogKey: string;
  sessionId: string;
  mode: 'full' | 'random';
  answer: string | null;
  correct: boolean | null;
  known: boolean | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SettingsV3 {
  appMode: AppMode;
  planEndDate: string | null;
  theme: 'light' | 'dark';
  markDate: string | null;
  startupAnimationEnabled: boolean;
  timerLapFontSize: number;
}

export interface DomainStateV3 {
  tasks: TaskV3[];
  dailyProgress: DailyProgressV3[];
  timerSessions: TimerSessionV3[];
  drillAttempts: DrillAttemptV3[];
  settings: SettingsV3;
}

export interface StorageEnvelopeV3 {
  schemaVersion: 3;
  revision: number;
  deviceId: string;
  savedAt: string;
  state: DomainStateV3;
}

export class DomainValidationError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = 'DomainValidationError';
    this.code = code;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[^\u0000]{1,128}$/;

function fail(code: string, message?: string): never {
  throw new DomainValidationError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function requireId(value: unknown, code: string): asserts value is string {
  if (typeof value !== 'string' || !ID_RE.test(value)) fail(code);
}

function requireTimestamp(value: unknown, code: string) {
  if (!validTimestamp(value)) fail(code);
}

function requireDate(value: unknown, code: string) {
  if (!validDate(value)) fail(code);
}

function requireSafeInt(value: unknown, code: string, min = 0) {
  if (!Number.isSafeInteger(value) || (value as number) < min) fail(code);
}

function requireUnit(value: unknown, code: string) {
  if (typeof value !== 'string' || value !== value.trim() || Array.from(value).length > 12) fail(code);
}

function requireNullableTimestamp(value: unknown, code: string) {
  if (value !== null) requireTimestamp(value, code);
}

function requireTask(task: TaskV3, ids: Set<string>) {
  if (!isRecord(task)) fail('TASK_SHAPE');
  requireId(task.id, 'TASK_ID');
  if (ids.has(task.id)) fail('DUPLICATE_TASK_ID');
  ids.add(task.id);
  if (typeof task.title !== 'string' || !task.title.trim() || Array.from(task.title).length > 256) fail('TASK_TITLE');
  if (!isRecord(task.schedule)) fail('TASK_SCHEDULE');
  if (task.schedule.kind !== 'daily' && task.schedule.kind !== 'deadline') fail('TASK_SCHEDULE_KIND');
  requireDate(task.schedule.startDate, 'TASK_START_DATE');
  if (task.schedule.endDate !== null) requireDate(task.schedule.endDate, 'TASK_END_DATE');
  if (task.schedule.kind === 'deadline' && task.schedule.endDate === null) fail('DEADLINE_END_DATE');
  if (task.schedule.endDate && task.schedule.endDate < task.schedule.startDate) fail('TASK_DATE_ORDER');
  if (!isRecord(task.completion)) fail('TASK_COMPLETION');
  if (!Array.isArray(task.subtasks)) fail('TASK_SUBTASKS');
  if (task.completion.kind !== 'checklist' && task.completion.kind !== 'quantity') fail('TASK_COMPLETION_KIND');
  if (task.completion.kind === 'checklist') {
    if (task.completion.target !== 1 || task.completion.unit !== '') fail('CHECKLIST_COMPLETION');
  } else {
    requireSafeInt(task.completion.target, 'QUANTITY_TARGET', 2);
    requireUnit(task.completion.unit, 'QUANTITY_UNIT');
    if (task.subtasks.length > 0) fail('QUANTITY_SUBTASK_CONFLICT');
  }
  requireSafeInt(task.order, 'TASK_ORDER');
  requireNullableTimestamp(task.archivedAt, 'TASK_ARCHIVED_AT');
  requireNullableTimestamp(task.deletedAt, 'TASK_DELETED_AT');
  requireTimestamp(task.createdAt, 'TASK_CREATED_AT');
  requireTimestamp(task.updatedAt, 'TASK_UPDATED_AT');
  const subtaskIds = new Set<string>();
  for (const subtask of task.subtasks) {
    requireId(subtask.id, 'SUBTASK_ID');
    if (subtaskIds.has(subtask.id)) fail('DUPLICATE_SUBTASK_ID');
    subtaskIds.add(subtask.id);
    if (typeof subtask.title !== 'string' || !subtask.title.trim() || Array.from(subtask.title).length > 256) fail('SUBTASK_TITLE');
    requireSafeInt(subtask.order, 'SUBTASK_ORDER');
    requireTimestamp(subtask.createdAt, 'SUBTASK_CREATED_AT');
    requireTimestamp(subtask.updatedAt, 'SUBTASK_UPDATED_AT');
    requireNullableTimestamp(subtask.deletedAt, 'SUBTASK_DELETED_AT');
  }
}

export function validateDomainState(state: DomainStateV3): void {
  if (!isRecord(state)) fail('STATE_SHAPE');
  if (!Array.isArray(state.tasks) || !Array.isArray(state.dailyProgress) || !Array.isArray(state.timerSessions) || !Array.isArray(state.drillAttempts)) {
    fail('STATE_COLLECTIONS');
  }
  if (!isRecord(state.settings)) fail('SETTINGS_SHAPE');
  const taskIds = new Set<string>();
  const allSubtaskIds = new Set<string>();
  for (const task of state.tasks) {
    requireTask(task, taskIds);
    for (const subtask of task.subtasks) {
      if (allSubtaskIds.has(subtask.id)) fail('DUPLICATE_SUBTASK_ID');
      allSubtaskIds.add(subtask.id);
    }
  }
  const progressKeys = new Set<string>();
  const timerIds = new Set<string>();
  const attemptIds = new Set<string>();
  for (const progress of state.dailyProgress) {
    requireId(progress.id, 'PROGRESS_ID');
    requireId(progress.taskId, 'PROGRESS_TASK_ID');
    if (!taskIds.has(progress.taskId)) fail('ORPHAN_PROGRESS');
    requireDate(progress.date, 'PROGRESS_DATE');
    const key = `${progress.taskId}\u0000${progress.date}`;
    if (progressKeys.has(key)) fail('DUPLICATE_PROGRESS');
    progressKeys.add(key);
    requireSafeInt(progress.completed, 'PROGRESS_COMPLETED');
    requireSafeInt(progress.targetSnapshot, 'PROGRESS_TARGET', 1);
    if (progress.completed > progress.targetSnapshot) fail('PROGRESS_RANGE');
    requireUnit(progress.unitSnapshot, 'PROGRESS_UNIT');
    if (!Array.isArray(progress.subtaskSnapshot)) fail('PROGRESS_SUBTASKS');
    const snapshotIds = new Set<string>();
    const taskSubtaskIds = new Set((state.tasks.find((task) => task.id === progress.taskId)?.subtasks || []).map((subtask) => subtask.id));
    for (const item of progress.subtaskSnapshot) {
      requireId(item.id, 'PROGRESS_SUBTASK_ID');
      if (!taskSubtaskIds.has(item.id)) fail('ORPHAN_PROGRESS_SUBTASK');
      if (snapshotIds.has(item.id)) fail('DUPLICATE_PROGRESS_SUBTASK');
      snapshotIds.add(item.id);
      if (typeof item.title !== 'string' || !item.title.trim()) fail('PROGRESS_SUBTASK_TITLE');
      if (typeof item.done !== 'boolean') fail('PROGRESS_SUBTASK_DONE');
    }
    requireTimestamp(progress.createdAt, 'PROGRESS_CREATED_AT');
    requireTimestamp(progress.updatedAt, 'PROGRESS_UPDATED_AT');
    requireNullableTimestamp(progress.deletedAt, 'PROGRESS_DELETED_AT');
  }
  for (const timer of state.timerSessions) {
    requireId(timer.id, 'TIMER_ID');
    if (timerIds.has(timer.id)) fail('DUPLICATE_TIMER_ID');
    timerIds.add(timer.id);
    if (typeof timer.label !== 'string' || Array.from(timer.label).length > 256) fail('TIMER_LABEL');
    if (timer.taskId !== null && !taskIds.has(timer.taskId)) fail('ORPHAN_TIMER');
    requireDate(timer.date, 'TIMER_DATE');
    requireTimestamp(timer.startedAt, 'TIMER_STARTED_AT');
    if (typeof timer.durationMs !== 'number' || !Number.isSafeInteger(timer.durationMs) || timer.durationMs < 0) fail('TIMER_DURATION');
    if (!Array.isArray(timer.laps) || timer.laps.some((lap) => !isRecord(lap) || !Number.isSafeInteger(lap.elapsedMs) || lap.elapsedMs < 0 || !Number.isSafeInteger(lap.splitMs) || lap.splitMs < 0)) fail('TIMER_LAPS');
    if (timer.mode !== 'stopwatch' && timer.mode !== 'countdown') fail('TIMER_MODE');
    requireTimestamp(timer.createdAt, 'TIMER_CREATED_AT');
    requireTimestamp(timer.updatedAt, 'TIMER_UPDATED_AT');
    requireNullableTimestamp(timer.deletedAt, 'TIMER_DELETED_AT');
  }
  for (const attempt of state.drillAttempts) {
    requireId(attempt.id, 'ATTEMPT_ID');
    if (attemptIds.has(attempt.id)) fail('DUPLICATE_ATTEMPT_ID');
    attemptIds.add(attempt.id);
    if (attempt.kind !== 'percent' && attempt.kind !== 'formula') fail('ATTEMPT_KIND');
    requireId(attempt.catalogKey, 'ATTEMPT_CATALOG_KEY');
    requireId(attempt.sessionId, 'ATTEMPT_SESSION_ID');
    if (attempt.mode !== 'full' && attempt.mode !== 'random') fail('ATTEMPT_MODE');
    if (attempt.answer !== null && typeof attempt.answer !== 'string') fail('ATTEMPT_ANSWER');
    if (attempt.correct !== null && typeof attempt.correct !== 'boolean') fail('ATTEMPT_CORRECT');
    if (attempt.known !== null && typeof attempt.known !== 'boolean') fail('ATTEMPT_KNOWN');
    requireTimestamp(attempt.createdAt, 'ATTEMPT_CREATED_AT');
    requireTimestamp(attempt.updatedAt, 'ATTEMPT_UPDATED_AT');
    requireNullableTimestamp(attempt.deletedAt, 'ATTEMPT_DELETED_AT');
  }
  if (state.settings.planEndDate !== null) requireDate(state.settings.planEndDate, 'SETTINGS_PLAN_DATE');
  if (state.settings.markDate !== null) requireDate(state.settings.markDate, 'SETTINGS_MARK_DATE');
  if (state.settings.appMode !== 'exam' && state.settings.appMode !== 'general') fail('SETTINGS_APP_MODE');
  if (state.settings.theme !== 'light' && state.settings.theme !== 'dark') fail('SETTINGS_THEME');
  if (typeof state.settings.startupAnimationEnabled !== 'boolean') fail('SETTINGS_ANIMATION');
  if (!Number.isSafeInteger(state.settings.timerLapFontSize) || state.settings.timerLapFontSize < 13 || state.settings.timerLapFontSize > 24) fail('SETTINGS_FONT_SIZE');
}

export function emptyDomainState(): DomainStateV3 {
  return {
    tasks: [],
    dailyProgress: [],
    timerSessions: [],
    drillAttempts: [],
    settings: {
      appMode: 'exam',
      planEndDate: null,
      theme: 'light',
      markDate: null,
      startupAnimationEnabled: true,
      timerLapFontSize: 17,
    },
  };
}

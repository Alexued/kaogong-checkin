import type { AppMode, AppState, Checkin, Task } from '../types';

export const STATE_SCHEMA_VERSION = 2 as const;
export const V1_BACKUP_KEY = 'kgc-state-v1-backup';

const COLLECTION_KEYS = [
  'tasks',
  'subtasks',
  'checkins',
  'timers',
  'drills',
  'formulaDrills',
] as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function normalizeTarget(value: unknown): number {
  const target = Number(value);
  return Number.isSafeInteger(target) && target > 0 ? target : 1;
}

export function normalizeUnit(value: unknown): string {
  if (typeof value !== 'string') return '';
  return Array.from(value.trim()).slice(0, 12).join('');
}

export function normalizeAppMode(value: unknown): AppMode {
  if (value === undefined) return 'exam';
  if (value === 'exam' || value === 'general') return value;
  throw new Error('invalid app mode');
}

export function normalizeTaskRecord(value: unknown): Task {
  if (!isRecord(value)) throw new Error('invalid task record');
  return {
    ...cloneJson(value),
    target: normalizeTarget(value.target),
    unit: normalizeUnit(value.unit),
  } as unknown as Task;
}

export function normalizeCheckinRecord(value: unknown): Checkin {
  if (!isRecord(value)) throw new Error('invalid checkin record');
  const targetSnapshot = normalizeTarget(value.targetSnapshot);
  const numericProgress = Number(value.progress);
  const progress = Number.isSafeInteger(numericProgress)
    ? Math.min(targetSnapshot, Math.max(0, numericProgress))
    : 1;
  return {
    ...cloneJson(value),
    progress: Math.min(targetSnapshot, progress),
    targetSnapshot,
    unitSnapshot: normalizeUnit(value.unitSnapshot),
  } as unknown as Checkin;
}

function collection(root: JsonRecord, key: typeof COLLECTION_KEYS[number]): unknown[] {
  const value = root[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`invalid ${key} collection`);
  return value;
}

/**
 * Convert persisted or remote JSON state to the current schema.
 * The source object is never mutated and unknown JSON fields are retained.
 */
export function migrateAppState(input: unknown): AppState {
  if (!isRecord(input)) throw new Error('invalid state object');
  const sourceVersion = input.schemaVersion === undefined ? 1 : Number(input.schemaVersion);
  if (sourceVersion !== 1 && sourceVersion !== STATE_SCHEMA_VERSION) {
    throw new Error(`unsupported state schema version: ${String(input.schemaVersion)}`);
  }

  const cloned = cloneJson(input) as JsonRecord;
  const settingsValue = cloned.settings;
  if (settingsValue !== undefined && !isRecord(settingsValue)) {
    throw new Error('invalid settings object');
  }

  const subtasks = cloneJson(collection(cloned, 'subtasks')) as JsonRecord[];
  const parentIds = new Set(
    subtasks.filter(isRecord).map((subtask) => subtask.taskId).filter((id): id is string => typeof id === 'string'),
  );
  const migrated: JsonRecord = {
    ...cloned,
    schemaVersion: STATE_SCHEMA_VERSION,
    tasks: collection(cloned, 'tasks').map((value) => {
      const task = normalizeTaskRecord(value);
      return parentIds.has(task.id) ? { ...task, target: 1, unit: '' } : task;
    }),
    subtasks,
    checkins: collection(cloned, 'checkins').map(normalizeCheckinRecord),
    timers: cloneJson(collection(cloned, 'timers')),
    drills: cloneJson(collection(cloned, 'drills')),
    formulaDrills: cloneJson(collection(cloned, 'formulaDrills')),
    settings: {
      planEndDate: null,
      theme: 'light',
      markDate: null,
      ...(settingsValue ? cloneJson(settingsValue) : {}),
      appMode: normalizeAppMode(settingsValue?.appMode),
    },
  };

  return migrated as unknown as AppState;
}

export interface ParsedMigratedState {
  state: AppState;
  serialized: string;
  original: string;
  needsV1Backup: boolean;
}

export function parseAndMigrateAppState(raw: string): ParsedMigratedState {
  const parsed = JSON.parse(raw) as unknown;
  const needsV1Backup = isRecord(parsed) &&
    (parsed.schemaVersion === undefined || Number(parsed.schemaVersion) === 1);
  const state = migrateAppState(parsed);
  const serialized = JSON.stringify(state);
  // Re-parse before callers persist so a broken serialization can never replace the source.
  migrateAppState(JSON.parse(serialized));
  return { state, serialized, original: raw, needsV1Backup };
}

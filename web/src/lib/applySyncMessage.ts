import type { AppState, SyncMessage } from '../types';
import { normalizeAppMode, normalizeCheckinRecord, normalizeTaskRecord } from './stateMigration';

const ENTITY_KEY: Record<string, 'tasks' | 'subtasks' | 'checkins' | 'timers' | 'drills' | 'formulaDrills' | 'speedDrills' | 'analysisReviews'> = {
  task: 'tasks',
  subtask: 'subtasks',
  checkin: 'checkins',
  timer: 'timers',
  drill: 'drills',
  formulaDrill: 'formulaDrills',
  speedDrill: 'speedDrills',
  analysisReview: 'analysisReviews',
};

/** Apply one last-write-wins message to any state-shaped target. */
export function applySyncMessage(state: AppState, msg: SyncMessage): void {
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
  const records = state[key] as { id: string; updatedAt: string }[];
  const index = records.findIndex((record) => record.id === payload.id);
  if (kind === 'upsert') {
    let next = index >= 0 ? { ...records[index], ...payload } : payload;
    if (key === 'tasks') next = normalizeTaskRecord(next);
    if (key === 'checkins') next = normalizeCheckinRecord(next);
    if (index >= 0) {
      if ((records[index].updatedAt || '') <= (payload.updatedAt || '')) records[index] = next;
    } else {
      records.push(next);
    }
    return;
  }

  if (index < 0 || (records[index].updatedAt || '') > (payload.updatedAt || '')) return;
  if (key !== 'tasks' && key !== 'subtasks') {
    const next = { ...records[index], ...payload, deleted: true };
    records[index] = key === 'checkins' ? normalizeCheckinRecord(next) : next;
  } else {
    records.splice(index, 1);
  }
}

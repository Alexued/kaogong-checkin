import { useAppStore } from '../../web/src/stores/app';
import { migrateAppState } from '../../web/src/lib/stateMigration';
import { applySyncMessage } from '../../web/src/lib/applySyncMessage';
import type { AppState, SyncMessage } from '../../web/src/types';

export const STATE_KEY = 'geji-minitool-state-v1';
export function snapshot(): AppState {
  const store = useAppStore();
  return migrateAppState({ schemaVersion: 2, tasks: store.tasks, subtasks: store.subtasks,
    checkins: store.checkins, timers: store.timers, drills: store.drills, formulaDrills: store.formulaDrills,
    speedDrills: store.speedDrills, analysisReviews: store.analysisReviews, settings: store.settings });
}
export function initializeLocalState() {
  const store = useAppStore();
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw !== null) store.applySnapshot(migrateAppState(JSON.parse(raw)));
    store.loaded = true;
  } catch {
    store.recoveryRequired = true;
    store.writeBlockedMessage = '本地学习存档无法读取，已停止写入保护原始数据。';
  }
}
export function enqueue(message: SyncMessage) {
  const next = snapshot();
  applySyncMessage(next, message);
  localStorage.setItem(STATE_KEY, JSON.stringify(next));
}
export function exportLearningText() { return JSON.stringify(snapshot(), null, 2); }
export function importLearningText(text: string) {
  if (text.length > 2_000_000) throw new Error('备份文本不能超过 2 MB');
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.checkins) || !parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings)) throw new Error('这不是完整学习备份：必须包含任务、打卡和设置。现有存档未改变。');
  const next = migrateAppState(parsed);
  localStorage.setItem(STATE_KEY, JSON.stringify(next));
  const store = useAppStore();
  store.applySnapshot(next);
  store.recoveryRequired = false;
  store.writeBlockedMessage = '';
}

const STATE_SCHEMA_VERSION = 2;
const COLLECTIONS = ['tasks', 'subtasks', 'checkins', 'timers', 'drills', 'formulaDrills', 'speedDrills', 'analysisReviews'];
const LEGACY_COLLECTIONS = ['tasks', 'subtasks', 'checkins', 'timers', 'drills', 'formulaDrills'];
const OPTIONAL_COLLECTIONS = ['speedDrills', 'analysisReviews'];

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeTarget(value) {
  const target = Number(value);
  return Number.isSafeInteger(target) && target > 0 ? target : 1;
}

function normalizeUnit(value) {
  if (typeof value !== 'string') return '';
  return Array.from(value.trim()).slice(0, 12).join('');
}

function normalizeAppMode(value) {
  if (value === undefined) return 'exam';
  if (value === 'exam' || value === 'general') return value;
  throw new Error('invalid app mode');
}

function isValidAppMode(value) {
  return value === undefined || value === 'exam' || value === 'general';
}

function normalizeTask(value) {
  if (!isRecord(value)) throw new Error('invalid task record');
  return { ...cloneJson(value), target: normalizeTarget(value.target), unit: normalizeUnit(value.unit) };
}

function normalizeCheckin(value) {
  if (!isRecord(value)) throw new Error('invalid checkin record');
  const targetSnapshot = normalizeTarget(value.targetSnapshot);
  const candidate = Number(value.progress);
  const progress = Number.isSafeInteger(candidate)
    ? Math.min(targetSnapshot, Math.max(0, candidate))
    : 1;
  return {
    ...cloneJson(value),
    progress: Math.min(targetSnapshot, progress),
    targetSnapshot,
    unitSnapshot: normalizeUnit(value.unitSnapshot),
  };
}

function stateCollection(value, key) {
  if (value[key] === undefined) return [];
  if (!Array.isArray(value[key])) throw new Error(`invalid ${key} collection`);
  return value[key];
}

function migrateStoredState(value, defaultSettings) {
  if (!isRecord(value)) throw new Error('invalid state shape');
  const sourceVersion = value.schemaVersion === undefined ? 1 : Number(value.schemaVersion);
  if (sourceVersion !== 1 && sourceVersion !== STATE_SCHEMA_VERSION) {
    throw new Error(`unsupported state schema version: ${String(value.schemaVersion)}`);
  }
  if (value.settings !== undefined && !isRecord(value.settings)) {
    throw new Error('invalid settings object');
  }
  const cloned = cloneJson(value);
  const subtasks = cloneJson(stateCollection(cloned, 'subtasks'));
  const parentIds = new Set(
    subtasks.filter(isRecord).map((subtask) => subtask.taskId).filter((id) => typeof id === 'string'),
  );
  const sourceSettings = value.settings ? cloneJson(value.settings) : {};
  const settings = sourceVersion === 1 || value.settings === undefined
    ? { ...cloneJson(defaultSettings), ...sourceSettings }
    : sourceSettings;
  settings.appMode = normalizeAppMode(sourceSettings.appMode);
  return {
    ...cloned,
    schemaVersion: STATE_SCHEMA_VERSION,
    tasks: stateCollection(cloned, 'tasks').map((entry) => {
      const task = normalizeTask(entry);
      return parentIds.has(task.id) ? { ...task, target: 1, unit: '' } : task;
    }),
    subtasks,
    checkins: stateCollection(cloned, 'checkins').map(normalizeCheckin),
    timers: cloneJson(stateCollection(cloned, 'timers')),
    drills: cloneJson(stateCollection(cloned, 'drills')),
    formulaDrills: cloneJson(stateCollection(cloned, 'formulaDrills')),
    speedDrills: cloneJson(stateCollection(cloned, 'speedDrills')),
    analysisReviews: cloneJson(stateCollection(cloned, 'analysisReviews')),
    settings,
  };
}

function validUnit(value) {
  return typeof value === 'string' && Array.from(value).length <= 12 && value === value.trim();
}

function isValidV2State(value) {
  return Boolean(
    isRecord(value) &&
      value.schemaVersion === STATE_SCHEMA_VERSION &&
      LEGACY_COLLECTIONS.every((key) => Array.isArray(value[key])) &&
      OPTIONAL_COLLECTIONS.every((key) => value[key] === undefined || Array.isArray(value[key])) &&
      isRecord(value.settings) &&
      isValidAppMode(value.settings.appMode) &&
      value.tasks.every((task) =>
        isRecord(task) && Number.isSafeInteger(task.target) && task.target > 0 && validUnit(task.unit)) &&
      value.checkins.every((checkin) =>
        isRecord(checkin) &&
        Number.isSafeInteger(checkin.targetSnapshot) &&
        checkin.targetSnapshot > 0 &&
        Number.isSafeInteger(checkin.progress) &&
        checkin.progress >= 0 &&
        checkin.progress <= checkin.targetSnapshot &&
        validUnit(checkin.unitSnapshot)),
  );
}

module.exports = {
  COLLECTIONS,
  STATE_SCHEMA_VERSION,
  isValidV2State,
  migrateStoredState,
  normalizeAppMode,
  normalizeCheckin,
  normalizeTask,
};

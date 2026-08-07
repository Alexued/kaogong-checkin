export const SYNC_ENABLED_KEY = 'kgc-sync-enabled';
export const LOCAL_STATE_KEY = 'kgc-state';

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Preserve sync for existing installations while keeping fresh installs local-only.
 * The resolved value is written immediately so later state hydration cannot change it.
 */
export function resolveInitialSyncEnabled(storage: KeyValueStorage = localStorage): boolean {
  const saved = storage.getItem(SYNC_ENABLED_KEY);
  if (saved === 'true' || saved === 'false') return saved === 'true';

  const enabled = storage.getItem(LOCAL_STATE_KEY) !== null;
  storage.setItem(SYNC_ENABLED_KEY, String(enabled));
  return enabled;
}

export function isSyncEnabled(storage: KeyValueStorage = localStorage): boolean {
  return resolveInitialSyncEnabled(storage);
}

export function persistSyncEnabled(enabled: boolean, storage: KeyValueStorage = localStorage) {
  storage.setItem(SYNC_ENABLED_KEY, String(enabled));
}

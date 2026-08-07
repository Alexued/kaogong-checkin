const TOKENS_KEY = 'kgc-pairing-tokens';
const SELECTED_SERVER_ID_KEY = 'kgc-selected-server-id';

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function loadTokens(storage: KeyValueStorage): Record<string, string> {
  try {
    const value = JSON.parse(storage.getItem(TOKENS_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function getSelectedServerId(storage: KeyValueStorage = localStorage): string {
  return storage.getItem(SELECTED_SERVER_ID_KEY) || '';
}

export function setSelectedServerId(serverId: string, storage: KeyValueStorage = localStorage) {
  if (serverId) storage.setItem(SELECTED_SERVER_ID_KEY, serverId);
  else storage.removeItem(SELECTED_SERVER_ID_KEY);
}

export function getPairingToken(serverId = getSelectedServerId(), storage: KeyValueStorage = localStorage): string {
  if (!serverId) return '';
  return loadTokens(storage)[serverId] || '';
}

export function savePairingToken(serverId: string, token: string, storage: KeyValueStorage = localStorage) {
  if (!serverId || !token) return;
  const tokens = loadTokens(storage);
  tokens[serverId] = token;
  storage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  setSelectedServerId(serverId, storage);
}

export function removePairingToken(serverId: string, storage: KeyValueStorage = localStorage) {
  if (!serverId) return;
  const tokens = loadTokens(storage);
  delete tokens[serverId];
  storage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export const DEVICE_SYNC_ACCENTS = ['#2563eb', '#0f766e', '#c2410c', '#7c3aed', '#be123c', '#4d7c0f'] as const;

export type RecoveryAgeBucket = 'recent' | 'week' | 'older';

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pairingAccent(accentIndex: number): string {
  const normalized = Number.isInteger(accentIndex)
    ? Math.max(0, Math.min(DEVICE_SYNC_ACCENTS.length - 1, accentIndex))
    : 0;
  return DEVICE_SYNC_ACCENTS[normalized];
}

export function recoveryAccent(sourceModel: string, sourceDeviceId: string): string {
  const key = recoverySourceKey(sourceModel, sourceDeviceId);
  return DEVICE_SYNC_ACCENTS[stableHash(key) % DEVICE_SYNC_ACCENTS.length];
}

export function recoverySourceKey(sourceModel: string, sourceDeviceId: string): string {
  return `${sourceModel.trim() || 'Android 设备'}|${sourceDeviceId.trim() || 'unknown-device'}`;
}

export function assignRecoveryAccents(
  sources: Array<{ sourceModel: string; sourceDeviceId: string }>,
): Map<string, string> {
  const keys = [...new Set(sources.map((source) => recoverySourceKey(source.sourceModel, source.sourceDeviceId)))].sort();
  const used = new Set<number>();
  const result = new Map<string, string>();
  for (const key of keys) {
    const preferred = stableHash(key) % DEVICE_SYNC_ACCENTS.length;
    let index = preferred;
    for (let offset = 0; offset < DEVICE_SYNC_ACCENTS.length; offset += 1) {
      const candidate = (preferred + offset) % DEVICE_SYNC_ACCENTS.length;
      if (!used.has(candidate)) {
        index = candidate;
        break;
      }
    }
    used.add(index);
    result.set(key, DEVICE_SYNC_ACCENTS[index]);
  }
  return result;
}

export function recoveryAgeBucket(createdAt: string, now = Date.now()): RecoveryAgeBucket {
  const parsed = Date.parse(createdAt);
  const age = Number.isFinite(parsed) ? Math.max(0, now - parsed) : Number.POSITIVE_INFINITY;
  if (age <= 24 * 60 * 60 * 1000) return 'recent';
  if (age <= 7 * 24 * 60 * 60 * 1000) return 'week';
  return 'older';
}

export function recoveryAgeText(bucket: RecoveryAgeBucket): string {
  return bucket === 'recent' ? '24 小时内' : bucket === 'week' ? '7 天内' : '更早';
}

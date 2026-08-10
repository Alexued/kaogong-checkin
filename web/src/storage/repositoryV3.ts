import { migrateLegacyToV3, type LegacyMigrationResultV3, type MigrationReportV3 } from '../domain/migrateV3';
import {
  DOMAIN_SCHEMA_VERSION,
  emptyDomainState,
  validateDomainState,
  type DomainStateV3,
  type StorageEnvelopeV3,
} from '../domain/v3';

export const REPOSITORY_KEY = 'kgc-repository-v3';
export const LEGACY_STATE_KEY = 'kgc-state';
export const LEGACY_QUEUE_KEY = 'kgc-queue';
export const MIGRATION_BACKUP_KEY = 'kgc-migration-backup-v3';
export const MIGRATION_LOCK_KEY = 'kgc-migration-lock-v3';

export interface RepositoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface OutboxItemV3 {
  mutationId: string;
  deviceId: string;
  localRevision: number;
  expectedBackupRevision: number;
  snapshotId: string;
  snapshotSha256: string;
  createdAt: string;
  operation: 'replace-state';
  envelope: StorageEnvelopeV3;
}

export interface RepositoryRecordV3 {
  formatVersion: 1;
  envelope: StorageEnvelopeV3;
  outbox: OutboxItemV3[];
}

export interface MigrationBackupV3 {
  formatVersion: 1;
  createdAt: string;
  sources: Array<{ key: string; raw: string; utf8ByteLength: number; sha256: string }>;
}

export interface MigrationLockV3 {
  formatVersion: 1;
  sourceDigest: string;
  sourceBytesRef: string;
  errorCode: string;
  firstFailedAt: string;
}

export class RepositoryError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
  }
}

export class MigrationLockedError extends RepositoryError {
  readonly lock: MigrationLockV3 | null;

  constructor(lock: MigrationLockV3 | null) {
    super('MIGRATION_LOCKED', 'Migration requires manual recovery');
    this.name = 'MigrationLockedError';
    this.lock = lock;
  }
}

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function addMissingAppMode(envelope: unknown): boolean {
  if (!isRecord(envelope) || !isRecord(envelope.state) || !isRecord(envelope.state.settings)) return false;
  if (Object.prototype.hasOwnProperty.call(envelope.state.settings, 'appMode')) return false;
  envelope.state.settings.appMode = 'exam';
  return true;
}

function upgradeStoredRecord(record: unknown): boolean {
  if (!isRecord(record)) return false;
  let upgraded = addMissingAppMode(record.envelope);
  if (Array.isArray(record.outbox)) {
    for (const item of record.outbox) {
      if (isRecord(item)) upgraded = addMissingAppMode(item.envelope) || upgraded;
    }
  }
  return upgraded;
}

function deviceId(): string {
  return globalThis.crypto?.randomUUID?.() || `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function sha256Utf8(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new RepositoryError('DIGEST_UNAVAILABLE');
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseJson<T>(raw: string | null, code: string): T {
  if (raw === null) throw new RepositoryError(code);
  try { return JSON.parse(raw) as T; } catch { throw new RepositoryError(code); }
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function validateEnvelope(envelope: StorageEnvelopeV3): void {
  if (!envelope || envelope.schemaVersion !== DOMAIN_SCHEMA_VERSION) throw new RepositoryError('UNSUPPORTED_STATE_VERSION');
  if (!Number.isSafeInteger(envelope.revision) || envelope.revision < 0) throw new RepositoryError('INVALID_REVISION');
  if (typeof envelope.deviceId !== 'string' || envelope.deviceId.length < 8 || envelope.deviceId.length > 128) throw new RepositoryError('INVALID_DEVICE_ID');
  if (!validTimestamp(envelope.savedAt)) throw new RepositoryError('INVALID_SAVED_AT');
  try { validateDomainState(envelope.state); } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as { code: unknown }).code) : 'INVALID_DOMAIN_STATE';
    throw new RepositoryError(code);
  }
}

function validateRecord(record: RepositoryRecordV3): void {
  if (!record || record.formatVersion !== 1 || !Array.isArray(record.outbox)) throw new RepositoryError('INVALID_REPOSITORY');
  validateEnvelope(record.envelope);
  for (const item of record.outbox) {
    if (!item || typeof item.mutationId !== 'string' || !item.mutationId || item.operation !== 'replace-state') throw new RepositoryError('INVALID_OUTBOX');
    validateEnvelope(item.envelope);
  }
}

function sourceBytesRef(sources: MigrationBackupV3['sources']): string {
  return sources.map((source) => `${source.key}:${source.sha256}:${source.utf8ByteLength}`).join('|');
}

export class RepositoryV3 {
  constructor(private readonly storage: RepositoryStorage) {}

  private readLock(): MigrationLockV3 | null {
    const raw = this.storage.getItem(MIGRATION_LOCK_KEY);
    if (!raw) return null;
    try {
      const lock = JSON.parse(raw) as MigrationLockV3;
      if (lock && lock.formatVersion === 1 && typeof lock.errorCode === 'string') return lock;
    } catch {
      // A damaged lock is still a lock; never resume business writes around it.
    }
    return { formatVersion: 1, sourceDigest: '', sourceBytesRef: '', errorCode: 'INVALID_MIGRATION_LOCK', firstFailedAt: now() };
  }

  private writeLock(lock: MigrationLockV3): void {
    try { this.storage.setItem(MIGRATION_LOCK_KEY, JSON.stringify(lock)); } catch { /* Preserve the original source even if storage is full. */ }
  }

  private writeRecord(record: RepositoryRecordV3): void {
    validateRecord(record);
    const serialized = JSON.stringify(record);
    try { this.storage.setItem(REPOSITORY_KEY, serialized); } catch {
      throw new RepositoryError('REPOSITORY_WRITE_FAILED');
    }
  }

  private async createBackup(rawState: string, rawQueue: string): Promise<MigrationBackupV3> {
    const sources = [];
    for (const [key, raw] of [[LEGACY_STATE_KEY, rawState], [LEGACY_QUEUE_KEY, rawQueue]] as const) {
      sources.push({ key, raw, utf8ByteLength: new TextEncoder().encode(raw).byteLength, sha256: await sha256Utf8(raw) });
    }
    const backup: MigrationBackupV3 = { formatVersion: 1, createdAt: now(), sources };
    try { this.storage.setItem(MIGRATION_BACKUP_KEY, JSON.stringify(backup)); } catch {
      throw new RepositoryError('BACKUP_WRITE_FAILED');
    }
    return backup;
  }

  private async migrateSource(rawState: string, rawQueue: string, backup: MigrationBackupV3): Promise<{ record: RepositoryRecordV3; report: MigrationReportV3 }> {
    try {
      const migrated: LegacyMigrationResultV3 = migrateLegacyToV3(rawState, rawQueue);
      const envelope: StorageEnvelopeV3 = { schemaVersion: 3, revision: 1, deviceId: deviceId(), savedAt: now(), state: migrated.state };
      const record: RepositoryRecordV3 = { formatVersion: 1, envelope, outbox: [] };
      this.writeRecord(record);
      return { record, report: migrated.report };
    } catch (error) {
      const errorCode = error instanceof RepositoryError ? error.code : error instanceof Error ? error.message : 'MIGRATION_FAILED';
      const lock: MigrationLockV3 = { formatVersion: 1, sourceDigest: await sha256Utf8(rawState), sourceBytesRef: sourceBytesRef(backup.sources), errorCode, firstFailedAt: now() };
      this.writeLock(lock);
      throw new MigrationLockedError(lock);
    }
  }

  async load(): Promise<{ record: RepositoryRecordV3; migrated: boolean; report?: MigrationReportV3 }> {
    const lock = this.readLock();
    if (lock) throw new MigrationLockedError(lock);
    const primary = this.storage.getItem(REPOSITORY_KEY);
    if (primary !== null) {
      let record: RepositoryRecordV3;
      try {
        record = parseJson<RepositoryRecordV3>(primary, 'INVALID_REPOSITORY');
      } catch (error) {
        const sourceDigest = await sha256Utf8(primary);
        const invalidLock: MigrationLockV3 = { formatVersion: 1, sourceDigest, sourceBytesRef: `${REPOSITORY_KEY}:${sourceDigest}`, errorCode: error instanceof RepositoryError ? error.code : 'INVALID_REPOSITORY', firstFailedAt: now() };
        this.writeLock(invalidLock);
        throw new MigrationLockedError(invalidLock);
      }
      try {
        const upgraded = upgradeStoredRecord(record);
        validateRecord(record);
        if (upgraded) this.writeRecord(record);
      } catch (error) {
        const code = error instanceof RepositoryError ? error.code : 'INVALID_REPOSITORY';
        const sourceDigest = await sha256Utf8(primary);
        const invalidLock: MigrationLockV3 = { formatVersion: 1, sourceDigest, sourceBytesRef: `${REPOSITORY_KEY}:${sourceDigest}`, errorCode: code, firstFailedAt: now() };
        this.writeLock(invalidLock);
        throw new MigrationLockedError(invalidLock);
      }
      return { record, migrated: false };
    }
    const rawState = this.storage.getItem(LEGACY_STATE_KEY);
    if (rawState === null) {
      const record: RepositoryRecordV3 = { formatVersion: 1, envelope: { schemaVersion: 3, revision: 0, deviceId: deviceId(), savedAt: now(), state: emptyDomainState() }, outbox: [] };
      this.writeRecord(record);
      return { record, migrated: false };
    }
    const rawQueue = this.storage.getItem(LEGACY_QUEUE_KEY) || '';
    const existingBackup = this.storage.getItem(MIGRATION_BACKUP_KEY);
    let backup: MigrationBackupV3;
    try {
      backup = existingBackup ? parseJson<MigrationBackupV3>(existingBackup, 'INVALID_MIGRATION_BACKUP') : await this.createBackup(rawState, rawQueue);
      if (existingBackup) {
        const stateSource = backup.sources.find((source) => source.key === LEGACY_STATE_KEY);
        const queueSource = backup.sources.find((source) => source.key === LEGACY_QUEUE_KEY);
        if (!stateSource || !queueSource || stateSource.raw !== rawState || queueSource.raw !== rawQueue) throw new RepositoryError('MIGRATION_SOURCE_CHANGED');
      }
    } catch (error) {
      const sourceDigest = await sha256Utf8(rawState);
      const lock: MigrationLockV3 = { formatVersion: 1, sourceDigest, sourceBytesRef: `${LEGACY_STATE_KEY}:${sourceDigest}`, errorCode: error instanceof RepositoryError ? error.code : 'BACKUP_WRITE_FAILED', firstFailedAt: now() };
      this.writeLock(lock);
      throw new MigrationLockedError(lock);
    }
    return this.migrateSource(rawState, rawQueue, backup).then((result) => ({ ...result, migrated: true }));
  }

  async retryMigration(): Promise<{ record: RepositoryRecordV3; report: MigrationReportV3 }> {
    const backup = parseJson<MigrationBackupV3>(this.storage.getItem(MIGRATION_BACKUP_KEY), 'MIGRATION_BACKUP_MISSING');
    const stateSource = backup.sources.find((source) => source.key === LEGACY_STATE_KEY);
    const queueSource = backup.sources.find((source) => source.key === LEGACY_QUEUE_KEY);
    if (!stateSource || !queueSource) throw new RepositoryError('MIGRATION_BACKUP_INCOMPLETE');
    const result = await this.migrateSource(stateSource.raw, queueSource.raw, backup);
    this.storage.removeItem(MIGRATION_LOCK_KEY);
    return result;
  }

  async commit(state: DomainStateV3, outbox: OutboxItemV3[] = []): Promise<RepositoryRecordV3> {
    const lock = this.readLock();
    if (lock) throw new MigrationLockedError(lock);
    validateDomainState(state);
    const current = this.storage.getItem(REPOSITORY_KEY);
    if (!current) throw new RepositoryError('REPOSITORY_MISSING');
    const previous = parseJson<RepositoryRecordV3>(current, 'INVALID_REPOSITORY');
    validateRecord(previous);
    const next: RepositoryRecordV3 = {
      formatVersion: 1,
      envelope: { ...previous.envelope, revision: previous.envelope.revision + 1, savedAt: now(), state: clone(state) },
      outbox: clone(outbox),
    };
    this.writeRecord(next);
    return next;
  }

  async exportBackup(): Promise<MigrationBackupV3> {
    return parseJson<MigrationBackupV3>(this.storage.getItem(MIGRATION_BACKUP_KEY), 'MIGRATION_BACKUP_MISSING');
  }

  async resetToEmpty(): Promise<RepositoryRecordV3> {
    this.storage.removeItem(REPOSITORY_KEY);
    this.storage.removeItem(LEGACY_STATE_KEY);
    this.storage.removeItem(LEGACY_QUEUE_KEY);
    this.storage.removeItem(MIGRATION_LOCK_KEY);
    const record: RepositoryRecordV3 = { formatVersion: 1, envelope: { schemaVersion: 3, revision: 0, deviceId: deviceId(), savedAt: now(), state: emptyDomainState() }, outbox: [] };
    this.writeRecord(record);
    return record;
  }
}

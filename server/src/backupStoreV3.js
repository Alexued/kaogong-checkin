'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BACKUP_FORMAT_VERSION = 1;
const SNAPSHOT_RETENTION_COUNT = 10;
const DEFAULT_MAX_MUTATION_RECORDS = 2048;
const DEFAULT_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_INDEX_BYTES = 4 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SNAPSHOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

class BackupStoreV3Error extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BackupStoreV3Error';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new BackupStoreV3Error(code, message, details);
}

function validateIdentifier(value, label) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 200
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail('INVALID_ARGUMENT', `${label} must be a non-empty stable identifier`);
  }
  return value;
}

function validateRevision(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail('INVALID_ARGUMENT', `${label} must be a safe integer greater than or equal to ${minimum}`);
  }
  return value;
}

function validateSnapshotId(value, label = 'snapshotId') {
  if (typeof value !== 'string' || !SNAPSHOT_ID_PATTERN.test(value) || value === '.' || value === '..') {
    fail('INVALID_ARGUMENT', `${label} must be a safe file identifier`);
  }
  return value;
}

function validatePositiveOption(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertJsonValue(value, location = 'envelope', ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    fail('INVALID_ARGUMENT', `${location} contains a non-finite number`);
  }
  if (typeof value !== 'object') {
    fail('INVALID_ARGUMENT', `${location} contains a non-JSON value`);
  }
  if (ancestors.has(value)) fail('INVALID_ARGUMENT', `${location} contains a circular reference`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) fail('INVALID_ARGUMENT', `${location} contains a sparse array`);
      assertJsonValue(value[index], `${location}[${index}]`, ancestors);
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail('INVALID_ARGUMENT', `${location} contains a non-plain object`);
    }
    for (const [key, child] of Object.entries(value)) {
      assertJsonValue(child, `${location}.${key}`, ancestors);
    }
    for (const symbol of Object.getOwnPropertySymbols(value)) {
      if (Object.prototype.propertyIsEnumerable.call(value, symbol)) {
        fail('INVALID_ARGUMENT', `${location} contains an enumerable Symbol property`);
      }
    }
  }
  ancestors.delete(value);
}

function serializeEnvelope(envelope, deviceId, localRevision) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    fail('INVALID_ARGUMENT', 'envelope must be a JSON object');
  }
  if (envelope.schemaVersion !== 3) {
    fail('INVALID_ARGUMENT', 'envelope schemaVersion must be 3');
  }
  if (envelope.deviceId !== deviceId) {
    fail('INVALID_ARGUMENT', 'envelope deviceId must match the mutation deviceId');
  }
  if (envelope.revision !== localRevision) {
    fail('INVALID_ARGUMENT', 'envelope revision must match localRevision');
  }
  assertJsonValue(envelope);

  let serialized;
  try {
    serialized = JSON.stringify(envelope);
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      fail('INVALID_ARGUMENT', 'envelope must serialize to a JSON object');
    }
  } catch (error) {
    if (error instanceof BackupStoreV3Error) throw error;
    fail('INVALID_ARGUMENT', 'envelope must contain only JSON-serializable values');
  }
  return Buffer.from(serialized, 'utf8');
}

function deviceDirectory(rootDir, deviceId) {
  return path.join(rootDir, 'devices', sha256(Buffer.from(deviceId, 'utf8')));
}

function snapshotPath(directory, snapshotId) {
  return path.join(directory, 'snapshots', `${snapshotId}.json`);
}

function emptyIndex(deviceId) {
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    deviceId,
    mutationFloorRevision: 0,
    headBackupRevision: 0,
    totalBytes: 0,
    snapshots: [],
    mutations: [],
  };
}

function validIsoDate(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function directoryContainsFiles(directory) {
  if (!fs.existsSync(directory)) return false;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() || entry.isSymbolicLink()) return true;
    if (entry.isDirectory() && directoryContainsFiles(path.join(directory, entry.name))) return true;
  }
  return false;
}

function validateMetadata(metadata, label) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    fail('CORRUPT_STORE', `${label} metadata is invalid`);
  }
  try {
    validateSnapshotId(metadata.snapshotId, `${label}.snapshotId`);
  } catch (error) {
    fail('CORRUPT_STORE', `${label} snapshotId is invalid`);
  }
  if (!Number.isSafeInteger(metadata.localRevision) || metadata.localRevision < 0) {
    fail('CORRUPT_STORE', `${label} localRevision is invalid`);
  }
  if (!Number.isSafeInteger(metadata.backupRevision) || metadata.backupRevision < 1) {
    fail('CORRUPT_STORE', `${label} backupRevision is invalid`);
  }
  if (!SHA256_PATTERN.test(metadata.sha256 || '')) {
    fail('CORRUPT_STORE', `${label} sha256 is invalid`);
  }
  if (!Number.isSafeInteger(metadata.bytes) || metadata.bytes < 1) {
    fail('CORRUPT_STORE', `${label} bytes is invalid`);
  }
  if (!validIsoDate(metadata.createdAt)) {
    fail('CORRUPT_STORE', `${label} createdAt is invalid`);
  }
}

function metadataEqual(left, right) {
  return left.snapshotId === right.snapshotId
    && left.localRevision === right.localRevision
    && left.backupRevision === right.backupRevision
    && left.sha256 === right.sha256
    && left.bytes === right.bytes
    && left.createdAt === right.createdAt;
}

function verifySnapshotFile(directory, metadata) {
  const filePath = snapshotPath(directory, metadata.snapshotId);
  let bytes;
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail('CORRUPT_STORE', `snapshot ${metadata.snapshotId} is not a regular file`);
    }
    bytes = fs.readFileSync(filePath);
  } catch (error) {
    if (error instanceof BackupStoreV3Error) throw error;
    fail('CORRUPT_STORE', `snapshot ${metadata.snapshotId} is missing or unreadable`);
  }
  if (bytes.length !== metadata.bytes || sha256(bytes) !== metadata.sha256) {
    fail('CORRUPT_STORE', `snapshot ${metadata.snapshotId} failed its size or SHA-256 check`);
  }
  try {
    const parsed = JSON.parse(bytes.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      fail('CORRUPT_STORE', `snapshot ${metadata.snapshotId} is not a JSON object`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof BackupStoreV3Error) throw error;
    fail('CORRUPT_STORE', `snapshot ${metadata.snapshotId} contains invalid JSON`);
  }
}

function validateIndex(index, deviceId, limits) {
  if (!index || typeof index !== 'object' || Array.isArray(index)) {
    fail('CORRUPT_STORE', 'backup index is not an object');
  }
  if (index.formatVersion !== BACKUP_FORMAT_VERSION || index.deviceId !== deviceId) {
    fail('CORRUPT_STORE', 'backup index identity or format is invalid');
  }
  if (!Array.isArray(index.snapshots) || !Array.isArray(index.mutations)) {
    fail('CORRUPT_STORE', 'backup index collections are invalid');
  }
  if (index.snapshots.length > SNAPSHOT_RETENTION_COUNT) {
    fail('CORRUPT_STORE', 'backup index exceeds the snapshot retention count');
  }
  if (
    !Number.isSafeInteger(index.mutationFloorRevision)
    || index.mutationFloorRevision < 0
    || index.mutations.length > limits.maxMutationRecords
  ) {
    fail('CORRUPT_STORE', 'backup index mutation window is invalid');
  }

  const mutationIds = new Set();
  let previousBackupRevision = index.mutationFloorRevision;
  for (const [offset, mutation] of index.mutations.entries()) {
    const label = `mutations[${offset}]`;
    if (!mutation || typeof mutation !== 'object' || Array.isArray(mutation)) {
      fail('CORRUPT_STORE', `${label} is invalid`);
    }
    try {
      validateIdentifier(mutation.mutationId, `${label}.mutationId`);
    } catch (error) {
      fail('CORRUPT_STORE', `${label} mutationId is invalid`);
    }
    if (mutationIds.has(mutation.mutationId)) {
      fail('CORRUPT_STORE', 'backup index contains duplicate mutation IDs');
    }
    mutationIds.add(mutation.mutationId);
    if (!SHA256_PATTERN.test(mutation.requestSha256 || '')) {
      fail('CORRUPT_STORE', `${label} requestSha256 is invalid`);
    }
    validateMetadata(mutation.metadata, `${label}.metadata`);
    if (mutation.metadata.backupRevision !== previousBackupRevision + 1) {
      fail('CORRUPT_STORE', 'backup index mutation revisions are not contiguous');
    }
    previousBackupRevision = mutation.metadata.backupRevision;
  }

  if (index.headBackupRevision !== previousBackupRevision) {
    fail('CORRUPT_STORE', 'backup index head revision is inconsistent');
  }
  const expectedSnapshots = index.mutations
    .slice(-SNAPSHOT_RETENTION_COUNT)
    .map((mutation) => mutation.metadata);
  if (
    expectedSnapshots.length !== index.snapshots.length
    || expectedSnapshots.some((metadata, offset) => !metadataEqual(metadata, index.snapshots[offset]))
  ) {
    fail('CORRUPT_STORE', 'backup index retained snapshots are inconsistent');
  }

  let totalBytes = 0;
  for (const [offset, metadata] of index.snapshots.entries()) {
    validateMetadata(metadata, `snapshots[${offset}]`);
    totalBytes += metadata.bytes;
    if (!Number.isSafeInteger(totalBytes)) {
      fail('CORRUPT_STORE', 'backup index total size is invalid');
    }
  }
  if (index.totalBytes !== totalBytes || totalBytes > limits.maxTotalBytes) {
    fail('CORRUPT_STORE', 'backup index total size is inconsistent or over capacity');
  }
}

function writeFileAtomic(filePath, bytes) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, filePath);
    fsyncDirectory(directory);
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* already closed */ }
    }
    try { fs.rmSync(temporaryPath, { force: true }); } catch { /* best effort */ }
  }
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = fs.openSync(directory, 'r');
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (!['EINVAL', 'EPERM', 'EISDIR', 'ENOTSUP'].includes(error.code)) throw error;
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* already closed */ }
    }
  }
}

function createBackupStoreV3(options = {}) {
  if (typeof options.rootDir !== 'string' || !options.rootDir.trim()) {
    throw new TypeError('rootDir is required');
  }
  const rootDir = path.resolve(options.rootDir);
  const limits = {
    maxTotalBytes: validatePositiveOption(
      options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
      'maxTotalBytes',
    ),
    maxIndexBytes: validatePositiveOption(
      options.maxIndexBytes ?? DEFAULT_MAX_INDEX_BYTES,
      'maxIndexBytes',
    ),
    maxMutationRecords: validatePositiveOption(
      options.maxMutationRecords ?? DEFAULT_MAX_MUTATION_RECORDS,
      'maxMutationRecords',
    ),
  };
  if (limits.maxMutationRecords < SNAPSHOT_RETENTION_COUNT) {
    throw new TypeError(`maxMutationRecords must be at least ${SNAPSHOT_RETENTION_COUNT}`);
  }
  const now = options.now || (() => new Date());
  const createSnapshotId = options.createSnapshotId || (() => crypto.randomUUID());
  if (typeof now !== 'function' || typeof createSnapshotId !== 'function') {
    throw new TypeError('now and createSnapshotId must be functions');
  }

  function acquireStoreLock() {
    fs.mkdirSync(rootDir, { recursive: true });
    const lockPath = path.join(rootDir, '.backup-store-v3.lock');
    const token = crypto.randomUUID();
    let descriptor;
    try {
      descriptor = fs.openSync(lockPath, 'wx', 0o600);
      fs.writeFileSync(descriptor, JSON.stringify({
        pid: process.pid,
        token,
        createdAt: new Date().toISOString(),
      }));
      fs.fsyncSync(descriptor);
      return { descriptor, lockPath, token };
    } catch (error) {
      if (descriptor !== undefined) {
        try { fs.closeSync(descriptor); } catch { /* already closed */ }
        try { fs.rmSync(lockPath, { force: true }); } catch { /* best effort */ }
      }
      if (error.code === 'EEXIST') fail('STORE_BUSY', 'another backup writer holds the store lock');
      const storeError = new BackupStoreV3Error('STORE_WRITE_FAILED', 'unable to acquire backup lock');
      storeError.cause = error;
      throw storeError;
    }
  }

  function releaseStoreLock(lock) {
    try { fs.closeSync(lock.descriptor); } catch { /* already closed */ }
    try {
      const current = JSON.parse(fs.readFileSync(lock.lockPath, 'utf8'));
      if (current.token === lock.token) fs.rmSync(lock.lockPath, { force: true });
    } catch {
      // A missing or replaced lock must not be removed by the previous owner.
    }
  }

  function withStoreLock(operation) {
    const lock = acquireStoreLock();
    try {
      return operation();
    } finally {
      releaseStoreLock(lock);
    }
  }

  function readIndex(deviceId, recoverUnindexedOrphans = false) {
    const directory = deviceDirectory(rootDir, deviceId);
    const indexPath = path.join(directory, 'index.json');
    if (!fs.existsSync(indexPath)) {
      if (directoryContainsFiles(directory)) {
        if (!recoverUnindexedOrphans) {
          fail('CORRUPT_STORE', 'device backup directory exists without an index');
        }
        try {
          fs.rmSync(directory, { recursive: true, force: true });
          fsyncDirectory(path.dirname(directory));
        } catch (error) {
          const storeError = new BackupStoreV3Error(
            'STORE_CLEANUP_FAILED',
            'unable to remove an uncommitted snapshot directory',
          );
          storeError.cause = error;
          throw storeError;
        }
      }
      return { directory, indexPath, index: emptyIndex(deviceId) };
    }

    let bytes;
    let index;
    try {
      bytes = fs.readFileSync(indexPath);
      if (bytes.length > limits.maxIndexBytes) {
        fail('CORRUPT_STORE', 'backup index exceeds its capacity limit');
      }
      index = JSON.parse(bytes.toString('utf8'));
    } catch (error) {
      if (error instanceof BackupStoreV3Error) throw error;
      fail('CORRUPT_STORE', 'backup index is unreadable or contains invalid JSON');
    }
    validateIndex(index, deviceId, limits);
    return { directory, indexPath, index };
  }

  function verifyRetainedSnapshots(directory, index) {
    for (const metadata of index.snapshots) verifySnapshotFile(directory, metadata);
  }

  function cleanupUnreferencedSnapshots(directory, index) {
    const snapshotsDirectory = path.join(directory, 'snapshots');
    if (!fs.existsSync(snapshotsDirectory)) return;
    const retainedFiles = new Set(index.snapshots.map((metadata) => `${metadata.snapshotId}.json`));
    let changed = false;
    for (const entry of fs.readdirSync(snapshotsDirectory, { withFileTypes: true })) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        fail('CORRUPT_STORE', 'snapshot directory contains an unexpected entry');
      }
      if (retainedFiles.has(entry.name)) continue;
      try {
        fs.rmSync(path.join(snapshotsDirectory, entry.name));
        changed = true;
      } catch (error) {
        const storeError = new BackupStoreV3Error(
          'STORE_CLEANUP_FAILED',
          `unable to remove unreferenced snapshot file ${entry.name}`,
        );
        storeError.cause = error;
        throw storeError;
      }
    }
    if (changed) fsyncDirectory(snapshotsDirectory);
  }

  function retainedStoreBytes() {
    const devicesDirectory = path.join(rootDir, 'devices');
    if (!fs.existsSync(devicesDirectory)) return 0;
    let totalBytes = 0;
    for (const entry of fs.readdirSync(devicesDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        fail('CORRUPT_STORE', 'backup devices directory contains an unexpected entry');
      }
      const directory = path.join(devicesDirectory, entry.name);
      const indexPath = path.join(directory, 'index.json');
      if (!fs.existsSync(indexPath)) {
        if (directoryContainsFiles(directory)) {
          fail('CORRUPT_STORE', 'device backup directory exists without an index');
        }
        continue;
      }
      let index;
      try {
        const bytes = fs.readFileSync(indexPath);
        if (bytes.length > limits.maxIndexBytes) {
          fail('CORRUPT_STORE', 'backup index exceeds its capacity limit');
        }
        index = JSON.parse(bytes.toString('utf8'));
      } catch (error) {
        if (error instanceof BackupStoreV3Error) throw error;
        fail('CORRUPT_STORE', 'backup index is unreadable or contains invalid JSON');
      }
      try {
        validateIdentifier(index.deviceId, 'index.deviceId');
      } catch {
        fail('CORRUPT_STORE', 'backup index contains an invalid deviceId');
      }
      if (path.basename(deviceDirectory(rootDir, index.deviceId)) !== entry.name) {
        fail('CORRUPT_STORE', 'device backup directory does not match its index identity');
      }
      validateIndex(index, index.deviceId, limits);
      cleanupUnreferencedSnapshots(directory, index);
      totalBytes += index.totalBytes;
      if (!Number.isSafeInteger(totalBytes)) fail('CORRUPT_STORE', 'backup store size is invalid');
    }
    return totalBytes;
  }

  function nextSnapshotId(directory, index) {
    const known = new Set(index.mutations.map((mutation) => mutation.metadata.snapshotId));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = createSnapshotId();
      validateSnapshotId(candidate);
      if (!known.has(candidate) && !fs.existsSync(snapshotPath(directory, candidate))) return candidate;
    }
    fail('STORE_WRITE_FAILED', 'unable to allocate a unique snapshotId');
  }

  function appendSnapshot(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      fail('INVALID_ARGUMENT', 'snapshot request must be an object');
    }
    const deviceId = validateIdentifier(request.deviceId, 'deviceId');
    const mutationId = validateIdentifier(request.mutationId, 'mutationId');
    const expectedBackupRevision = validateRevision(
      request.expectedBackupRevision,
      'expectedBackupRevision',
    );
    const localRevision = validateRevision(request.localRevision, 'localRevision');
    const envelopeBytes = serializeEnvelope(request.envelope, deviceId, localRevision);
    const envelopeSha256 = sha256(envelopeBytes);
    const requestSha256 = sha256(Buffer.from(JSON.stringify({
      deviceId,
      expectedBackupRevision,
      localRevision,
      envelopeSha256,
    }), 'utf8'));

    return withStoreLock(() => {
    const { directory, indexPath, index } = readIndex(deviceId, true);
    cleanupUnreferencedSnapshots(directory, index);
    verifyRetainedSnapshots(directory, index);
    const currentStoreBytes = retainedStoreBytes();
    const duplicate = index.mutations.find((mutation) => mutation.mutationId === mutationId);
    if (duplicate) {
      if (duplicate.requestSha256 !== requestSha256) {
        fail('MUTATION_ID_REUSED', 'mutationId was already used for a different request');
      }
      return {
        metadata: cloneJson(duplicate.metadata),
        idempotent: true,
        retained: index.snapshots.some(
          (metadata) => metadata.snapshotId === duplicate.metadata.snapshotId,
        ),
        prunedSnapshotIds: [],
      };
    }

    if (expectedBackupRevision !== index.headBackupRevision) {
      fail('BACKUP_REVISION_CONFLICT', 'expectedBackupRevision does not match the server head', {
        expectedBackupRevision,
        actualBackupRevision: index.headBackupRevision,
      });
    }
    const head = index.snapshots[index.snapshots.length - 1];
    if (head && localRevision <= head.localRevision) {
      fail('LOCAL_REVISION_CONFLICT', 'localRevision must advance beyond the current backup head', {
        localRevision,
        currentLocalRevision: head.localRevision,
      });
    }
    if (index.headBackupRevision >= Number.MAX_SAFE_INTEGER) {
      fail('CAPACITY_EXCEEDED', 'backupRevision has reached the safe integer limit');
    }

    const createdAtValue = now();
    const createdAtDate = createdAtValue instanceof Date
      ? createdAtValue
      : new Date(createdAtValue);
    if (Number.isNaN(createdAtDate.getTime())) {
      fail('STORE_WRITE_FAILED', 'now() returned an invalid date');
    }
    const metadata = {
      snapshotId: nextSnapshotId(directory, index),
      localRevision,
      backupRevision: index.headBackupRevision + 1,
      sha256: envelopeSha256,
      bytes: envelopeBytes.length,
      createdAt: createdAtDate.toISOString(),
    };
    const nextSnapshots = [...index.snapshots, metadata].slice(-SNAPSHOT_RETENTION_COUNT);
    const nextTotalBytes = nextSnapshots.reduce((total, snapshot) => total + snapshot.bytes, 0);
    const requestedStoreBytes = currentStoreBytes - index.totalBytes + nextTotalBytes;
    if (!Number.isSafeInteger(requestedStoreBytes) || requestedStoreBytes > limits.maxTotalBytes) {
      fail('CAPACITY_EXCEEDED', 'snapshot would exceed the retained backup capacity', {
        maxTotalBytes: limits.maxTotalBytes,
        requestedTotalBytes: requestedStoreBytes,
      });
    }

    const nextMutations = [...index.mutations, { mutationId, requestSha256, metadata }]
      .slice(-limits.maxMutationRecords);
    const nextIndex = {
      formatVersion: BACKUP_FORMAT_VERSION,
      deviceId,
      mutationFloorRevision: nextMutations[0].metadata.backupRevision - 1,
      headBackupRevision: metadata.backupRevision,
      totalBytes: nextTotalBytes,
      snapshots: nextSnapshots,
      mutations: nextMutations,
    };
    const indexBytes = Buffer.from(`${JSON.stringify(nextIndex, null, 2)}\n`, 'utf8');
    if (indexBytes.length > limits.maxIndexBytes) {
      fail('CAPACITY_EXCEEDED', 'mutation audit index would exceed its capacity', {
        maxIndexBytes: limits.maxIndexBytes,
        requestedIndexBytes: indexBytes.length,
      });
    }

    const newSnapshotPath = snapshotPath(directory, metadata.snapshotId);
    try {
      writeFileAtomic(newSnapshotPath, envelopeBytes);
      writeFileAtomic(indexPath, indexBytes);
    } catch (error) {
      let indexCommitted = false;
      try {
        indexCommitted = fs.existsSync(indexPath)
          && fs.readFileSync(indexPath).equals(indexBytes);
      } catch {
        indexCommitted = false;
      }
      if (!indexCommitted) {
        try {
          fs.rmSync(newSnapshotPath, { force: true });
          fsyncDirectory(path.dirname(newSnapshotPath));
        } catch { /* best effort */ }
      }
      if (error instanceof BackupStoreV3Error) throw error;
      const storeError = new BackupStoreV3Error(
        'STORE_WRITE_FAILED',
        'failed to persist the backup snapshot',
        { committed: indexCommitted },
      );
      storeError.cause = error;
      throw storeError;
    }

    const retainedIds = new Set(nextSnapshots.map((snapshot) => snapshot.snapshotId));
    const prunedSnapshotIds = index.snapshots
      .filter((snapshot) => !retainedIds.has(snapshot.snapshotId))
      .map((snapshot) => snapshot.snapshotId);
    cleanupUnreferencedSnapshots(directory, nextIndex);

    return {
      metadata: cloneJson(metadata),
      idempotent: false,
      retained: true,
      prunedSnapshotIds,
    };
    });
  }

  function listSnapshots(deviceIdValue) {
    const deviceId = validateIdentifier(deviceIdValue, 'deviceId');
    const { index } = readIndex(deviceId);
    return index.snapshots.slice().reverse().map(cloneJson);
  }

  function readSnapshot(deviceIdValue, snapshotIdValue) {
    const deviceId = validateIdentifier(deviceIdValue, 'deviceId');
    const snapshotId = validateSnapshotId(snapshotIdValue);
    const { directory, index } = readIndex(deviceId);
    const metadata = index.snapshots.find((candidate) => candidate.snapshotId === snapshotId);
    if (!metadata) fail('SNAPSHOT_NOT_FOUND', `snapshot ${snapshotId} is not retained`);
    return {
      metadata: cloneJson(metadata),
      envelope: verifySnapshotFile(directory, metadata),
    };
  }

  function getHead(deviceIdValue) {
    const snapshots = listSnapshots(deviceIdValue);
    return snapshots[0] || null;
  }

  return Object.freeze({ appendSnapshot, getHead, listSnapshots, readSnapshot });
}

module.exports = {
  BACKUP_FORMAT_VERSION,
  BackupStoreV3Error,
  DEFAULT_MAX_INDEX_BYTES,
  DEFAULT_MAX_TOTAL_BYTES,
  SNAPSHOT_RETENTION_COUNT,
  createBackupStoreV3,
};

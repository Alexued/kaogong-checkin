'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  SNAPSHOT_RETENTION_COUNT,
  createBackupStoreV3,
} = require('../src/backupStoreV3');

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kaogong-backup-v3-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function fixtureStore(t, options = {}) {
  const rootDir = options.rootDir || temporaryDirectory(t);
  let nextId = 0;
  let nextSecond = 0;
  return createBackupStoreV3({
    rootDir,
    createSnapshotId: () => `snapshot-${++nextId}`,
    now: () => new Date(Date.UTC(2026, 7, 8, 0, 0, nextSecond++)),
    ...options,
  });
}

function envelope(deviceId, revision, value = revision) {
  return {
    schemaVersion: 3,
    revision,
    deviceId,
    savedAt: '2026-08-08T00:00:00.000Z',
    state: { value },
  };
}

function request(deviceId, revision, expectedBackupRevision = revision - 1, value = revision) {
  return {
    mutationId: `mutation-${revision}`,
    deviceId,
    expectedBackupRevision,
    localRevision: revision,
    envelope: envelope(deviceId, revision, value),
  };
}

function findFiles(rootDir, name) {
  const matches = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.name === name) matches.push(target);
    }
  }
  if (fs.existsSync(rootDir)) visit(rootDir);
  return matches;
}

function assertCode(expectedCode) {
  return (error) => {
    assert.equal(error.code, expectedCode);
    return true;
  };
}

test('appends immutable per-device snapshots with complete metadata', (t) => {
  const rootDir = temporaryDirectory(t);
  const store = fixtureStore(t, { rootDir });
  const result = store.appendSnapshot(request('device-a', 1, 0, 'first'));

  assert.equal(result.idempotent, false);
  assert.equal(result.retained, true);
  assert.deepEqual(Object.keys(result.metadata).sort(), [
    'backupRevision', 'bytes', 'createdAt', 'localRevision', 'sha256', 'snapshotId',
  ]);
  assert.equal(result.metadata.backupRevision, 1);
  assert.equal(result.metadata.localRevision, 1);
  assert.match(result.metadata.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.metadata.bytes, Buffer.byteLength(JSON.stringify(request('device-a', 1, 0, 'first').envelope)));
  assert.deepEqual(store.getHead('device-a'), result.metadata);
  assert.deepEqual(store.readSnapshot('device-a', result.metadata.snapshotId), {
    metadata: result.metadata,
    envelope: envelope('device-a', 1, 'first'),
  });
});

test('persists idempotent mutation results across store restarts', (t) => {
  const rootDir = temporaryDirectory(t);
  const firstStore = fixtureStore(t, { rootDir });
  const mutation = request('device-a', 1, 0, 'first');
  const first = firstStore.appendSnapshot(mutation);

  const restartedStore = fixtureStore(t, { rootDir });
  const duplicate = restartedStore.appendSnapshot(mutation);
  assert.equal(duplicate.idempotent, true);
  assert.deepEqual(duplicate.metadata, first.metadata);
  assert.equal(restartedStore.listSnapshots('device-a').length, 1);

  assert.throws(
    () => restartedStore.appendSnapshot({
      ...mutation,
      envelope: envelope('device-a', 1, 'changed'),
    }),
    assertCode('MUTATION_ID_REUSED'),
  );
});

test('enforces expectedBackupRevision CAS without changing prior snapshots', (t) => {
  const rootDir = temporaryDirectory(t);
  const store = fixtureStore(t, { rootDir });
  const first = store.appendSnapshot(request('device-a', 1, 0));
  const indexPath = findFiles(rootDir, 'index.json')[0];
  const before = fs.readFileSync(indexPath);

  assert.throws(
    () => store.appendSnapshot(request('device-a', 2, 0)),
    assertCode('BACKUP_REVISION_CONFLICT'),
  );
  assert.deepEqual(fs.readFileSync(indexPath), before);
  assert.deepEqual(store.listSnapshots('device-a'), [first.metadata]);
});

test('retains only the latest ten snapshot bodies while preserving the mutation audit', (t) => {
  const rootDir = temporaryDirectory(t);
  const store = fixtureStore(t, { rootDir });
  let first;
  let latest;
  for (let revision = 1; revision <= SNAPSHOT_RETENTION_COUNT + 1; revision += 1) {
    const appended = store.appendSnapshot(request('device-a', revision));
    if (revision === 1) first = appended;
    latest = appended;
  }

  const listed = store.listSnapshots('device-a');
  assert.equal(listed.length, SNAPSHOT_RETENTION_COUNT);
  assert.deepEqual(listed.map((metadata) => metadata.backupRevision), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  assert.deepEqual(latest.prunedSnapshotIds, [first.metadata.snapshotId]);
  assert.throws(
    () => store.readSnapshot('device-a', first.metadata.snapshotId),
    assertCode('SNAPSHOT_NOT_FOUND'),
  );

  const snapshotFiles = findFiles(rootDir, 'index.json')[0]
    ? findFiles(path.dirname(findFiles(rootDir, 'index.json')[0]), 'snapshot-1.json')
    : [];
  assert.equal(snapshotFiles.length, 0);

  const replay = store.appendSnapshot(request('device-a', 1, 0));
  assert.equal(replay.idempotent, true);
  assert.equal(replay.retained, false);
  assert.deepEqual(replay.metadata, first.metadata);
});

test('bounds the idempotency audit window and continues backing up after compaction', (t) => {
  const rootDir = temporaryDirectory(t);
  const store = fixtureStore(t, { rootDir, maxMutationRecords: 10 });
  for (let revision = 1; revision <= 12; revision += 1) {
    store.appendSnapshot(request('device-a', revision));
  }
  const indexPath = findFiles(rootDir, 'index.json')[0];
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  assert.equal(index.mutationFloorRevision, 2);
  assert.equal(index.mutations.length, 10);
  assert.deepEqual(index.mutations.map((item) => item.metadata.backupRevision), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

  const next = store.appendSnapshot(request('device-a', 13));
  assert.equal(next.metadata.backupRevision, 13);
  assert.throws(
    () => store.appendSnapshot(request('device-a', 1, 0)),
    assertCode('BACKUP_REVISION_CONFLICT'),
  );
});

test('rejects capacity overflow without deleting or replacing retained data', (t) => {
  const rootDir = temporaryDirectory(t);
  const firstEnvelope = envelope('device-a', 1, 'first');
  const secondEnvelope = envelope('device-a', 2, 'second');
  const maxTotalBytes = Buffer.byteLength(JSON.stringify(firstEnvelope))
    + Buffer.byteLength(JSON.stringify(secondEnvelope)) - 1;
  const store = fixtureStore(t, { rootDir, maxTotalBytes });
  const first = store.appendSnapshot(request('device-a', 1, 0, 'first'));
  const indexPath = findFiles(rootDir, 'index.json')[0];
  const before = fs.readFileSync(indexPath);

  assert.throws(
    () => store.appendSnapshot(request('device-a', 2, 1, 'second')),
    assertCode('CAPACITY_EXCEEDED'),
  );
  assert.deepEqual(fs.readFileSync(indexPath), before);
  assert.deepEqual(store.listSnapshots('device-a'), [first.metadata]);
  assert.equal(store.readSnapshot('device-a', first.metadata.snapshotId).envelope.state.value, 'first');
});

test('applies the retained-byte capacity across all device indexes', (t) => {
  const rootDir = temporaryDirectory(t);
  const firstEnvelope = envelope('device-a', 1, 'first');
  const secondEnvelope = envelope('device-b', 1, 'second');
  const maxTotalBytes = Buffer.byteLength(JSON.stringify(firstEnvelope))
    + Buffer.byteLength(JSON.stringify(secondEnvelope)) - 1;
  const store = fixtureStore(t, { rootDir, maxTotalBytes });
  const first = store.appendSnapshot(request('device-a', 1, 0, 'first'));

  assert.throws(
    () => store.appendSnapshot(request('device-b', 1, 0, 'second')),
    assertCode('CAPACITY_EXCEEDED'),
  );
  assert.deepEqual(store.listSnapshots('device-a'), [first.metadata]);
  assert.deepEqual(store.listSnapshots('device-b'), []);
});

test('rejects mutation audit index overflow without changing the current head', (t) => {
  const rootDir = temporaryDirectory(t);
  const initialStore = fixtureStore(t, { rootDir });
  const first = initialStore.appendSnapshot(request('device-a', 1, 0, 'first'));
  const indexPath = findFiles(rootDir, 'index.json')[0];
  const before = fs.readFileSync(indexPath);
  const cappedStore = fixtureStore(t, {
    rootDir,
    maxIndexBytes: before.length + 1,
  });

  assert.throws(
    () => cappedStore.appendSnapshot(request('device-a', 2, 1, 'second')),
    assertCode('CAPACITY_EXCEEDED'),
  );
  assert.deepEqual(fs.readFileSync(indexPath), before);
  assert.deepEqual(cappedStore.getHead('device-a'), first.metadata);
});

test('isolates a corrupted historical snapshot while keeping the healthy head recoverable', (t) => {
  const rootDir = temporaryDirectory(t);
  const store = fixtureStore(t, { rootDir });
  const first = store.appendSnapshot(request('device-a', 1, 0, 'first'));
  const second = store.appendSnapshot(request('device-a', 2, 1, 'second'));
  const indexPath = findFiles(rootDir, 'index.json')[0];
  const snapshotFile = findFiles(rootDir, `${first.metadata.snapshotId}.json`)[0];
  const indexBefore = fs.readFileSync(indexPath);
  fs.writeFileSync(snapshotFile, '{"tampered":true}', 'utf8');

  assert.deepEqual(store.listSnapshots('device-a'), [second.metadata, first.metadata]);
  assert.equal(store.readSnapshot('device-a', second.metadata.snapshotId).envelope.state.value, 'second');
  assert.throws(
    () => store.readSnapshot('device-a', first.metadata.snapshotId),
    assertCode('CORRUPT_STORE'),
  );
  assert.throws(
    () => store.appendSnapshot(request('device-a', 3, 2, 'third')),
    assertCode('CORRUPT_STORE'),
  );
  assert.deepEqual(fs.readFileSync(indexPath), indexBefore);
  assert.equal(fs.readFileSync(snapshotFile, 'utf8'), '{"tampered":true}');
});

test('rejects unsafe snapshot paths before touching the filesystem', (t) => {
  const rootDir = temporaryDirectory(t);
  const store = createBackupStoreV3({
    rootDir,
    createSnapshotId: () => '../../../escaped',
  });

  assert.throws(
    () => store.appendSnapshot(request('device-a', 1, 0)),
    assertCode('INVALID_ARGUMENT'),
  );
  assert.throws(
    () => store.readSnapshot('device-a', '../index'),
    assertCode('INVALID_ARGUMENT'),
  );
  assert.equal(findFiles(rootDir, 'index.json').length, 0);
  assert.equal(fs.existsSync(path.join(rootDir, 'escaped.json')), false);
});

test('rejects values that JSON.stringify would silently change or discard', (t) => {
  const rootDir = temporaryDirectory(t);
  const store = fixtureStore(t, { rootDir });
  const withUndefined = request('device-a', 1, 0);
  withUndefined.envelope.state.omitted = undefined;
  assert.throws(() => store.appendSnapshot(withUndefined), assertCode('INVALID_ARGUMENT'));

  const withNaN = request('device-a', 1, 0);
  withNaN.envelope.state.value = Number.NaN;
  assert.throws(() => store.appendSnapshot(withNaN), assertCode('INVALID_ARGUMENT'));
  assert.equal(findFiles(rootDir, 'index.json').length, 0);
});

test('serializes writers with a cross-process lock before reading the CAS head', (t) => {
  const rootDir = temporaryDirectory(t);
  const store = fixtureStore(t, { rootDir });
  const lockPath = path.join(rootDir, '.backup-store-v3.lock');
  fs.writeFileSync(lockPath, JSON.stringify({
    pid: process.pid,
    token: 'other-writer',
    createdAt: new Date().toISOString(),
  }), 'utf8');

  assert.throws(
    () => store.appendSnapshot(request('device-a', 1, 0)),
    assertCode('STORE_BUSY'),
  );
  assert.equal(findFiles(rootDir, 'index.json').length, 0);
  fs.rmSync(lockPath);
  assert.equal(store.appendSnapshot(request('device-a', 1, 0)).metadata.backupRevision, 1);
});

test('removes uncommitted orphan files before accepting the next mutation', (t) => {
  const rootDir = temporaryDirectory(t);
  const store = fixtureStore(t, { rootDir });
  store.appendSnapshot(request('device-a', 1, 0));
  const indexPath = findFiles(rootDir, 'index.json')[0];
  const snapshotsDirectory = path.join(path.dirname(indexPath), 'snapshots');
  const orphanPath = path.join(snapshotsDirectory, '.orphan.tmp');
  fs.writeFileSync(orphanPath, 'orphan');

  assert.equal(store.appendSnapshot(request('device-a', 2, 1)).metadata.backupRevision, 2);
  assert.equal(fs.existsSync(orphanPath), false);
});

test('rejects a corrupted index instead of creating an empty replacement', (t) => {
  const rootDir = temporaryDirectory(t);
  const store = fixtureStore(t, { rootDir });
  store.appendSnapshot(request('device-a', 1, 0));
  const indexPath = findFiles(rootDir, 'index.json')[0];
  fs.writeFileSync(indexPath, '{broken', 'utf8');

  assert.throws(
    () => store.appendSnapshot(request('device-a', 2, 1)),
    assertCode('CORRUPT_STORE'),
  );
  assert.equal(fs.readFileSync(indexPath, 'utf8'), '{broken');
});

test('maintains independent CAS heads and indexes for different devices', (t) => {
  const store = fixtureStore(t);
  const firstA = store.appendSnapshot(request('device-a', 1, 0, 'a'));
  const firstB = store.appendSnapshot(request('device-b', 1, 0, 'b'));

  assert.equal(firstA.metadata.backupRevision, 1);
  assert.equal(firstB.metadata.backupRevision, 1);
  assert.equal(store.readSnapshot('device-a', firstA.metadata.snapshotId).envelope.state.value, 'a');
  assert.equal(store.readSnapshot('device-b', firstB.metadata.snapshotId).envelope.state.value, 'b');
});

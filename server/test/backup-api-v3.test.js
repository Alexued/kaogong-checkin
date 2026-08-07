'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  BACKUP_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  createKgcServer,
} = require('../src/server');
const { BACKUP_FORMAT_VERSION } = require('../src/backupStoreV3');

const silentLogger = { info() {}, warn() {}, error() {} };

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kaogong-backup-api-v3-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

async function pair(baseUrl, code) {
  const response = await fetch(`${baseUrl}/api/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, protocolVersion: PROTOCOL_VERSION }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function envelope(deviceId, revision, marker = revision) {
  return {
    schemaVersion: 3,
    revision,
    deviceId,
    savedAt: '2026-08-08T00:00:00.000Z',
    state: { marker },
  };
}

function mutation(deviceId, revision, expectedBackupRevision = revision - 1, marker = revision) {
  return {
    mutationId: `mutation-${revision}`,
    deviceId,
    expectedBackupRevision,
    localRevision: revision,
    envelope: envelope(deviceId, revision, marker),
  };
}

async function postSnapshot(baseUrl, token, body) {
  return fetch(`${baseUrl}/api/v3/backups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  });
}

test('v3 backup API authenticates, appends, lists, reads, and replays idempotently', async (t) => {
  const dataDir = temporaryDirectory(t);
  const service = createKgcServer({
    dataDir,
    webDir: null,
    updateDir: dataDir,
    httpHost: '127.0.0.1',
    httpPort: 0,
    udpEnabled: false,
    pairingCode: '123456',
    logger: silentLogger,
  });
  t.after(() => service.close());

  const status = await service.start();
  const baseUrl = `http://127.0.0.1:${status.httpPort}`;
  const info = await (await fetch(`${baseUrl}/api/info`)).json();
  assert.equal(info.backupProtocolVersion, BACKUP_PROTOCOL_VERSION);
  assert.equal(info.backupFormatVersion, BACKUP_FORMAT_VERSION);

  const credentials = await pair(baseUrl, service.getPairingCode());
  assert.equal(credentials.backupProtocolVersion, BACKUP_PROTOCOL_VERSION);
  assert.equal(credentials.backupFormatVersion, BACKUP_FORMAT_VERSION);

  const unauthenticated = await postSnapshot(baseUrl, '', mutation('device-a', 1, 0));
  assert.equal(unauthenticated.status, 401);

  const firstResponse = await postSnapshot(
    baseUrl,
    credentials.token,
    mutation('device-a', 1, 0, 'first'),
  );
  assert.equal(firstResponse.status, 201);
  const first = await firstResponse.json();
  assert.equal(first.idempotent, false);
  assert.equal(first.metadata.backupRevision, 1);

  const replayResponse = await postSnapshot(
    baseUrl,
    credentials.token,
    mutation('device-a', 1, 0, 'first'),
  );
  assert.equal(replayResponse.status, 200);
  const replay = await replayResponse.json();
  assert.equal(replay.idempotent, true);
  assert.deepEqual(replay.metadata, first.metadata);

  const listResponse = await fetch(`${baseUrl}/api/v3/backups/device-a`, {
    headers: authHeaders(credentials.token),
  });
  assert.equal(listResponse.status, 200);
  const listed = await listResponse.json();
  assert.deepEqual(listed.head, first.metadata);
  assert.deepEqual(listed.snapshots, [first.metadata]);

  const readResponse = await fetch(
    `${baseUrl}/api/v3/backups/device-a/${encodeURIComponent(first.metadata.snapshotId)}`,
    { headers: authHeaders(credentials.token) },
  );
  assert.equal(readResponse.status, 200);
  const read = await readResponse.json();
  assert.deepEqual(read.envelope, envelope('device-a', 1, 'first'));
  assert.deepEqual(read.metadata, first.metadata);
});

test('v3 backup API returns stable CAS and mutation-reuse errors without changing the head', async (t) => {
  const dataDir = temporaryDirectory(t);
  const service = createKgcServer({
    dataDir,
    webDir: null,
    updateDir: dataDir,
    httpHost: '127.0.0.1',
    httpPort: 0,
    udpEnabled: false,
    allowLegacy: true,
    logger: silentLogger,
  });
  t.after(() => service.close());

  const status = await service.start();
  const baseUrl = `http://127.0.0.1:${status.httpPort}`;
  const first = await (await postSnapshot(baseUrl, '', mutation('device-b', 1, 0, 'first'))).json();

  const conflictResponse = await postSnapshot(
    baseUrl,
    '',
    mutation('device-b', 2, 0, 'conflict'),
  );
  assert.equal(conflictResponse.status, 409);
  const conflict = await conflictResponse.json();
  assert.equal(conflict.code, 'BACKUP_REVISION_CONFLICT');
  assert.equal(conflict.details.actualBackupRevision, 1);

  const reusedRequest = mutation('device-b', 1, 0, 'changed');
  const reusedResponse = await postSnapshot(baseUrl, '', reusedRequest);
  assert.equal(reusedResponse.status, 409);
  assert.equal((await reusedResponse.json()).code, 'MUTATION_ID_REUSED');

  const listed = await (await fetch(`${baseUrl}/api/v3/backups/device-b`)).json();
  assert.deepEqual(listed.head, first.metadata);
  assert.equal(listed.snapshots.length, 1);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createKgcServer } = require('../src/server');
const { isValidV2State, migrateStoredState } = require('../src/stateSchema');

const silentLogger = { info() {}, warn() {}, error() {} };

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kaogong-schema-v2-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('server upgrades legacy disk state and advertises the v2 state protocol', async (t) => {
  const dataDir = temporaryDirectory(t);
  fs.writeFileSync(path.join(dataDir, 'data.json'), JSON.stringify({
    tasks: [{ id: 'task-1', title: '资料分析', updatedAt: '2026-08-01T00:00:00.000Z' }],
    checkins: [{
      id: 'c1', taskId: 'task-1', date: '2026-08-01', deleted: false,
      updatedAt: '2026-08-01T01:00:00.000Z',
    }],
    settings: { theme: 'light' },
  }), 'utf8');
  const service = createKgcServer({
    dataDir, webDir: null, updateDir: dataDir, httpHost: '127.0.0.1', httpPort: 0,
    udpEnabled: false, allowLegacy: true, logger: silentLogger,
  });
  t.after(() => service.close());
  const status = await service.start();
  const baseUrl = `http://127.0.0.1:${status.httpPort}`;

  const info = await (await fetch(`${baseUrl}/api/info`)).json();
  assert.equal(info.stateSchemaVersion, 2);
  assert.equal(info.minimumClientStateSchemaVersion, 2);
  const state = await (await fetch(`${baseUrl}/api/state`)).json();
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.settings.appMode, 'exam');
  assert.equal(state.tasks[0].target, 1);
  assert.equal(state.tasks[0].unit, '');
  assert.equal(state.checkins[0].progress, 1);
  assert.equal(state.checkins[0].targetSnapshot, 1);
  assert.equal(state.checkins[0].unitSnapshot, '');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'data.json'), 'utf8')).schemaVersion, 2);
});

test('server state migration defaults missing modes, preserves general, and rejects invalid values', () => {
  const base = {
    schemaVersion: 2,
    tasks: [], subtasks: [], checkins: [], timers: [], drills: [], formulaDrills: [],
    settings: { theme: 'light' },
  };
  assert.equal(isValidV2State(base), true);
  assert.equal(migrateStoredState(base, { appMode: 'exam' }).settings.appMode, 'exam');
  assert.equal(
    migrateStoredState({ ...base, settings: { ...base.settings, appMode: 'general' } }, { appMode: 'exam' }).settings.appMode,
    'general',
  );
  const invalid = { ...base, settings: { ...base.settings, appMode: 'focus' } };
  assert.equal(isValidV2State(invalid), false);
  assert.throws(() => migrateStoredState(invalid, { appMode: 'exam' }), /app mode/i);
});

test('unsupported stored schema fails startup without overwriting source bytes', async (t) => {
  const dataDir = temporaryDirectory(t);
  const dataFile = path.join(dataDir, 'data.json');
  const source = Buffer.from(JSON.stringify({ schemaVersion: 3, tasks: [], checkins: [], future: true }));
  fs.writeFileSync(dataFile, source);
  const service = createKgcServer({
    dataDir, webDir: null, updateDir: dataDir, httpHost: '127.0.0.1', httpPort: 0,
    udpEnabled: false, allowLegacy: true, logger: silentLogger,
  });
  t.after(() => service.close());
  await assert.rejects(service.start(), /unsupported state schema version/);
  assert.deepEqual(fs.readFileSync(dataFile), source);
});

test('missing-schema full replacement is rejected without changing persisted v2 bytes', async (t) => {
  const dataDir = temporaryDirectory(t);
  const service = createKgcServer({
    dataDir, webDir: null, updateDir: dataDir, httpHost: '127.0.0.1', httpPort: 0,
    udpEnabled: false, allowLegacy: true, logger: silentLogger,
  });
  t.after(() => service.close());
  const status = await service.start();
  const baseUrl = `http://127.0.0.1:${status.httpPort}`;
  const dataFile = path.join(dataDir, 'data.json');
  const before = fs.readFileSync(dataFile);

  const response = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks: [], subtasks: [], checkins: [], timers: [], drills: [], formulaDrills: [], settings: {} }),
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'STATE_SCHEMA_VERSION_REQUIRED');
  assert.deepEqual(fs.readFileSync(dataFile), before);

  const current = JSON.parse(before.toString('utf8'));
  current.tasks.push({ id: 'bad', target: 0, unit: '', updatedAt: '2026-08-01T00:00:00.000Z' });
  const invalidV2 = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(current),
  });
  assert.equal(invalidV2.status, 400);
  assert.equal((await invalidV2.json()).code, 'INVALID_STATE');
  assert.deepEqual(fs.readFileSync(dataFile), before);

  current.tasks = [];
  current.settings.appMode = 'focus';
  const invalidMode = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(current),
  });
  assert.equal(invalidMode.status, 400);
  assert.equal((await invalidMode.json()).code, 'INVALID_STATE');
  assert.deepEqual(fs.readFileSync(dataFile), before);
});

test('legacy websocket upserts preserve v2 fields on existing entities', async (t) => {
  const dataDir = temporaryDirectory(t);
  const service = createKgcServer({
    dataDir, webDir: null, updateDir: dataDir, httpHost: '127.0.0.1', httpPort: 0,
    udpEnabled: false, allowLegacy: true, logger: silentLogger,
  });
  t.after(() => service.close());
  const status = await service.start();
  const baseUrl = `http://127.0.0.1:${status.httpPort}`;
  const initial = await (await fetch(`${baseUrl}/api/state`)).json();
  initial.tasks.push({
    id: 'task-1', title: '资料分析', type: 'daily', target: 20, unit: '题', endDate: null,
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', archived: false, order: 0,
  });
  initial.checkins.push({
    id: 'checkin-1', taskId: 'task-1', date: '2026-08-01', progress: 7,
    targetSnapshot: 20, unitSnapshot: '题', deleted: false,
    createdAt: '2026-08-01T01:00:00.000Z', updatedAt: '2026-08-01T01:00:00.000Z',
  });
  let response = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(initial),
  });
  assert.equal(response.status, 200);

  const { WebSocket } = require('ws');
  const socket = new WebSocket(`ws://127.0.0.1:${status.httpPort}/ws`);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.send(JSON.stringify({
    kind: 'upsert', entity: 'task',
    payload: { id: 'task-1', title: '资料分析（旧端改名）', updatedAt: '2026-08-02T00:00:00.000Z' },
    clientMutationId: 'legacy-upsert',
  }));
  await new Promise((resolve, reject) => {
    socket.once('message', resolve);
    socket.once('error', reject);
  });
  socket.send(JSON.stringify({
    kind: 'upsert', entity: 'checkin',
    payload: { id: 'checkin-1', deleted: false, updatedAt: '2026-08-02T01:00:00.000Z' },
    clientMutationId: 'legacy-checkin-upsert',
  }));
  await new Promise((resolve, reject) => {
    socket.once('message', resolve);
    socket.once('error', reject);
  });
  socket.close();
  response = await fetch(`${baseUrl}/api/state`);
  const state = await response.json();
  assert.equal(state.tasks[0].title, '资料分析（旧端改名）');
  assert.equal(state.tasks[0].target, 20);
  assert.equal(state.tasks[0].unit, '题');
  assert.equal(state.checkins[0].progress, 7);
  assert.equal(state.checkins[0].targetSnapshot, 20);
  assert.equal(state.checkins[0].unitSnapshot, '题');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const WebSocket = require('ws');

const {
  PROTOCOL_VERSION,
  collectActiveIpv4InterfaceNames,
  collectUdpBroadcastAddresses,
  createKgcServer,
  directedBroadcastAddress,
} = require('../src/server');

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

function temporaryDirectory(t, prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function authHeaders(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

async function pair(baseUrl, code, body = {}) {
  const response = await fetch(`${baseUrl}/api/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      protocolVersion: PROTOCOL_VERSION,
      clientName: 'Node test client',
      ...body,
    }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

function nextJsonMessage(socket) {
  return new Promise((resolve, reject) => {
    const onMessage = (raw) => {
      cleanup();
      try {
        resolve(JSON.parse(raw.toString()));
      } catch (error) {
        reject(error);
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off('message', onMessage);
      socket.off('error', onError);
    };
    socket.once('message', onMessage);
    socket.once('error', onError);
  });
}

function openWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function expectWebSocketStatus(url, expectedStatus) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.on('error', () => {});
    socket.once('open', () => {
      socket.close();
      reject(new Error('WebSocket unexpectedly opened'));
    });
    socket.once('unexpected-response', (request, response) => {
      try {
        assert.equal(response.statusCode, expectedStatus);
        response.resume();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

test('factory protects state, rate-limits pairing, persists tokens, and restarts cleanly', async (t) => {
  const dataDir = temporaryDirectory(t, 'kaogong-server-data-');
  const updateDir = temporaryDirectory(t, 'kaogong-server-updates-');
  const apkName = 'kaogong-checkin-v0.6.0.apk';
  fs.writeFileSync(path.join(updateDir, apkName), 'apk-content');

  const service = createKgcServer({
    dataDir,
    updateDir,
    webDir: null,
    httpHost: '127.0.0.1',
    httpPort: 0,
    udpEnabled: false,
    pairingCode: '123456',
    serverId: 'server-lifecycle-test',
    pairRateLimitMax: 2,
    getLanAddresses: () => ['192.168.50.7'],
    logger: silentLogger,
  });
  t.after(() => service.close());
  const unsubscribeFailingListener = service.subscribe(() => {
    throw new Error('host UI listener failed');
  });

  const [firstStatus, concurrentStatus] = await Promise.all([service.start(), service.start()]);
  unsubscribeFailingListener();
  assert.equal(firstStatus.running, true);
  assert.equal(concurrentStatus.httpPort, firstStatus.httpPort);
  assert.equal(firstStatus.serverId, 'server-lifecycle-test');
  assert.equal(firstStatus.protocolVersion, PROTOCOL_VERSION);
  assert.equal(firstStatus.apkFileName, apkName);
  assert.equal(firstStatus.apkVersion, '0.6.0');
  assert.equal(
    firstStatus.apkDownloadUrl,
    `http://192.168.50.7:${firstStatus.httpPort}/updates/${apkName}`,
  );

  let baseUrl = `http://127.0.0.1:${firstStatus.httpPort}`;
  const infoResponse = await fetch(`${baseUrl}/api/info`);
  assert.equal(infoResponse.status, 200);
  const info = await infoResponse.json();
  assert.deepEqual(
    {
      serverId: info.serverId,
      httpPort: info.httpPort,
      pairingRequired: info.pairingRequired,
      protocolVersion: info.protocolVersion,
      legacyMode: info.legacyMode,
    },
    {
      serverId: 'server-lifecycle-test',
      httpPort: firstStatus.httpPort,
      pairingRequired: true,
      protocolVersion: PROTOCOL_VERSION,
      legacyMode: false,
    },
  );
  assert.equal(Object.hasOwn(info, 'pairingCode'), false);
  assert.equal(Object.hasOwn(info, 'token'), false);
  assert.equal(info.apkAvailable, true);
  assert.equal(info.apkFileName, apkName);
  assert.equal(info.apkVersion, '0.6.0');

  const preflight = await fetch(`${baseUrl}/api/state`, { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers') || '', /Authorization/i);

  const unauthenticated = await fetch(`${baseUrl}/api/state`);
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).code, 'AUTH_REQUIRED');

  const incompatible = await fetch(`${baseUrl}/api/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '123456', protocolVersion: PROTOCOL_VERSION + 1 }),
  });
  assert.equal(incompatible.status, 409);
  assert.equal((await incompatible.json()).code, 'PROTOCOL_VERSION_UNSUPPORTED');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const wrongCode = await fetch(`${baseUrl}/api/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '000000', protocolVersion: PROTOCOL_VERSION }),
    });
    assert.equal(wrongCode.status, 401);
    assert.equal((await wrongCode.json()).code, 'PAIRING_CODE_INVALID');
  }
  const limited = await fetch(`${baseUrl}/api/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '123456', protocolVersion: PROTOCOL_VERSION }),
  });
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).code, 'PAIR_RATE_LIMITED');

  const reset = service.regeneratePairing();
  assert.match(reset.pairingCode, /^\d{6}$/);
  assert.notEqual(reset.pairingCode, '123456');
  const credentials = await pair(baseUrl, reset.pairingCode);
  assert.equal(credentials.serverId, 'server-lifecycle-test');
  assert.equal(credentials.protocolVersion, PROTOCOL_VERSION);
  assert.match(credentials.token, /^[A-Za-z0-9_-]{40,}$/);

  const securityText = fs.readFileSync(path.join(dataDir, 'pairing.json'), 'utf8');
  assert.doesNotMatch(securityText, new RegExp(credentials.token));
  assert.match(securityText, /"hash": "[a-f0-9]{64}"/);

  const invalidState = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: authHeaders(credentials.token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ tasks: [] }),
  });
  assert.equal(invalidState.status, 409);
  assert.equal((await invalidState.json()).code, 'STATE_SCHEMA_VERSION_REQUIRED');

  const state = {
    schemaVersion: 2,
    tasks: [{ id: 'task-1', title: '资料分析', target: 20, unit: '题', updatedAt: '2026-08-05T00:00:00.000Z' }],
    subtasks: [],
    checkins: [],
    timers: [],
    drills: [],
    formulaDrills: [],
    settings: { appMode: 'general', theme: 'light', note: '本地优先', updatedAt: '2026-08-05T00:00:00.000Z' },
  };
  const putState = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: authHeaders(credentials.token, { 'Content-Type': 'application/json; charset=utf-8' }),
    body: JSON.stringify(state),
  });
  assert.equal(putState.status, 200);
  assert.deepEqual(await putState.json(), state);

  await service.close();
  assert.equal(service.getStatus().running, false);
  await assert.rejects(fetch(`${baseUrl}/api/info`));

  const restarted = await service.start();
  baseUrl = `http://127.0.0.1:${restarted.httpPort}`;
  const afterRestart = await fetch(`${baseUrl}/api/state`, {
    headers: authHeaders(credentials.token),
  });
  assert.equal(afterRestart.status, 200);
  assert.deepEqual(await afterRestart.json(), state);
  await service.close();
  await service.close();

  const reloadedService = createKgcServer({
    dataDir,
    updateDir,
    webDir: null,
    httpHost: '127.0.0.1',
    httpPort: 0,
    udpEnabled: false,
    logger: {
      info() {
        throw new Error('logger failed');
      },
      warn() {
        throw new Error('logger failed');
      },
      error() {
        throw new Error('logger failed');
      },
    },
  });
  t.after(() => reloadedService.close());
  const reloadedStatus = await reloadedService.start();
  assert.equal(reloadedStatus.serverId, 'server-lifecycle-test');
  assert.equal(reloadedService.getPairingCode(), reset.pairingCode);
  const reloadedState = await fetch(`http://127.0.0.1:${reloadedStatus.httpPort}/api/state`, {
    headers: authHeaders(credentials.token),
  });
  assert.equal(reloadedState.status, 200);
  assert.deepEqual(await reloadedState.json(), state);
  await reloadedService.close();
});

test('invalid local security options fail before allocating resources', () => {
  assert.throws(
    () => createKgcServer({ pairingCode: '12345' }),
    /pairingCode must contain exactly six digits/,
  );
});

test('a pre-listen startup failure returns to stopped and can be retried', async (t) => {
  const parentDir = temporaryDirectory(t, 'kaogong-retry-data-');
  const dataDir = path.join(parentDir, 'data-as-file');
  fs.writeFileSync(dataDir, 'not a directory');
  const service = createKgcServer({
    dataDir,
    webDir: null,
    updateDir: parentDir,
    httpHost: '127.0.0.1',
    httpPort: 0,
    udpEnabled: false,
    logger: silentLogger,
  });
  t.after(() => service.close());

  await assert.rejects(service.start());
  const failedStatus = service.getStatus();
  assert.equal(failedStatus.state, 'stopped');
  assert.equal(failedStatus.running, false);
  assert.equal(failedStatus.serverId, null);
  assert.ok(failedStatus.lastError);

  fs.rmSync(dataDir);
  const recoveredStatus = await service.start();
  assert.equal(recoveredStatus.running, true);
  assert.match(recoveredStatus.serverId, /^[0-9a-f-]{36}$/i);
  await service.close();
});

test('WebSocket authentication, mutation acknowledgements, replay, and revocation work', async (t) => {
  const dataDir = temporaryDirectory(t, 'kaogong-ws-data-');
  const service = createKgcServer({
    dataDir,
    webDir: null,
    updateDir: dataDir,
    httpHost: '127.0.0.1',
    httpPort: 0,
    udpEnabled: false,
    pairingCode: '654321',
    logger: silentLogger,
  });
  t.after(() => service.close());

  const status = await service.start();
  const baseUrl = `http://127.0.0.1:${status.httpPort}`;
  const webSocketUrl = `ws://127.0.0.1:${status.httpPort}/ws`;
  await expectWebSocketStatus(webSocketUrl, 401);

  const credentials = await pair(baseUrl, service.getPairingCode());
  const socket = await openWebSocket(`${webSocketUrl}?token=${encodeURIComponent(credentials.token)}`);

  const mutation = {
    kind: 'upsert',
    entity: 'task',
    payload: {
      id: 'mutation-task',
      title: '判断推理',
      updatedAt: '2026-08-05T01:00:00.000Z',
    },
    clientMutationId: 'mutation-1',
  };
  let messagePromise = nextJsonMessage(socket);
  socket.send(JSON.stringify(mutation));
  assert.deepEqual(await messagePromise, {
    kind: 'ack',
    clientMutationId: 'mutation-1',
    applied: true,
    protocolVersion: PROTOCOL_VERSION,
    stateSchemaVersion: 2,
  });

  messagePromise = nextJsonMessage(socket);
  socket.send(JSON.stringify(mutation));
  const replayAck = await messagePromise;
  assert.equal(replayAck.kind, 'ack');
  assert.equal(replayAck.clientMutationId, 'mutation-1');

  messagePromise = nextJsonMessage(socket);
  socket.send(JSON.stringify({
    kind: 'upsert',
    entity: 'settings',
    payload: { appMode: 'general', updatedAt: '2099-08-05T02:00:00.000Z' },
    clientMutationId: 'settings-general',
  }));
  assert.equal((await messagePromise).applied, true);

  messagePromise = nextJsonMessage(socket);
  socket.send(JSON.stringify({
    kind: 'upsert',
    entity: 'settings',
    payload: { appMode: 'focus', updatedAt: '2099-08-05T03:00:00.000Z' },
    clientMutationId: 'settings-invalid',
  }));
  assert.deepEqual(await messagePromise, {
    kind: 'error',
    code: 'INVALID_MUTATION',
    clientMutationId: 'settings-invalid',
  });

  const stateResponse = await fetch(`${baseUrl}/api/state`, {
    headers: authHeaders(credentials.token),
  });
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].id, 'mutation-task');
  assert.equal(state.settings.appMode, 'general');

  const closed = new Promise((resolve) => socket.once('close', (code) => resolve(code)));
  const reset = service.regeneratePairing();
  assert.equal(await closed, 4001);
  assert.equal(reset.revokedTokens, 1);

  const revoked = await fetch(`${baseUrl}/api/state`, {
    headers: authHeaders(credentials.token),
  });
  assert.equal(revoked.status, 401);
  await expectWebSocketStatus(
    `${webSocketUrl}?token=${encodeURIComponent(credentials.token)}`,
    401,
  );

  const replacement = await pair(baseUrl, reset.pairingCode);
  const replacementSocket = await openWebSocket(
    `${webSocketUrl}?token=${encodeURIComponent(replacement.token)}`,
  );
  replacementSocket.close();
});

test('HTTP port fallback and UDP discovery expose only public identity fields', async (t) => {
  const dataDir = temporaryDirectory(t, 'kaogong-network-data-');
  fs.writeFileSync(path.join(dataDir, 'kaogong-checkin-v0.7.0.apk'), 'apk');
  const blocker = net.createServer();
  await new Promise((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => blocker.close(resolve)));
  const blockedPort = blocker.address().port;

  const udpReceiver = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => {
    udpReceiver.once('error', reject);
    udpReceiver.bind(0, '127.0.0.1', resolve);
  });
  t.after(() => {
    try {
      udpReceiver.close();
    } catch {
      // Already closed by a failed assertion.
    }
  });
  let discoveryCount = 0;
  const discoveryMessage = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('UDP discovery message was not received')), 2000);
    udpReceiver.on('message', (message) => {
      discoveryCount += 1;
      if (discoveryCount === 1) {
        clearTimeout(timeout);
        resolve(JSON.parse(message.toString('utf8')));
      }
    });
  });

  const service = createKgcServer({
    dataDir,
    webDir: null,
    updateDir: dataDir,
    httpHost: '127.0.0.1',
    httpPort: blockedPort,
    httpPortEnd: Math.min(65_535, blockedPort + 10),
    udpPort: udpReceiver.address().port,
    udpBroadcastAddress: '127.0.0.1',
    udpIntervalMs: 25,
    pairingCode: '112233',
    serverId: 'udp-public-server',
    logger: silentLogger,
  });
  t.after(() => service.close());

  const status = await service.start();
  assert.notEqual(status.httpPort, blockedPort);
  assert.equal(status.udpBroadcasting, true);
  const payload = await discoveryMessage;
  assert.deepEqual(payload, {
    serverId: 'udp-public-server',
    name: os.hostname(),
    httpPort: status.httpPort,
    pairingRequired: true,
    protocolVersion: PROTOCOL_VERSION,
    stateSchemaVersion: 2,
    minimumClientStateSchemaVersion: 2,
    apkAvailable: true,
    apkVersion: '0.7.0',
  });
  assert.equal(Object.hasOwn(payload, 'pairingCode'), false);
  assert.equal(Object.hasOwn(payload, 'token'), false);

  await service.close();
  assert.equal(service.getStatus().udpBroadcasting, false);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const countAfterShutdown = discoveryCount;
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(discoveryCount, countAfterShutdown);

  const releasedPortProbe = net.createServer();
  await new Promise((resolve, reject) => {
    releasedPortProbe.once('error', reject);
    releasedPortProbe.listen(status.httpPort, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => releasedPortProbe.close(resolve));
});

test('directed UDP broadcast targets cover each active IPv4 network once', () => {
  assert.equal(directedBroadcastAddress('192.168.7.14', '255.255.255.0'), '192.168.7.255');
  assert.equal(directedBroadcastAddress('10.42.18.4', '255.255.0.0'), '10.42.255.255');
  assert.equal(directedBroadcastAddress('invalid', '255.255.255.0'), null);

  assert.deepEqual(
    collectUdpBroadcastAddresses({
      WiFi: [
        { family: 'IPv4', internal: false, address: '192.168.7.14', netmask: '255.255.255.0' },
        { family: 'IPv6', internal: false, address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::' },
      ],
      Ethernet: [
        { family: 4, internal: false, address: '10.42.18.4', netmask: '255.255.0.0' },
        { family: 'IPv4', internal: true, address: '127.0.0.1', netmask: '255.0.0.0' },
      ],
      Duplicate: [
        { family: 'IPv4', internal: false, address: '192.168.7.20', netmask: '255.255.255.0' },
      ],
    }),
    ['192.168.7.255', '10.42.255.255', '255.255.255.255'],
  );

  assert.deepEqual(
    collectActiveIpv4InterfaceNames({
      'Wi-Fi\rspoofed': [
        { family: 'IPv4', internal: false, address: '192.168.7.14', netmask: '255.255.255.0' },
      ],
      Loopback: [
        { family: 'IPv4', internal: true, address: '127.0.0.1', netmask: '255.0.0.0' },
      ],
    }),
    ['Wi-Fi spoofed'],
  );
});

test('backup recovery and explicit legacy mode preserve old clients', async (t) => {
  const dataDir = temporaryDirectory(t, 'kaogong-recovery-data-');
  fs.writeFileSync(path.join(dataDir, 'data.json'), '{corrupted', 'utf8');
  fs.writeFileSync(
    path.join(dataDir, 'data.json.bak'),
    JSON.stringify({
      tasks: [{ id: 'recovered', updatedAt: '2026-08-05T00:00:00.000Z' }],
      checkins: [],
      settings: { theme: 'light' },
    }),
    'utf8',
  );

  const service = createKgcServer({
    dataDir,
    webDir: null,
    updateDir: path.join(dataDir, 'missing-updates'),
    httpHost: '127.0.0.1',
    httpPort: 0,
    udpEnabled: false,
    allowLegacy: true,
    logger: silentLogger,
  });
  t.after(() => service.close());

  const status = await service.start();
  const baseUrl = `http://127.0.0.1:${status.httpPort}`;
  const info = await (await fetch(`${baseUrl}/api/info`)).json();
  assert.equal(info.legacyMode, true);
  assert.equal(info.pairingRequired, false);

  const stateResponse = await fetch(`${baseUrl}/api/state`);
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.equal(state.tasks[0].id, 'recovered');
  assert.equal(state.settings.appMode, 'exam');
  for (const collection of ['subtasks', 'timers', 'drills', 'formulaDrills']) {
    assert.deepEqual(state[collection], []);
  }

  const restoredOnDisk = JSON.parse(fs.readFileSync(path.join(dataDir, 'data.json'), 'utf8'));
  assert.equal(restoredOnDisk.tasks[0].id, 'recovered');
  assert.equal((await fetch(`${baseUrl}/api/update/latest`)).status, 404);
});

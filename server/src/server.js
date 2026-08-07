const crypto = require('node:crypto');
const dgram = require('node:dgram');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const express = require('express');
const { WebSocketServer } = require('ws');

const { findLatestApk } = require('./update');
const {
  STATE_SCHEMA_VERSION,
  isValidV2State,
  migrateStoredState,
  normalizeCheckin,
  normalizeTask,
} = require('./stateSchema');

const PROTOCOL_VERSION = 2;
const DEFAULT_HTTP_PORT = 8321;
const DEFAULT_HTTP_PORT_END = 8330;
const DEFAULT_UDP_PORT = 8322;
const DEFAULT_PAIR_RATE_LIMIT_MAX = 5;
const DEFAULT_PAIR_RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_STORED_TOKENS = 64;

const ENTITY_COLLECTION = {
  task: 'tasks',
  subtask: 'subtasks',
  checkin: 'checkins',
  timer: 'timers',
  drill: 'drills',
  formulaDrill: 'formulaDrills',
};

function defaultData() {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    tasks: [],
    subtasks: [],
    checkins: [],
    timers: [],
    drills: [],
    formulaDrills: [],
    settings: {
      planEndDate: null,
      theme: 'light',
      markDate: null,
      updatedAt: new Date().toISOString(),
    },
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function lanAddresses() {
  const addresses = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const networkInterface of interfaces[name] || []) {
      if (networkInterface.family === 'IPv4' && !networkInterface.internal) {
        addresses.push(networkInterface.address);
      }
    }
  }
  return [...new Set(addresses)];
}

function normalizePort(value, fallback, label) {
  const port = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError(`${label} must be an integer between 0 and 65535`);
  }
  return port;
}

function normalizePositiveInteger(value, fallback, label) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(result) || result <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return result;
}

function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(temporaryPath, filePath);
  } finally {
    try {
      if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
    } catch {
      // The next write can safely replace a stale temporary file.
    }
  }
}

function generatePairingCode(previousCode) {
  let code;
  do {
    code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  } while (code === previousCode);
  return code;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function timingSafeTextEqual(left, right) {
  const leftBuffer = Buffer.from(String(left), 'utf8');
  const rightBuffer = Buffer.from(String(right), 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function ipv4ToInteger(address) {
  const octets = String(address || '').split('.');
  if (octets.length !== 4) return null;
  let value = 0;
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) return null;
    const part = Number(octet);
    if (part < 0 || part > 255) return null;
    value = ((value << 8) | part) >>> 0;
  }
  return value;
}

function integerToIpv4(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

function directedBroadcastAddress(address, netmask) {
  const ip = ipv4ToInteger(address);
  const mask = ipv4ToInteger(netmask);
  if (ip === null || mask === null) return null;
  return integerToIpv4(((ip & mask) | (~mask >>> 0)) >>> 0);
}

function collectUdpBroadcastAddresses(interfaces, fallback = '255.255.255.255') {
  const targets = new Set();
  for (const entries of Object.values(interfaces || {})) {
    for (const entry of entries || []) {
      const family = typeof entry.family === 'string' ? entry.family : Number(entry.family);
      if ((family !== 'IPv4' && family !== 4) || entry.internal) continue;
      const target = directedBroadcastAddress(entry.address, entry.netmask);
      if (target) targets.add(target);
    }
  }
  if (fallback) targets.add(fallback);
  return [...targets];
}

function collectActiveIpv4InterfaceNames(interfaces) {
  const names = [];
  for (const [name, entries] of Object.entries(interfaces || {})) {
    const active = (entries || []).some((entry) => {
      const family = typeof entry.family === 'string' ? entry.family : Number(entry.family);
      return (family === 'IPv4' || family === 4) && !entry.internal;
    });
    if (active) names.push(String(name).replace(/[\r\n\t]/g, ' ').slice(0, 48));
  }
  return names;
}

function createKgcServer(options = {}) {
  const httpHost = options.httpHost || '0.0.0.0';
  const requestedHttpPort = normalizePort(options.httpPort, DEFAULT_HTTP_PORT, 'httpPort');
  const defaultPortEnd = requestedHttpPort === 0
    ? 0
    : options.httpPort === undefined
      ? DEFAULT_HTTP_PORT_END
      : requestedHttpPort;
  const requestedHttpPortEnd = normalizePort(
    options.httpPortEnd,
    defaultPortEnd,
    'httpPortEnd',
  );
  if (requestedHttpPortEnd < requestedHttpPort) {
    throw new TypeError('httpPortEnd must be greater than or equal to httpPort');
  }

  const udpPort = normalizePort(options.udpPort, DEFAULT_UDP_PORT, 'udpPort');
  const udpIntervalMs = normalizePositiveInteger(options.udpIntervalMs, 1000, 'udpIntervalMs');
  const pairRateLimitMax = normalizePositiveInteger(
    options.pairRateLimitMax,
    DEFAULT_PAIR_RATE_LIMIT_MAX,
    'pairRateLimitMax',
  );
  const pairRateLimitWindowMs = normalizePositiveInteger(
    options.pairRateLimitWindowMs,
    DEFAULT_PAIR_RATE_LIMIT_WINDOW_MS,
    'pairRateLimitWindowMs',
  );

  const dataDir = path.resolve(
    options.dataDir || path.join(__dirname, '..', 'data'),
  );
  const webDir = options.webDir === null || options.webDir === false
    ? null
    : path.resolve(options.webDir || path.join(__dirname, '..', '..', 'web', 'dist'));
  const updateDir = path.resolve(options.updateDir || path.join(__dirname, '..', '..'));
  const dataFile = path.join(dataDir, 'data.json');
  const backupFile = `${dataFile}.bak`;
  const securityFile = path.join(dataDir, 'pairing.json');
  const serverName = String(options.name || os.hostname());
  const allowLegacy = options.allowLegacy === true;
  const udpEnabled = options.udpEnabled !== false;
  const explicitUdpBroadcastAddress = options.udpBroadcastAddress || null;
  const getNetworkInterfaces = options.getNetworkInterfaces || os.networkInterfaces;
  const getLanAddresses = options.getLanAddresses || lanAddresses;
  const logger = options.logger === undefined ? console : options.logger;
  const events = new EventEmitter();

  if (options.pairingCode !== undefined && !/^\d{6}$/.test(String(options.pairingCode))) {
    throw new TypeError('pairingCode must contain exactly six digits');
  }

  let lifecycle = 'stopped';
  let startPromise = null;
  let closePromise = null;
  let actualHttpPort = null;
  let data = null;
  let security = null;
  let expressApp = null;
  let httpServer = null;
  let webSocketServer = null;
  let upgradeHandler = null;
  let udpSocket = null;
  let udpInterval = null;
  let udpBroadcasting = false;
  let lastError = null;
  const httpSockets = new Set();
  const pairAttempts = new Map();

  function log(level, ...args) {
    if (!logger) return;
    const method = typeof logger[level] === 'function'
      ? logger[level]
      : typeof logger.log === 'function'
        ? logger.log
        : null;
    if (method) {
      try {
        method.call(logger, ...args);
      } catch {
        // Diagnostics supplied by a host application must not break the service.
      }
    }
  }

  function emitStatus() {
    const status = getStatus();
    for (const listener of events.listeners('status')) {
      try {
        listener(status);
      } catch (error) {
        log('error', '[server] status listener failed:', error.message);
      }
    }
  }

  function saveData(nextData) {
    fs.mkdirSync(dataDir, { recursive: true });
    try {
      if (fs.existsSync(dataFile)) fs.copyFileSync(dataFile, backupFile);
    } catch (error) {
      log('error', '[store] backup failed:', error.message);
    }
    writeJsonAtomic(dataFile, nextData);
  }

  function loadData() {
    fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(dataFile)) {
      const fresh = defaultData();
      writeJsonAtomic(dataFile, fresh);
      return fresh;
    }

    let stored;
    try {
      stored = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    } catch (primaryError) {
      log('error', '[store] data.json corrupted, restoring from .bak:', primaryError.message);
      try {
        const recovered = migrateStoredState(
          JSON.parse(fs.readFileSync(backupFile, 'utf8')),
          defaultData().settings,
        );
        writeJsonAtomic(dataFile, recovered);
        log('info', '[store] restored from data.json.bak');
        return recovered;
      } catch (backupError) {
        log('error', '[store] .bak also unusable, starting fresh:', backupError.message);
        const fresh = defaultData();
        writeJsonAtomic(dataFile, fresh);
        return fresh;
      }
    }

    try {
      const normalized = migrateStoredState(stored, defaultData().settings);
      if (JSON.stringify(stored) !== JSON.stringify(normalized)) saveData(normalized);
      return normalized;
    } catch (migrationError) {
      log('error', '[store] state schema migration failed; source preserved:', migrationError.message);
      throw migrationError;
    }
  }

  function createSecurityState(previousCode) {
    const configuredCode = options.pairingCode;
    return {
      version: 1,
      serverId: String(options.serverId || crypto.randomUUID()),
      pairingCode: configuredCode === undefined
        ? generatePairingCode(previousCode)
        : String(configuredCode),
      tokens: [],
    };
  }

  function isValidSecurityState(value) {
    return Boolean(
      value &&
        value.version === 1 &&
        typeof value.serverId === 'string' &&
        value.serverId.length > 0 &&
        /^\d{6}$/.test(value.pairingCode) &&
        Array.isArray(value.tokens) &&
        value.tokens.every(
          (token) =>
            token &&
            typeof token.hash === 'string' &&
            /^[a-f0-9]{64}$/.test(token.hash),
        ),
    );
  }

  function ensureSecurityLoaded() {
    if (security) return security;
    fs.mkdirSync(dataDir, { recursive: true });
    try {
      const stored = JSON.parse(fs.readFileSync(securityFile, 'utf8'));
      if (!isValidSecurityState(stored)) throw new Error('invalid pairing state');
      security = stored;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        log('error', '[auth] pairing state unusable; issuing a new identity:', error.message);
      }
      security = createSecurityState();
      writeJsonAtomic(securityFile, security);
    }
    return security;
  }

  function saveSecurity(nextSecurity) {
    writeJsonAtomic(securityFile, nextSecurity);
    security = nextSecurity;
  }

  function issueToken(clientName) {
    const token = crypto.randomBytes(32).toString('base64url');
    const nextSecurity = cloneJson(ensureSecurityLoaded());
    nextSecurity.tokens.push({
      id: crypto.randomUUID(),
      hash: hashToken(token),
      clientName: typeof clientName === 'string' ? clientName.slice(0, 80) : null,
      createdAt: new Date().toISOString(),
    });
    if (nextSecurity.tokens.length > MAX_STORED_TOKENS) {
      nextSecurity.tokens.splice(0, nextSecurity.tokens.length - MAX_STORED_TOKENS);
    }
    saveSecurity(nextSecurity);
    return token;
  }

  function tokenIsValid(token) {
    if (typeof token !== 'string' || token.length < 16 || token.length > 1024) return false;
    const candidateHash = hashToken(token);
    return ensureSecurityLoaded().tokens.some((record) =>
      timingSafeTextEqual(record.hash, candidateHash),
    );
  }

  function bearerTokenFromRequest(request) {
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string') return null;
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    return match ? match[1].trim() : null;
  }

  function requestIsAuthorized(request, queryToken) {
    if (allowLegacy) return true;
    return tokenIsValid(queryToken || bearerTokenFromRequest(request));
  }

  function requireAuthentication(request, response, next) {
    if (requestIsAuthorized(request)) return next();
    response.setHeader('WWW-Authenticate', 'Bearer');
    return response.status(401).json({
      error: 'authentication required',
      code: 'AUTH_REQUIRED',
    });
  }

  function applyMutation(target, message) {
    const { kind, entity, payload } = message || {};
    if (
      (kind !== 'upsert' && kind !== 'delete') ||
      typeof entity !== 'string' ||
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      return { recognized: false, applied: false };
    }

    if (entity === 'settings') {
      if (kind !== 'upsert') return { recognized: false, applied: false };
      const currentUpdatedAt = target.settings && target.settings.updatedAt
        ? target.settings.updatedAt
        : '';
      if (currentUpdatedAt <= (payload.updatedAt || '')) {
        target.settings = { ...target.settings, ...cloneJson(payload) };
        return { recognized: true, applied: true };
      }
      return { recognized: true, applied: false };
    }

    const collectionName = ENTITY_COLLECTION[entity];
    if (!collectionName || payload.id === undefined || payload.id === null) {
      return { recognized: false, applied: false };
    }

    const collection = target[collectionName];
    const index = collection.findIndex((item) => item.id === payload.id);
    if (kind === 'upsert') {
      let next = index === -1
        ? cloneJson(payload)
        : { ...collection[index], ...cloneJson(payload) };
      if (collectionName === 'tasks') next = normalizeTask(next);
      if (collectionName === 'checkins') next = normalizeCheckin(next);
      if (index === -1) {
        collection.push(next);
        return { recognized: true, applied: true };
      }
      if ((collection[index].updatedAt || '') <= (payload.updatedAt || '')) {
        collection[index] = next;
        return { recognized: true, applied: true };
      }
      return { recognized: true, applied: false };
    }

    if (index === -1) return { recognized: true, applied: false };
    if ((collection[index].updatedAt || '') > (payload.updatedAt || '')) {
      return { recognized: true, applied: false };
    }

    const usesSoftDelete = collectionName !== 'tasks' && collectionName !== 'subtasks';
    if (usesSoftDelete) {
      collection[index] = { ...collection[index], ...cloneJson(payload), deleted: true };
    } else {
      collection.splice(index, 1);
    }
    return { recognized: true, applied: true };
  }

  function sendWebSocket(socket, value) {
    if (socket.readyState !== 1) return;
    try {
      socket.send(JSON.stringify(value));
    } catch {
      // A later close event will remove the client.
    }
  }

  function broadcast(value, excludedSocket) {
    if (!webSocketServer) return;
    const encoded = JSON.stringify(value);
    for (const client of webSocketServer.clients) {
      if (client === excludedSocket || client.readyState !== 1) continue;
      try {
        client.send(encoded);
      } catch {
        // Broadcasts are best effort; the next snapshot repairs a missed event.
      }
    }
  }

  function broadcastSnapshot() {
    broadcast({ kind: 'snapshot', state: data });
  }

  function pairSourceAddress(request) {
    const address = request.socket.remoteAddress || 'unknown';
    return address.startsWith('::ffff:') ? address.slice(7) : address;
  }

  function prunePairAttempts(now) {
    for (const [address, attempts] of pairAttempts) {
      const recent = attempts.filter((timestamp) => now - timestamp < pairRateLimitWindowMs);
      if (recent.length) pairAttempts.set(address, recent);
      else pairAttempts.delete(address);
    }
  }

  function pairRetryAfterSeconds(address, now) {
    prunePairAttempts(now);
    const attempts = pairAttempts.get(address) || [];
    if (attempts.length < pairRateLimitMax) return 0;
    return Math.max(1, Math.ceil((attempts[0] + pairRateLimitWindowMs - now) / 1000));
  }

  function recordFailedPairAttempt(address, now) {
    const attempts = pairAttempts.get(address) || [];
    attempts.push(now);
    pairAttempts.set(address, attempts);
  }

  function latestApk() {
    try {
      return findLatestApk(updateDir);
    } catch (error) {
      log('error', '[update] scan failed:', error.message);
      return null;
    }
  }

  function currentIps() {
    try {
      const values = getLanAddresses();
      return Array.isArray(values) ? [...new Set(values.filter(Boolean).map(String))] : [];
    } catch (error) {
      log('error', '[network] failed to enumerate LAN addresses:', error.message);
      return [];
    }
  }

  function publicInfo() {
    const apk = latestApk();
    return {
      name: serverName,
      serverId: ensureSecurityLoaded().serverId,
      httpPort: actualHttpPort,
      ips: currentIps(),
      pairingRequired: !allowLegacy,
      protocolVersion: PROTOCOL_VERSION,
      stateSchemaVersion: STATE_SCHEMA_VERSION,
      minimumClientStateSchemaVersion: STATE_SCHEMA_VERSION,
      legacyMode: allowLegacy,
      apkAvailable: Boolean(apk),
      apkFileName: apk ? apk.fileName : null,
      apkVersion: apk ? apk.version : null,
      apkSha256: apk ? apk.sha256 : null,
      apkApplicationId: apk ? apk.applicationId : null,
    };
  }

  function buildApplication() {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '1mb' }));
    app.use((request, response, next) => {
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      response.setHeader('Access-Control-Allow-Private-Network', 'true');
      if (request.method === 'OPTIONS') return response.sendStatus(204);
      return next();
    });

    app.get('/api/info', (request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      return response.json(publicInfo());
    });

    app.post('/api/pair', (request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      const address = pairSourceAddress(request);
      const now = Date.now();
      const retryAfterSeconds = pairRetryAfterSeconds(address, now);
      if (retryAfterSeconds > 0) {
        response.setHeader('Retry-After', String(retryAfterSeconds));
        return response.status(429).json({
          error: 'too many pairing attempts',
          code: 'PAIR_RATE_LIMITED',
          retryAfterSeconds,
        });
      }

      const clientProtocolVersion = request.body && request.body.protocolVersion;
      if (
        clientProtocolVersion !== undefined &&
        Number(clientProtocolVersion) !== PROTOCOL_VERSION
      ) {
        return response.status(409).json({
          error: 'unsupported protocol version',
          code: 'PROTOCOL_VERSION_UNSUPPORTED',
          protocolVersion: PROTOCOL_VERSION,
        });
      }

      const submittedCode = request.body && request.body.code;
      if (!timingSafeTextEqual(String(submittedCode || '').trim(), ensureSecurityLoaded().pairingCode)) {
        recordFailedPairAttempt(address, now);
        return response.status(401).json({
          error: 'invalid pairing code',
          code: 'PAIRING_CODE_INVALID',
        });
      }

      try {
        const token = issueToken(request.body && request.body.clientName);
        pairAttempts.delete(address);
        return response.json({
          serverId: ensureSecurityLoaded().serverId,
          token,
          protocolVersion: PROTOCOL_VERSION,
          stateSchemaVersion: STATE_SCHEMA_VERSION,
          minimumClientStateSchemaVersion: STATE_SCHEMA_VERSION,
        });
      } catch (error) {
        log('error', '[auth] failed to persist paired client:', error.message);
        return response.status(500).json({
          error: 'failed to save paired client',
          code: 'PAIRING_PERSIST_FAILED',
        });
      }
    });

    app.get('/api/state', requireAuthentication, (request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      return response.json(data);
    });

    app.put('/api/state', requireAuthentication, (request, response) => {
      if (!request.body || request.body.schemaVersion !== STATE_SCHEMA_VERSION) {
        return response.status(409).json({
          error: 'state schema version 2 is required for full replacement',
          code: 'STATE_SCHEMA_VERSION_REQUIRED',
          stateSchemaVersion: STATE_SCHEMA_VERSION,
          minimumClientStateSchemaVersion: STATE_SCHEMA_VERSION,
        });
      }
      if (!isValidV2State(request.body)) {
        return response.status(400).json({
          error: 'invalid state shape',
          code: 'INVALID_STATE',
        });
      }

      const nextData = migrateStoredState(request.body, defaultData().settings);
      try {
        saveData(nextData);
        data = nextData;
        broadcastSnapshot();
        response.setHeader('Cache-Control', 'no-store');
        return response.json(data);
      } catch (error) {
        log('error', '[store] full replace failed:', error.message);
        return response.status(500).json({
          error: 'failed to replace state',
          code: 'STATE_PERSIST_FAILED',
        });
      }
    });

    app.get('/api/update/latest', (request, response) => {
      try {
        const apk = findLatestApk(updateDir);
        if (!apk) return response.status(404).json({ error: 'no update APK available' });
        const downloadUrl = `${request.protocol}://${request.get('host')}/updates/${encodeURIComponent(apk.fileName)}`;
        return response.json({
          version: apk.version,
          name: `kaogong-checkin v${apk.version}`,
          apkUrl: downloadUrl,
          pageUrl: downloadUrl,
          notes: 'Provided by the local network server.',
          publishedAt: apk.publishedAt,
          source: 'lan',
          fileName: apk.fileName,
          size: apk.size,
          sha256: apk.sha256,
          applicationId: apk.applicationId,
        });
      } catch (error) {
        log('error', '[update] scan failed:', error.message);
        return response.status(500).json({ error: 'failed to scan update APKs' });
      }
    });

    app.get('/updates/:fileName', (request, response) => {
      const apk = latestApk();
      if (!apk || request.params.fileName !== apk.fileName) return response.sendStatus(404);
      return response.download(apk.filePath, apk.fileName, {
        headers: { 'Content-Type': 'application/vnd.android.package-archive' },
      });
    });

    const webIndex = webDir ? path.join(webDir, 'index.html') : null;
    if (webIndex && fs.existsSync(webIndex)) {
      app.use(express.static(webDir));
      app.get(/^(?!\/(?:api|updates|ws)(?:\/|$)).*/, (request, response) =>
        response.sendFile(webIndex),
      );
    }

    app.use((error, request, response, next) => {
      if (error && error.type === 'entity.parse.failed') {
        return response.status(400).json({
          error: 'invalid JSON body',
          code: 'INVALID_JSON',
        });
      }
      return next(error);
    });

    return app;
  }

  function handleWebSocketConnection(socket) {
    log('info', '[ws] client connected, total:', webSocketServer.clients.size);
    emitStatus();

    socket.on('message', (raw) => {
      if (socket.kgcRevoked) {
        socket.terminate();
        return;
      }
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        sendWebSocket(socket, { kind: 'error', code: 'INVALID_JSON' });
        return;
      }

      const mutationId = message && message.clientMutationId;
      if (
        mutationId !== undefined &&
        (typeof mutationId !== 'string' || mutationId.length === 0 || mutationId.length > 128)
      ) {
        sendWebSocket(socket, { kind: 'error', code: 'INVALID_MUTATION_ID' });
        return;
      }

      const nextData = cloneJson(data);
      const result = applyMutation(nextData, message);
      if (!result.recognized) {
        sendWebSocket(socket, {
          kind: 'error',
          code: 'INVALID_MUTATION',
          ...(mutationId ? { clientMutationId: mutationId } : {}),
        });
        return;
      }

      if (result.applied) {
        try {
          saveData(nextData);
          data = nextData;
          broadcast(message, socket);
        } catch (error) {
          log('error', '[store] mutation save failed:', error.message);
          if (mutationId) {
            sendWebSocket(socket, {
              kind: 'ack',
              clientMutationId: mutationId,
              applied: false,
              error: 'STATE_PERSIST_FAILED',
              protocolVersion: PROTOCOL_VERSION,
              stateSchemaVersion: STATE_SCHEMA_VERSION,
            });
          }
          return;
        }
      }

      if (mutationId) {
        sendWebSocket(socket, {
          kind: 'ack',
          clientMutationId: mutationId,
          applied: result.applied,
          protocolVersion: PROTOCOL_VERSION,
          stateSchemaVersion: STATE_SCHEMA_VERSION,
        });
      }
    });

    socket.on('close', () => {
      const count = webSocketServer ? webSocketServer.clients.size : 0;
      log('info', '[ws] client disconnected, total:', count);
      emitStatus();
    });
  }

  function rejectUpgrade(socket, statusCode, message) {
    const body = `${message}\n`;
    socket.end(
      `HTTP/1.1 ${statusCode} ${message}\r\n` +
        'Connection: close\r\n' +
        'Content-Type: text/plain; charset=utf-8\r\n' +
        `Content-Length: ${Buffer.byteLength(body)}\r\n` +
        '\r\n' +
        body,
    );
  }

  function createHttpResources() {
    expressApp = buildApplication();
    httpServer = http.createServer(expressApp);
    webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
    webSocketServer.on('connection', handleWebSocketConnection);

    httpServer.on('connection', (socket) => {
      httpSockets.add(socket);
      socket.once('close', () => httpSockets.delete(socket));
    });

    upgradeHandler = (request, socket, head) => {
      let url;
      try {
        url = new URL(request.url, 'http://localhost');
      } catch {
        rejectUpgrade(socket, 400, 'Bad Request');
        return;
      }
      if (url.pathname !== '/ws') {
        rejectUpgrade(socket, 404, 'Not Found');
        return;
      }
      if (!requestIsAuthorized(request, url.searchParams.get('token'))) {
        rejectUpgrade(socket, 401, 'Unauthorized');
        return;
      }
      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketServer.emit('connection', webSocket, request);
      });
    };
    httpServer.on('upgrade', upgradeHandler);
  }

  function listenOnce(port) {
    return new Promise((resolve, reject) => {
      const onError = (error) => {
        httpServer.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        httpServer.off('error', onError);
        resolve();
      };
      httpServer.once('error', onError);
      httpServer.once('listening', onListening);
      httpServer.listen({ host: httpHost, port });
    });
  }

  async function listenWithFallback() {
    const ports = requestedHttpPort === 0
      ? [0]
      : Array.from(
          { length: requestedHttpPortEnd - requestedHttpPort + 1 },
          (_, index) => requestedHttpPort + index,
        );

    let lastPortError = null;
    for (const port of ports) {
      try {
        await listenOnce(port);
        const address = httpServer.address();
        actualHttpPort = address && typeof address === 'object' ? address.port : port;
        return;
      } catch (error) {
        lastPortError = error;
        if (error.code !== 'EADDRINUSE') throw error;
      }
    }

    const error = new Error(
      `No HTTP port is available in ${requestedHttpPort}-${requestedHttpPortEnd}`,
    );
    error.code = 'KGC_HTTP_PORT_UNAVAILABLE';
    error.cause = lastPortError;
    throw error;
  }

  function udpPayload() {
    const apk = latestApk();
    return Buffer.from(JSON.stringify({
      serverId: ensureSecurityLoaded().serverId,
      name: serverName,
      httpPort: actualHttpPort,
      pairingRequired: !allowLegacy,
      protocolVersion: PROTOCOL_VERSION,
      stateSchemaVersion: STATE_SCHEMA_VERSION,
      minimumClientStateSchemaVersion: STATE_SCHEMA_VERSION,
      apkAvailable: Boolean(apk),
      apkVersion: apk ? apk.version : null,
    }));
  }

  async function startUdpBroadcast() {
    if (!udpEnabled) return;
    const socket = dgram.createSocket('udp4');
    udpSocket = socket;
    let settled = false;

    const ready = await new Promise((resolve) => {
      const fail = (error) => {
        log('error', '[udp] error:', error.message);
        if (!settled) {
          settled = true;
          resolve(false);
          return;
        }
        if (udpSocket === socket) {
          if (udpInterval) {
            clearInterval(udpInterval);
            udpInterval = null;
          }
          udpBroadcasting = false;
          udpSocket = null;
          try {
            socket.close();
          } catch {
            // The runtime error may already have closed the socket.
          }
          emitStatus();
        }
      };
      socket.on('error', fail);
      socket.once('listening', () => {
        try {
          socket.setBroadcast(true);
          settled = true;
          resolve(true);
        } catch (error) {
          fail(error);
        }
      });
      socket.bind(0);
    });

    if (!ready || udpSocket !== socket) {
      try {
        socket.close();
      } catch {
        // The socket may already be closed after a bind failure.
      }
      if (udpSocket === socket) udpSocket = null;
      return;
    }

    const send = () => {
      if (udpSocket !== socket) return;
      let targets;
      try {
        targets = explicitUdpBroadcastAddress
          ? [explicitUdpBroadcastAddress]
          : collectUdpBroadcastAddresses(getNetworkInterfaces());
      } catch (error) {
        targets = ['255.255.255.255'];
        log('error', '[udp] network interface enumeration failed; using global broadcast:', error.message);
      }
      const payload = udpPayload();
      for (const target of targets) {
        try {
          socket.send(payload, udpPort, target, (error) => {
            if (error) log('error', '[udp] send failed:', error.message);
          });
        } catch (error) {
          log('error', '[udp] send failed:', error.message);
        }
      }
    };

    udpBroadcasting = true;
    send();
    udpInterval = setInterval(send, udpIntervalMs);
    if (typeof udpInterval.unref === 'function') udpInterval.unref();
    let interfaceNames = [];
    let targetCount = 1;
    try {
      const interfaces = getNetworkInterfaces();
      interfaceNames = collectActiveIpv4InterfaceNames(interfaces);
      targetCount = explicitUdpBroadcastAddress
        ? 1
        : collectUdpBroadcastAddresses(interfaces).length;
    } catch {
      /* send() already logs and falls back if enumeration remains unavailable. */
    }
    const interfaceLabel = interfaceNames.length ? interfaceNames.join(', ') : 'none detected';
    log(
      'info',
      `[udp] broadcasting on ${targetCount} target(s), port ${udpPort}; interfaces: ${interfaceLabel}`,
    );
  }

  async function closeUdp() {
    if (udpInterval) {
      clearInterval(udpInterval);
      udpInterval = null;
    }
    udpBroadcasting = false;
    const socket = udpSocket;
    udpSocket = null;
    if (!socket) return;
    await new Promise((resolve) => {
      try {
        socket.close(resolve);
      } catch {
        resolve();
      }
    });
    socket.removeAllListeners();
  }

  async function closeWebSockets() {
    const socketServer = webSocketServer;
    webSocketServer = null;
    if (!socketServer) return;
    for (const client of socketServer.clients) client.terminate();
    await new Promise((resolve) => {
      try {
        socketServer.close(resolve);
      } catch {
        resolve();
      }
    });
    socketServer.removeAllListeners();
  }

  async function closeHttp() {
    const server = httpServer;
    httpServer = null;
    if (!server) return;
    if (upgradeHandler) server.off('upgrade', upgradeHandler);
    upgradeHandler = null;

    const closed = server.listening
      ? new Promise((resolve) => server.close(resolve))
      : Promise.resolve();
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    for (const socket of httpSockets) socket.destroy();
    httpSockets.clear();
    await closed;
    server.removeAllListeners();
  }

  async function releaseResources() {
    // Stop accepting HTTP and upgrade traffic before releasing protocol handlers.
    const failures = [];
    try {
      await closeHttp();
    } catch (error) {
      failures.push(error);
    }
    const remaining = await Promise.allSettled([closeUdp(), closeWebSockets()]);
    for (const result of remaining) {
      if (result.status === 'rejected') failures.push(result.reason);
    }
    expressApp = null;
    actualHttpPort = null;
    if (failures.length) {
      throw new AggregateError(failures, 'Failed to release all server resources');
    }
  }

  async function startInternal() {
    lastError = null;
    try {
      data = loadData();
      ensureSecurityLoaded();
      createHttpResources();
      await listenWithFallback();
      await startUdpBroadcast();
      lifecycle = 'running';
      log('info', `[http] listening on http://${httpHost}:${actualHttpPort}`);
      for (const url of getStatus().webUrls) log('info', `[http] LAN: ${url}`);
      if (allowLegacy) {
        log('warn', '[auth] WARNING: insecure legacy mode is enabled; state access is unauthenticated.');
      }
      emitStatus();
      return getStatus();
    } catch (error) {
      lastError = error;
      try {
        await releaseResources();
      } catch (cleanupError) {
        log('error', '[server] startup cleanup failed:', cleanupError.message);
      }
      lifecycle = 'stopped';
      emitStatus();
      throw error;
    }
  }

  async function start() {
    if (lifecycle === 'running') return getStatus();
    if (lifecycle === 'starting') return startPromise;
    if (lifecycle === 'stopping') await closePromise;

    lifecycle = 'starting';
    startPromise = startInternal().finally(() => {
      startPromise = null;
    });
    return startPromise;
  }

  async function closeInternal() {
    let cleanupError = null;
    try {
      await releaseResources();
    } catch (error) {
      cleanupError = error;
      lastError = error;
    } finally {
      pairAttempts.clear();
      lifecycle = 'stopped';
      emitStatus();
    }
    if (cleanupError) throw cleanupError;
    return getStatus();
  }

  async function close() {
    if (lifecycle === 'stopped') return getStatus();
    if (lifecycle === 'starting') {
      try {
        await startPromise;
      } catch {
        return getStatus();
      }
    }
    if (lifecycle === 'stopped') return getStatus();
    if (lifecycle === 'stopping') return closePromise;

    lifecycle = 'stopping';
    closePromise = closeInternal().finally(() => {
      closePromise = null;
    });
    return closePromise;
  }

  function getStatus() {
    const ips = currentIps();
    const localUrl = actualHttpPort ? `http://127.0.0.1:${actualHttpPort}/` : null;
    const webUrls = actualHttpPort
      ? ips.map((ip) => `http://${ip}:${actualHttpPort}/`)
      : [];
    const apk = latestApk();
    const apkBaseUrl = webUrls[0] || localUrl;
    const apkDownloadUrl = apk && apkBaseUrl
      ? `${apkBaseUrl}updates/${encodeURIComponent(apk.fileName)}`
      : null;

    return {
      state: lifecycle,
      running: lifecycle === 'running',
      name: serverName,
      serverId: security ? security.serverId : null,
      protocolVersion: PROTOCOL_VERSION,
      pairingRequired: !allowLegacy,
      legacyMode: allowLegacy,
      httpHost,
      httpPort: actualHttpPort,
      udpPort,
      udpBroadcasting,
      connectedClients: webSocketServer ? webSocketServer.clients.size : 0,
      ips,
      localUrl,
      webUrl: webUrls[0] || localUrl,
      webUrls,
      webAvailable: Boolean(webDir && fs.existsSync(path.join(webDir, 'index.html'))),
      apkAvailable: Boolean(apk),
      apkFileName: apk ? apk.fileName : null,
      apkVersion: apk ? apk.version : null,
      apkSize: apk ? apk.size : null,
      apkSha256: apk ? apk.sha256 : null,
      apkApplicationId: apk ? apk.applicationId : null,
      apkDownloadUrl,
      dataDir,
      webDir,
      updateDir,
      lastError: lastError ? { code: lastError.code || null, message: lastError.message } : null,
    };
  }

  function getPairingCode() {
    return ensureSecurityLoaded().pairingCode;
  }

  function regeneratePairing() {
    const current = ensureSecurityLoaded();
    const nextSecurity = {
      ...cloneJson(current),
      pairingCode: generatePairingCode(current.pairingCode),
      tokens: [],
    };
    saveSecurity(nextSecurity);
    pairAttempts.clear();
    if (webSocketServer) {
      for (const client of webSocketServer.clients) {
        client.kgcRevoked = true;
        client.close(4001, 'Pairing reset');
      }
    }
    emitStatus();
    return {
      pairingCode: nextSecurity.pairingCode,
      revokedTokens: current.tokens.length,
    };
  }

  function subscribe(listener) {
    events.on('status', listener);
    return () => events.off('status', listener);
  }

  return {
    start,
    close,
    getStatus,
    getPairingCode,
    regeneratePairing,
    regeneratePairingCode: regeneratePairing,
    subscribe,
  };
}

module.exports = {
  PROTOCOL_VERSION,
  collectActiveIpv4InterfaceNames,
  collectUdpBroadcastAddresses,
  createKgcServer,
  directedBroadcastAddress,
  findLatestApk,
  isValidState: isValidV2State,
};

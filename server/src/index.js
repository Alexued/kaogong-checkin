/**
 * 考公打卡 本地服务器
 * - HTTP/WS 端口 8321，UDP 广播端口 8322（每秒广播 {name, httpPort}）
 * - 存储：data/data.json，原子写入（tmp + rename），写前备份 .bak，启动校验损坏则从 .bak 恢复
 * - REST：GET /api/state 全量快照；PUT /api/state 本地完整覆盖；GET /api/info 本机局域网 IP + 端口
 * - WS /ws：接收 {kind:"upsert"|"delete", entity:"task"|"checkin"|"settings", payload}
 *   按 updatedAt last-write-wins 应用 → 落盘 → 广播给其他客户端
 * - 静态托管 ../web/dist（生产模式）
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dgram = require('dgram');
const { WebSocketServer } = require('ws');

const HTTP_PORT = 8321;
const UDP_PORT = 8322;
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const BAK_FILE = DATA_FILE + '.bak';
const TMP_FILE = DATA_FILE + '.tmp';
const WEB_DIST = path.join(__dirname, '..', '..', 'web', 'dist');

// ---------- 存储 ----------
function defaultData() {
  return {
    tasks: [],
    subtasks: [],
    checkins: [],
    timers: [],
    drills: [],
    formulaDrills: [],
    settings: { planEndDate: null, theme: 'light', markDate: null, updatedAt: new Date().toISOString() },
  };
}

function saveData(data) {
  try {
    if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, BAK_FILE);
  } catch (e) {
    console.error('[store] backup failed:', e.message);
  }
  fs.writeFileSync(TMP_FILE, JSON.stringify(data, null, 2));
  fs.renameSync(TMP_FILE, DATA_FILE);
}

function loadData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const d = defaultData();
    saveData(d);
    return d;
  }
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!d || !Array.isArray(d.tasks) || !Array.isArray(d.checkins)) throw new Error('bad shape');
    if (!d.settings) d.settings = defaultData().settings;
    // 旧数据文件兼容：补齐后加的集合
    if (!Array.isArray(d.subtasks)) d.subtasks = [];
    if (!Array.isArray(d.timers)) d.timers = [];
    if (!Array.isArray(d.drills)) d.drills = [];
    if (!Array.isArray(d.formulaDrills)) d.formulaDrills = [];
    return d;
  } catch (e) {
    console.error('[store] data.json corrupted, restoring from .bak:', e.message);
    try {
      const d = JSON.parse(fs.readFileSync(BAK_FILE, 'utf8'));
      fs.copyFileSync(BAK_FILE, DATA_FILE);
      console.log('[store] restored from data.json.bak');
      return d;
    } catch (e2) {
      console.error('[store] .bak also unusable, starting fresh:', e2.message);
      const d = defaultData();
      saveData(d);
      return d;
    }
  }
}

const data = loadData();

function isValidState(value) {
  return (
    value &&
    typeof value === 'object' &&
    Array.isArray(value.tasks) &&
    Array.isArray(value.subtasks) &&
    Array.isArray(value.checkins) &&
    Array.isArray(value.timers) &&
    Array.isArray(value.drills) &&
    Array.isArray(value.formulaDrills) &&
    value.settings &&
    typeof value.settings === 'object' &&
    !Array.isArray(value.settings)
  );
}

// ---------- 变更应用（last-write-wins，按 updatedAt 字符串比较） ----------
function applyMessage(msg) {
  const { kind, entity, payload } = msg || {};
  if (!kind || !entity || !payload) return false;
  if (entity === 'settings') {
    if (kind === 'upsert') {
      const cur = data.settings && data.settings.updatedAt ? data.settings.updatedAt : '';
      if (cur <= (payload.updatedAt || '')) {
        data.settings = payload;
        return true;
      }
    }
    return false;
  }
  const key =
    entity === 'task'
      ? 'tasks'
      : entity === 'subtask'
        ? 'subtasks'
        : entity === 'checkin'
          ? 'checkins'
          : entity === 'timer'
            ? 'timers'
            : entity === 'drill'
              ? 'drills'
              : entity === 'formulaDrill'
                ? 'formulaDrills'
                : null;
  if (!key) return false;
  // 取消/删除 = 软删除的集合（便于同步合并）；task / subtask 为硬删除
  const softDelete = key !== 'tasks' && key !== 'subtasks';
  const arr = data[key];
  const idx = arr.findIndex((x) => x.id === payload.id);
  if (kind === 'upsert') {
    if (idx >= 0) {
      if ((arr[idx].updatedAt || '') <= (payload.updatedAt || '')) {
        arr[idx] = payload;
        return true;
      }
      return false;
    }
    arr.push(payload);
    return true;
  }
  if (kind === 'delete') {
    if (idx >= 0 && (arr[idx].updatedAt || '') <= (payload.updatedAt || '')) {
      if (softDelete) {
        // 软删除，便于同步合并
        arr[idx] = { ...arr[idx], ...payload, deleted: true };
      } else {
        arr.splice(idx, 1);
      }
      return true;
    }
  }
  return false;
}

// ---------- 本机局域网信息 ----------
function lanAddresses() {
  const ips = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
    }
  }
  return ips;
}

// ---------- HTTP ----------
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/state', (req, res) => res.json(data));
app.put('/api/state', (req, res) => {
  if (!isValidState(req.body)) {
    return res.status(400).json({ error: 'invalid state shape' });
  }
  const next = JSON.parse(JSON.stringify(req.body));
  try {
    saveData(next);
    for (const key of ['tasks', 'subtasks', 'checkins', 'timers', 'drills', 'formulaDrills', 'settings']) {
      data[key] = next[key];
    }
    broadcastSnapshot();
    return res.json(data);
  } catch (e) {
    console.error('[store] full replace failed:', e.message);
    return res.status(500).json({ error: 'failed to replace state' });
  }
});
app.get('/api/info', (req, res) =>
  res.json({ name: os.hostname(), httpPort: HTTP_PORT, ips: lanAddresses() })
);

if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  // SPA 回退：非 /api 的 GET 一律返回 index.html
  app.get(/^(?!\/api|\/ws).*/, (req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
  console.log('[http] serving web/dist');
}

const server = http.createServer(app);

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastSnapshot() {
  const out = JSON.stringify({ kind: 'snapshot', state: data });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try {
        client.send(out);
      } catch {
        /* best effort */
      }
    }
  }
}

wss.on('connection', (ws) => {
  console.log('[ws] client connected, total:', wss.clients.size);
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (applyMessage(msg)) {
      try {
        saveData(data);
      } catch (e) {
        console.error('[store] save failed:', e.message);
      }
      const out = JSON.stringify(msg);
      for (const client of wss.clients) {
        if (client !== ws && client.readyState === 1) client.send(out);
      }
    }
  });
  ws.on('close', () => console.log('[ws] client disconnected, total:', wss.clients.size));
});

// ---------- UDP 广播（服务器发现，best effort） ----------
function startUdpBroadcast() {
  const sock = dgram.createSocket('udp4');
  sock.on('error', (e) => console.error('[udp] error:', e.message));
  sock.bind(() => {
    sock.setBroadcast(true);
    const payload = () => Buffer.from(JSON.stringify({ name: os.hostname(), httpPort: HTTP_PORT }));
    setInterval(() => {
      try {
        sock.send(payload(), UDP_PORT, '255.255.255.255');
      } catch (e) {
        console.error('[udp] send failed:', e.message);
      }
    }, 1000);
    console.log(`[udp] broadcasting {name, httpPort} to :${UDP_PORT} every 1s`);
  });
}

server.listen(HTTP_PORT, () => {
  console.log(`[http] listening on http://0.0.0.0:${HTTP_PORT}`);
  for (const ip of lanAddresses()) console.log(`[http]   LAN: http://${ip}:${HTTP_PORT}`);
  startUdpBroadcast();
});

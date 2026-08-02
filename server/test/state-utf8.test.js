const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function waitForServer(url) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('test server did not start');
}

test('full-state replacement preserves UTF-8 strings', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaogong-utf8-'));
  const httpPort = 18000 + Math.floor(Math.random() * 1000);
  const udpPort = httpPort + 1000;
  const serverPath = path.join(__dirname, '..', 'src', 'index.js');
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      KGC_HTTP_PORT: String(httpPort),
      KGC_UDP_PORT: String(udpPort),
      KGC_DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(() => {
    child.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const url = `http://127.0.0.1:${httpPort}/api/state`;
  await waitForServer(url);

  const state = {
    tasks: [{ id: '任务一', title: '资料分析四十题', updatedAt: '2026-08-02T00:00:00.000Z' }],
    subtasks: [{ id: '子任务一', taskId: '任务一', title: '第一套二十题', updatedAt: '2026-08-02T00:00:00.000Z' }],
    checkins: [],
    timers: [{ id: '计时一', label: '测试计时', updatedAt: '2026-08-02T00:00:00.000Z' }],
    drills: [],
    formulaDrills: [],
    settings: { theme: 'light', planEndDate: null, note: '中文设置' },
  };

  const put = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(state),
  });
  assert.equal(put.status, 200);
  assert.match(put.headers.get('content-type') || '', /charset=utf-8/i);
  const putText = new TextDecoder('utf-8', { fatal: true }).decode(await put.arrayBuffer());
  assert.deepEqual(JSON.parse(putText), state);

  const get = await fetch(url);
  const getText = new TextDecoder('utf-8', { fatal: true }).decode(await get.arrayBuffer());
  assert.deepEqual(JSON.parse(getText), state);
  assert.match(getText, /资料分析四十题/);
  assert.match(getText, /测试计时/);

  const diskText = fs.readFileSync(path.join(dataDir, 'data.json'), 'utf8');
  assert.match(diskText, /第一套二十题/);
  assert.doesNotMatch(diskText, /\?{2,}/);
});

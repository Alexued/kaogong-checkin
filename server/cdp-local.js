// 连本地 headless Chrome (9223) 执行 JS
// 用法: node cdp-local.js "<expression>"
const WebSocket = require('ws');

const expr = process.argv[2];

async function main() {
  const targets = await fetch('http://localhost:9223/json').then((r) => r.json());
  const page = targets.find((t) => t.type === 'page' && t.url.includes('8321'));
  if (!page) throw new Error('no page target: ' + targets.map((t) => t.url).join(','));
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0;
  const pending = new Map();
  const send = (m, p) =>
    new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method: m, params: p }));
    });
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  await new Promise((r) => ws.on('open', r));
  const res = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  const val = res.result && res.result.result ? res.result.result.value : res.result;
  console.log(JSON.stringify(val, null, 1));
  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});

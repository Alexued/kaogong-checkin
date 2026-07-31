// 通过 CDP 在手机 WebView 里执行 JS 并打印结果
// 用法: node cdp.js "<js expression>"
const WebSocket = require('ws');

const expr = process.argv[2];
if (!expr) {
  console.error('usage: node cdp.js "<expression>"');
  process.exit(1);
}

async function main() {
  const targets = await fetch('http://localhost:9222/json').then((r) => r.json());
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0;
  const pending = new Map();
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id).resolve(msg);
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

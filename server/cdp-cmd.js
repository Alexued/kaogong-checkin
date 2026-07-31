// 通过 CDP 调用任意方法
// 用法: node cdp-cmd.js <method> '<json params>'
const WebSocket = require('ws');

const [method, paramsRaw] = process.argv.slice(2);

async function main() {
  const targets = await fetch('http://localhost:9222/json').then((r) => r.json());
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
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
  const res = await send(method, paramsRaw ? JSON.parse(paramsRaw) : {});
  console.log(JSON.stringify(res.result ?? res, null, 1));
  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});

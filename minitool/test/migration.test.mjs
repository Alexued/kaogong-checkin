import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import { selectBank } from '../scripts/select-bank.mjs';
import { adaptSource, replaceRequired, replaceFunction } from '../scripts/adapt-source.mjs';
import { cssBaseline } from '../scripts/css-baseline.mjs';
const web = new URL('../../web/src/', import.meta.url);
const read = filename => readFile(new URL(filename, web), 'utf8');
test('精简题库可重复生成且不修改原始题库', async () => {
  const source = JSON.parse(await read('data/analysis-question-bank.json')); const before = JSON.stringify(source);
  const metadata = JSON.parse(await read('data/analysis-question-bank-meta.json'));
  const bank = selectBank(source, metadata.categories);
  assert.equal(bank.length, 200); assert.equal(source.length, 3988);
  assert.ok(Buffer.byteLength(JSON.stringify(bank)) <= 512 * 1024);
  assert.equal(new Set(bank.map(question => question.id)).size, 200);
  assert.ok(metadata.categories.every(category => bank.some(question => question.categories.includes(category))));
  assert.deepEqual(bank, selectBank(source, metadata.categories)); assert.equal(before, JSON.stringify(source));
  assert.ok(bank.every(question => !question.titleImages.length && !question.optionImages.some(images => images.length)));
  assert.doesNotMatch(JSON.stringify(bank), /https?:\/\/|<img/i);
});
test('适配锚点变化时构建失败，不静默跳过', () => {
  assert.throws(() => replaceRequired('abc', 'missing', ''), /必须唯一/);
  assert.throws(() => replaceRequired('aa', 'a', ''), /必须唯一/);
  assert.throws(() => replaceFunction('function other(){}', 'missing', ''), /唯一函数/);
});
for (const filename of ['router.ts', 'stores/app.ts', 'views/PetView.vue', 'views/WishesView.vue', 'components/DeveloperStars.vue', 'storage/wishIdentity.ts']) {
  test(`迁移适配 ${filename}`, async () => {
    const adapted = adaptSource((await read(filename)).replaceAll('\r\n', '\n'), '/web/src/' + filename);
    assert.doesNotMatch(adapted, /@capacitor|navigator\.clipboard|anchor\.download|accept="\.(txt|json)/);
    if (filename === 'stores/app.ts') assert.ok(adapted.indexOf('enqueue(msg);') < adapted.indexOf('applySyncMessage(this as unknown as AppState, msg);', adapted.indexOf('send(msg:')));
    if (filename === 'components/DeveloperStars.vue') assert.match(adapted, /!petDebugAllowed.value \|\| !developerSession.tap/);
  });
}
test('样式为核心现代声明生成本地回退', () => {
  const css = cssBaseline('.panel{width:min(100%,320px);inset:1px 2px;gap:12px;background:color-mix(in srgb,var(--warn) 30%,var(--card));padding-bottom:env(safe-area-inset-bottom)}');
  for (const part of ['max-width:320px', 'width:100%', 'top:1px', 'right:2px', 'grid-gap:12px', 'background:var(--card)', '--safe-area-inset-bottom']) assert.ok(css.includes(part), part);
});
test('Chrome61局部兼容路径补齐flat、flatMap、at和安全UUID', async () => {
  const script = await readFile(new URL('../src/compat.js', import.meta.url), 'utf8');
  const sandbox = { window: { innerHeight: 800, addEventListener() {}, crypto: { getRandomValues(bytes) { bytes.fill(1); } } }, document: { readyState: 'loading', addEventListener() {}, documentElement: { style: { setProperty() {} } } } };
  vm.createContext(sandbox);
  vm.runInContext('Array.prototype.flat=undefined;Array.prototype.flatMap=undefined;Array.prototype.at=undefined;String.prototype.replaceAll=undefined;Object.hasOwn=undefined;', sandbox);
  vm.runInContext(script, sandbox);
  assert.equal(vm.runInContext('JSON.stringify([1,[2,[3]]].flat(2))', sandbox), '[1,2,3]');
  assert.equal(vm.runInContext('JSON.stringify([1,2].flatMap(value=>[value,value]))', sandbox), '[1,1,2,2]');
  assert.equal(vm.runInContext('[1,2].at(-1)', sandbox), 2);
  assert.match(sandbox.window.crypto.randomUUID(), /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
});
test('生产产物不带联网、动态脚本、Capacitor或下载能力', async () => {
  const dist = new URL('../dist/', import.meta.url);
  const script = await readFile(new URL('assets/app.js', dist), 'utf8');
  for (const pattern of [/fetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /new Worker/, /new Function/, /eval\s*\(/, /navigator\.clipboard/, /Capacitor/, /\.download\s*=/, /window\.open/, /import\s*\(/]) assert.doesNotMatch(script, pattern);
  const html = await readFile(new URL('index.html', dist), 'utf8');
  assert.doesNotMatch(html, /type="module"|<script>[^<]/);
  assert.ok(html.indexOf('compat.js') < html.indexOf('app.js'));
  assert.equal((await readdir(new URL('assets/pets/', dist))).length, 11);
  assert.doesNotMatch(script, /data:image\/png;base64,[A-Za-z0-9+/=]{140000}/);
});

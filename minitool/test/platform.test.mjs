import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../../web/node_modules/esbuild/lib/main.js';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { adaptSource } from '../scripts/adapt-source.mjs';
import QRCode from '../../web/node_modules/qrcode/lib/index.js';
import { importTypeScript } from '../../web/test/import-typescript.mjs';

async function loadPlatform() {
  const result = await build({
    stdin: { contents: "export * from './src/persistence'; export * from './src/platform'; export * from './src/qr'; export {useAppStore} from '../web/src/stores/app'; import {createPinia,setActivePinia} from 'pinia'; export function resetStore(){setActivePinia(createPinia());}", resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'node', target: 'node22', define: { __MINITOOL_TEST__: 'false' },
    alias: { vue: fileURLToPath(new URL('../../web/node_modules/vue/dist/vue.runtime.esm-bundler.js', import.meta.url)), pinia: fileURLToPath(new URL('../../web/node_modules/pinia/dist/pinia.mjs', import.meta.url)) },
    plugins: [{ name: 'isolated-test-adapter', setup(plugin) {
      plugin.onResolve({ filter: /api\/sync$/ }, () => ({ path: fileURLToPath(new URL('../src/persistence.ts', import.meta.url)) }));
      plugin.onLoad({ filter: /stores[\\/]app\.ts$/ }, async args => ({ contents: adaptSource((await readFile(args.path, 'utf8')).replaceAll('\r\n', '\n'), args.path.replaceAll('\\', '/')), loader: 'ts' }));
    } }],
  });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const platform = await loadPlatform();
function setup(raw = null) {
  let value = raw; const disk = { fail: false, getItem() { return value; }, setItem(_key, next) { if (disk.fail) throw new Error('full'); value = next; }, read() { return value; } };
  globalThis.localStorage = disk; platform.resetStore(); platform.initializeLocalState(); return { disk, store: platform.useAppStore() };
}
test('学习保存写入失败不会改变界面或覆盖原始存档', () => {
  const { store, disk } = setup(); store.saveSettings({ theme: 'dark' }); const before = disk.read();
  disk.fail = true; store.saveSettings({ theme: 'light' });
  assert.equal(store.settings.theme, 'dark'); assert.equal(disk.read(), before); assert.match(store.writeBlockedMessage, /未生效/);
  disk.fail = false; store.saveSettings({ theme: 'light' }); assert.equal(store.settings.theme, 'light'); assert.equal(store.writeBlockedMessage, '');
  platform.resetStore(); platform.initializeLocalState(); assert.equal(platform.useAppStore().settings.theme, 'light');
});
test('损坏学习存档进入恢复状态，禁止覆盖', () => {
  const { store, disk } = setup('{broken'); assert.equal(store.recoveryRequired, true);
  store.saveSettings({ theme: 'dark' }); assert.equal(disk.read(), '{broken'); assert.equal(store.settings.theme, 'light');
  assert.throws(() => platform.importLearningText('{broken')); assert.equal(disk.read(), '{broken');
});
test('备份导入写失败时保留现有UI与存档', () => {
  const { store, disk } = setup(); store.saveSettings({ theme: 'dark' }); const before = disk.read(); disk.fail = true;
  assert.throws(() => platform.importLearningText(JSON.stringify({ schemaVersion: 2, tasks: [], checkins: [], settings: { theme: 'light' } })), /full/);
  assert.equal(store.settings.theme, 'dark'); assert.equal(disk.read(), before);
});
test('不完整备份不能被当成空存档导入', () => {
  const { store, disk } = setup(); store.saveSettings({ theme: 'dark' }); const before = disk.read();
  assert.throws(() => platform.importLearningText('{}'), /完整学习备份/); assert.equal(disk.read(), before);
});
test('任务保存失败不返回成功ID也不留下任务', () => {
  const { store, disk } = setup(); disk.fail = true;
  assert.equal(store.saveTask({ title: '失败测试', type: 'daily' }), undefined); assert.equal(store.tasks.length, 0); assert.equal(disk.read(), null);
});
test('没有小红书桥接时明确失败，不伪报保存成功', async () => {
  globalThis.window = {};
  await assert.rejects(() => platform.saveImage('data:image/png;base64,AAAA'), /浏览器预览/);
  await assert.rejects(() => platform.shareImage('https://example.com/photo.png', 'title', 'content'), /有效的本地图片/);
});
test('相册和笔记桥接参数正确，原生拒绝会向上传递', async () => {
  const calls = [];
  globalThis.window = { xhs: { miniTool: { async saveImageToPhotosAlbum(value) { calls.push(value); }, async postNote(value) { calls.push(value); } } } };
  const image = 'data:image/png;base64,AAAA'; await platform.saveImage(image); await platform.shareImage(image, '星'.repeat(30), '猫'.repeat(1200));
  assert.deepEqual(calls[0], { filePath: image }); assert.equal(calls[1].title.length, 20); assert.equal(calls[1].content.length, 1000); assert.deepEqual(calls[1].mediaInfo, { image_resources: [{ url: image }] });
  window.xhs.miniTool.saveImageToPhotosAlbum = async () => { throw new Error('拒绝授权'); };
  await assert.rejects(() => platform.saveImage(image), /拒绝授权/);
});
function qrPixels(text) {
  const code = QRCode.create(text, { errorCorrectionLevel: 'M' }); const scale = 5; const margin = 4; const width = (code.modules.size + margin * 2) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let row = 0; row < code.modules.size; row++) for (let column = 0; column < code.modules.size; column++) {
    if (!code.modules.get(row, column)) continue;
    for (let vertical = 0; vertical < scale; vertical++) for (let horizontal = 0; horizontal < scale; horizontal++) {
      const offset = (((row + margin) * scale + vertical) * width + (column + margin) * scale + horizontal) * 4;
      pixels[offset] = 0; pixels[offset + 1] = 0; pixels[offset + 2] = 0;
    }
  }
  return { pixels, width };
}
test('离线心愿经实际二维码编码解码后验签通过', async () => {
  const wishes = await importTypeScript(new URL('../../web/src/domain/wishes.ts', import.meta.url));
  const { defaultPet } = await importTypeScript(new URL('../../web/src/domain/pet.ts', import.meta.url));
  const sender = await wishes.createWishIdentity(); const receiver = await wishes.createWishIdentity(); const source = defaultPet(); const target = defaultPet(); target.stars = 20;
  function transfer(message) { const { pixels, width } = qrPixels(wishes.encodeWish(message)); return wishes.decodeWish(platform.decodeQrPixels(pixels, width, width)); }
  const offer = transfer(await wishes.issueOffer(source, 'sample-game', sender, 'real', '伙伴')); await wishes.receiveOffer(target, offer, 'real');
  const request = transfer(await wishes.requestWish(target, offer.body.id, receiver, 'real', '小猫'));
  const key = transfer(await wishes.approveWish(source, request, sender, 'real')); const used = [];
  await wishes.redeemWish(target, key, receiver, 'real', used, new Date().toISOString()); assert.equal(target.stars, 18);
  await assert.rejects(() => wishes.redeemWish(target, key, receiver, 'real', used, new Date().toISOString())); assert.equal(target.stars, 18);
});
test('空白图片、无效尺寸和非图片文件明确拒绝', async () => {
  assert.throws(() => platform.decodeQrPixels(new Uint8ClampedArray(400).fill(255), 10, 10), /没有识别到/);
  assert.throws(() => platform.decodeQrPixels(new Uint8ClampedArray(4), 2049, 2049), /尺寸无效/);
  await assert.rejects(() => platform.decodeQrFile({ type: 'text/plain', size: 100 }), /请选择/);
  await assert.rejects(() => platform.decodeQrFile({ type: 'image/png', size: 21 * 1024 * 1024 }), /20 MB/);
});

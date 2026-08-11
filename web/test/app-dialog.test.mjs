import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import {
  activeAppDialog,
  cancelAllDialogs,
  confirmDialog,
  settleAppDialog,
} from '../src/lib/appDialog.ts';

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) return sourceFiles(url);
    return /\.(?:ts|vue)$/.test(entry.name) ? [url] : [];
  }));
  return nested.flat();
}

test.afterEach(() => cancelAllDialogs());

test('all confirmations use the app dialog host instead of window.confirm', async () => {
  const src = new URL('../src/', import.meta.url);
  const files = await sourceFiles(src);
  const contents = await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')]));
  const offenders = contents.filter(([, content]) => /window\.confirm\s*\(/.test(content));
  assert.deepEqual(offenders.map(([file]) => file.pathname), []);

  const [app, host] = await Promise.all([
    readFile(new URL('../src/App.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AppDialogHost.vue', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /<AppDialogHost\s*\/>/);
  assert.match(host, /data-back-priority="220"/);
  assert.match(host, /cancelButton\.value\?\.focus/);
  assert.match(host, /role="alertdialog"/);
});

test('dialog requests settle in queue order and normalize their copy', async () => {
  const first = confirmDialog({
    title: '  第一个  ',
    message: '  第一条消息  ',
    confirmLabel: '  继续  ',
    variant: 'danger',
    details: ['  细节  ', '   '],
  });
  const second = confirmDialog({
    title: '第二个',
    message: '第二条消息',
    confirmLabel: '完成',
  });

  assert.equal(activeAppDialog.value?.title, '第一个');
  assert.equal(activeAppDialog.value?.variant, 'danger');
  assert.deepEqual(activeAppDialog.value?.details, ['细节']);
  settleAppDialog(false);
  assert.equal(await first, false);
  await Promise.resolve();
  assert.equal(activeAppDialog.value?.title, '第二个');
  assert.equal(activeAppDialog.value?.variant, 'neutral');
  assert.equal(activeAppDialog.value?.cancelLabel, '取消');
  settleAppDialog(true);
  assert.equal(await second, true);
  await Promise.resolve();
  assert.equal(activeAppDialog.value, null);
});

test('cancelAllDialogs rejects the active request and every queued request', async () => {
  const results = [
    confirmDialog({ title: '一', message: '一', confirmLabel: '继续' }),
    confirmDialog({ title: '二', message: '二', confirmLabel: '继续' }),
    confirmDialog({ title: '三', message: '三', confirmLabel: '继续' }),
  ];
  cancelAllDialogs();
  assert.deepEqual(await Promise.all(results), [false, false, false]);
  assert.equal(activeAppDialog.value, null);
});

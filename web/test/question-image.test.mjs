import test from 'node:test';
import assert from 'node:assert/strict';
import { importTypeScript } from './import-typescript.mjs';

const { questionImageCandidates } = await importTypeScript(new URL('../src/lib/questionImage.ts', import.meta.url));

test('题图为粉笔 CDN 增加 WebView 缓存键并保留原地址与备用域名', () => {
  const src = 'https://fb.fenbike.cn/api/tarzan/images/example.png?width=700';
  assert.deepEqual(questionImageCandidates(src), [
    'https://fb.fenbike.cn/api/tarzan/images/example.png?width=700&client=kgc-webview',
    src,
    'https://fb.fbstatic.cn/api/tarzan/images/example.png?width=700&client=kgc-webview',
  ]);
});

test('非题库 CDN 与非 URL 输入保持原样', () => {
  assert.deepEqual(questionImageCandidates('https://example.com/image.png'), ['https://example.com/image.png']);
  assert.deepEqual(questionImageCandidates('/local/image.png'), ['/local/image.png']);
});

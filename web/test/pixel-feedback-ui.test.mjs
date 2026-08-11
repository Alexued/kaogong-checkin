import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, grid, today, tasks] = await Promise.all([
  readFile(new URL('../src/App.vue', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PixelGrid.vue', import.meta.url), 'utf8'),
  readFile(new URL('../src/views/TodayView.vue', import.meta.url), 'utf8'),
  readFile(new URL('../src/views/TasksView.vue', import.meta.url), 'utf8'),
]);

test('teleported FAB shares startup shell phase and is absent while pending', () => {
  assert.match(app, /provide\(SHELL_PHASE_KEY, readonly\(shellPhase\)\)/);
  assert.match(today, /inject\(SHELL_PHASE_KEY/);
  assert.match(today, /shellPhase\.value !== 'pending'/);
  assert.match(today, /'fab-entering': shellPhase === 'entering'/);
});

test('check-in and task operations use one-shot semantic patterns', () => {
  assert.match(today, /showPixelFeedback\('confirm', '打卡完成'/);
  assert.match(today, /function onToggleSub\(sub: SubItem, ev: MouseEvent\)[\s\S]*?if \(checking\) celebrate\(ev\)/);
  assert.match(today, /showPixelFeedback\('arrival'/);
  assert.match(tasks, /showTaskFeedback\([\s\S]*?'arrival'/);
  assert.match(tasks, /showTaskFeedback\([\s\S]*?'dissolve'/);
  assert.match(grid, /pixelPatternIntensitiesAt/);
  assert.match(grid, /props\.once/);
});

test('task deletion commits immediately before transient feedback begins', () => {
  const deletion = tasks.slice(tasks.indexOf('function onDelete'));
  assert.ok(deletion.indexOf('store.deleteTask(t.id)') < deletion.indexOf("showTaskFeedback(\n        'dissolve'"));
});

test('pattern motion has an explicit reduced-motion path', () => {
  assert.match(grid, /pixelPatternIntensitiesAt\(0, props\.pattern, \{ reduceMotion: true \}/);
  assert.match(grid, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(grid, /transition: none/);
});

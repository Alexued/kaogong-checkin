import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importTypeScript } from './import-typescript.mjs';

const source = await readFile(new URL('../src/lib/swipeTabs.ts', import.meta.url), 'utf8');
const {
  canPreventSwipeMove,
  shouldCancelSwipeForTouchCount,
} = await importTypeScript(new URL('../src/lib/swipeTabs.ts', import.meta.url));

test('touch moves only claim cancelable browser events', () => {
  assert.equal(canPreventSwipeMove({ cancelable: true }), true);
  assert.equal(canPreventSwipeMove({ cancelable: false }), false);
  assert.match(source, /if \(canPreventSwipeMove\(e\)\) e\.preventDefault\(\);/);
});

test('multi-touch is excluded both at start and during an active swipe', () => {
  assert.equal(shouldCancelSwipeForTouchCount(0), true);
  assert.equal(shouldCancelSwipeForTouchCount(1), false);
  assert.equal(shouldCancelSwipeForTouchCount(2), true);
  assert.match(source, /shouldCancelSwipeForTouchCount\(e\.touches\.length\)/g);
  assert.match(source, /if \(shouldCancelSwipeForTouchCount\(e\.touches\.length\)\) \{[\s\S]*?cancelTouchGesture\(\);/);
});

test('touchcancel has an abort-only path and removes the same listeners on unmount', () => {
  assert.match(source, /function onTouchCancel\(\) \{[\s\S]*?cancelTouchGesture\(\);[\s\S]*?\}/);
  assert.match(source, /addEventListener\('touchcancel', onTouchCancel, \{ passive: true \}\)/);
  assert.match(source, /removeEventListener\('touchcancel', onTouchCancel\)/);
  assert.match(source, /function cancelTouchGesture\(\) \{[\s\S]*?cancelAnimationFrame\(dragFrame\)[\s\S]*?clearSettleTimer\(\)[\s\S]*?resetPointerState\(\)[\s\S]*?dragOffset\.value = 0[\s\S]*?animating\.value = false/);
});

test('unmount cleanup cancels pending frame and settle timer', () => {
  assert.match(source, /onUnmounted\(\(\) => \{[\s\S]*?cancelTouchGesture\(\);/);
  assert.match(source, /function clearSettleTimer\(\) \{[\s\S]*?clearTimeout\(settleTimer\)[\s\S]*?settleTimer = null;/);
});

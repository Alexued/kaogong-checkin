import test from 'node:test';
import assert from 'node:assert/strict';
import { importTypeScript } from './import-typescript.mjs';

const { positionTaskMenu } = await importTypeScript(new URL('../src/lib/taskMenu.ts', import.meta.url));
const viewport = { width: 375, height: 812 };
const menu = { width: 216, height: 240 };

for (const [name, anchor] of Object.entries({
  'left top': { x: 18, y: 80 },
  'right top': { x: 360, y: 80 },
  'left bottom': { x: 18, y: 730 },
  'right bottom': { x: 360, y: 730 },
})) {
  test(`task menu stays inside the safe viewport at ${name}`, () => {
    const position = positionTaskMenu(anchor, menu, viewport);
    assert.ok(position.x >= 12);
    assert.ok(position.y >= 12);
    assert.ok(position.x + menu.width <= viewport.width - 12);
    assert.ok(position.y + menu.height <= viewport.height - 86);
    assert.ok(position.originX >= 16 && position.originX <= menu.width - 16);
    assert.ok(position.originY >= 16 && position.originY <= menu.height - 16);
  });
}

test('task menu honors a shifted visual viewport', () => {
  const position = positionTaskMenu(
    { x: 210, y: 250 },
    menu,
    { left: 30, top: 40, width: 320, height: 640 },
  );
  assert.ok(position.x >= 42);
  assert.ok(position.y >= 52);
  assert.ok(position.x + menu.width <= 338);
  assert.ok(position.y + menu.height <= 594);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [config, activity] = await Promise.all([
  readFile(new URL('../capacitor.config.ts', import.meta.url), 'utf8'),
  readFile(new URL('../android/app/src/main/java/com/wjy/kaogong/MainActivity.java', import.meta.url), 'utf8'),
]);

test('Android safe area has one native owner and disables duplicate CSS injection', () => {
  assert.match(config, /SystemBars:[\s\S]*insetsHandling: 'disable'/);
  assert.match(activity, /setOnApplyWindowInsetsListener/);
  assert.match(activity, /mlp\.topMargin = bars\.top/);
  assert.match(activity, /mlp\.bottomMargin = bars\.bottom/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8');
const tabBar = await readFile(new URL('../src/components/TabBar.vue', import.meta.url), 'utf8');
const router = await readFile(new URL('../src/router.ts', import.meta.url), 'utf8');

test('inactive persistent root pages are removed from focus and accessibility navigation', () => {
  assert.match(app, /:inert="!isActiveRootPage\(p\.path\)"/);
  assert.match(app, /:aria-hidden="isActiveRootPage\(p\.path\) \? undefined : 'true'"/);
  assert.match(app, /isTabPage\.value && route\.path === path/);
});

test('root navigation exposes its current item on root and secondary routes', () => {
  assert.match(tabBar, /<nav class="tabbar" aria-label="主导航">/);
  assert.match(tabBar, /:aria-current="isActive\(t\.to\) \? 'page' : undefined"/);
  assert.match(tabBar, /aria-hidden="true" v-html="t\.icon"/);
  assert.match(router, /meta: \{ parentPath: '\/timer', rootTab: '\/timer' \}/);
  assert.match(router, /meta: \{ parentPath: '\/', rootTab: '\/' \}/);
});

test('root and secondary layers use shared depth transitions without unmounting root tabs', () => {
  assert.match(app, /<main class="route-shell">/);
  assert.match(app, /<Transition name="root-depth">[\s\S]*v-show="!isSecondary"/);
  assert.match(app, /<Transition name="secondary-depth">[\s\S]*v-if="isSecondary"/);
  assert.match(app, /:key="resolvedRoute\.fullPath"/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appleStyles = await readFile(new URL('../../docs/styles.css', import.meta.url), 'utf8');
const styleSwitcher = await readFile(
  new URL('../../docs/styles/shared/style-switcher.js', import.meta.url),
  'utf8',
);
const styleIds = [
  'ancient',
  'bauhaus',
  'blueprint',
  'cyber',
  'government',
  'newspaper',
  'sprint',
  'stationery',
  'terminal',
];

function ruleBody(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing CSS rule: ${marker}`);

  const openIndex = source.indexOf('{', markerIndex);
  assert.notEqual(openIndex, -1, `Missing opening brace for: ${marker}`);

  let depth = 1;
  for (let index = openIndex + 1; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(openIndex + 1, index);
  }

  assert.fail(`Missing closing brace for: ${marker}`);
}

test('Apple reduced motion keeps only the navigation color handoff at 80ms', () => {
  const reducedMotion = ruleBody(appleStyles, '@media (prefers-reduced-motion: reduce)');
  const globalMotion = ruleBody(reducedMotion, '*::after');
  const navigationOverlay = ruleBody(reducedMotion, 'body::after');

  assert.match(globalMotion, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(globalMotion, /transition-duration:\s*0\.01ms\s*!important/);
  assert.match(navigationOverlay, /transition-duration:\s*80ms\s*!important/);
  assert.match(styleSwitcher, /reducedMotion\.matches\s*\?\s*80\s*:\s*180/);
});

test('all showcase pages use the v0.7.1 cache key for release and local assets', async () => {
  const pages = [
    await readFile(new URL('../../docs/index.html', import.meta.url), 'utf8'),
    ...await Promise.all(styleIds.map((styleId) => readFile(
      new URL(`../../docs/styles/${styleId}/index.html`, import.meta.url),
      'utf8',
    ))),
  ];

  for (const page of pages) {
    assert.doesNotMatch(page, /v070-release/);
    assert.match(page, /release-data\.js\?v=20260807-v071-release/);
    assert.match(page, /styles?\.css\?v=20260807-v071-release/);
    assert.match(page, /app\.js\?v=20260807-v071-release/);
  }
});

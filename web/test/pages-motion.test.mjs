import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const appleStyles = await readFile(new URL('../../docs/styles.css', import.meta.url), 'utf8');
const resetStyles = await readFile(
  new URL('../../docs/styles/shared/reset.css', import.meta.url),
  'utf8',
);
const motionScript = await readFile(
  new URL('../../docs/styles/shared/motion.js', import.meta.url),
  'utf8',
);
const styleSwitcher = await readFile(
  new URL('../../docs/styles/shared/style-switcher.js', import.meta.url),
  'utf8',
);
const styleSwitcherStyles = await readFile(
  new URL('../../docs/styles/shared/style-switcher.css', import.meta.url),
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
const stylePages = await Promise.all(styleIds.map(async (styleId) => ({
  styleId,
  html: await readFile(
    new URL(`../../docs/styles/${styleId}/index.html`, import.meta.url),
    'utf8',
  ),
  css: await readFile(
    new URL(`../../docs/styles/${styleId}/style.css`, import.meta.url),
    'utf8',
  ),
})));

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

function createClassList() {
  const names = new Set();
  return {
    add: (...tokens) => tokens.forEach((token) => names.add(token)),
    remove: (...tokens) => tokens.forEach((token) => names.delete(token)),
    toggle(token, force) {
      const enabled = force === undefined ? !names.has(token) : force;
      if (enabled) names.add(token);
      else names.delete(token);
      return enabled;
    },
    contains: (token) => names.has(token),
  };
}

function runMotion({ reduce = false } = {}) {
  const listeners = new Map();
  const frames = [];
  const root = { classList: createClassList(), dataset: {} };
  const window = {
    innerHeight: 1000,
    scrollY: 0,
    location: { reload() {} },
    matchMedia() {
      return { matches: reduce, addEventListener() {} };
    },
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
  };
  const makeElement = (absoluteTop, height = 800) => ({
    classList: createClassList(),
    getBoundingClientRect() {
      const top = absoluteTop - window.scrollY;
      return { top, bottom: top + height, height };
    },
    matches: (selector) => selector === '[data-reveal], [data-enter]',
  });
  const scenes = [0, 900, 1800].map((top) => makeElement(top));
  const reveals = [makeElement(80, 40)];
  const document = {
    documentElement: root,
    querySelectorAll(selector) {
      return selector === '[data-motion-scene]' ? scenes : reveals;
    },
  };
  class IntersectionObserver {
    observe() {}
  }
  window.IntersectionObserver = IntersectionObserver;

  runInNewContext(motionScript, { document, IntersectionObserver, window });

  return {
    flushFrames() {
      while (frames.length) frames.shift()();
    },
    listeners,
    reveals,
    root,
    scenes,
    window,
  };
}

test('Apple reduced motion keeps only the navigation color handoff at 80ms', () => {
  const reducedMotion = ruleBody(appleStyles, '@media (prefers-reduced-motion: reduce)');
  const globalMotion = ruleBody(reducedMotion, '*::after');
  const navigationOverlay = ruleBody(reducedMotion, 'body::after');

  assert.match(globalMotion, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(globalMotion, /transition-duration:\s*0\.01ms\s*!important/);
  assert.match(navigationOverlay, /transition-duration:\s*80ms\s*!important/);
  assert.match(styleSwitcher, /reducedMotion\.matches\s*\?\s*80\s*:\s*240/);
});

test('nine non-Apple pages opt into the shared scene state machine', () => {
  for (const { styleId, html, css } of stylePages) {
    assert.match(html, /\.\.\/shared\/reset\.css/, `${styleId} must load the shared reset`);
    assert.match(html, /\.\.\/shared\/style-switcher\.css/, `${styleId} must load the switcher styles`);
    assert.match(html, /\.\.\/shared\/style-switcher\.js/, `${styleId} must load the switcher behavior`);
    assert.match(html, /\.\.\/shared\/motion\.js/, `${styleId} must load the scene state machine`);
    assert.ok(
      (html.match(/data-motion-scene/g) || []).length >= 2,
      `${styleId} must expose at least two motion scenes`,
    );
    assert.match(html, /data-(?:enter|reveal)/, `${styleId} must expose reveal targets`);
    assert.match(css, /\.motion-ready/, `${styleId} motion must be JS-gated`);
    assert.match(css, /\.is-prev/, `${styleId} must choreograph the previous scene`);
    assert.match(css, /\.is-current/, `${styleId} must choreograph the current scene`);
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, `${styleId} needs a static fallback`);
  }
});

test('shared motion assigns previous, current, and next scenes in both directions', () => {
  const motion = runMotion();
  motion.flushFrames();

  assert.equal(motion.root.classList.contains('motion-ready'), true);
  assert.equal(motion.reveals[0].classList.contains('is-visible'), true);
  assert.equal(motion.scenes[0].classList.contains('is-current'), true);
  assert.equal(motion.scenes[1].classList.contains('is-next'), true);

  motion.window.scrollY = 900;
  motion.listeners.get('scroll')();
  motion.flushFrames();
  assert.equal(motion.root.dataset.motionDirection, 'forward');
  assert.equal(motion.scenes[0].classList.contains('is-prev'), true);
  assert.equal(motion.scenes[1].classList.contains('is-current'), true);
  assert.equal(motion.scenes[2].classList.contains('is-next'), true);

  motion.window.scrollY = 1800;
  motion.listeners.get('scroll')();
  motion.flushFrames();
  assert.equal(motion.scenes[1].classList.contains('is-prev'), true);
  assert.equal(motion.scenes[2].classList.contains('is-current'), true);

  motion.window.scrollY = 900;
  motion.listeners.get('scroll')();
  motion.flushFrames();
  assert.equal(motion.root.dataset.motionDirection, 'backward');
  assert.equal(motion.scenes[1].classList.contains('is-current'), true);
  assert.equal(motion.scenes[2].classList.contains('is-next'), true);
});

test('reduced motion and no-JavaScript paths keep showcase content visible', () => {
  const hiddenRevealRule = ruleBody(
    resetStyles,
    '.motion-ready [data-enter]:not(.is-visible),',
  );
  assert.match(hiddenRevealRule, /opacity:\s*0/);
  assert.doesNotMatch(resetStyles, /\.js\s+\[data-enter\]/);

  for (const { styleId, html } of stylePages) {
    assert.doesNotMatch(
      html,
      /<html[^>]*class=["'][^"']*motion-ready/,
      `${styleId} must not hide content before JavaScript runs`,
    );
  }

  const motion = runMotion({ reduce: true });
  assert.equal(motion.root.classList.contains('motion-reduced'), true);
  assert.equal(motion.root.classList.contains('motion-ready'), false);
  assert.equal(motion.root.classList.contains('style-ready'), true);
  assert.equal(motion.reveals.every((element) => element.classList.contains('is-visible')), true);
  assert.equal(motion.scenes[0].classList.contains('is-current'), true);
  assert.equal(motion.scenes.slice(1).every((scene) => scene.classList.contains('is-next')), true);
});

test('style switching animates material shape, preserves direction, and reduces to an 80ms fade', () => {
  const overlay = ruleBody(styleSwitcherStyles, 'body::after');
  const bauhausExit = ruleBody(
    styleSwitcherStyles,
    'html.is-style-leaving[data-style-transition="bauhaus"] body::after',
  );
  const reducedMotion = ruleBody(styleSwitcherStyles, '@media (prefers-reduced-motion: reduce)');
  const reducedOverlay = ruleBody(reducedMotion, 'body::after');

  assert.match(overlay, /clip-path\s+240ms/);
  assert.match(bauhausExit, /clip-path:\s*polygon\(/);
  assert.match(styleSwitcher, /setProperty\('--style-shift',\s*arrivalDirection\s*===\s*'forward'\s*\?\s*'1'\s*:\s*'-1'\)/);
  assert.match(styleSwitcher, /reducedMotion\.matches\s*\?\s*80\s*:\s*240/);
  assert.match(reducedOverlay, /clip-path:\s*inset\(0\)\s*!important/);
  assert.match(reducedOverlay, /transform:\s*none\s*!important/);
  assert.match(reducedOverlay, /transition-duration:\s*80ms\s*!important/);
});

test('all showcase pages use the v0.15.0 cache key for release and local assets', async () => {
  const pages = [
    await readFile(new URL('../../docs/index.html', import.meta.url), 'utf8'),
    ...stylePages.map(({ html }) => html),
  ];

  for (const page of pages) {
    assert.doesNotMatch(page, /v0131-release|v071-release|v070-release/);
    assert.match(page, /release-data\.js\?v=20260816-v0150-release/);
    assert.match(page, /styles?\.css\?v=20260816-v0150-release/);
    assert.match(page, /app\.js\?v=20260816-v0150-release/);
  }
});

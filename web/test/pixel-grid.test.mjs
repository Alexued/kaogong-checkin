import test from 'node:test';
import assert from 'node:assert/strict';
import { importTypeScript } from './import-typescript.mjs';

const {
  PIXEL_GRID_FADE_OUT_PADDING,
  PIXEL_GRID_PRESETS,
  PIXEL_GRID_PATTERNS,
  compilePixelPattern,
  cubicEaseOut,
  pixelGridCycleDuration,
  pixelGridIntensitiesAt,
  pixelGridIntensityAt,
  pixelPatternCycleDuration,
  pixelPatternFrameIndexAt,
  pixelPatternIntensitiesAt,
} = await importTypeScript(new URL('../src/lib/pixelGrid.ts', import.meta.url));

test('pixel presets preserve the audited 3x3 timings', () => {
  assert.deepEqual(PIXEL_GRID_PRESETS.wave.delays, [0, 0.12, 0.24, 0, 0.12, 0.24, 0, 0.12, 0.24]);
  assert.deepEqual(PIXEL_GRID_PRESETS.spiral.delays, [0, 0.08, 0.16, 0.56, 0.64, 0.24, 0.48, 0.4, 0.32]);
  assert.deepEqual(PIXEL_GRID_PRESETS.pulse.delays, [0.24, 0.12, 0.24, 0.12, 0, 0.12, 0.24, 0.12, 0.24]);
  for (const animation of Object.values(PIXEL_GRID_PRESETS)) {
    assert.equal(animation.delays.length, 9);
    assert.ok(animation.duration > 0);
  }
});

test('cycle duration uses 2 * (maximumDelay + duration) + padding', () => {
  assert.equal(pixelGridCycleDuration('wave'), 2 * (0.24 + 0.2) + PIXEL_GRID_FADE_OUT_PADDING);
  assert.equal(pixelGridCycleDuration('spiral'), 2 * (0.64 + 0.18) + PIXEL_GRID_FADE_OUT_PADDING);
});

test('continuous intensity follows rise, hold, fade and loop boundaries', () => {
  assert.equal(pixelGridIntensityAt(0, 0, 'wave'), 0);
  assert.equal(pixelGridIntensityAt(0.3, 0, 'wave'), 1);
  assert.equal(pixelGridIntensityAt(0.439, 0, 'wave'), 1);
  assert.ok(pixelGridIntensityAt(0.5, 0, 'wave') < 1);
  assert.equal(pixelGridIntensityAt(0.74, 0, 'wave'), 0);
  assert.equal(pixelGridIntensityAt(pixelGridCycleDuration('wave'), 0, 'wave'), 0);
  assert.equal(pixelGridIntensityAt(0.239, 0.24, 'wave'), 0);
  assert.ok(pixelGridIntensityAt(0.39, 0.24, 'wave') > 0.5);
});

test('cubic ease-out is bounded, monotonic and uses the reference midpoint', () => {
  const samples = Array.from({ length: 21 }, (_, index) => cubicEaseOut(index / 20));
  assert.equal(samples[0], 0);
  assert.equal(samples.at(-1), 1);
  assert.ok(Math.abs(cubicEaseOut(0.5) - 0.684643) < 0.00001);
  for (let index = 1; index < samples.length; index += 1) {
    assert.ok(samples[index] >= samples[index - 1]);
  }
});

test('static playback states return meaningful reusable frames', () => {
  const target = new Array(9).fill(-1);
  assert.equal(pixelGridIntensitiesAt(0.2, 'spiral', { active: false }, target), target);
  assert.deepEqual(target, new Array(9).fill(0));
  assert.equal(pixelGridIntensitiesAt(4, 'spiral', { reduceMotion: true }, target), target);
  assert.deepEqual(target, new Array(9).fill(1));
});

test('pattern compiler follows SwiftPixelGrid grouping and normalization rules', () => {
  assert.deepEqual(compilePixelPattern([]), []);
  assert.deepEqual(compilePixelPattern([[1, 2, 3]]), [[1], [2], [3]]);
  assert.deepEqual(compilePixelPattern([[2], [4], [6], [8]]), [[2, 4, 6, 8], []]);
  assert.deepEqual(
    compilePixelPattern([[0, 5, 1, 1, 10], [9, 5]]),
    [[1, 5], [5, 9]],
  );
});

test('interaction patterns preserve meaningful settled frames and timing', () => {
  assert.deepEqual(PIXEL_GRID_PATTERNS.confirm.frames.at(-1), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(PIXEL_GRID_PATTERNS.dissolve.frames.at(-1), []);
  assert.equal(pixelPatternCycleDuration('confirm'), 3 * 0.095);
  assert.equal(pixelPatternCycleDuration('dissolve'), 4 * 0.075);
});

test('pattern playback uses absolute time, loops, and stops on the final frame', () => {
  assert.equal(pixelPatternFrameIndexAt(0, 'confirm'), 0);
  assert.equal(pixelPatternFrameIndexAt(0.095, 'confirm'), 1);
  assert.equal(pixelPatternFrameIndexAt(pixelPatternCycleDuration('confirm'), 'confirm'), 0);
  assert.equal(pixelPatternFrameIndexAt(pixelPatternCycleDuration('confirm'), 'confirm', true), 2);

  const settled = pixelPatternIntensitiesAt(9, 'dissolve', {}, undefined, true);
  assert.deepEqual(settled, new Array(9).fill(0));
});

test('pattern static states reuse targets and reduced motion renders the frame union', () => {
  const target = new Array(9).fill(-1);
  assert.equal(pixelPatternIntensitiesAt(0, 'confirm', { active: false }, target), target);
  assert.deepEqual(target, new Array(9).fill(0));
  assert.equal(pixelPatternIntensitiesAt(4, 'confirm', { reduceMotion: true }, target), target);
  assert.deepEqual(target, new Array(9).fill(1));
});

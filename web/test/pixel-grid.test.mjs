import test from 'node:test';
import assert from 'node:assert/strict';
import { importTypeScript } from './import-typescript.mjs';

const {
  PIXEL_GRID_FADE_OUT_PADDING,
  PIXEL_GRID_PRESETS,
  cubicEaseOut,
  pixelGridCycleDuration,
  pixelGridIntensitiesAt,
  pixelGridIntensityAt,
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

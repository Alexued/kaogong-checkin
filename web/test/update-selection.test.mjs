import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPreferredRelease } from '../src/api/update-selection.ts';

const release = (version, source) => ({ version, source });

test('higher LAN version wins', () => {
  assert.deepEqual(
    selectPreferredRelease(release('0.6.0', 'lan'), release('0.5.9', 'github')),
    release('0.6.0', 'lan'),
  );
});

test('higher GitHub version wins', () => {
  assert.deepEqual(
    selectPreferredRelease(release('0.5.9', 'lan'), release('0.6.0', 'github')),
    release('0.6.0', 'github'),
  );
});

test('equal versions prefer LAN', () => {
  assert.deepEqual(
    selectPreferredRelease(release('0.6.0', 'lan'), release('0.6.0', 'github')),
    release('0.6.0', 'lan'),
  );
});

test('one available source remains usable', () => {
  assert.deepEqual(selectPreferredRelease(release('0.6.0', 'lan'), null), release('0.6.0', 'lan'));
  assert.deepEqual(selectPreferredRelease(null, release('0.6.0', 'github')), release('0.6.0', 'github'));
});

test('no available source returns null', () => {
  assert.equal(selectPreferredRelease(null, null), null);
});

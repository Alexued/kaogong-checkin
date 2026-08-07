import test from 'node:test';
import assert from 'node:assert/strict';
import { importTypeScript } from './import-typescript.mjs';

const {
  INVALID_STATS_DATE_REDIRECT,
  UNKNOWN_ROUTE_REDIRECT,
  isValidStatsDateParam,
  resolveStatsDayNavigation,
  resolveUnknownRoute,
} = await importTypeScript(new URL('../src/lib/routeValidation.ts', import.meta.url));

test('statistics day routes accept only real zero-padded calendar dates', () => {
  for (const date of ['2026-08-08', '2024-02-29', '2000-02-29', '9999-12-31']) {
    assert.equal(isValidStatsDateParam(date), true, date);
    assert.equal(resolveStatsDayNavigation(date), true, date);
  }

  for (const date of [
    '2026-2-08',
    '2026-02-8',
    '2026-00-10',
    '2026-13-10',
    '2026-01-00',
    '2026-04-31',
    '2026-02-29',
    '2100-02-29',
    '0000-01-01',
    '2026-08-08T00:00:00',
    '',
    null,
    undefined,
    ['2026-08-08'],
  ]) {
    assert.equal(isValidStatsDateParam(date), false, String(date));
    assert.deepEqual(resolveStatsDayNavigation(date), {
      path: INVALID_STATS_DATE_REDIRECT,
      replace: true,
    });
  }
});

test('invalid detail dates and unknown paths use stable explicit parents', () => {
  assert.equal(INVALID_STATS_DATE_REDIRECT, '/settings');
  assert.equal(UNKNOWN_ROUTE_REDIRECT, '/');
  assert.equal(resolveUnknownRoute(), '/');
});

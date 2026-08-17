import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const timerView = await readFile(new URL('../src/views/TimerView.vue', import.meta.url), 'utf8');

test('active stopwatch reserves a five-row lap viewport between clock and controls', () => {
  assert.match(timerView, /class="timer-stage"[^>]+stopwatch-session/);
  assert.match(timerView, /mode === 'stopwatch' && sessionActive[^>]+data-testid="laps-viewport"/);
  assert.match(timerView, /const MAX_VISIBLE_LAPS = 5/);
  assert.match(timerView, /lapViewportHeight[^\n]+MAX_VISIBLE_LAPS/);
  assert.match(timerView, /data-testid="timer-clock"[\s\S]+data-testid="laps-viewport"[\s\S]+data-testid="timer-controls"/);
});

test('lap growth scrolls inside its own panel without moving the action slot', () => {
  assert.match(timerView, /\.laps-area \{[^}]*flex: 0 0 auto[^}]*overflow: hidden/);
  assert.match(timerView, /\.laps-scroll \{[^}]*overflow-y: auto[^}]*overscroll-behavior: contain/);
  assert.match(timerView, /\.controls \{[^}]*flex: 0 0 auto[^}]*min-height: 116px/);
  assert.match(timerView, /scrollTop = lapsEl\.value\.scrollHeight/);
  assert.doesNotMatch(timerView, /\.laps-area \{[^}]*flex:\s*1(?:;|\s)/);
});

test('running clock uses a compact upper slot and reduced motion remains supported', () => {
  assert.match(timerView, /\.timer-stage\.stopwatch-session \{[^}]*justify-content: flex-start/);
  assert.match(timerView, /\.timer-stage\.stopwatch-session \.stopwatch-clock \{[^}]*aspect-ratio: auto/);
  assert.match(timerView, /orientation: landscape[\s\S]+stopwatch-page-active[\s\S]+grid-template-columns/);
  assert.match(timerView, /timer-stage\.stopwatch-session \{[^}]*grid-template-columns: minmax\(180px,\.85fr\) minmax\(220px,1\.15fr\)/);
  assert.match(timerView, /stopwatch-page-active[\s\S]+stopwatch-clock \.clock \{[^}]*font-size: clamp\(34px,5vw,44px\)/);
  assert.match(timerView, /stopwatch-page-active \.history-entry \{ display: none/);
  assert.match(timerView, /prefers-reduced-motion:[\s\S]+stopwatch-session \.stopwatch-clock/);
});

test('timer mode switches use a keyed directional transition and a moving indicator', () => {
  assert.match(timerView, /class="timer-mode-indicator"/);
  assert.match(timerView, /:style="\{ transform: `translateX\(\$\{modeIndex \* 100\}%\)` \}"/);
  assert.match(timerView, /<Transition name="timer-mode-view">[\s\S]*:key="mode"/);
  assert.match(timerView, /function setMode\(nextMode/);
  assert.match(timerView, /modeDirection\.value = MODE_ORDER\.indexOf/);
  assert.match(timerView, /\.timer-mode-view-enter-active,[\s\S]+transition: opacity 320ms/);
  assert.match(timerView, /\.mode-forward \{ --mode-enter-x: 18px; --mode-leave-x: -12px; \}/);
});

test('all circular timer controls keep their geometry when flex space is tight', () => {
  assert.match(timerView, /\.round-btn \{[^}]*flex: 0 0 auto[^}]*aspect-ratio: 1/);
  assert.match(timerView, /\.round-btn\.main \{[^}]*min-width: 96px[^}]*min-height: 96px/);
  assert.match(timerView, /\.round-btn\.lap \{[^}]*min-width: 80px[^}]*min-height: 80px/);
  assert.match(timerView, /\.round-btn\.sub \{[^}]*min-width: 64px[^}]*min-height: 64px/);
});

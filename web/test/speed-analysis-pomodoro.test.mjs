import test from 'node:test';
import assert from 'node:assert/strict';
import { importTypeScript } from './import-typescript.mjs';

const speed = await importTypeScript(new URL('../src/lib/speedMath.ts', import.meta.url));
const coach = await importTypeScript(new URL('../src/lib/analysisCoach.ts', import.meta.url));
const pomodoroModule = await importTypeScript(new URL('../src/lib/pomodoro.ts', import.meta.url));

test('every speed category generates a gradeable question at every difficulty', () => {
  for (const category of speed.SPEED_CATEGORIES) {
    for (const difficulty of ['easy', 'normal', 'hard']) {
      const question = speed.generateSpeedQuestion(category.key, difficulty, () => 0.314159);
      assert.ok(question.prompt.trim(), `${category.key} prompt`);
      assert.ok(question.expression.trim(), `${category.key} expression`);
      assert.equal(speed.judgeSpeedAnswer(question, question.answerDisplay), true, `${category.key} answer`);
    }
  }
});

test('speed grading applies numeric tolerance but rejects adjacent answers', () => {
  const question = speed.generateSpeedQuestion('prior-amount', 'normal', () => 0.2);
  assert.equal(speed.judgeSpeedAnswer(question, String(Number(question.answerDisplay) + 0.09)), true);
  assert.equal(speed.judgeSpeedAnswer(question, String(Number(question.answerDisplay) + 1)), false);
});

test('analysis coach selects Chen Huaian rules and always returns six review sections', () => {
  const base = coach.analyzeDataQuestion('2025年产量为5200万吨，同比增长8.3%，问2024年基期量约为多少？');
  assert.equal(base.categoryKey, 'base-amount');
  assert.equal(base.sections.length, 6);
  assert.match(base.sections[2].content, /基期 = 现期/);

  const share = coach.analyzeDataQuestion('部分增长21%，整体增长17%，现期占比32.6%，比重比上年提高多少个百分点？', '31.5%', '31.5%');
  assert.equal(share.categoryKey, 'share');
  assert.match(share.sections.at(-1).content, /答案一致/);
});

test('analysis coach treats an earlier year asked from a growth context as the base amount', () => {
  const result = coach.analyzeDataQuestion('2025年某地区粮食产量为5200万吨，同比增长8.3%，问2024年粮食产量约为多少万吨？');
  assert.equal(result.categoryKey, 'base-amount');
  assert.match(result.sections[2].content, /基期 = 现期/);
});

test('pomodoro persists pause state and resumes from remaining absolute time', () => {
  const pomo = pomodoroModule.pomodoro;
  pomo.resetCycle();
  pomo.configure(25, 5, 15, 4, 'task-1');
  pomo.start();
  const startedAt = pomo.startedAt;
  pomo.deadlineAt = Date.now() + 10_000;
  pomo.pause();
  assert.equal(pomo.running, false);
  assert.equal(pomo.startedAt, startedAt);
  assert.ok(pomo.remainingAtPauseMs > 9_000 && pomo.remainingAtPauseMs <= 10_000);
  pomo.resume();
  assert.equal(pomo.running, true);
  assert.equal(pomo.startedAt, startedAt);
  assert.ok(pomo.deadlineAt > Date.now());
  pomo.resetCycle();
});

test('pomodoro clamps configuration and resolves every stage duration', () => {
  const pomo = pomodoroModule.pomodoro;
  pomo.resetCycle();
  pomo.configure(0, 99, -5, 1, '');
  assert.equal(pomo.focusMinutes, 1);
  assert.equal(pomo.shortBreakMinutes, 60);
  assert.equal(pomo.longBreakMinutes, 1);
  assert.equal(pomo.longBreakEvery, 2);
  assert.equal(pomo.stageDurationMs('focus'), 60_000);
  assert.equal(pomo.stageDurationMs('shortBreak'), 3_600_000);
  assert.equal(pomo.stageDurationMs('longBreak'), 60_000);
  pomo.resetCycle();
});

test('pomodoro alternates focus and short breaks, then uses a long break after round four', () => {
  const pomo = pomodoroModule.pomodoro;
  pomo.resetCycle();
  pomo.configure(25, 5, 15, 4, 'task-1');

  for (let round = 1; round <= 4; round += 1) {
    pomo.start();
    pomo.deadlineAt = Date.now() - 1;
    assert.equal(pomo.remainingMs(), 0);
    const focus = pomo.completeStage();
    assert.equal(focus.stage, 'focus');
    assert.equal(focus.round, round);
    assert.equal(focus.taskId, 'task-1');
    assert.equal(pomo.stage, round === 4 ? 'longBreak' : 'shortBreak');

    pomo.start();
    const rest = pomo.completeStage();
    assert.equal(rest.stage, round === 4 ? 'longBreak' : 'shortBreak');
    assert.equal(pomo.stage, 'focus');
  }

  assert.equal(pomo.focusesCompleted, 4);
  pomo.resetCycle();
});

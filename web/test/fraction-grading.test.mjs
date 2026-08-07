import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
test.after(() => vite.close());

const { DRILL_TABLE, gradeAnswer, isCorrect } = await vite.ssrLoadModule('/src/lib/drill.ts');

test('percent catalog contains the 24 standard fractions and registered approximations', () => {
  assert.equal(DRILL_TABLE.length, 24);
  assert.deepEqual(
    DRILL_TABLE.map(({ percent, answer }) => [percent, answer]),
    [
      [50, '1/2'], [33.3, '1/3'], [25, '1/4'], [20, '1/5'],
      [19, '3/16'], [18, '2/11'], [17, '1/6'], [26.7, '4/15'],
      [15, '2/13'], [14.3, '1/7'], [13, '2/15'], [12.5, '1/8'],
      [11.1, '1/9'], [10.5, '2/19'], [10, '1/10'], [9.5, '2/21'],
      [9.1, '1/11'], [8.3, '1/12'], [7.7, '1/13'], [7.1, '1/14'],
      [6.7, '1/15'], [5, '1/20'], [3.3, '1/30'], [2.5, '1/40'],
    ],
  );

  assert.equal(isCorrect(19, '4/21'), true);
  assert.equal(isCorrect(18, '9/50'), true);
  assert.equal(isCorrect(17, '3/17'), true);
  assert.equal(isCorrect(15, '3/20'), true);
  assert.equal(isCorrect(13, '13/100'), true);
});

test('grading accepts exact equivalents and finite decimal equivalents', () => {
  assert.equal(isCorrect(50, '3/6'), true);
  assert.equal(isCorrect(50, '-3/-6'), true);
  assert.equal(isCorrect(12.5, '0.125'), true);
  assert.equal(isCorrect(25, '+1/+4'), true);
  assert.equal(isCorrect(50, '-1/2'), false);
  assert.equal(isCorrect(50, '1/-2'), false);
  assert.equal(isCorrect(19, '1/5'), false);
  assert.equal(isCorrect(33.3, '333/1000'), false);
});

test('grading switches to BigInt cross multiplication beyond safe integer range', () => {
  assert.equal(isCorrect(50, '9007199254740992/18014398509481984'), true);
  assert.equal(isCorrect(50, '10000000000000000000000000000000000000000/20000000000000000000000000000000000000000'), true);
  assert.equal(isCorrect(50, '9007199254740993/18014398509481984'), false);
});

test('invalid answers fail with stable readable feedback', () => {
  assert.deepEqual(gradeAnswer(50, ''), {
    correct: false,
    reason: 'empty',
    message: '请输入答案',
  });
  assert.equal(gradeAnswer(50, '1/0').reason, 'zero-denominator');
  assert.equal(gradeAnswer(50, '-1/-0').reason, 'zero-denominator');

  for (const input of ['1/2abc', '1//2', 'Infinity', '1e0/2e0', '≈1/2']) {
    const result = gradeAnswer(50, input);
    assert.equal(result.correct, false, input);
    assert.equal(result.reason, 'format', input);
    assert.ok(result.message.length > 0, input);
  }

  const tooLong = `${'9'.repeat(257)}/2`;
  assert.equal(gradeAnswer(50, tooLong).reason, 'too-large');
  assert.equal(gradeAnswer(999, '1/2').reason, 'unknown-percent');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importTypeScript } from './import-typescript.mjs';

const skills = await importTypeScript(new URL('../src/lib/analysisSkills.ts', import.meta.url));
const bank = await importTypeScript(new URL('../src/lib/questionBank.ts', import.meta.url));

test('analysis skills expose an extensible registry with Chen Huaian available', () => {
  assert.equal(skills.analysisSkill('chen-huaian').name, '陈怀安资料分析');
  assert.equal(skills.availableAnalysisSkills().length, 1);
  assert.equal(skills.analysisSkill('future-teacher').id, 'chen-huaian');
  assert.equal(skills.analyzeWithSkill('chen-huaian', '2025年现期5200，同比增长8.3%，求2024年基期量').sections.length, 6);
});

test('question bank searches source questions by terms and category', () => {
  assert.equal(bank.ANALYSIS_BANK_COUNT, 3988);
  assert.equal(bank.ANALYSIS_BANK_CATEGORIES.length, 12);
});

test('all source questions load with unique ids, answers, analysis and category coverage', async () => {
  const questions = await bank.loadAnalysisQuestionBank();
  assert.equal(questions.length, 3988);
  assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
  assert.ok(questions.every((question) => /^[A-D]$/.test(question.answer)));
  assert.ok(questions.every((question) => question.analysis.trim().length > 0));
  assert.ok(questions.every((question) => question.categories.length > 0));
  assert.ok(questions.every((question) => question.options.length === question.optionImages.length));
  assert.deepEqual(
    new Set(questions.flatMap((question) => question.categories)),
    new Set(bank.ANALYSIS_BANK_CATEGORIES),
  );
  const results = bank.searchAnalysisQuestionBank('研发经费');
  assert.ok(results.some((question) => question.stem.includes('研发经费')));
  assert.ok(bank.searchAnalysisQuestionBank('', '增长率').every((question) => question.categories.includes('增长率')));
  const first = results[0];
  assert.match(bank.questionBankText(first), /研发经费/);
  assert.match(bank.questionBankText(first), /A\./);
  assert.equal(bank.analysisBankQuestion(first.id)?.analysis, first.analysis);
});

test('recovery and timer UI expose actionable paths and stable danger contrast', async () => {
  const recovery = await readFile(new URL('../src/components/DataRecoveryPanel.vue', import.meta.url), 'utf8');
  const timer = await readFile(new URL('../src/views/TimerHistoryView.vue', import.meta.url), 'utf8');
  const dialog = await readFile(new URL('../src/components/AppDialogHost.vue', import.meta.url), 'utf8');
  assert.match(recovery, /验证并恢复/);
  assert.match(recovery, /查看原因和操作路径/);
  assert.match(recovery, /不要清除应用数据/);
  assert.match(recovery, /接下来这样操作/);
  assert.match(recovery, /错误码/);
  assert.match(recovery, /设置 → 设备直连 → 发送本机记录/);
  const today = await readFile(new URL('../src/views/TodayView.vue', import.meta.url), 'utf8');
  assert.match(today, /if \(!store\.setProgress/);
  assert.match(today, /showRecoveryForBlockedWrite/);
  assert.match(timer, /记录已删除/);
  assert.match(timer, /writeBlockedMessage/);
  assert.match(dialog, /\.dialog-confirm\.danger \{ background: var\(--danger\); color: #fff/);
});

test('bank review prepends the source explanation before the selected skill sections', async () => {
  const panel = await readFile(new URL('../src/components/drill/AnalysisReviewPanel.vue', import.meta.url), 'utf8');
  assert.match(panel, /analysisBankQuestion\(questionBankId\.value\)/);
  assert.match(panel, /title: '原题解析'/);
  assert.match(panel, /\.\.\.skillResult\.sections/);
});

test('wheel picker uses scroll snapping and no numeric input', async () => {
  const timer = await readFile(new URL('../src/views/TimerView.vue', import.meta.url), 'utf8');
  const wheel = await readFile(new URL('../src/components/WheelPicker.vue', import.meta.url), 'utf8');
  assert.doesNotMatch(timer, /type="number"/);
  assert.match(wheel, /scroll-snap-type:y mandatory/);
  assert.match(wheel, /role="spinbutton"/);
});

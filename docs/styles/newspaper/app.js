(() => {
  'use strict';
  const mark = document.querySelector('[data-mark-story]');
  const markLabel = document.querySelector('[data-mark-label]');
  mark?.addEventListener('click', () => {
    const marked = mark.getAttribute('aria-pressed') !== 'true';
    mark.setAttribute('aria-pressed', String(marked));
    mark.querySelector('span').textContent = marked ? '■' : '□';
    markLabel.textContent = marked ? '已标记为今日重点' : '标记为今日重点';
  });

  const answerToggle = document.querySelector('[data-answer-toggle]');
  const answer = document.querySelector('[data-answer]');
  answerToggle?.addEventListener('click', () => {
    const expanded = answerToggle.getAttribute('aria-expanded') !== 'true';
    answerToggle.setAttribute('aria-expanded', String(expanded));
    answerToggle.textContent = expanded ? '收起答案' : '揭晓答案';
    answer.hidden = !expanded;
  });
})();

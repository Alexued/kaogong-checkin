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
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let answerTimer = 0;

  const settleAnswer = (expanded) => {
    answer.classList.remove('is-answer-opening', 'is-answer-closing');
    answer.classList.toggle('is-expanded', expanded);
    answer.hidden = false;
    answer.setAttribute('aria-hidden', String(!expanded));
    answer.inert = !expanded;
    answerTimer = 0;
  };

  if (answer) settleAnswer(false);
  answerToggle?.addEventListener('click', () => {
    const expanded = answerToggle.getAttribute('aria-expanded') !== 'true';
    answerToggle.setAttribute('aria-expanded', String(expanded));
    answerToggle.textContent = expanded ? '收起答案' : '揭晓答案';

    window.clearTimeout(answerTimer);
    if (reducedMotion.matches) {
      settleAnswer(expanded);
      return;
    }

    if (expanded) {
      answer.hidden = false;
      answer.setAttribute('aria-hidden', 'false');
      answer.inert = false;
      answer.classList.remove('is-answer-closing');
      answer.classList.add('is-answer-opening');
      void answer.offsetWidth;
      window.requestAnimationFrame(() => {
        answer.classList.remove('is-answer-opening');
        answer.classList.add('is-expanded');
      });
    } else {
      answer.setAttribute('aria-hidden', 'true');
      answer.inert = true;
      answer.classList.remove('is-answer-opening', 'is-expanded');
      answer.classList.add('is-answer-closing');
    }
    answerTimer = window.setTimeout(() => settleAnswer(expanded), 460);
  });

  window.addEventListener('pagehide', () => {
    window.clearTimeout(answerTimer);
    settleAnswer(answerToggle?.getAttribute('aria-expanded') === 'true');
  });
})();

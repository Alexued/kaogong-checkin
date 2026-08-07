(() => {
  'use strict';

  const tasks = [...document.querySelectorAll('[data-sprint-task]')];
  const score = document.querySelector('[data-sprint-score]');
  const done = document.querySelector('[data-sprint-done]');
  const timer = document.querySelector('[data-sprint-timer]');
  const timerToggle = document.querySelector('[data-sprint-timer-toggle]');
  const timerReset = document.querySelector('[data-sprint-timer-reset]');
  const timerStatus = document.querySelector('[data-sprint-timer-status]');
  const relay = document.querySelector('[data-relay-root]');
  const relayToggle = document.querySelector('[data-relay-toggle]');
  const relayState = document.querySelector('[data-relay-state]');
  const relayDetail = document.querySelector('[data-relay-detail]');
  const relayLabel = document.querySelector('[data-relay-label]');
  let remaining = 25 * 60;
  let timerId = 0;

  const updateScore = () => {
    const completed = tasks.filter((task) => task.getAttribute('aria-pressed') === 'true').length;
    done.textContent = String(completed);
    score.textContent = String(Math.round((completed / tasks.length) * 100));
  };

  tasks.forEach((task) => task.addEventListener('click', () => {
    const next = task.getAttribute('aria-pressed') !== 'true';
    task.setAttribute('aria-pressed', String(next));
    task.classList.toggle('is-done', next);
    task.querySelector('small').textContent = next ? '已通过' : '待执行';
    updateScore();
  }));

  const renderTimer = () => {
    const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
    const seconds = String(remaining % 60).padStart(2, '0');
    timer.textContent = `${minutes}:${seconds}`;
  };

  const stopTimer = (status) => {
    window.clearInterval(timerId);
    timerId = 0;
    timerToggle.setAttribute('aria-pressed', 'false');
    timerToggle.textContent = remaining === 25 * 60 ? '开始计时' : '继续计时';
    timerStatus.textContent = status;
  };

  timerToggle?.addEventListener('click', () => {
    if (timerId) {
      stopTimer('已暂停，成绩保留');
      return;
    }
    timerToggle.setAttribute('aria-pressed', 'true');
    timerToggle.textContent = '暂停计时';
    timerStatus.textContent = '正在执行';
    timerId = window.setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      renderTimer();
      if (!remaining) stopTimer('本赛段完成');
    }, 1000);
  });

  timerReset?.addEventListener('click', () => {
    remaining = 25 * 60;
    stopTimer('等待起跑');
    renderTimer();
  });

  relayToggle?.addEventListener('click', () => {
    const enabled = relayToggle.getAttribute('aria-pressed') !== 'true';
    relayToggle.setAttribute('aria-pressed', String(enabled));
    relay.dataset.enabled = String(enabled);
    relayState.textContent = enabled ? '等待配对' : '未接力';
    relayDetail.textContent = enabled ? '开始扫描可信局域网中的电脑' : '不会扫描或连接电脑';
    relayLabel.textContent = enabled ? '已开启' : '已关闭';
  });
})();

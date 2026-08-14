(() => {
  'use strict';
  const callout = document.querySelector('[data-callout-panel]');
  const calloutCopy = {
    phone: ['标注 A-01', 'Android 输入模块', '任务、计时和背诵数据先写入本地状态。'],
    desktop: ['标注 W-02', 'Windows 输出模块', '只有总开关开启后，手机才发现并连接可信局域网服务。'],
  };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let calloutTimer = 0;

  document.querySelectorAll('[data-callout]').forEach((button) => button.addEventListener('click', () => {
    const [index, title, copy] = calloutCopy[button.dataset.callout];
    const update = () => {
      callout.querySelector('span').textContent = index;
      callout.querySelector('strong').textContent = title;
      callout.querySelector('p').textContent = copy;
      callout.setAttribute('aria-busy', 'false');
      window.requestAnimationFrame(() => callout.classList.remove('is-changing'));
    };

    window.clearTimeout(calloutTimer);
    callout.setAttribute('aria-busy', 'true');
    if (reducedMotion.matches) {
      update();
      return;
    }
    callout.classList.add('is-changing');
    calloutTimer = window.setTimeout(update, 150);
  }));

  const steps = [...document.querySelectorAll('[data-flow-step]')];
  const run = document.querySelector('[data-run-update]');
  const output = document.querySelector('[data-flow-output]');
  let timers = [];
  run?.addEventListener('click', () => {
    timers.forEach(window.clearTimeout);
    timers = [];
    steps.forEach((step) => {
      step.classList.remove('is-active', 'is-current-step');
      step.removeAttribute('aria-current');
    });
    run.disabled = true;
    run.setAttribute('aria-busy', 'true');
    output.textContent = '检测器运行中';

    if (reducedMotion.matches) {
      steps.forEach((step, index) => {
        step.classList.add('is-active');
        step.classList.toggle('is-current-step', index === steps.length - 1);
      });
      steps.at(-1)?.setAttribute('aria-current', 'step');
      output.textContent = '发现局域网更新 v0.14.0，等待用户确认下载';
      run.disabled = false;
      run.setAttribute('aria-busy', 'false');
      return;
    }

    steps.forEach((step, index) => {
      timers.push(window.setTimeout(() => {
        steps.forEach((item, itemIndex) => {
          item.classList.toggle('is-active', itemIndex <= index);
          item.classList.toggle('is-current-step', itemIndex === index);
          if (itemIndex === index) item.setAttribute('aria-current', 'step');
          else item.removeAttribute('aria-current');
        });
        output.textContent = index === steps.length - 1 ? '发现局域网更新 v0.14.0，等待用户确认下载' : `步骤 ${String(index + 1).padStart(2, '0')} 已完成`;
        if (index === steps.length - 1) {
          run.disabled = false;
          run.setAttribute('aria-busy', 'false');
        }
      }, 100 + index * 460));
    });
  });

  window.addEventListener('pagehide', () => {
    window.clearTimeout(calloutTimer);
    timers.forEach(window.clearTimeout);
    callout.classList.remove('is-changing');
    callout.setAttribute('aria-busy', 'false');
    if (run) {
      run.disabled = false;
      run.setAttribute('aria-busy', 'false');
    }
  });
})();

(() => {
  'use strict';
  const callout = document.querySelector('[data-callout-panel]');
  const calloutCopy = {
    phone: ['标注 A-01', 'Android 输入模块', '任务、计时和背诵数据先写入本地状态。'],
    desktop: ['标注 W-02', 'Windows 输出模块', '只有总开关开启后，手机才发现并连接可信局域网服务。'],
  };
  document.querySelectorAll('[data-callout]').forEach((button) => button.addEventListener('click', () => {
    const [index, title, copy] = calloutCopy[button.dataset.callout];
    callout.innerHTML = `<span>${index}</span><strong>${title}</strong><p>${copy}</p>`;
  }));

  const steps = [...document.querySelectorAll('[data-flow-step]')];
  const run = document.querySelector('[data-run-update]');
  const output = document.querySelector('[data-flow-output]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let timers = [];
  run?.addEventListener('click', () => {
    timers.forEach(window.clearTimeout);
    timers = [];
    steps.forEach((step) => step.classList.remove('is-active'));
    run.disabled = true;
    output.textContent = '检测器运行中';
    steps.forEach((step, index) => {
      timers.push(window.setTimeout(() => {
        steps.forEach((item, itemIndex) => item.classList.toggle('is-active', itemIndex === index));
        output.textContent = index === steps.length - 1 ? '发现局域网更新 v0.7.0，等待用户确认下载' : `步骤 ${String(index + 1).padStart(2, '0')} 已完成`;
        if (index === steps.length - 1) run.disabled = false;
      }, reducedMotion.matches ? 0 : index * 520));
    });
  });
})();

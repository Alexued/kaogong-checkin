(() => {
  'use strict';

  const tasks = [...document.querySelectorAll('[data-structure-task]')];
  const taskStatus = document.querySelector('[data-task-status]');

  const pulse = (element, className, duration = 520) => {
    if (!element) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    window.setTimeout(() => element.classList.remove(className), duration);
  };

  const renderTasks = () => {
    const completed = tasks.filter((task) => task.getAttribute('aria-pressed') === 'true').length;
    tasks.forEach((task) => {
      const isSet = task.getAttribute('aria-pressed') === 'true';
      task.classList.toggle('is-set', isSet);
      const note = task.querySelector('small');
      if (note) note.textContent = note.textContent.replace(isSet ? '待归位' : '已归位', isSet ? '已归位' : '待归位');
    });
    if (taskStatus) taskStatus.textContent = `已归位 ${completed} 块 / 共 ${tasks.length} 块`;
  };

  tasks.forEach((task) => task.addEventListener('click', () => {
    const isSet = task.getAttribute('aria-pressed') !== 'true';
    task.setAttribute('aria-pressed', String(isSet));
    renderTasks();
    pulse(task, isSet ? 'is-snapping' : 'is-releasing', 460);
  }));

  const syncRoot = document.querySelector('[data-sync-root]');
  const syncToggle = document.querySelector('[data-sync-toggle]');
  const syncLabel = document.querySelector('[data-sync-label]');
  const syncState = document.querySelector('[data-sync-state]');
  const syncDetail = document.querySelector('[data-sync-detail]');

  syncToggle?.addEventListener('click', () => {
    const enabled = syncToggle.getAttribute('aria-pressed') !== 'true';
    syncToggle.setAttribute('aria-pressed', String(enabled));
    syncRoot?.classList.toggle('is-online', enabled);
    if (syncLabel) syncLabel.textContent = enabled ? '允许电脑接力' : '保持本地';
    if (syncState) syncState.textContent = enabled ? 'LAN READY' : 'LOCAL';
    if (syncDetail) syncDetail.textContent = enabled ? '可发现已配对电脑，并比较局域网 APK 版本' : '发现、连接与局域网版本检查均已停止';
    pulse(syncRoot, enabled ? 'is-routing' : 'is-unrouting', 560);
  });

  renderTasks();
})();

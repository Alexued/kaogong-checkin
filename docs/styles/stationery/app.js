(() => {
  'use strict';

  const tabs = [...document.querySelectorAll('[data-journal-tab]')];
  const pages = [...document.querySelectorAll('[data-journal-page]')];

  const selectPage = (name, focus = false) => {
    tabs.forEach((tab) => {
      const current = tab.dataset.journalTab === name;
      tab.setAttribute('aria-selected', String(current));
      tab.tabIndex = current ? 0 : -1;
      if (current && focus) tab.focus();
    });
    pages.forEach((page) => {
      page.hidden = page.dataset.journalPage !== name;
    });
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', (event) => {
      event.preventDefault();
      selectPage(tab.dataset.journalTab);
    });
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
      selectPage(tabs[nextIndex].dataset.journalTab, true);
    });
  });

  const tasks = [...document.querySelectorAll('[data-journal-task]')];
  const progress = document.querySelector('[data-day-progress]');
  const renderProgress = () => {
    const completed = tasks.filter((task) => task.checked).length;
    if (progress) progress.textContent = `${completed} / ${tasks.length} 已完成`;
  };
  tasks.forEach((task) => task.addEventListener('change', renderProgress));

  const notes = [...document.querySelectorAll('[data-memory-note]')];
  const noteIndex = document.querySelector('[data-note-index]');
  let currentNote = 0;
  const showNote = (next) => {
    currentNote = (next + notes.length) % notes.length;
    notes.forEach((note, index) => note.classList.toggle('is-current', index === currentNote));
    if (noteIndex) noteIndex.textContent = String(currentNote + 1);
  };
  document.querySelector('[data-note-prev]')?.addEventListener('click', () => showNote(currentNote - 1));
  document.querySelector('[data-note-next]')?.addEventListener('click', () => showNote(currentNote + 1));

  const backupRoot = document.querySelector('[data-backup-root]');
  const backupToggle = document.querySelector('[data-backup-toggle]');
  const backupLabel = document.querySelector('[data-backup-label]');
  const backupStatus = document.querySelector('[data-backup-status]');
  backupToggle?.addEventListener('click', () => {
    const enabled = backupToggle.getAttribute('aria-pressed') !== 'true';
    backupToggle.setAttribute('aria-pressed', String(enabled));
    backupRoot?.classList.toggle('is-enabled', enabled);
    if (backupLabel) backupLabel.textContent = enabled ? '电脑同步：打开' : '电脑同步：关闭';
    if (backupStatus) backupStatus.textContent = enabled ? '等待已配对电脑 · 连接后自动比较局域网版本' : '本地模式 · 没有局域网活动';
  });

  selectPage('today');
  renderProgress();
  showNote(0);
})();

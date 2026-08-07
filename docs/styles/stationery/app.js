(() => {
  'use strict';

  const tabs = [...document.querySelectorAll('[data-journal-tab]')];
  const pages = [...document.querySelectorAll('[data-journal-page]')];
  const notebook = document.querySelector('.notebook');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let activePage = null;
  let pageTransitionTimer = 0;

  const setPageAccess = (page, current) => {
    page.setAttribute('aria-hidden', String(!current));
    page.inert = !current;
  };

  const settlePageTransition = () => {
    pages.forEach((page) => {
      const current = page === activePage;
      page.classList.remove('is-page-entering', 'is-page-leaving');
      page.classList.toggle('is-page-active', current);
      page.hidden = !current;
      setPageAccess(page, current);
    });
    pageTransitionTimer = 0;
    window.dispatchEvent(new Event('resize'));
  };

  const selectPage = (name, focus = false, immediate = false) => {
    const nextPage = pages.find((page) => page.dataset.journalPage === name);
    if (!nextPage) return;
    tabs.forEach((tab) => {
      const current = tab.dataset.journalTab === name;
      tab.setAttribute('aria-selected', String(current));
      tab.tabIndex = current ? 0 : -1;
      if (current && focus) tab.focus();
    });

    if (!activePage || immediate) {
      activePage = nextPage;
      settlePageTransition();
      return;
    }
    if (nextPage === activePage) return;

    if (pageTransitionTimer) {
      window.clearTimeout(pageTransitionTimer);
      settlePageTransition();
    }

    const previousPage = activePage;
    const previousIndex = pages.indexOf(previousPage);
    const nextIndex = pages.indexOf(nextPage);
    const direction = nextIndex > previousIndex ? 'forward' : 'backward';
    if (notebook) notebook.dataset.pageDirection = direction;
    document.documentElement.dataset.motionDirection = direction;

    activePage = nextPage;
    nextPage.hidden = false;
    setPageAccess(previousPage, false);
    setPageAccess(nextPage, true);
    previousPage.classList.add('is-page-leaving');
    nextPage.classList.remove('is-page-leaving', 'is-page-active');
    nextPage.classList.add('is-page-entering');

    if (reducedMotion.matches) {
      settlePageTransition();
      return;
    }

    void nextPage.offsetWidth;
    window.requestAnimationFrame(() => {
      previousPage.classList.remove('is-page-active');
      nextPage.classList.remove('is-page-entering');
      nextPage.classList.add('is-page-active');
    });
    pageTransitionTimer = window.setTimeout(settlePageTransition, 560);
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
  const noteStage = document.querySelector('[data-note-stage]');
  let currentNote = 0;
  let noteTransitionTimer = 0;

  const settleNotes = () => {
    notes.forEach((note, index) => {
      const current = index === currentNote;
      note.classList.remove('is-note-entering', 'is-note-leaving');
      note.classList.toggle('is-current', current);
      note.setAttribute('aria-hidden', String(!current));
      note.inert = !current;
    });
    noteTransitionTimer = 0;
  };

  const showNote = (next, direction = 'forward', immediate = false) => {
    const nextIndex = (next + notes.length) % notes.length;
    if (immediate || nextIndex === currentNote) {
      currentNote = nextIndex;
      settleNotes();
      if (noteIndex) noteIndex.textContent = String(currentNote + 1);
      return;
    }

    if (noteTransitionTimer) {
      window.clearTimeout(noteTransitionTimer);
      settleNotes();
    }

    const previousNote = notes[currentNote];
    const nextNote = notes[nextIndex];
    currentNote = nextIndex;
    if (noteStage) noteStage.dataset.noteDirection = direction;
    previousNote.setAttribute('aria-hidden', 'true');
    previousNote.inert = true;
    nextNote.setAttribute('aria-hidden', 'false');
    nextNote.inert = false;
    nextNote.classList.remove('is-note-leaving', 'is-current');
    nextNote.classList.add('is-note-entering');

    if (reducedMotion.matches) {
      settleNotes();
    } else {
      void nextNote.offsetWidth;
      window.requestAnimationFrame(() => {
        previousNote.classList.remove('is-current');
        previousNote.classList.add('is-note-leaving');
        nextNote.classList.remove('is-note-entering');
        nextNote.classList.add('is-current');
      });
      noteTransitionTimer = window.setTimeout(settleNotes, 520);
    }
    if (noteIndex) noteIndex.textContent = String(currentNote + 1);
  };
  document.querySelector('[data-note-prev]')?.addEventListener('click', () => showNote(currentNote - 1, 'backward'));
  document.querySelector('[data-note-next]')?.addEventListener('click', () => showNote(currentNote + 1, 'forward'));

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

  window.addEventListener('pagehide', () => {
    window.clearTimeout(pageTransitionTimer);
    window.clearTimeout(noteTransitionTimer);
    settlePageTransition();
    settleNotes();
  });

  selectPage('today', false, true);
  renderProgress();
  showNote(0, 'forward', true);
})();

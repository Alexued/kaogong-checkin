(() => {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let prefersReducedMotion = Boolean(reducedMotionQuery?.matches);

  const cleanupCallbacks = [];
  const managedTimeouts = new Set();

  root.classList.remove('no-js');
  root.classList.add('js');
  root.classList.toggle('reduce-motion', prefersReducedMotion);

  const listen = (target, type, handler, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    cleanupCallbacks.push(() => target.removeEventListener(type, handler, options));
  };

  const schedule = (callback, delay) => {
    const timeoutId = window.setTimeout(() => {
      managedTimeouts.delete(timeoutId);
      callback();
    }, delay);
    managedTimeouts.add(timeoutId);
    return timeoutId;
  };

  const cancelScheduled = (timeoutId) => {
    if (!timeoutId) return;
    window.clearTimeout(timeoutId);
    managedTimeouts.delete(timeoutId);
  };

  // Reveal content progressively, while keeping a static fallback for older browsers.
  const revealItems = [...doc.querySelectorAll('[data-reveal]')];
  const enterItems = [...doc.querySelectorAll('[data-enter]')];
  let revealObserver = null;

  const reveal = (element) => {
    element.classList.add('is-visible');
    element.classList.add('is-entered');
  };

  const revealEverything = () => {
    [...enterItems, ...revealItems].forEach(reveal);
  };

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    revealEverything();
  } else {
    root.classList.add('motion-ready');
    window.requestAnimationFrame(() => enterItems.forEach(reveal));

    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          reveal(entry.target);
          revealObserver?.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );

    revealItems.forEach((item) => revealObserver.observe(item));

    // If observation is delayed during restoration, never leave visible content hidden.
    schedule(() => {
      revealItems.forEach((item) => {
        const bounds = item.getBoundingClientRect();
        if (bounds.bottom >= 0 && bounds.top <= window.innerHeight * 1.12) reveal(item);
      });
    }, 1400);
  }

  // Keep one chapter current at the viewport center so adjacent chapters can
  // transition in either direction without scroll locking or queued timelines.
  const scenes = [...doc.querySelectorAll('[data-scene]')];
  const sceneBackdrops = [...doc.querySelectorAll('[data-scene-backdrop]')];
  let sceneObserver = null;
  let sceneFrame = 0;
  let activeSceneIndex = -1;
  let frontBackdropIndex = 0;

  const getSceneColor = (scene) =>
    window.getComputedStyle(scene).getPropertyValue('--scene-color').trim() || '#f5f5f7';

  const paintSceneBackdrop = (scene, immediate = false) => {
    if (!scene || sceneBackdrops.length < 2) return;
    const color = getSceneColor(scene);

    if (immediate || prefersReducedMotion || activeSceneIndex < 0) {
      sceneBackdrops.forEach((backdrop, index) => {
        backdrop.style.backgroundColor = color;
        backdrop.classList.toggle('is-front', index === 0);
      });
      frontBackdropIndex = 0;
      return;
    }

    const nextBackdropIndex = frontBackdropIndex === 0 ? 1 : 0;
    const nextBackdrop = sceneBackdrops[nextBackdropIndex];
    nextBackdrop.style.backgroundColor = color;
    sceneBackdrops.forEach((backdrop, index) => {
      backdrop.classList.toggle('is-front', index === nextBackdropIndex);
    });
    frontBackdropIndex = nextBackdropIndex;
  };

  const setActiveScene = (nextIndex, immediate = false) => {
    if (!scenes.length) return;
    const boundedIndex = Math.min(scenes.length - 1, Math.max(0, nextIndex));
    if (boundedIndex === activeSceneIndex && !immediate) return;

    scenes.forEach((scene, index) => {
      const state = index < boundedIndex ? 'prev' : index > boundedIndex ? 'next' : 'current';
      scene.dataset.sceneState = state;
      scene.classList.remove('is-prev', 'is-current', 'is-next');
      scene.classList.add('is-' + state);
    });

    paintSceneBackdrop(scenes[boundedIndex], immediate || activeSceneIndex < 0);
    activeSceneIndex = boundedIndex;
  };

  const updateActiveScene = (immediate = false) => {
    sceneFrame = 0;
    if (!scenes.length) return;
    const viewportCenter = window.innerHeight * 0.5;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    scenes.forEach((scene, index) => {
      const bounds = scene.getBoundingClientRect();
      const sceneCenter = bounds.top + bounds.height * 0.5;
      const distance = Math.abs(sceneCenter - viewportCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    setActiveScene(closestIndex, immediate);
  };

  const requestSceneUpdate = () => {
    if (sceneFrame) return;
    sceneFrame = window.requestAnimationFrame(() => updateActiveScene(false));
  };

  if (scenes.length) {
    updateActiveScene(true);
    listen(window, 'scroll', requestSceneUpdate, { passive: true });
    listen(window, 'resize', requestSceneUpdate, { passive: true });

    if ('IntersectionObserver' in window) {
      sceneObserver = new IntersectionObserver(requestSceneUpdate, {
        rootMargin: '-42% 0px -42% 0px',
        threshold: 0
      });
      scenes.forEach((scene) => sceneObserver.observe(scene));
    }
  }

  // Scroll progress only mutates transform, keeping scroll work off layout properties.
  const pageProgress = doc.querySelector('[data-page-progress]');
  let progressFrame = 0;

  const updatePageProgress = () => {
    progressFrame = 0;
    if (!pageProgress) return;

    if (prefersReducedMotion) {
      pageProgress.style.transform = 'scaleX(0)';
      return;
    }

    const range = doc.documentElement.scrollHeight - window.innerHeight;
    const progress = range > 0 ? Math.min(1, Math.max(0, window.scrollY / range)) : 0;
    pageProgress.style.transform = `scaleX(${progress})`;
  };

  const requestProgressUpdate = () => {
    if (progressFrame) return;
    progressFrame = window.requestAnimationFrame(updatePageProgress);
  };

  if (pageProgress) {
    listen(window, 'scroll', requestProgressUpdate, { passive: true });
    listen(window, 'resize', requestProgressUpdate, { passive: true });
    updatePageProgress();
  }

  // Today checklist.
  const taskToggles = [...doc.querySelectorAll('[data-task-toggle]')];
  const taskCount = doc.querySelector('[data-task-count]');
  const taskProgress = doc.querySelector('[data-task-progress]');

  const isTaskComplete = (toggle) =>
    'checked' in toggle ? toggle.checked : toggle.getAttribute('aria-pressed') === 'true';

  const updateTasks = () => {
    const completeCount = taskToggles.filter(isTaskComplete).length;
    const totalCount = taskToggles.length;
    const percentage = totalCount ? (completeCount / totalCount) * 100 : 0;

    taskToggles.forEach((toggle) => {
      const complete = isTaskComplete(toggle);
      const item = toggle.closest('.interactive-task, [data-task-item]');
      const state = item?.querySelector('.task-state, [data-task-state]');

      item?.classList.toggle('is-complete', complete);
      if (item) item.dataset.state = complete ? 'complete' : 'pending';
      if (!('checked' in toggle)) toggle.setAttribute('aria-pressed', String(complete));
      if (state) state.textContent = complete ? '已完成' : '待完成';
    });

    if (taskCount) taskCount.textContent = `${completeCount} / ${totalCount}`;
    if (taskProgress) {
      taskProgress.setAttribute('aria-valuemax', String(totalCount));
      taskProgress.setAttribute('aria-valuenow', String(completeCount));
      taskProgress.setAttribute('aria-valuetext', `已完成 ${completeCount} 项，共 ${totalCount} 项`);
      taskProgress.style.setProperty('--task-progress-scale', String(percentage / 100));
    }
  };

  taskToggles.forEach((toggle) => {
    if ('checked' in toggle) {
      listen(toggle, 'change', updateTasks);
    } else {
      listen(toggle, 'click', () => {
        const nextState = toggle.getAttribute('aria-pressed') !== 'true';
        toggle.setAttribute('aria-pressed', String(nextState));
        updateTasks();
      });
    }
  });
  if (taskToggles.length) updateTasks();

  // Timestamp-based countdown remains accurate after background tab throttling.
  const timerStage = doc.querySelector('.timer-stage, [data-timer-root]');
  const timerDisplay = doc.querySelector('[data-timer-display]');
  const timerTrack = doc.querySelector('[data-timer-track]');
  const timerToggle = doc.querySelector('[data-timer-toggle]');
  const timerToggleLabel = doc.querySelector('[data-timer-toggle-label]');
  const timerReset = doc.querySelector('[data-timer-reset]');
  const timerStatus = doc.querySelector('[data-timer-status]');
  const configuredSeconds = Number(timerStage?.dataset.timerSeconds || timerToggle?.dataset.timerSeconds);
  const timerDuration = Number.isFinite(configuredSeconds) && configuredSeconds > 0
    ? configuredSeconds * 1000
    : 25 * 60 * 1000;
  let timerRemaining = timerDuration;
  let timerDeadline = 0;
  let timerInterval = 0;
  let timerRunning = false;
  let renderedTimerSecond = null;

  const formatTime = (milliseconds) => {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const setTimerState = (state, statusText) => {
    if (timerStage) timerStage.dataset.timerState = state;
    if (timerStatus && statusText) timerStatus.textContent = statusText;
  };

  const renderTimer = (force = false) => {
    const currentSecond = Math.max(0, Math.ceil(timerRemaining / 1000));
    if (timerDisplay && (force || currentSecond !== renderedTimerSecond)) {
      timerDisplay.textContent = formatTime(timerRemaining);
      const minutes = Math.floor(currentSecond / 60);
      const seconds = currentSecond % 60;
      timerDisplay.setAttribute(
        'aria-label',
        `剩余时间 ${minutes} 分钟${seconds ? ` ${seconds} 秒` : ''}`
      );
      renderedTimerSecond = currentSecond;
    }

    if (timerTrack) {
      const progress = Math.min(1, Math.max(0, timerRemaining / timerDuration));
      timerTrack.style.transform = `scaleX(${progress})`;
      timerTrack.style.setProperty('--timer-progress', String(progress));
    }

    if (timerToggle) timerToggle.setAttribute('aria-pressed', String(timerRunning));
  };

  const stopTimerInterval = () => {
    if (!timerInterval) return;
    window.clearInterval(timerInterval);
    timerInterval = 0;
  };

  const completeTimer = () => {
    timerRunning = false;
    timerRemaining = 0;
    stopTimerInterval();
    if (timerToggleLabel) timerToggleLabel.textContent = '重新开始';
    const icon = timerToggle?.querySelector('[aria-hidden="true"]');
    if (icon) icon.textContent = '↻';
    setTimerState('complete', '本轮专注完成。休息一下，再开始下一轮。');
    renderTimer(true);
  };

  const tickTimer = () => {
    if (!timerRunning) return;
    timerRemaining = Math.max(0, timerDeadline - Date.now());
    if (timerRemaining <= 0) {
      completeTimer();
      return;
    }
    renderTimer();
  };

  const startTimer = () => {
    if (timerRemaining <= 0) timerRemaining = timerDuration;
    timerDeadline = Date.now() + timerRemaining;
    timerRunning = true;
    stopTimerInterval();
    timerInterval = window.setInterval(tickTimer, 250);
    if (timerToggleLabel) timerToggleLabel.textContent = '暂停专注';
    const icon = timerToggle?.querySelector('[aria-hidden="true"]');
    if (icon) icon.textContent = 'Ⅱ';
    setTimerState('running', '专注进行中');
    renderTimer(true);
  };

  const pauseTimer = () => {
    if (!timerRunning) return;
    timerRemaining = Math.max(0, timerDeadline - Date.now());
    timerRunning = false;
    stopTimerInterval();
    if (timerToggleLabel) timerToggleLabel.textContent = '继续专注';
    const icon = timerToggle?.querySelector('[aria-hidden="true"]');
    if (icon) icon.textContent = '▶';
    setTimerState('paused', '已暂停，准备好后继续。');
    renderTimer(true);
  };

  const resetTimer = () => {
    timerRunning = false;
    timerRemaining = timerDuration;
    timerDeadline = 0;
    stopTimerInterval();
    if (timerToggleLabel) timerToggleLabel.textContent = '开始专注';
    const icon = timerToggle?.querySelector('[aria-hidden="true"]');
    if (icon) icon.textContent = '▶';
    setTimerState('idle', '准备开始');
    renderTimer(true);
  };

  listen(timerToggle, 'click', () => (timerRunning ? pauseTimer() : startTimer()));
  listen(timerReset, 'click', resetTimer);
  listen(doc, 'visibilitychange', () => {
    if (timerRunning && doc.visibilityState === 'visible') tickTimer();
  });
  if (timerDisplay) resetTimer();

  // Flashcards use one stable surface; only its semantic state and copy change.
  const flashcard = doc.querySelector('[data-flashcard]');
  const flashcardCounter = doc.querySelector('[data-flashcard-counter]');
  const flashcardQuestion = doc.querySelector('[data-flashcard-question]');
  const flashcardAnswer = doc.querySelector('[data-flashcard-answer]');
  const flashcardStatus = doc.querySelector('[data-flashcard-status]');
  const flashcardNext = doc.querySelector('[data-flashcard-next]');
  const flashcardRatings = [...doc.querySelectorAll('[data-flashcard-rate]')];
  const flashcards = [
    {
      question: '如何计算基期量？',
      answer: '基期量 = 现期量 ÷（1 + 增长率）'
    },
    {
      question: '如何计算增长量？',
      answer: '增长量 = 现期量 × 增长率 ÷（1 + 增长率）'
    },
    {
      question: '如何判断比重上升还是下降？',
      answer: '部分增长率大于整体增长率，比重上升；反之下降。'
    }
  ];
  let flashcardIndex = 0;
  let flashcardFlipped = false;
  let reviewCardIndex = null;
  let cardsBeforeReview = 0;

  const updateFlashcardSide = (flipped) => {
    flashcardFlipped = flipped;
    flashcard?.classList.toggle('is-flipped', flipped);
    if (flashcard) {
      flashcard.dataset.side = flipped ? 'back' : 'front';
      flashcard.setAttribute('aria-pressed', String(flipped));
      flashcard.setAttribute(
        'aria-label',
        flipped ? '收起答案，返回题目' : '翻开背诵卡查看答案'
      );
    }
    flashcardRatings.forEach((button) => {
      button.disabled = !flipped;
    });
    if (flashcardStatus) {
      flashcardStatus.textContent = flipped
        ? '核对答案，然后标记这道题。'
        : '先在心里作答，再翻面核对。';
    }
  };

  const renderFlashcard = () => {
    const current = flashcards[flashcardIndex];
    if (flashcardCounter) flashcardCounter.textContent = String(flashcardIndex + 1).padStart(2, '0');
    if (flashcardQuestion) flashcardQuestion.textContent = current.question;
    if (flashcardAnswer) flashcardAnswer.textContent = current.answer;
    if (flashcard) {
      flashcard.dataset.cardIndex = String(flashcardIndex);
      delete flashcard.dataset.rating;
    }
    flashcardRatings.forEach((button) => delete button.dataset.state);
    updateFlashcardSide(false);
  };

  listen(flashcard, 'click', () => updateFlashcardSide(!flashcardFlipped));
  listen(flashcardNext, 'click', () => {
    if (reviewCardIndex !== null && cardsBeforeReview <= 0) {
      flashcardIndex = reviewCardIndex;
      reviewCardIndex = null;
    } else {
      flashcardIndex = (flashcardIndex + 1) % flashcards.length;
      if (reviewCardIndex !== null) cardsBeforeReview -= 1;
    }
    renderFlashcard();
  });
  flashcardRatings.forEach((button) => {
    listen(button, 'click', () => {
      if (!flashcardFlipped) return;
      flashcardRatings.forEach((item) => delete item.dataset.state);
      button.dataset.state = 'selected';
      const needsReview = button.dataset.flashcardRate === 'again';
      if (flashcard) flashcard.dataset.rating = needsReview ? 'again' : 'known';
      if (needsReview) {
        reviewCardIndex = flashcardIndex;
        cardsBeforeReview = 1;
      } else if (reviewCardIndex === flashcardIndex) {
        reviewCardIndex = null;
        cardsBeforeReview = 0;
      }
      if (flashcardStatus) {
        flashcardStatus.textContent = needsReview
          ? '已加入复习队列，这道题会更早再次出现。'
          : '已标记为记住，可以进入下一题。';
      }
    });
  });
  if (flashcard) renderFlashcard();

  // Simulated LAN discovery communicates each state without making network requests.
  const scanRoot = doc.querySelector('[data-scan-root]');
  const scanButton = doc.querySelector('[data-scan-button]');
  const scanButtonLabel = doc.querySelector('[data-scan-button-label]');
  const scanStatus = doc.querySelector('[data-scan-status]');
  const scanServer = doc.querySelector('[data-scan-node="server"]');
  const scanPhone = doc.querySelector('[data-scan-node="phone"]');
  const scanServerName = doc.querySelector('[data-scan-server-name]');
  const scanServerDetail = doc.querySelector('[data-scan-server-detail]');
  const syncControl = doc.querySelector('[data-sync-control]');
  const syncToggle = doc.querySelector('[data-sync-toggle]');
  const syncSummary = doc.querySelector('[data-sync-summary]');
  const syncSwitchLabel = doc.querySelector('[data-sync-switch-label]');
  let scanFoundTimer = 0;
  let scanConnectedTimer = 0;

  const clearScanTimers = () => {
    cancelScheduled(scanFoundTimer);
    cancelScheduled(scanConnectedTimer);
    scanFoundTimer = 0;
    scanConnectedTimer = 0;
  };

  const setScanState = (state) => {
    if (scanRoot) {
      scanRoot.dataset.scanState = state;
      scanRoot.setAttribute('aria-busy', String(state === 'scanning' || state === 'found'));
    }
    [scanPhone, scanServer].forEach((node) => {
      if (node) node.dataset.state = state;
    });
  };

  const beginScan = () => {
    if (syncToggle && !syncToggle.checked) return;
    clearScanTimers();
    setScanState('scanning');
    if (scanButton) scanButton.disabled = true;
    if (scanButtonLabel) scanButtonLabel.textContent = '正在扫描';
    if (scanServerName) scanServerName.textContent = '正在扫描';
    if (scanServerDetail) scanServerDetail.textContent = '查找同一网络内的设备';
    if (scanStatus) scanStatus.textContent = '正在扫描同一局域网…';

    const foundDelay = prefersReducedMotion ? 220 : 900;
    const connectDelay = prefersReducedMotion ? 520 : 1850;

    scanFoundTimer = schedule(() => {
      scanFoundTimer = 0;
      setScanState('found');
      if (scanButtonLabel) scanButtonLabel.textContent = '正在连接';
      if (scanServerName) scanServerName.textContent = '学习备份服务器';
      if (scanServerDetail) scanServerDetail.textContent = '192.168.1.8 · 可连接';
      if (scanStatus) scanStatus.textContent = '已发现 1 台可用设备，正在建立连接…';
    }, foundDelay);

    scanConnectedTimer = schedule(() => {
      scanConnectedTimer = 0;
      setScanState('connected');
      if (scanButton) scanButton.disabled = false;
      if (scanButtonLabel) scanButtonLabel.textContent = '重新扫描';
      if (scanServerName) scanServerName.textContent = '学习备份服务器';
      if (scanServerDetail) scanServerDetail.textContent = '192.168.1.8 · 已连接';
      if (scanStatus) scanStatus.textContent = '连接成功。现在可以由你主动同步 128 条记录。';
    }, connectDelay);
  };

  const applySyncPreference = () => {
    const enabled = syncToggle ? syncToggle.checked : true;
    clearScanTimers();
    if (syncControl) syncControl.dataset.syncEnabled = String(enabled);
    if (scanRoot) scanRoot.dataset.syncEnabled = String(enabled);

    if (!enabled) {
      setScanState('disabled');
      if (scanButton) scanButton.disabled = true;
      if (scanButtonLabel) scanButtonLabel.textContent = '电脑同步已关闭';
      if (scanServerName) scanServerName.textContent = '未连接电脑';
      if (scanServerDetail) scanServerDetail.textContent = '不会扫描、连接或重试';
      if (scanStatus) scanStatus.textContent = '已关闭，仅保存在本机。现有本地数据和待同步队列会保留。';
      if (syncSummary) syncSummary.textContent = '已关闭，仅保存在本机';
      if (syncSwitchLabel) syncSwitchLabel.textContent = '已关闭';
      return;
    }

    setScanState('idle');
    if (scanButton) scanButton.disabled = false;
    if (scanButtonLabel) scanButtonLabel.textContent = '扫描局域网';
    if (scanServerName) scanServerName.textContent = '等待扫描';
    if (scanServerDetail) scanServerDetail.textContent = '只连接你主动配对的电脑';
    if (scanStatus) scanStatus.textContent = '电脑同步已开启。需要连接时，再由你主动扫描。';
    if (syncSummary) syncSummary.textContent = '已开启，可连接已配对的 Windows 伴侣';
    if (syncSwitchLabel) syncSwitchLabel.textContent = '已开启';
  };

  listen(scanButton, 'click', beginScan);
  listen(syncToggle, 'change', applySyncPreference);
  if (scanRoot) applySyncPreference();

  // Clipboard API with a local fallback for non-secure previews and older browsers.
  const copyButtons = [...doc.querySelectorAll('[data-copy-checksum], #copy-checksum')];
  const copyResetTimers = new Map();

  const fallbackCopy = (value) => {
    const textarea = doc.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    doc.body.append(textarea);
    textarea.select();
    textarea.setSelectionRange(0, value.length);
    const copied = doc.execCommand?.('copy');
    textarea.remove();
    if (!copied) throw new Error('Copy command unavailable');
  };

  const copyText = async (value) => {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      let clipboardTimeout = 0;
      try {
        await Promise.race([
          navigator.clipboard.writeText(value),
          new Promise((_, reject) => {
            clipboardTimeout = schedule(() => reject(new Error('Clipboard API timed out')), 650);
          })
        ]);
        cancelScheduled(clipboardTimeout);
        return;
      } catch {
        cancelScheduled(clipboardTimeout);
      }
    }
    fallbackCopy(value);
  };

  copyButtons.forEach((copyButton) => listen(copyButton, 'click', async () => {
    const targetId = copyButton.dataset.copyTarget;
    const target = targetId ? doc.getElementById(targetId) : doc.querySelector('[data-checksum]');
    const value = target?.textContent?.trim();
    if (!value) return;

    const label = copyButton.querySelector('[data-copy-label]') || copyButton;
    const originalLabel = copyButton.dataset.originalLabel || label.textContent?.trim() || '复制校验值';
    copyButton.dataset.originalLabel = originalLabel;
    cancelScheduled(copyResetTimers.get(copyButton));
    label.textContent = '正在复制';
    copyButton.dataset.state = 'pending';

    try {
      await copyText(value);
      label.textContent = '已复制';
      copyButton.dataset.state = 'success';
    } catch {
      label.textContent = '请手动复制';
      copyButton.dataset.state = 'error';
    }

    const resetTimer = schedule(() => {
      copyResetTimers.delete(copyButton);
      label.textContent = originalLabel;
      delete copyButton.dataset.state;
    }, prefersReducedMotion ? 900 : 1600);
    copyResetTimers.set(copyButton, resetTimer);
  }));

  const handleMotionPreference = (event) => {
    prefersReducedMotion = event.matches;
    root.classList.toggle('reduce-motion', prefersReducedMotion);
    root.classList.toggle('motion-ready', !prefersReducedMotion);
    if (prefersReducedMotion) {
      revealObserver?.disconnect();
      revealEverything();
    }
    updateActiveScene(true);
    requestProgressUpdate();
  };

  if (reducedMotionQuery?.addEventListener) {
    listen(reducedMotionQuery, 'change', handleMotionPreference);
  } else if (reducedMotionQuery?.addListener) {
    reducedMotionQuery.addListener(handleMotionPreference);
    cleanupCallbacks.push(() => reducedMotionQuery.removeListener(handleMotionPreference));
  }

  const destroy = () => {
    revealObserver?.disconnect();
    revealObserver = null;
    sceneObserver?.disconnect();
    sceneObserver = null;
    if (progressFrame) window.cancelAnimationFrame(progressFrame);
    progressFrame = 0;
    if (sceneFrame) window.cancelAnimationFrame(sceneFrame);
    sceneFrame = 0;
    stopTimerInterval();
    clearScanTimers();
    managedTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    managedTimeouts.clear();
    cleanupCallbacks.splice(0).forEach((cleanup) => cleanup());
  };

  listen(window, 'pagehide', (event) => {
    if (!event.persisted) destroy();
  });
})();

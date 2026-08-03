const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const revealItems = document.querySelectorAll('[data-reveal]');
const revealEverything = () => {
  revealItems.forEach((item) => item.classList.add('is-visible'));
};

if (prefersReducedMotion || !('IntersectionObserver' in window)) {
  revealEverything();
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -7% 0px', threshold: 0.1 });

  revealItems.forEach((item) => observer.observe(item));
}

const progressBar = document.querySelector('#scroll-progress');
let progressFrame = 0;

const updateProgress = () => {
  progressFrame = 0;
  if (!progressBar || prefersReducedMotion) return;

  const scrollRange = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollRange > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollRange)) : 0;
  progressBar.style.transform = `scaleX(${progress})`;
};

const requestProgressUpdate = () => {
  if (progressFrame) return;
  progressFrame = window.requestAnimationFrame(updateProgress);
};

window.addEventListener('scroll', requestProgressUpdate, { passive: true });
window.addEventListener('resize', requestProgressUpdate);
updateProgress();

const themeMetaColors = {
  ancient: '#2f211c',
  cyber: '#111827',
  apple: '#111214',
  terminal: '#101b12',
  government: '#5d2525',
  sprint: '#101412',
  bauhaus: '#f5f1df',
  stationery: '#f7fbf9',
  blueprint: '#1f68bd',
  newspaper: '#151515'
};

const themeLabels = {
  ancient: '古风',
  cyber: '赛博朋克',
  apple: '苹果官网',
  terminal: '终端炫酷',
  government: '政府严肃',
  sprint: '冲刺仪表',
  bauhaus: '包豪斯海报',
  stationery: '日系文具',
  blueprint: '科研蓝图',
  newspaper: '墨水报刊'
};

const themeIds = Object.keys(themeLabels);
const root = document.documentElement;
const themeOptions = [...document.querySelectorAll('[data-theme-option]')];
const themeStatus = document.querySelector('#theme-status');
const themeMeta = document.querySelector('meta[name="theme-color"]');
let activeTheme = themeIds.includes(root.dataset.theme) ? root.dataset.theme : 'sprint';
let activeTransition = null;
let transitionBusy = false;
let requestedTheme = activeTheme;

const persistTheme = (theme) => {
  try {
    window.localStorage.setItem('kaogong-theme', theme);
  } catch {
    // Storage can be unavailable in private browsing or embedded previews.
  }
};

const updateThemeControls = (theme) => {
  themeOptions.forEach((option) => {
    const selected = option.dataset.themeOption === theme;
    option.setAttribute('aria-checked', String(selected));
    option.tabIndex = selected ? 0 : -1;
  });

  if (themeMeta && themeMetaColors[theme]) themeMeta.content = themeMetaColors[theme];
  if (themeStatus) themeStatus.textContent = `当前风格：${themeLabels[theme]}`;
};

const commitTheme = (theme, shouldPersist) => {
  root.dataset.theme = theme;
  activeTheme = theme;
  updateThemeControls(theme);
  if (shouldPersist) persistTheme(theme);
  requestProgressUpdate();
};

const finishThemeTransition = () => {
  if (!transitionBusy) return;
  transitionBusy = false;
  activeTransition = null;
  if (requestedTheme !== activeTheme) applyTheme(requestedTheme);
};

const applyTheme = (nextTheme, { persist = true } = {}) => {
  if (!themeIds.includes(nextTheme)) return;
  requestedTheme = nextTheme;
  if (nextTheme === activeTheme && !transitionBusy) {
    updateThemeControls(nextTheme);
    return;
  }

  if (prefersReducedMotion) {
    commitTheme(nextTheme, persist);
    return;
  }

  if (transitionBusy) {
    return;
  }

  const update = () => commitTheme(nextTheme, persist);
  if (typeof document.startViewTransition === 'function') {
    try {
      transitionBusy = true;
      activeTransition = document.startViewTransition(update);
      activeTransition.finished.then(finishThemeTransition, finishThemeTransition);
      return;
    } catch {
      transitionBusy = false;
      activeTransition = null;
      // Older browsers can expose the method but reject a transition during rapid input.
    }
  }

  root.classList.add('theme-fallback');
  update();
  window.requestAnimationFrame(() => root.classList.remove('theme-fallback'));
};

themeOptions.forEach((option, index) => {
  option.addEventListener('click', () => applyTheme(option.dataset.themeOption));

  option.addEventListener('keydown', (event) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();

    let nextIndex = index;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = themeOptions.length - 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % themeOptions.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + themeOptions.length) % themeOptions.length;

    const nextOption = themeOptions[nextIndex];
    nextOption.focus();
    applyTheme(nextOption.dataset.themeOption);
  });
});

updateThemeControls(activeTheme);

const copyButton = document.querySelector('#copy-checksum');
let copyResetTimer = 0;

copyButton?.setAttribute('aria-live', 'polite');
copyButton?.addEventListener('click', async () => {
  const targetId = copyButton.dataset.copyTarget;
  const value = targetId ? document.getElementById(targetId)?.textContent?.trim() : '';
  if (!value) return;

  const originalLabel = copyButton.dataset.originalLabel || copyButton.textContent;
  copyButton.dataset.originalLabel = originalLabel;
  window.clearTimeout(copyResetTimer);

  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(value);
    copyButton.textContent = '已复制';
    copyButton.dataset.state = 'success';
  } catch {
    copyButton.textContent = '复制失败';
    copyButton.dataset.state = 'error';
  }

  copyResetTimer = window.setTimeout(() => {
    copyButton.textContent = originalLabel;
    delete copyButton.dataset.state;
  }, 1600);
});

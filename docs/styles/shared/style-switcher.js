(() => {
  'use strict';

  const root = document.documentElement;
  const switcher = document.querySelector('.style-switcher');
  const links = [...document.querySelectorAll('[data-style-link]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let navigationTimer = 0;
  let targetUrl = '';

  window.requestAnimationFrame(() => root.classList.add('style-ready'));

  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = link.href;
      if (!href || href === window.location.href) return;
      event.preventDefault();
      targetUrl = href;
      window.clearTimeout(navigationTimer);
      root.style.setProperty('--style-target', link.dataset.transitionColor || '#f5f5f7');
      root.classList.add('is-style-leaving');
      navigationTimer = window.setTimeout(() => window.location.assign(targetUrl), reducedMotion.matches ? 80 : 180);
    });
  });

  document.addEventListener('click', (event) => {
    if (!switcher?.open || switcher.contains(event.target)) return;
    switcher.open = false;
  });

  window.addEventListener('pageshow', () => {
    window.clearTimeout(navigationTimer);
    root.classList.remove('is-style-leaving');
  });
})();

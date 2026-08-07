(() => {
  'use strict';

  const root = document.documentElement;
  const switcher = document.querySelector('.style-switcher');
  const links = [...document.querySelectorAll('[data-style-link]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let navigationTimer = 0;
  let targetUrl = '';
  let navigating = false;

  const styleIds = [
    'ancient',
    'cyber',
    'apple',
    'terminal',
    'government',
    'sprint',
    'bauhaus',
    'stationery',
    'blueprint',
    'newspaper',
  ];

  const linkIndex = (link) => Math.max(0, Number.parseInt(link?.querySelector('span')?.textContent || '1', 10) - 1);
  const currentIndex = linkIndex(links.find((link) => link.getAttribute('aria-current') === 'page'));

  const readArrival = () => {
    try {
      const value = JSON.parse(window.sessionStorage.getItem('kgc-style-arrival') || 'null');
      window.sessionStorage.removeItem('kgc-style-arrival');
      return value;
    } catch {
      return null;
    }
  };

  const arrival = readArrival();
  if (arrival?.style && styleIds.includes(arrival.style)) {
    const arrivalDirection = arrival.direction === 'backward' ? 'backward' : 'forward';
    root.style.setProperty('--style-shift', arrivalDirection === 'forward' ? '1' : '-1');
    root.dataset.styleTransition = arrival.style;
    root.dataset.styleDirection = arrivalDirection;
    root.classList.add('is-style-arriving');
    window.setTimeout(() => root.classList.remove('is-style-arriving'), reducedMotion.matches ? 80 : 560);
  }

  window.requestAnimationFrame(() => root.classList.add('style-ready'));

  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = link.href;
      if (!href || href === window.location.href || navigating) return;
      event.preventDefault();
      navigating = true;
      targetUrl = href;
      window.clearTimeout(navigationTimer);
      const targetIndex = linkIndex(link);
      const targetStyle = styleIds[targetIndex] || 'apple';
      const direction = targetIndex >= currentIndex ? 'forward' : 'backward';
      root.style.setProperty('--style-target', link.dataset.transitionColor || '#f5f5f7');
      root.style.setProperty('--style-shift', direction === 'forward' ? '1' : '-1');
      root.dataset.styleTransition = targetStyle;
      root.dataset.styleDirection = direction;
      try {
        window.sessionStorage.setItem('kgc-style-arrival', JSON.stringify({ style: targetStyle, direction }));
      } catch {
        // Navigation still works when storage is unavailable.
      }
      root.classList.add('is-style-leaving');
      navigationTimer = window.setTimeout(() => window.location.assign(targetUrl), reducedMotion.matches ? 80 : 240);
    });
  });

  document.addEventListener('click', (event) => {
    if (!switcher?.open || switcher.contains(event.target)) return;
    switcher.open = false;
  });

  window.addEventListener('pageshow', () => {
    window.clearTimeout(navigationTimer);
    navigating = false;
    root.classList.remove('is-style-leaving');
  });
})();

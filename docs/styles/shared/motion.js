(() => {
  'use strict';

  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scenes = [...document.querySelectorAll('[data-motion-scene]')];
  const reveals = [...document.querySelectorAll('[data-reveal], [data-enter]')];
  const supportsObserver = 'IntersectionObserver' in window;
  let activeIndex = -1;
  let frame = 0;
  let lastScrollY = window.scrollY;

  const revealEverything = () => {
    reveals.forEach((element) => element.classList.add('is-visible'));
    scenes.forEach((scene, index) => {
      scene.classList.add('motion-scene');
      scene.classList.toggle('is-current', index === 0);
      scene.classList.toggle('is-next', index > 0);
      scene.classList.remove('is-prev');
    });
    root.classList.add('style-ready');
  };

  if (reducedMotion.matches || !supportsObserver) {
    root.classList.add('motion-reduced');
    revealEverything();
    return;
  }

  scenes.forEach((scene) => scene.classList.add('motion-scene'));
  root.classList.add('motion-ready');

  const setActiveScene = (nextIndex) => {
    if (nextIndex < 0 || nextIndex === activeIndex) return;
    activeIndex = nextIndex;
    scenes.forEach((scene, index) => {
      scene.classList.toggle('is-prev', index < activeIndex);
      scene.classList.toggle('is-current', index === activeIndex);
      scene.classList.toggle('is-next', index > activeIndex);
    });
  };

  const measure = () => {
    frame = 0;
    if (!scenes.length) return;
    const anchor = window.innerHeight * 0.46;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    scenes.forEach((scene, index) => {
      const rect = scene.getBoundingClientRect();
      const center = rect.top + Math.min(rect.height, window.innerHeight) * 0.5;
      const distance = Math.abs(center - anchor);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setActiveScene(nearestIndex);
  };

  const scheduleMeasure = () => {
    const nextScrollY = window.scrollY;
    if (Math.abs(nextScrollY - lastScrollY) > 2) {
      root.dataset.motionDirection = nextScrollY > lastScrollY ? 'forward' : 'backward';
      lastScrollY = nextScrollY;
    }
    if (!frame) frame = window.requestAnimationFrame(measure);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      if (entry.target.matches('[data-reveal], [data-enter]')) {
        entry.target.classList.add('is-visible');
      }
    });
    scheduleMeasure();
  }, {
    rootMargin: '8% 0px 8% 0px',
    threshold: [0, 0.12, 0.35, 0.65],
  });

  reveals.forEach((element) => observer.observe(element));
  scenes.forEach((scene) => observer.observe(scene));

  const settle = () => {
    reveals.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.top < window.innerHeight * 1.04 && rect.bottom > -window.innerHeight * 0.04) {
        element.classList.add('is-visible');
      }
    });
    measure();
    root.classList.add('style-ready');
  };

  window.addEventListener('scroll', scheduleMeasure, { passive: true });
  window.addEventListener('resize', scheduleMeasure, { passive: true });
  window.addEventListener('pageshow', settle);
  reducedMotion.addEventListener('change', () => window.location.reload());
  window.requestAnimationFrame(settle);
})();

const revealItems = document.querySelectorAll('[data-reveal]');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (prefersReducedMotion || !('IntersectionObserver' in window)) {
  revealItems.forEach((item) => item.classList.add('is-visible'));
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  revealItems.forEach((item) => observer.observe(item));
}

const copyButton = document.querySelector('#copy-checksum');

copyButton?.addEventListener('click', async () => {
  const targetId = copyButton.dataset.copyTarget;
  const value = targetId ? document.getElementById(targetId)?.textContent?.trim() : '';
  if (!value) return;

  const originalLabel = copyButton.textContent;
  try {
    await navigator.clipboard.writeText(value);
    copyButton.textContent = '已复制';
  } catch {
    copyButton.textContent = '复制失败';
  }
  window.setTimeout(() => {
    copyButton.textContent = originalLabel;
  }, 1600);
});

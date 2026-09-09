type ConfettiOptions = { particleCount?: number; colors?: string[] };
let active: HTMLElement[] = [];
const confetti = Object.assign((options: ConfettiOptions = {}) => {
  if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  confetti.reset();
  const colors = options.colors || ['#338e82', '#efc76a', '#b0d8c5'];
  for (let index = 0; index < Math.min(options.particleCount || 24, 32); index++) {
    const particle = document.createElement('span');
    particle.className = 'minitool-confetti';
    particle.style.left = `${(index * 37) % 100}%`;
    particle.style.backgroundColor = colors[index % colors.length];
    particle.style.animationDelay = `${(index % 8) * 0.06}s`;
    particle.addEventListener('animationend', () => { particle.remove(); active = active.filter(value => value !== particle); }, { once: true });
    document.body.appendChild(particle); active.push(particle);
  }
}, { reset() { active.forEach(particle => particle.remove()); active = []; } });
export default confetti;

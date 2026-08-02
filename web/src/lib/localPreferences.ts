const STARTUP_ANIMATION_KEY = 'kgc-startup-animation';
const STARTUP_SESSION_KEY = 'kgc-startup-played';

export function isStartupAnimationEnabled(): boolean {
  return localStorage.getItem(STARTUP_ANIMATION_KEY) !== 'false';
}

export function setStartupAnimationEnabled(enabled: boolean) {
  localStorage.setItem(STARTUP_ANIMATION_KEY, String(enabled));
}

export function shouldPlayStartupAnimation(): boolean {
  if (!isStartupAnimationEnabled()) return false;
  if (sessionStorage.getItem(STARTUP_SESSION_KEY) === 'true') return false;
  sessionStorage.setItem(STARTUP_SESSION_KEY, 'true');
  return true;
}

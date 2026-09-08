export class DeveloperSession {
  unlocked = false;
  private taps: number[] = [];
  private failures = 0;
  private blockedUntil = 0;
  tap(now = Date.now()): boolean {
    this.taps = this.taps.filter(time => now >= time && now - time <= 3000);
    this.taps.push(now);
    if (this.taps.length < 5) return false;
    this.taps = []; return true;
  }
  unlock(password: string, now = Date.now()): void {
    if (now < this.blockedUntil) throw new Error('先休息一下，30 秒后再试。');
    if (password !== '192837') {
      this.failures += 1;
      if (this.failures >= 5) { this.blockedUntil = now + 30000; this.failures = 0; }
      throw new Error('密码不对，再想想这串数字。');
    }
    this.unlocked = true; this.failures = 0;
  }
  lock() { this.unlocked = false; this.taps = []; }
}
export const developerSession = new DeveloperSession();
export type StarOperation = 'set' | 'add' | 'subtract';
export function adjustedStars(before: number, amount: number, operation: StarOperation): number {
  if (!Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(amount) || amount < 0 || amount > 999999999 || !['set', 'add', 'subtract'].includes(operation)) throw new Error('请输入 0 至 999999999 的整数。');
  const after = operation === 'set' ? amount : operation === 'add' ? before + amount : before - amount;
  if (!Number.isSafeInteger(after) || after < 0 || after > 999999999) throw new Error('调整后的星星必须在 0 至 999999999 之间。');
  return after;
}

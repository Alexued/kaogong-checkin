/**
 * 秒表运行态单例（模块级 reactive，切换页面不丢失）。
 * 显示由组件内 rAF 读取 elapsedMs() 驱动。
 */
import { reactive } from 'vue';
import type { TimerLap } from '../types';

export const stopwatch = reactive({
  running: false,
  /** 暂停累计的毫秒数 */
  accumulatedMs: 0,
  /** 当前计时段的起点（performance.now()） */
  startTs: 0,
  /** 每次打点的累计时长 */
  lapsElapsed: [] as number[],
  /** 整个计时的开始时间（ISO），为空表示未开始 */
  startedAt: null as string | null,

  elapsedMs(): number {
    return this.accumulatedMs + (this.running ? performance.now() - this.startTs : 0);
  },

  start() {
    this.startedAt = new Date().toISOString();
    this.accumulatedMs = 0;
    this.lapsElapsed = [];
    this.startTs = performance.now();
    this.running = true;
  },

  pause() {
    if (!this.running) return;
    this.accumulatedMs += performance.now() - this.startTs;
    this.running = false;
  },

  resume() {
    if (this.running || !this.startedAt) return;
    this.startTs = performance.now();
    this.running = true;
  },

  lap() {
    if (!this.running) return;
    this.lapsElapsed.push(this.elapsedMs());
  },

  laps(): TimerLap[] {
    return this.lapsElapsed.map((e, i) => ({
      elapsedMs: e,
      splitMs: e - (this.lapsElapsed[i - 1] || 0),
    }));
  },

  reset() {
    this.running = false;
    this.accumulatedMs = 0;
    this.lapsElapsed = [];
    this.startedAt = null;
  },
});

/** 倒计时运行态单例；remainingMs() 始终返回当前真实剩余时长。 */
export const countdown = reactive({
  running: false,
  completed: false,
  durationMs: 0,
  remainingAtPauseMs: 0,
  startTs: 0,
  startedAt: null as string | null,
  remainingMs(): number {
    return Math.max(0, this.remainingAtPauseMs - (this.running ? performance.now() - this.startTs : 0));
  },
  start(durationMs: number) {
    this.durationMs = Math.max(1000, Math.round(durationMs));
    this.remainingAtPauseMs = this.durationMs;
    this.startTs = performance.now();
    this.startedAt = new Date().toISOString();
    this.running = true;
    this.completed = false;
  },
  pause() {
    if (!this.running) return;
    this.remainingAtPauseMs = this.remainingMs();
    this.running = false;
  },
  resume() {
    if (this.running || !this.startedAt || this.completed || this.remainingAtPauseMs <= 0) return;
    this.startTs = performance.now();
    this.running = true;
  },
  complete() {
    this.remainingAtPauseMs = 0;
    this.running = false;
    this.completed = true;
  },
  elapsedMs(): number {
    return Math.max(0, this.durationMs - this.remainingMs());
  },
  reset() {
    this.running = false;
    this.completed = false;
    this.durationMs = 0;
    this.remainingAtPauseMs = 0;
    this.startTs = 0;
    this.startedAt = null;
  },
});

/** mm:ss.cs；满 1 小时自动切换 hh:mm:ss */
export function fmtClock(ms: number): string {
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % 100;
  const totalS = Math.floor(totalCs / 100);
  const s = totalS % 60;
  const totalM = Math.floor(totalS / 60);
  const m = totalM % 60;
  const h = Math.floor(totalM / 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}.${p(cs)}`;
}

/** 记录展示用：h:mm:ss 或 m:ss */
export function fmtDuration(ms: number): string {
  const totalS = Math.round(ms / 1000);
  const s = totalS % 60;
  const totalM = Math.floor(totalS / 60);
  const m = totalM % 60;
  const h = Math.floor(totalM / 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

export function fmtCountdown(ms: number): string {
  const totalS = Math.max(0, Math.ceil(ms / 1000));
  const s = totalS % 60;
  const totalM = Math.floor(totalS / 60);
  const m = totalM % 60;
  const h = Math.floor(totalM / 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

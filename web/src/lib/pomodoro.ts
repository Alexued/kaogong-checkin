import { reactive } from 'vue';

export type PomodoroStage = 'focus' | 'shortBreak' | 'longBreak';

interface PersistedPomodoro {
  stage: PomodoroStage;
  running: boolean;
  durationMs: number;
  remainingAtPauseMs: number;
  deadlineAt: number;
  startedAt: string | null;
  focusesCompleted: number;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakEvery: number;
  taskId: string;
}

const STORAGE_KEY = 'kgc-pomodoro-v1';
const defaults: PersistedPomodoro = {
  stage: 'focus', running: false, durationMs: 25 * 60_000, remainingAtPauseMs: 25 * 60_000,
  deadlineAt: 0, startedAt: null, focusesCompleted: 0, focusMinutes: 25, shortBreakMinutes: 5,
  longBreakMinutes: 15, longBreakEvery: 4, taskId: '',
};

function load(): PersistedPomodoro {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Partial<PersistedPomodoro> | null;
    if (!value) return { ...defaults };
    return { ...defaults, ...value };
  } catch { return { ...defaults }; }
}

const initial = load();

export const pomodoro = reactive({
  ...initial,
  persist() {
    const snapshot: PersistedPomodoro = {
      stage: this.stage, running: this.running, durationMs: this.durationMs,
      remainingAtPauseMs: this.remainingAtPauseMs, deadlineAt: this.deadlineAt,
      startedAt: this.startedAt, focusesCompleted: this.focusesCompleted,
      focusMinutes: this.focusMinutes, shortBreakMinutes: this.shortBreakMinutes,
      longBreakMinutes: this.longBreakMinutes, longBreakEvery: this.longBreakEvery, taskId: this.taskId,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* optional cache */ }
  },
  stageDurationMs(stage?: PomodoroStage): number {
    const resolvedStage = stage ?? this.stage;
    const minutes = resolvedStage === 'focus' ? this.focusMinutes : resolvedStage === 'shortBreak' ? this.shortBreakMinutes : this.longBreakMinutes;
    return Math.max(1, Math.round(minutes)) * 60_000;
  },
  remainingMs(): number {
    return Math.max(0, this.running ? this.deadlineAt - Date.now() : this.remainingAtPauseMs);
  },
  configure(focus: number, shortBreak: number, longBreak: number, every: number, taskId: string) {
    if (this.running || this.startedAt) return;
    this.focusMinutes = Math.min(180, Math.max(1, Math.round(focus)));
    this.shortBreakMinutes = Math.min(60, Math.max(1, Math.round(shortBreak)));
    this.longBreakMinutes = Math.min(120, Math.max(1, Math.round(longBreak)));
    this.longBreakEvery = Math.min(12, Math.max(2, Math.round(every)));
    this.taskId = taskId;
    this.durationMs = this.stageDurationMs();
    this.remainingAtPauseMs = this.durationMs;
    this.persist();
  },
  start() {
    if (this.running) return;
    if (!this.startedAt) {
      this.durationMs = this.stageDurationMs();
      this.remainingAtPauseMs = this.durationMs;
      this.startedAt = new Date().toISOString();
    }
    this.deadlineAt = Date.now() + this.remainingAtPauseMs;
    this.running = true;
    this.persist();
  },
  pause() {
    if (!this.running) return;
    this.remainingAtPauseMs = this.remainingMs();
    this.running = false;
    this.deadlineAt = 0;
    this.persist();
  },
  resume() { this.start(); },
  completeStage() {
    const completedStage = this.stage;
    const completed = {
      stage: completedStage,
      startedAt: this.startedAt || new Date(Date.now() - this.durationMs).toISOString(),
      durationMs: this.durationMs,
      taskId: this.taskId || null,
      round: this.focusesCompleted + 1,
    };
    if (completedStage === 'focus') {
      this.focusesCompleted += 1;
      this.stage = this.focusesCompleted % this.longBreakEvery === 0 ? 'longBreak' : 'shortBreak';
    } else {
      this.stage = 'focus';
    }
    this.running = false;
    this.startedAt = null;
    this.deadlineAt = 0;
    this.durationMs = this.stageDurationMs();
    this.remainingAtPauseMs = this.durationMs;
    this.persist();
    return completed;
  },
  skipBreak() {
    if (this.stage === 'focus') return;
    this.stage = 'focus'; this.running = false; this.startedAt = null; this.deadlineAt = 0;
    this.durationMs = this.stageDurationMs(); this.remainingAtPauseMs = this.durationMs; this.persist();
  },
  resetCurrent() {
    this.running = false; this.startedAt = null; this.deadlineAt = 0;
    this.durationMs = this.stageDurationMs(); this.remainingAtPauseMs = this.durationMs; this.persist();
  },
  resetCycle() {
    this.focusesCompleted = 0; this.stage = 'focus'; this.resetCurrent();
  },
});

export const pomodoroStageLabel = (stage: PomodoroStage) => stage === 'focus' ? '专注' : stage === 'shortBreak' ? '短休息' : '长休息';

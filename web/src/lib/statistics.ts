import type {
  Checkin,
  DrillRecord,
  FormulaDrillRecord,
  Task,
  TimerRecord,
} from '../types';

type QuantityTask = Task & { target?: number };
type ProgressCheckin = Checkin & { progress?: number; targetSnapshot?: number };

export interface CompletionPoint {
  date: string;
  done: number;
  total: number;
  ratio: number;
  percent: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface StatisticsSummary {
  streakDays: number;
  fullAttendanceDays: number;
  averageCompletionRate: number;
  daysUntilPlanEnd: number | null;
}

export interface MonthCell extends CompletionPoint {
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  hasRecord: boolean;
}

export interface MonthProjection {
  month: string;
  label: string;
  previousMonth: string;
  nextMonth: string;
  cells: MonthCell[];
}

export interface CompletionBar extends CompletionPoint {
  label: string;
  valueLabel: string;
  isToday: boolean;
}

export interface TimerBar {
  id: string;
  label: string;
  value: number;
  valueLabel: string;
  title: string;
  date: string;
  isFastest: boolean;
}

export interface TimerComparisonGroup {
  mode: 'stopwatch' | 'countdown';
  bars: TimerBar[];
  averageMs: number;
  fastestId: string;
}

export interface RecordDay {
  date: string;
  done: number;
  total: number;
  ratio: number;
  taskRecords: number;
  timerSessions: number;
  drillSessions: number;
  formulaSessions: number;
}

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

function dateOrdinal(date: string): number {
  const match = DATE_RE.exec(date);
  if (!match) throw new Error(`Invalid local date: ${date}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = Date.UTC(year, month - 1, day);
  const parsed = new Date(value);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error(`Invalid local date: ${date}`);
  }
  return Math.trunc(value / DAY_MS);
}

function ordinalDate(ordinal: number): string {
  const date = new Date(ordinal * DAY_MS);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(date: string, days: number): string {
  return ordinalDate(dateOrdinal(date) + days);
}

function shiftMonth(month: string, offset: number): string {
  const match = MONTH_RE.exec(month);
  if (!match) throw new Error(`Invalid month: ${month}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function taskStartDate(task: Task): string {
  return task.createdAt.slice(0, 10);
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.trunc(value))
    : fallback;
}

function checkinRatio(checkin: Checkin, task: Task): number {
  const progressCheckin = checkin as ProgressCheckin;
  const quantityTask = task as QuantityTask;
  const progress = typeof progressCheckin.progress === 'number' && Number.isFinite(progressCheckin.progress)
    ? Math.max(0, progressCheckin.progress)
    : 1;
  const target = positiveInteger(
    progressCheckin.targetSnapshot,
    positiveInteger(quantityTask.target, 1),
  );
  return Math.min(1, progress / target);
}

function checkinComplete(checkin: Checkin, task: Task): boolean {
  return checkinRatio(checkin, task) >= 1;
}

function activeOn(task: Task, date: string, planEndDate: string | null): boolean {
  if (task.archived || taskStartDate(task) > date) return false;
  if (task.endDate && task.endDate < date) return false;
  return !planEndDate || date <= planEndDate;
}

function completionLevel(ratio: number, total: number): 0 | 1 | 2 | 3 | 4 {
  if (total <= 0 || ratio <= 0) return 0;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio < 1) return 3;
  return 4;
}

interface CompletionContext {
  tasks: Task[];
  byTask: Map<string, Checkin[]>;
  planEndDate: string | null;
}

function completionContext(
  tasks: Task[],
  checkins: Checkin[],
  planEndDate: string | null,
): CompletionContext {
  const byTask = new Map<string, Checkin[]>();
  for (const checkin of checkins) {
    if (checkin.deleted) continue;
    const records = byTask.get(checkin.taskId);
    if (records) records.push(checkin);
    else byTask.set(checkin.taskId, [checkin]);
  }
  for (const records of byTask.values()) {
    records.sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt));
  }
  return { tasks: tasks.filter((task) => !task.archived), byTask, planEndDate };
}

/** A deterministic daily projection. Calendar arithmetic uses UTC ordinals, never host time-zone offsets. */
function dailyCompletion(context: CompletionContext, date: string): CompletionPoint {
  let done = 0;
  let total = 0;
  let progressRatio = 0;

  for (const task of context.tasks) {
    const taskCheckins = context.byTask.get(task.id) || [];

    if (task.type === 'deadline') {
      const completion = taskCheckins.find((checkin) => checkinComplete(checkin, task));
      if (completion?.date === date && activeOn(task, date, context.planEndDate)) {
          total += 1;
          done += 1;
          progressRatio += 1;
      } else if ((!completion || completion.date > date) && activeOn(task, date, context.planEndDate)) {
        total += 1;
        progressRatio += Math.max(
          0,
          ...taskCheckins
            .filter((checkin) => checkin.date === date)
            .map((checkin) => checkinRatio(checkin, task)),
        );
      }
      continue;
    }

    if (!activeOn(task, date, context.planEndDate)) continue;
    total += 1;
    const dateProgress = Math.max(
      0,
      ...taskCheckins
        .filter((checkin) => checkin.date === date)
        .map((checkin) => checkinRatio(checkin, task)),
    );
    progressRatio += dateProgress;
    if (dateProgress >= 1) {
      done += 1;
    }
  }

  const ratio = total > 0 ? progressRatio / total : 0;
  return {
    date,
    done,
    total,
    ratio,
    percent: Math.round(ratio * 100),
    level: completionLevel(ratio, total),
  };
}

function relevantStartDate(tasks: Task[], today: string): string | null {
  const starts = tasks
    .filter((task) => !task.archived && taskStartDate(task) <= today)
    .map(taskStartDate)
    .sort();
  return starts[0] || null;
}

export function statisticsSummary(
  tasks: Task[],
  checkins: Checkin[],
  today: string,
  planEndDate: string | null,
): StatisticsSummary {
  const context = completionContext(tasks, checkins, planEndDate);
  const start = relevantStartDate(tasks, today);
  const finalDate = planEndDate && planEndDate < today ? planEndDate : today;
  const days: CompletionPoint[] = [];

  if (start && start <= finalDate) {
    for (let ordinal = dateOrdinal(start); ordinal <= dateOrdinal(finalDate); ordinal += 1) {
      days.push(dailyCompletion(context, ordinalDate(ordinal)));
    }
  }

  const scheduled = days.filter((day) => day.total > 0);
  const fullAttendanceDays = scheduled.filter((day) => day.done === day.total).length;
  const averageCompletionRate = scheduled.length > 0
    ? scheduled.reduce((sum, day) => sum + day.ratio, 0) / scheduled.length
    : 0;

  let cursor = today;
  const todayPoint = dailyCompletion(context, today);
  if (todayPoint.total <= 0 || todayPoint.ratio < 1) cursor = shiftDate(today, -1);
  let streakDays = 0;
  if (start) {
    while (cursor >= start) {
      const point = dailyCompletion(context, cursor);
      if (point.total <= 0) {
        cursor = shiftDate(cursor, -1);
        continue;
      }
      if (point.ratio < 1) break;
      streakDays += 1;
      cursor = shiftDate(cursor, -1);
    }
  }

  return {
    streakDays,
    fullAttendanceDays,
    averageCompletionRate,
    daysUntilPlanEnd: planEndDate
      ? Math.max(0, dateOrdinal(planEndDate) - dateOrdinal(today))
      : null,
  };
}

export function monthlyCompletion(
  tasks: Task[],
  checkins: Checkin[],
  month: string,
  today: string,
  planEndDate: string | null,
  recordDates: Iterable<string> = [],
): MonthProjection {
  const match = MONTH_RE.exec(month);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new Error(`Invalid month: ${month}`);
  }
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const firstDate = `${match[1]}-${match[2]}-01`;
  const firstDay = new Date(dateOrdinal(firstDate) * DAY_MS).getUTCDay();
  const leadingDays = (firstDay + 6) % 7;
  const gridStart = shiftDate(firstDate, -leadingDays);
  const recorded = new Set(recordDates);
  const context = completionContext(tasks, checkins, planEndDate);

  const cells = Array.from({ length: 42 }, (_, index): MonthCell => {
    const date = shiftDate(gridStart, index);
    const point = dailyCompletion(context, date);
    return {
      ...point,
      day: Number(date.slice(8, 10)),
      inMonth: date.startsWith(`${month}-`),
      isToday: date === today,
      isFuture: date > today,
      hasRecord: recorded.has(date) || checkins.some((checkin) => !checkin.deleted && checkin.date === date),
    };
  });

  return {
    month,
    label: `${year}年${monthNumber}月`,
    previousMonth: shiftMonth(month, -1),
    nextMonth: shiftMonth(month, 1),
    cells,
  };
}

export function completionSeries(
  tasks: Task[],
  checkins: Checkin[],
  today: string,
  planEndDate: string | null,
): CompletionBar[] {
  const context = completionContext(tasks, checkins, planEndDate);
  return Array.from({ length: 14 }, (_, index) => {
    const date = shiftDate(today, index - 13);
    const point = dailyCompletion(context, date);
    return {
      ...point,
      label: String(Number(date.slice(8, 10))),
      valueLabel: point.total > 0 ? `${point.percent}%` : '无计划',
      isToday: date === today,
    };
  });
}

function durationLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function timerComparisonGroups(records: TimerRecord[]): TimerComparisonGroup[] {
  const latest = records
    .filter((record) => !record.deleted && Number.isFinite(record.durationMs) && record.durationMs >= 0)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, 12);

  return (['stopwatch', 'countdown'] as const).flatMap((mode) => {
    const selected = latest
      .filter((record) => (record.mode || 'stopwatch') === mode)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    if (selected.length === 0) return [];
    const fastest = selected.reduce((best, record) => (
      record.durationMs < best.durationMs ? record : best
    ));
    const averageMs = selected.reduce((sum, record) => sum + record.durationMs, 0) / selected.length;
    return [{
      mode,
      averageMs,
      fastestId: fastest.id,
      bars: selected.map((record) => ({
        id: record.id,
        label: `${Number(record.date.slice(5, 7))}/${Number(record.date.slice(8, 10))}`,
        value: record.durationMs,
        valueLabel: durationLabel(record.durationMs),
        title: record.label || '未命名计时',
        date: record.date,
        isFastest: record.id === fastest.id,
      })),
    }];
  });
}

function defaultDateFromTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function recordedDates(
  checkins: Checkin[],
  timers: TimerRecord[],
  drills: DrillRecord[],
  formulaDrills: FormulaDrillRecord[],
  dateFromTimestamp: (timestamp: string) => string = defaultDateFromTimestamp,
): string[] {
  const dates = new Set<string>();
  for (const checkin of checkins) if (!checkin.deleted) dates.add(checkin.date);
  for (const timer of timers) if (!timer.deleted) dates.add(timer.date);
  for (const drill of drills) if (!drill.deleted) dates.add(dateFromTimestamp(drill.createdAt));
  for (const formula of formulaDrills) if (!formula.deleted) dates.add(dateFromTimestamp(formula.createdAt));
  return [...dates].sort((a, b) => b.localeCompare(a));
}

export function recentRecordDays(
  tasks: Task[],
  checkins: Checkin[],
  timers: TimerRecord[],
  drills: DrillRecord[],
  formulaDrills: FormulaDrillRecord[],
  today: string,
  planEndDate: string | null,
  dateFromTimestamp: (timestamp: string) => string = defaultDateFromTimestamp,
): RecordDay[] {
  const dates = recordedDates(checkins, timers, drills, formulaDrills, dateFromTimestamp).slice(0, 14);
  const context = completionContext(tasks, checkins, planEndDate);
  return dates.map((date) => {
    const completion = dailyCompletion(context, date);
    const drillSessionIds = new Set(
      drills
        .filter((record) => !record.deleted && dateFromTimestamp(record.createdAt) === date)
        .map((record) => record.sessionId),
    );
    const formulaSessionIds = new Set(
      formulaDrills
        .filter((record) => !record.deleted && dateFromTimestamp(record.createdAt) === date)
        .map((record) => record.sessionId),
    );
    return {
      date,
      done: completion.done,
      total: completion.total,
      ratio: completion.ratio,
      taskRecords: checkins.filter((record) => !record.deleted && record.date === date).length,
      timerSessions: timers.filter((record) => !record.deleted && record.date === date).length,
      drillSessions: drillSessionIds.size,
      formulaSessions: formulaSessionIds.size,
    };
  });
}

/** Daily planning and traceable quantity progress projections. */
import type { Checkin, Task } from '../types';
import { addDays, datePart, diffDays } from './date';
import { normalizeTarget, normalizeUnit } from './stateMigration';

export interface ProgressSource {
  date: string;
  overdueDays: number;
  progress: number;
  target: number;
  unit: string;
  done: boolean;
  checkinId?: string;
}

export interface PlanItem extends ProgressSource {
  task: Task;
  /** Aggregated carried items retain every original due date here. */
  sources?: ProgressSource[];
}

export interface DayPlan {
  today: PlanItem[];
  carried: PlanItem[];
}

function isActiveOn(task: Task, day: string, planEndDate: string | null): boolean {
  if (task.archived) return false;
  if (datePart(task.createdAt) > day) return false;
  if (task.endDate && task.endDate < day) return false;
  if (planEndDate && day > planEndDate) return false;
  return true;
}

function checkinForDate(checkins: Checkin[], date: string): Checkin | undefined {
  return checkins
    .filter((checkin) => checkin.date === date)
    .sort((left, right) => (right.updatedAt || '').localeCompare(left.updatedAt || ''))[0];
}

function sourceFor(task: Task, date: string, day: string, checkin?: Checkin): ProgressSource {
  const target = checkin ? normalizeTarget(checkin.targetSnapshot) : normalizeTarget(task.target);
  const progress = checkin && !checkin.deleted
    ? Math.min(target, Math.max(0, Number.isSafeInteger(checkin.progress) ? checkin.progress : 0))
    : 0;
  return {
    date,
    overdueDays: diffDays(date, day),
    progress,
    target,
    unit: checkin ? normalizeUnit(checkin.unitSnapshot) : normalizeUnit(task.unit),
    done: progress >= target,
    ...(checkin ? { checkinId: checkin.id } : {}),
  };
}

function aggregateDebt(task: Task, sources: ProgressSource[]): PlanItem {
  const ordered = sources.slice().sort((left, right) => left.date.localeCompare(right.date));
  const first = ordered[0];
  const units = new Set(ordered.map((source) => source.unit));
  return {
    task,
    date: first.date,
    overdueDays: Math.max(...ordered.map((source) => source.overdueDays)),
    progress: ordered.reduce((sum, source) => sum + source.progress, 0),
    target: ordered.reduce((sum, source) => sum + source.target, 0),
    unit: units.size === 1 ? first.unit : '',
    done: false,
    sources: ordered,
  };
}

export function selectProgressSource(item: PlanItem, delta: -1 | 1): ProgressSource {
  const sources = item.sources?.length ? item.sources : [item];
  if (delta > 0) return sources.find((source) => source.progress < source.target) || sources[0];
  return sources.slice().reverse().find((source) => source.progress > 0) || sources[0];
}

/** Pure record builder used by the store. A zero for a missing day creates no tombstone. */
export function buildProgressCheckin(
  task: Task | undefined,
  taskId: string,
  date: string,
  requestedProgress: number,
  existing: Checkin | undefined,
  timestamp: string,
  id: string,
): Checkin | null {
  if (!existing && requestedProgress <= 0) return null;
  const targetSnapshot = existing
    ? normalizeTarget(existing.targetSnapshot)
    : normalizeTarget(task?.target);
  const progress = Math.min(
    targetSnapshot,
    Math.max(0, Number.isSafeInteger(requestedProgress) ? requestedProgress : 0),
  );
  if (existing) {
    return {
      ...existing,
      progress,
      targetSnapshot,
      unitSnapshot: normalizeUnit(existing.unitSnapshot),
      deleted: progress === 0,
      updatedAt: timestamp,
    };
  }
  return {
    id,
    taskId,
    date,
    progress,
    targetSnapshot,
    unitSnapshot: normalizeUnit(task?.unit),
    createdAt: timestamp,
    updatedAt: timestamp,
    deleted: false,
  };
}

export function generatePlan(
  tasks: Task[],
  checkins: Checkin[],
  day: string,
  planEndDate: string | null,
): DayPlan {
  const today: PlanItem[] = [];
  const carried: PlanItem[] = [];
  const byTask = new Map<string, Checkin[]>();

  for (const checkin of checkins) {
    const records = byTask.get(checkin.taskId);
    if (records) records.push(checkin);
    else byTask.set(checkin.taskId, [checkin]);
  }

  for (const task of tasks) {
    if (task.archived) continue;
    const records = byTask.get(task.id) || [];

    if (task.type === 'deadline') {
      const activeRecords = records
        .filter((checkin) => !checkin.deleted)
        .sort((left, right) => left.date.localeCompare(right.date));
      const completed = activeRecords.find((checkin) => {
        const target = normalizeTarget(checkin.targetSnapshot);
        return checkin.progress >= target;
      });
      if (completed) {
        if (completed.date === day && isActiveOn(task, day, planEndDate)) {
          today.push({ task, ...sourceFor(task, day, day, completed) });
        }
        continue;
      }
      if (isActiveOn(task, day, planEndDate)) {
        const partial = activeRecords.slice().reverse()[0];
        today.push({ task, ...sourceFor(task, partial?.date || day, day, partial) });
      }
      continue;
    }

    if (isActiveOn(task, day, planEndDate)) {
      today.push({ task, ...sourceFor(task, day, day, checkinForDate(records, day)) });
    }

    const debtSources: ProgressSource[] = [];
    const start = datePart(task.createdAt);
    let endLimit = addDays(day, -1);
    if (task.endDate && task.endDate < endLimit) endLimit = task.endDate;
    if (planEndDate && planEndDate < endLimit) endLimit = planEndDate;
    for (let date = start; date <= endLimit; date = addDays(date, 1)) {
      const source = sourceFor(task, date, day, checkinForDate(records, date));
      if (!source.done) debtSources.push(source);
    }
    if (debtSources.length) carried.push(aggregateDebt(task, debtSources));
  }

  today.sort((left, right) => left.task.order - right.task.order);
  carried.sort((left, right) =>
    left.date.localeCompare(right.date) || left.task.order - right.task.order,
  );
  return { today, carried };
}

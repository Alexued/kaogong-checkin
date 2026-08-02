import type { Checkin, Task } from '../types';
import { generatePlan } from './plan';

export interface CompletionSummary {
  done: number;
  total: number;
  ratio: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export function completionLevel(ratio: number, total: number): 0 | 1 | 2 | 3 | 4 {
  if (total <= 0 || ratio <= 0) return 0;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio < 1) return 3;
  return 4;
}

export function completionForDate(
  tasks: Task[],
  checkins: Checkin[],
  date: string,
  planEndDate: string | null
): CompletionSummary {
  const items = generatePlan(tasks, checkins, date, planEndDate).today;
  const done = items.filter((item) => item.done).length;
  const total = items.length;
  const ratio = total > 0 ? done / total : 0;
  return { done, total, ratio, level: completionLevel(ratio, total) };
}

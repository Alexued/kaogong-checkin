/**
 * 每日计划生成（纯函数）
 *
 * 给定日期 D（本地 yyyy-MM-dd），计划 = A + B：
 * - A 今日应做：createdAt(日期部分) <= D && (endDate 空 || endDate >= D) 且未归档
 *   - daily：每天出现，当日有 checkin 才算完成
 *   - deadline：完成前每天出现；一旦有任意 checkin 即完成，之后不再出现
 *     （查看历史日时，若 checkin.date === D 则以完成态展示）
 * - B 结转：daily 任务对每个应做日 D' < D 无有效 checkin → 结转到 D，
 *   overdueDays = D - D'，按逾期天数降序排在今日任务之后
 *   （deadline 任务在完成前本就每天出现在 A 中，故不重复结转）
 * - 补卡：勾选结转项 → 写 checkin{taskId, date: D'}（记原始日期）
 * - settings.planEndDate 非空时，超过该日不再生成新任务（结转仍显示）
 */
import type { Task, Checkin } from '../types';
import { datePart, addDays, diffDays } from './date';

export interface PlanItem {
  task: Task;
  /** 应完成日期（结转项为原始日期 D'） */
  date: string;
  /** 0 = 今日应做；>0 = 结转逾期天数 */
  overdueDays: number;
  done: boolean;
  checkinId?: string;
}

export interface DayPlan {
  today: PlanItem[];
  carried: PlanItem[];
}

/** 任务在 day 当天是否处于有效期内（不含完成状态判断） */
function isActiveOn(task: Task, day: string, planEndDate: string | null): boolean {
  if (task.archived) return false;
  if (datePart(task.createdAt) > day) return false;
  if (task.endDate && task.endDate < day) return false;
  if (planEndDate && day > planEndDate) return false;
  return true;
}

export function generatePlan(
  tasks: Task[],
  checkins: Checkin[],
  day: string,
  planEndDate: string | null
): DayPlan {
  const today: PlanItem[] = [];
  const carried: PlanItem[] = [];

  const byTask = new Map<string, Checkin[]>();
  for (const c of checkins) {
    if (c.deleted) continue;
    const arr = byTask.get(c.taskId);
    if (arr) arr.push(c);
    else byTask.set(c.taskId, [c]);
  }

  for (const task of tasks) {
    if (task.archived) continue;
    const cs = (byTask.get(task.id) || []).slice().sort((a, b) => a.date.localeCompare(b.date));

    if (task.type === 'deadline') {
      const done = cs[0];
      if (done) {
        // 完成后不再出现；仅在完成当天以完成态展示
        if (done.date === day && isActiveOn(task, day, planEndDate)) {
          today.push({ task, date: day, overdueDays: 0, done: true, checkinId: done.id });
        }
        continue;
      }
      if (isActiveOn(task, day, planEndDate)) {
        today.push({ task, date: day, overdueDays: 0, done: false });
      }
      continue;
    }

    // daily
    if (isActiveOn(task, day, planEndDate)) {
      const c = cs.find((x) => x.date === day);
      today.push({ task, date: day, overdueDays: 0, done: !!c, checkinId: c?.id });
    }
    // 结转：从创建日到 min(D-1, endDate, planEndDate)，缺哪天补哪天
    const start = datePart(task.createdAt);
    let endLimit = addDays(day, -1);
    if (task.endDate && task.endDate < endLimit) endLimit = task.endDate;
    if (planEndDate && planEndDate < endLimit) endLimit = planEndDate;
    for (let d = start; d <= endLimit; d = addDays(d, 1)) {
      if (!cs.some((x) => x.date === d)) {
        carried.push({ task, date: d, overdueDays: diffDays(d, day), done: false });
      }
    }
  }

  carried.sort((a, b) => b.overdueDays - a.overdueDays);
  // 今日任务固定按任务排序值排列：完成后留在原位，不沉底
  today.sort((a, b) => a.task.order - b.task.order);
  return { today, carried };
}

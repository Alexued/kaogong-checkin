/** 统计（纯函数）：连续打卡天数、近 30 天热力图、总完成数 */
import type { Checkin } from '../types';
import { addDays } from './date';

export function totalDone(checkins: Checkin[]): number {
  return checkins.filter((c) => !c.deleted).length;
}

/**
 * 连续打卡天数：从今天往前，"当天有任一打卡"即算连续。
 * 今天还没有打卡时不立刻中断——从昨天开始往回数。
 */
export function streakDays(checkins: Checkin[], today: string): number {
  const dates = new Set(checkins.filter((c) => !c.deleted).map((c) => c.date));
  let d = today;
  if (!dates.has(d)) d = addDays(d, -1);
  let n = 0;
  while (dates.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export interface HeatCell {
  date: string;
  count: number;
}

/** 近 days 天（含今天）每天完成数，按日期升序 */
export function heatmap(checkins: Checkin[], today: string, days = 30): HeatCell[] {
  const counts = new Map<string, number>();
  for (const c of checkins) {
    if (c.deleted) continue;
    counts.set(c.date, (counts.get(c.date) || 0) + 1);
  }
  const cells: HeatCell[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    cells.push({ date, count: counts.get(date) || 0 });
  }
  return cells;
}

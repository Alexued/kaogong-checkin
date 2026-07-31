/** 本地时区日期工具：所有"今天"计算均用设备本地时区 */

export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return toLocalDateStr(new Date());
}

/** dateStr(yyyy-MM-dd) 加减 n 天 */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toLocalDateStr(d);
}

/** b - a 的天数差 */
export function diffDays(a: string, b: string): number {
  const ms = new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime();
  return Math.round(ms / 86400000);
}

/** ISO 时间戳取本地无关的日期部分（createdAt 均为 UTC ISO，截取前 10 位即可） */
export function datePart(iso: string): string {
  return iso.slice(0, 10);
}

export function formatCn(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

/** ISO 时间戳 → 本地 "M月d日 HH:mm" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ISO 时间戳 → 本地 "HH:mm" */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
export function weekdayCn(dateStr: string): string {
  return WEEK_CN[new Date(dateStr + 'T00:00:00').getDay()];
}

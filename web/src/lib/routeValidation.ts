export const UNKNOWN_ROUTE_REDIRECT = '/';
export const INVALID_STATS_DATE_REDIRECT = '/settings';

const LOCAL_DATE_PATTERN = /^([1-9]\d{3})-(\d{2})-(\d{2})$/;
const DAYS_BY_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

export function isValidStatsDateParam(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;

  const maximumDay = month === 2 && isLeapYear(year) ? 29 : DAYS_BY_MONTH[month - 1];
  return day <= maximumDay;
}

export function resolveStatsDayNavigation(
  dateParam: unknown,
): true | { path: typeof INVALID_STATS_DATE_REDIRECT; replace: true } {
  return isValidStatsDateParam(dateParam)
    ? true
    : { path: INVALID_STATS_DATE_REDIRECT, replace: true };
}

export function resolveDayDetailSiblingPath(routeName: unknown, date: string): string {
  const base = routeName === 'review-day' ? '/review/day' : '/stats/day';
  return `${base}/${date}`;
}

export function resolveUnknownRoute(): typeof UNKNOWN_ROUTE_REDIRECT {
  return UNKNOWN_ROUTE_REDIRECT;
}

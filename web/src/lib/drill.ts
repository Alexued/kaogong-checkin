/** 百化分（百分数 ↔ 分数）背诵：对照表常量 + 答案解析判定 */

export interface DrillItem {
  percent: number;
  /** 标准答案（展示用） */
  answer: string;
}

export const DRILL_TABLE: DrillItem[] = [
  { percent: 50, answer: '1/2' },
  { percent: 33.3, answer: '1/3' },
  { percent: 25, answer: '1/4' },
  { percent: 20, answer: '1/5' },
  { percent: 19, answer: '≈1/5.3' },
  { percent: 18, answer: '≈1/5.6' },
  { percent: 17, answer: '≈1/5.9' },
  { percent: 26.7, answer: '≈4/15' },
  { percent: 15, answer: '≈1/6.7' },
  { percent: 14.3, answer: '≈1/7' },
  { percent: 13, answer: '≈1/7.7' },
  { percent: 12.5, answer: '1/8' },
  { percent: 11.1, answer: '≈1/9' },
  { percent: 10.5, answer: '≈1/9.5' },
  { percent: 10, answer: '1/10' },
  { percent: 9.5, answer: '≈1/10.5' },
  { percent: 9.1, answer: '≈1/11' },
  { percent: 8.3, answer: '≈1/12' },
  { percent: 7.7, answer: '≈1/13' },
  { percent: 7.1, answer: '≈1/14' },
  { percent: 6.7, answer: '≈1/15' },
  { percent: 5, answer: '1/20' },
  { percent: 3.3, answer: '≈1/30' },
  { percent: 2.5, answer: '1/40' },
];

/** 解析用户输入为数值：支持 "1/8" 分数形式或 "0.125" 小数形式 */
export function parseAnswer(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const frac = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (frac) {
    const denom = parseFloat(frac[2]);
    if (denom === 0) return null;
    return parseFloat(frac[1]) / denom;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 判定：与 百分数/100 比较，误差 ≤0.002 判对 */
export function isCorrect(percent: number, input: string): boolean {
  const v = parseAnswer(input);
  return v !== null && Math.abs(v - percent / 100) <= 0.002;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

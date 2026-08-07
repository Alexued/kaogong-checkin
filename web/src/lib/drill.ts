/** 百化分背诵：24 项有理数目录、精确判分与通用洗牌。 */

export type FractionPair = readonly [numerator: number, denominator: number];

export interface DrillItem {
  /** 保留 number 类型，与既有 DrillRecord.percent 和历史统计兼容。 */
  percent: number;
  numerator: number;
  denominator: number;
  /** 标准答案（展示用）。 */
  answer: string;
  /** 不与标准答案等值，但明确登记为可接受的常用近似。 */
  approximations: readonly FractionPair[];
}

function entry(
  percent: number,
  numerator: number,
  denominator: number,
  approximations: readonly FractionPair[] = [],
): DrillItem {
  return {
    percent,
    numerator,
    denominator,
    answer: `${numerator}/${denominator}`,
    approximations,
  };
}

/** 顺序与 Claude PercentData.kt 一致，完整背诵按此顺序进行。 */
export const DRILL_TABLE: DrillItem[] = [
  entry(50, 1, 2),
  entry(33.3, 1, 3),
  entry(25, 1, 4),
  entry(20, 1, 5),
  entry(19, 3, 16, [[4, 21]]),
  entry(18, 2, 11, [[9, 50]]),
  entry(17, 1, 6, [[3, 17]]),
  entry(26.7, 4, 15),
  entry(15, 2, 13, [[3, 20]]),
  entry(14.3, 1, 7),
  entry(13, 2, 15, [[13, 100]]),
  entry(12.5, 1, 8),
  entry(11.1, 1, 9),
  entry(10.5, 2, 19),
  entry(10, 1, 10),
  entry(9.5, 2, 21),
  entry(9.1, 1, 11),
  entry(8.3, 1, 12),
  entry(7.7, 1, 13),
  entry(7.1, 1, 14),
  entry(6.7, 1, 15),
  entry(5, 1, 20),
  entry(3.3, 1, 30),
  entry(2.5, 1, 40),
];

export type AnswerFailureReason =
  | 'empty'
  | 'format'
  | 'zero-denominator'
  | 'too-large'
  | 'unknown-percent'
  | 'incorrect';

export interface AnswerGrade {
  correct: boolean;
  reason: 'correct' | AnswerFailureReason;
  message: string;
}

interface Rational {
  numerator: number | bigint;
  denominator: number | bigint;
}

type RationalParseResult =
  | { ok: true; value: Rational }
  | { ok: false; reason: AnswerFailureReason; message: string };

const MAX_INTEGER_DIGITS = 256;
const FRACTION_PATTERN = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/;
const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;

function digitCount(token: string): number {
  return token.replace(/^[+-]/, '').length;
}

function parseInteger(token: string): number | bigint {
  const value = Number(token);
  return Number.isSafeInteger(value) ? value : BigInt(token);
}

function isZero(value: number | bigint): boolean {
  return typeof value === 'bigint' ? value === 0n : value === 0;
}

function makeRational(numeratorText: string, denominatorText: string): RationalParseResult {
  if (
    digitCount(numeratorText) > MAX_INTEGER_DIGITS ||
    digitCount(denominatorText) > MAX_INTEGER_DIGITS
  ) {
    return {
      ok: false,
      reason: 'too-large',
      message: `数字过长，请控制在 ${MAX_INTEGER_DIGITS} 位以内`,
    };
  }

  try {
    const numerator = parseInteger(numeratorText);
    const denominator = parseInteger(denominatorText);
    if (isZero(denominator)) {
      return { ok: false, reason: 'zero-denominator', message: '分母不能为 0' };
    }
    return { ok: true, value: { numerator, denominator } };
  } catch {
    return { ok: false, reason: 'format', message: '请输入有效的分数或有限小数' };
  }
}

function parseRational(input: string): RationalParseResult {
  const value = input.trim();
  if (!value) return { ok: false, reason: 'empty', message: '请输入答案' };

  const fraction = value.match(FRACTION_PATTERN);
  if (fraction) return makeRational(fraction[1], fraction[2]);

  const decimal = value.match(DECIMAL_PATTERN);
  if (!decimal) {
    return {
      ok: false,
      reason: 'format',
      message: '格式不正确，请输入如 1/8 或 0.125',
    };
  }

  const [, sign, whole, fractionDigits = ''] = decimal;
  if (!fractionDigits) return makeRational(`${sign}${whole}`, '1');
  const combinedDigits = `${whole}${fractionDigits}`.replace(/^0+(?=\d)/, '');
  return makeRational(`${sign}${combinedDigits}`, `1${'0'.repeat(fractionDigits.length)}`);
}

function multiplicationIsSafe(left: number, right: number): boolean {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) return false;
  if (left === 0 || right === 0) return true;
  return Math.abs(left) <= Number.MAX_SAFE_INTEGER / Math.abs(right);
}

function toBigInt(value: number | bigint): bigint {
  return typeof value === 'bigint' ? value : BigInt(value);
}

/** 使用安全整数快速路径；任一交叉乘积可能越界时切换到 BigInt。 */
export function equivalentRationals(left: Rational, right: Rational): boolean {
  const allNumbers =
    typeof left.numerator === 'number' &&
    typeof left.denominator === 'number' &&
    typeof right.numerator === 'number' &&
    typeof right.denominator === 'number';

  if (
    allNumbers &&
    multiplicationIsSafe(left.numerator as number, right.denominator as number) &&
    multiplicationIsSafe(right.numerator as number, left.denominator as number)
  ) {
    return (
      (left.numerator as number) * (right.denominator as number) ===
      (right.numerator as number) * (left.denominator as number)
    );
  }

  return (
    toBigInt(left.numerator) * toBigInt(right.denominator) ===
    toBigInt(right.numerator) * toBigInt(left.denominator)
  );
}

function itemByPercent(percent: number): DrillItem | undefined {
  return DRILL_TABLE.find((item) => item.percent === percent);
}

function targetRational(pair: FractionPair): Rational {
  return { numerator: pair[0], denominator: pair[1] };
}

export function gradeAnswer(itemOrPercent: DrillItem | number, input: string): AnswerGrade {
  const item = typeof itemOrPercent === 'number' ? itemByPercent(itemOrPercent) : itemOrPercent;
  if (!item) {
    return {
      correct: false,
      reason: 'unknown-percent',
      message: '当前题目缺少标准答案',
    };
  }

  const parsed = parseRational(input);
  if (!parsed.ok) return { correct: false, reason: parsed.reason, message: parsed.message };

  const targets: FractionPair[] = [
    [item.numerator, item.denominator],
    ...item.approximations,
  ];
  const correct = targets.some((target) => equivalentRationals(parsed.value, targetRational(target)));
  return correct
    ? { correct: true, reason: 'correct', message: '回答正确' }
    : {
        correct: false,
        reason: 'incorrect',
        message: '分数不等值，也不是登记的近似答案',
      };
}

/** 保留旧调用形式，内部不再以浮点容差判分。 */
export function isCorrect(percent: number, input: string): boolean {
  return gradeAnswer(percent, input).correct;
}

/** 兼容旧的数值解析 API；精确判分不依赖此函数。 */
export function parseAnswer(input: string): number | null {
  const parsed = parseRational(input);
  if (!parsed.ok) return null;
  const value = Number(parsed.value.numerator) / Number(parsed.value.denominator);
  return Number.isFinite(value) ? value : null;
}

export function acceptedAnswers(item: DrillItem): string[] {
  return [
    item.answer,
    ...item.approximations.map(([numerator, denominator]) => `${numerator}/${denominator}`),
  ];
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const shuffled = arr.slice();
  for (let index = shuffled.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

import type { SpeedDifficulty } from '../types';

export type SpeedGroupKey = 'basic' | 'data';

export interface SpeedCategory {
  key: string;
  label: string;
  group: SpeedGroupKey;
}

export interface SpeedQuestion {
  categoryKey: string;
  categoryLabel: string;
  prompt: string;
  expression: string;
  answer: number | string;
  answerDisplay: string;
  tolerance: number;
  suffix: string;
  options?: string[];
  explanation: string;
}

export const SPEED_CATEGORIES: SpeedCategory[] = [
  { key: 'two-add-sub', label: '两位数加减', group: 'basic' },
  { key: 'round-hundred', label: '凑整百练习', group: 'basic' },
  { key: 'three-add', label: '三位数加法', group: 'basic' },
  { key: 'three-sub', label: '三位数减法', group: 'basic' },
  { key: 'three-mixed', label: '三位数加减', group: 'basic' },
  { key: 'multi-add', label: '多数相加', group: 'basic' },
  { key: 'mixed-add-sub', label: '混合加减', group: 'basic' },
  { key: 'two-by-one', label: '两位数乘一位数', group: 'basic' },
  { key: 'three-by-one', label: '三位数乘一位数', group: 'basic' },
  { key: 'two-by-11', label: '两位数乘 11', group: 'basic' },
  { key: 'two-by-15', label: '两位数乘 15', group: 'basic' },
  { key: 'two-by-two', label: '两位数乘两位数', group: 'basic' },
  { key: 'three-div-one', label: '三位数除一位数', group: 'basic' },
  { key: 'three-div-two', label: '三位数除两位数', group: 'basic' },
  { key: 'multiply-estimate', label: '乘法估算', group: 'basic' },
  { key: 'five-div-three', label: '五位数除三位数', group: 'basic' },
  { key: 'three-div-four', label: '三位数除四位数', group: 'basic' },
  { key: 'custom-mix', label: '自定义（综合随机）', group: 'basic' },
  { key: 'one-table', label: '一表通算', group: 'data' },
  { key: 'prior-amount', label: '估算前期量', group: 'data' },
  { key: 'growth-amount', label: '估算增长量', group: 'data' },
  { key: 'percent-fraction', label: '百化分计算', group: 'data' },
  { key: 'increment-compare', label: '增量比大小', group: 'data' },
  { key: 'base-compare', label: '基期比大小', group: 'data' },
  { key: 'annual-growth', label: '年均增长率', group: 'data' },
  { key: 'fraction-under', label: '分数计算（分子 < 分母）', group: 'data' },
  { key: 'fraction-over', label: '分数计算（分子 > 分母）', group: 'data' },
  { key: 'base-share', label: '基期比重', group: 'data' },
  { key: 'fraction-compare', label: '分数比大小', group: 'data' },
  { key: 'annual-average', label: '年平均量', group: 'data' },
];

const RATE_TABLE = [5, 6.25, 6.7, 7.1, 7.7, 8.3, 9.1, 10, 11.1, 12.5, 14.3, 16.7, 20, 25, 33.3, 50];
const FRACTION_TABLE = [
  [50, 2], [33.3, 3], [25, 4], [20, 5], [16.7, 6], [14.3, 7], [12.5, 8],
  [11.1, 9], [10, 10], [9.1, 11], [8.3, 12], [7.7, 13], [7.1, 14], [6.7, 15], [6.25, 16], [5, 20],
] as const;

function randInt(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function numeric(category: SpeedCategory, expression: string, answer: number, explanation: string, options?: Partial<SpeedQuestion>): SpeedQuestion {
  return {
    categoryKey: category.key,
    categoryLabel: category.label,
    prompt: options?.prompt || '请直接计算',
    expression,
    answer,
    answerDisplay: String(answer),
    tolerance: options?.tolerance ?? 0,
    suffix: options?.suffix || '',
    explanation,
  };
}

function choice(category: SpeedCategory, expression: string, answer: string, explanation: string): SpeedQuestion {
  return {
    categoryKey: category.key,
    categoryLabel: category.label,
    prompt: '请选择结果更大的一个',
    expression,
    answer,
    answerDisplay: answer,
    tolerance: 0,
    suffix: '',
    options: ['甲', '乙'],
    explanation,
  };
}

function basicQuestion(category: SpeedCategory, difficulty: SpeedDifficulty, random: () => number): SpeedQuestion {
  const scale = difficulty === 'easy' ? 0 : difficulty === 'normal' ? 1 : 2;
  const two = () => randInt(12, 65 + scale * 17, random);
  const three = () => randInt(105, 650 + scale * 170, random);
  switch (category.key) {
    case 'two-add-sub': {
      const a = two(); const b = two(); const plus = random() > 0.45;
      const [left, right] = plus || a >= b ? [a, b] : [b, a];
      return numeric(category, `${left} ${plus ? '+' : '−'} ${right}`, plus ? left + right : left - right, '按个位、十位分层计算；接近整十时先凑整再修正。');
    }
    case 'round-hundred': {
      const a = randInt(101, 899, random); const target = Math.ceil(a / 100) * 100;
      return numeric(category, `${a} + ? = ${target}`, target - a, '先看末两位，补到 100；百位无需参与运算。');
    }
    case 'three-add': { const a = three(); const b = three(); return numeric(category, `${a} + ${b}`, a + b, '百位、十位、个位分层相加，注意进位。'); }
    case 'three-sub': { const a = three(); const b = three(); const [x, y] = a >= b ? [a, b] : [b, a]; return numeric(category, `${x} − ${y}`, x - y, '先判断是否需要借位；可同时对两数加同一个量凑整。'); }
    case 'three-mixed': { const a = three(); const b = three(); const c = randInt(20, 180, random); return numeric(category, `${a} + ${b} − ${c}`, a + b - c, '先合并最容易凑整的两项，再处理剩余项。'); }
    case 'multi-add': { const values = Array.from({ length: 4 + scale }, () => randInt(40, 460, random)); return numeric(category, values.join(' + '), values.reduce((sum, value) => sum + value, 0), '优先把尾数互补、能凑整百的数配对。'); }
    case 'mixed-add-sub': { const a = three(); const b = randInt(30, 240, random); const c = randInt(20, Math.min(a + b - 1, 220), random); const d = randInt(10, 90, random); return numeric(category, `${a} − ${b} + ${c} − ${d}`, a - b + c - d, '把正项与负项分别合并，再做一次差。'); }
    case 'two-by-one': { const a = two(); const b = randInt(3, 9, random); return numeric(category, `${a} × ${b}`, a * b, '拆成十位与个位分别乘，再相加。'); }
    case 'three-by-one': { const a = three(); const b = randInt(3, 9, random); return numeric(category, `${a} × ${b}`, a * b, '拆百、十、个三段，控制每段进位。'); }
    case 'two-by-11': { const a = two(); return numeric(category, `${a} × 11`, a * 11, '两位数乘 11：原数加上向左错一位的原数。'); }
    case 'two-by-15': { const a = two(); return numeric(category, `${a} × 15`, a * 15, '×15 = ×10 + 原数的一半×10，也可先×3再×5。'); }
    case 'two-by-two': { const a = two(); const b = two(); return numeric(category, `${a} × ${b}`, a * b, '选更接近整十的因子拆分，用乘法分配律。'); }
    case 'three-div-one': { const q = randInt(24, 180, random); const b = randInt(3, 9, random); return numeric(category, `${q * b} ÷ ${b}`, q, '先用首位估商，再乘回验证。'); }
    case 'three-div-two': { const b = randInt(12, 49 + scale * 15, random); const q = randInt(6, 28, random); return numeric(category, `${b * q} ÷ ${b}`, q, '把除数看作整十数估商，再用乘法验证。'); }
    case 'multiply-estimate': { const a = randInt(118, 948, random); const b = randInt(12, 89, random); const answer = Math.round((a * b) / 100) * 100; return numeric(category, `${a} × ${b}（估算到百位）`, answer, '先按选项精度截位，估算结果只需落入正确区间。'); }
    case 'five-div-three': { const b = randInt(108, 680, random); const q = randInt(18, 120, random); return numeric(category, `${b * q} ÷ ${b}`, q, '分母截取前两到三位估商，结果接近时再乘回修正。'); }
    case 'three-div-four': { const a = randInt(120, 980, random); const b = randInt(1200, 9600, random); const answer = round(a / b, 3); return numeric(category, `${a} ÷ ${b}（保留三位小数）`, answer, '先判断数量级小于 1，再截位直除。', { tolerance: 0.0005 }); }
    default: {
      const candidates = SPEED_CATEGORIES.filter((item) => item.group === 'basic' && item.key !== 'custom-mix');
      return basicQuestion(pick(candidates, random), difficulty, random);
    }
  }
}

function dataQuestion(category: SpeedCategory, difficulty: SpeedDifficulty, random: () => number): SpeedQuestion {
  const factor = difficulty === 'easy' ? 1 : difficulty === 'normal' ? 2 : 3;
  const rate = pick(RATE_TABLE, random);
  const current = randInt(18, 160, random) * 100 * factor;
  switch (category.key) {
    case 'one-table': {
      const values = Array.from({ length: 4 }, () => randInt(12, 89, random) * factor);
      return numeric(category, `甲 ${values[0]}　乙 ${values[1]}　丙 ${values[2]}　丁 ${values[3]}\n合计为多少？`, values.reduce((sum, value) => sum + value, 0), '先用尾数检查，再用凑整法合计；表格题先核对单位。');
    }
    case 'prior-amount': { const answer = round(current / (1 + rate / 100), 1); return numeric(category, `现期 ${current}，同比增长 ${rate}%，估算基期量`, answer, '基期 = 现期 ÷ (1+r)。先看增长率能否百化分，再按选项决定精度。', { tolerance: 0.1 }); }
    case 'growth-amount': { const answer = round(current * (rate / 100) / (1 + rate / 100), 1); return numeric(category, `现期 ${current}，同比增长 ${rate}%，估算增长量`, answer, '增长量 = 现期×r÷(1+r)；r≈1/n 时直接用现期÷(n+1)。', { tolerance: 0.1 }); }
    case 'percent-fraction': { const [percent, denominator] = pick(FRACTION_TABLE, random); return numeric(category, `${percent}% ≈ 1 ÷ ?`, denominator, '把常见百分数对应到 1/n，优先记住 1/6、1/8、1/9、1/12。'); }
    case 'increment-compare': {
      const aRate = pick(RATE_TABLE, random); const bRate = pick(RATE_TABLE, random);
      const a = randInt(20, 120, random) * 100; const b = randInt(20, 120, random) * 100;
      const ga = a * aRate / (100 + aRate); const gb = b * bRate / (100 + bRate);
      return choice(category, `甲：${a}（+${aRate}%）\n乙：${b}（+${bRate}%）`, ga >= gb ? '甲' : '乙', '增长量比较先看“现期×增长率”，接近时再比较 1+r 的修正。');
    }
    case 'base-compare': {
      const aRate = pick(RATE_TABLE, random); const bRate = pick(RATE_TABLE, random);
      const a = randInt(20, 120, random) * 100; const b = randInt(20, 120, random) * 100;
      return choice(category, `甲：${a}（+${aRate}%）\n乙：${b}（+${bRate}%）`, a / (1 + aRate / 100) >= b / (1 + bRate / 100) ? '甲' : '乙', '基期 = 现期÷(1+r)；现期大且增速小可直接判大。');
    }
    case 'annual-growth': {
      const years = randInt(2, 5, random); const annual = pick([5, 10, 15, 20, 25] as const, random); const start = randInt(10, 50, random) * 100; const end = Math.round(start * (1 + annual / 100) ** years);
      return numeric(category, `${years} 年前为 ${start}，现在约为 ${end}，年均增长率约为`, annual, '用选项代入 (1+r)ⁿ，不开方；先用总增幅÷年数框定上限。', { suffix: '%' });
    }
    case 'fraction-under': { const den = randInt(80, 360, random); const num = randInt(20, den - 5, random); const answer = round(num / den * 100, 1); return numeric(category, `${num} ÷ ${den} = ?`, answer, '分母截位直除，先判断百分比首位。', { suffix: '%', tolerance: 0.1 }); }
    case 'fraction-over': { const den = randInt(30, 180, random); const num = randInt(den + 10, den * 3, random); const answer = round(num / den, 2); return numeric(category, `${num} ÷ ${den} = ?`, answer, '先判断结果在 1、2 还是 3 附近，再做截位直除。', { tolerance: 0.01 }); }
    case 'base-share': {
      const whole = randInt(50, 160, random) * 100; const share = randInt(18, 75, random); const part = Math.round(whole * share / 100); const rp = pick([5, 10, 15, 20] as const, random); const rw = pick([5, 10, 15, 20] as const, random); const answer = round((part / whole) * (1 + rw / 100) / (1 + rp / 100) * 100, 1);
      return numeric(category, `现期部分 ${part}（+${rp}%），整体 ${whole}（+${rw}%），基期比重`, answer, '基期比重 = 现期比重×(1+整体增速)÷(1+部分增速)。先判断升降方向。', { suffix: '%', tolerance: 0.1 });
    }
    case 'fraction-compare': {
      const a = randInt(20, 190, random); const b = randInt(a + 5, 260, random); const c = randInt(20, 190, random); const d = randInt(c + 5, 260, random);
      return choice(category, `甲：${a}/${b}\n乙：${c}/${d}`, a / b >= c / d ? '甲' : '乙', '先用“分子大、分母小则大”排除；不满足时直除看首位。');
    }
    case 'annual-average': { const years = randInt(3, 6, random); const values = Array.from({ length: years }, () => randInt(80, 320, random) * factor); const answer = round(values.reduce((sum, value) => sum + value, 0) / years, 1); return numeric(category, `${values.join('、')} 的年平均量`, answer, '用削峰填谷：选中间值作基准，只计算各年偏差。', { tolerance: 0.1 }); }
    default: return dataQuestion(SPEED_CATEGORIES.find((item) => item.key === 'prior-amount')!, difficulty, random);
  }
}

export function generateSpeedQuestion(categoryKey: string, difficulty: SpeedDifficulty, random: () => number = Math.random): SpeedQuestion {
  const category = SPEED_CATEGORIES.find((item) => item.key === categoryKey) || SPEED_CATEGORIES[0];
  return category.group === 'basic' ? basicQuestion(category, difficulty, random) : dataQuestion(category, difficulty, random);
}

export function judgeSpeedAnswer(question: SpeedQuestion, rawAnswer: string): boolean {
  const normalized = rawAnswer.trim().replace(/[％%]/g, '').replace(/，/g, ',');
  if (typeof question.answer === 'string') return normalized.toUpperCase() === question.answer.toUpperCase();
  const numericAnswer = Number(normalized);
  return Number.isFinite(numericAnswer) && Math.abs(numericAnswer - question.answer) <= Math.max(question.tolerance, 1e-9);
}

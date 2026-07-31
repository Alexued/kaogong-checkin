/** 资料分析公式背诵：公式表前端常量 */

export interface FormulaItem {
  key: string;
  name: string;
  formula: string;
  note?: string;
}

/** 统一符号约定：A=现期量，B=基期量，r=增长率，R=增长量 */
export const FORMULA_SYMBOLS = 'A = 现期量　B = 基期量　r = 增长率　R = 增长量';

export const FORMULA_TABLE: FormulaItem[] = [
  { key: 'base', name: '基期量', formula: 'B = A ÷ (1 + r)' },
  { key: 'current', name: '现期量', formula: 'A = B × (1 + r)' },
  {
    key: 'growth-amount',
    name: '增长量',
    formula: 'R = A − B = B × r = A ÷ (1 + r) × r',
  },
  {
    key: 'growth-rate',
    name: '增长率',
    formula: 'r = R ÷ B = (A − B) ÷ B',
  },
  {
    key: 'base-sum-diff',
    name: '基期和差',
    formula: '基期和 = A₁÷(1+r₁) + A₂÷(1+r₂)\n基期差 = A₁÷(1+r₁) − A₂÷(1+r₂)',
    note: 'A₁、A₂ 为两个现期量，r₁、r₂ 为各自增长率',
  },
  { key: 'interval-rate', name: '间隔增长率', formula: 'r = r₁ + r₂ + r₁ × r₂' },
  {
    key: 'avg-growth-amount',
    name: '年均增长量',
    formula: 'R̄ = (A − B) ÷ n',
    note: 'A 为末期量，B 为基期量，n 为年份差',
  },
  {
    key: 'avg-growth-rate',
    name: '年均增长率',
    formula: '(1 + r̄)ⁿ = A ÷ B',
    note: 'A 为末期量，B 为基期量，n 为年份差',
  },
  { key: 'proportion', name: '比重', formula: '比重 = A ÷ B', note: 'A 为部分量，B 为整体量' },
  {
    key: 'base-proportion',
    name: '基期比重',
    formula: '基期比重 = A/B × (1 + r_b) ÷ (1 + r_a)',
    note: 'A 为部分现期，B 为整体现期，r_a / r_b 为各自增长率',
  },
  {
    key: 'proportion-diff',
    name: '两期比重差',
    formula: '比重差 = A/B × (r_a − r_b) ÷ (1 + r_a)',
    note: 'r_a > r_b 比重上升，反之下降',
  },
  {
    key: 'avg-rate',
    name: '平均数增长率',
    formula: 'r = (r_a − r_b) ÷ (1 + r_b)',
    note: 'r_a 为总量增长率，r_b 为份数增长率',
  },
  { key: 'multiple', name: '倍数', formula: '倍数 = A ÷ B\n多几倍 = A ÷ B − 1' },
  {
    key: 'mixed-rate',
    name: '混合增长率',
    formula: 'r₁ < r < r₂（假设 r₁ < r₂），r 偏向 B 较大的一方',
    note: '整体增长率介于各部分增长率之间，偏向基期量大的一侧',
  },
];

export function formulaByKey(key: string): FormulaItem | undefined {
  return FORMULA_TABLE.find((f) => f.key === key);
}

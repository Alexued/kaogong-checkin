/** 资料分析公式背诵：完整公式目录与历史 key 兼容映射。 */

export const FORMULA_CATEGORIES = [
  '基期与现期',
  '增长量',
  '和差与混合',
  '隔年与年均',
  '比重',
  '平均数与倍数',
  '贡献与拉动',
  '概念辨析',
] as const;

export type FormulaCategory = (typeof FORMULA_CATEGORIES)[number];

export interface FormulaItem {
  /** 与 Claude 来源条目一致的稳定主键。 */
  key: string;
  category: FormulaCategory;
  /** 题面只说明要求，不包含公式答案。 */
  name: string;
  formula: string;
  condition: string;
  tip: string;
}

export const FORMULA_SYMBOLS =
  '现期量 A　基期量 B　增长率 r　增长量 R　期数/年数 n\n' +
  '部分量 a（增长率 r_a）　整体量 A（增长率 r_A）\n' +
  '下标 1、2 区分不同事物或不同时期';

/** 顺序与 Claude FormulaData.kt 一致，完整背诵按此顺序进行。 */
export const FORMULA_TABLE: FormulaItem[] = [
  {
    key: 'base_1',
    category: '基期与现期',
    name: '基期量 B（已知现期量 A、增长率 r）',
    formula: 'B = A ÷ (1 + r)',
    condition: 'A 为现期量，r 为增长率',
    tip: '「现期 ÷ (1+r)」，除以不是减去',
  },
  {
    key: 'base_2',
    category: '基期与现期',
    name: '现期量 A（已知基期量 B、增长率 r）',
    formula: 'A = B × (1 + r)',
    condition: 'B 为基期量',
    tip: '基期往后推一期就乘 (1+r)',
  },
  {
    key: 'base_3',
    category: '基期与现期',
    name: '增长量 R',
    formula: 'R = A − B',
    condition: '',
    tip: '增长量是差值，单位与量纲相同',
  },
  {
    key: 'base_4',
    category: '基期与现期',
    name: '增长率 r',
    formula: 'r = (A − B) ÷ B = A ÷ B − 1 = R ÷ B',
    condition: '',
    tip: '增长率的分母永远是基期量 B',
  },
  {
    key: 'base_5',
    category: '基期与现期',
    name: '基期量 B（已知现期量 A、增长量 R）',
    formula: 'B = A − R',
    condition: '',
    tip: '已知增长量时直接减',
  },
  {
    key: 'base_6',
    category: '基期与现期',
    name: '增长率 r（已知现期量 A、增长量 R）',
    formula: 'r = R ÷ (A − R)',
    condition: 'A − R 就是基期量',
    tip: '分母先还原成基期',
  },
  {
    key: 'grow_1',
    category: '增长量',
    name: '增长量 R（已知现期量 A、增长率 r）',
    formula: 'R = A − A ÷ (1 + r) = A × r ÷ (1 + r)',
    condition: '',
    tip: '现期 × r/(1+r)，别用 A×r',
  },
  {
    key: 'grow_2',
    category: '增长量',
    name: '增长量 R（已知基期量 B、增长率 r）',
    formula: 'R = B × r',
    condition: '',
    tip: '基期才可以直接乘 r',
  },
  {
    key: 'grow_3',
    category: '增长量',
    name: '增长量特殊速算（r ≈ 1/n）',
    formula: 'R ≈ A ÷ (n + 1)',
    condition: '把 r 化成 1/n 的形式（百化分）',
    tip: '百化分就是为这个公式服务的',
  },
  {
    key: 'grow_4',
    category: '增长量',
    name: '年均增长量',
    formula: '年均增长量 = (A − B) ÷ n',
    condition: 'n = 末期年份 − 初期年份',
    tip: 'n 是间隔数，不是年份个数',
  },
  {
    key: 'sum_1',
    category: '和差与混合',
    name: '基期和',
    formula: 'B₁ + B₂ = A₁ ÷ (1 + r₁) + A₂ ÷ (1 + r₂)',
    condition: '两部分现期量 A₁、A₂，增长率 r₁、r₂',
    tip: '分别还原再相加，不能先加后还原',
  },
  {
    key: 'sum_2',
    category: '和差与混合',
    name: '基期差',
    formula: 'B₁ − B₂ = A₁ ÷ (1 + r₁) − A₂ ÷ (1 + r₂)',
    condition: '',
    tip: '同样先各自还原',
  },
  {
    key: 'sum_3',
    category: '和差与混合',
    name: '整体（混合）增长率 r',
    formula: 'r = [(A₁ + A₂) − (B₁ + B₂)] ÷ (B₁ + B₂)',
    condition: '',
    tip: '结果必介于 r₁、r₂ 之间，偏向基期量大的一方',
  },
  {
    key: 'sum_4',
    category: '和差与混合',
    name: '十字交叉法',
    formula: 'B₁ ÷ B₂ = (r₂ − r) ÷ (r − r₁)',
    condition: 'r 为混合增长率，B₁、B₂ 为两部分基期量',
    tip: '交叉相减得基期量之比，离谁近谁的量大',
  },
  {
    key: 'span_1',
    category: '隔年与年均',
    name: '隔年增长率 r',
    formula: 'r = r₁ + r₂ + r₁ × r₂',
    condition: 'r₁ 为前一期增长率，r₂ 为后一期增长率',
    tip: '别忘了两率相乘那一项',
  },
  {
    key: 'span_2',
    category: '隔年与年均',
    name: '隔年基期量 B',
    formula: 'B = A ÷ [(1 + r₁)(1 + r₂)]',
    condition: '',
    tip: '连续除以两个 (1+r)',
  },
  {
    key: 'span_3',
    category: '隔年与年均',
    name: '年均增长率 r',
    formula: 'r = ⁿ√(A ÷ B) − 1',
    condition: 'n = 末期年份 − 初期年份',
    tip: '即 (1+r)ⁿ = A/B，开 n 次方再减 1',
  },
  {
    key: 'span_4',
    category: '隔年与年均',
    name: '年均增长率估算',
    formula: '(1 + r)ⁿ = A ÷ B',
    condition: '',
    tip: '选项代入验证比开方更快',
  },
  {
    key: 'share_1',
    category: '比重',
    name: '现期比重 w',
    formula: 'w = a ÷ A',
    condition: 'a 为部分现期量，A 为整体现期量',
    tip: '部分 ÷ 整体',
  },
  {
    key: 'share_2',
    category: '比重',
    name: '基期比重 w₀',
    formula: 'w₀ = (a ÷ A) × (1 + r_A) ÷ (1 + r_a)',
    condition: 'r_a 为部分增长率，r_A 为整体增长率',
    tip: '现期比重 × (1+整体率)/(1+部分率)，分子分母的率反着放',
  },
  {
    key: 'share_3',
    category: '比重',
    name: '比重变化（百分点）',
    formula: 'Δw = (a ÷ A) × (r_a − r_A) ÷ (1 + r_a)',
    condition: '',
    tip: '结果单位是百分点；绝对值必小于 |r_a − r_A|',
  },
  {
    key: 'share_4',
    category: '比重',
    name: '比重升降判断',
    formula: 'r_a > r_A ⇒ 比重上升；r_a < r_A ⇒ 比重下降',
    condition: '',
    tip: '部分比整体长得快，占比就变大',
  },
  {
    key: 'avg_1',
    category: '平均数与倍数',
    name: '平均数',
    formula: '平均数 = A ÷ N',
    condition: 'A 为总量，N 为份数',
    tip: '总量 ÷ 份数',
  },
  {
    key: 'avg_2',
    category: '平均数与倍数',
    name: '平均数增长率 r',
    formula: 'r = (1 + r_A) ÷ (1 + r_N) − 1 = (r_A − r_N) ÷ (1 + r_N)',
    condition: 'r_A 为总量增长率，r_N 为份数增长率',
    tip: '和比重公式同构：分子的率减分母的率',
  },
  {
    key: 'avg_3',
    category: '平均数与倍数',
    name: '基期平均数',
    formula: '[A ÷ (1 + r_A)] ÷ [N ÷ (1 + r_N)]',
    condition: '',
    tip: '分子分母各自还原基期',
  },
  {
    key: 'avg_4',
    category: '平均数与倍数',
    name: 'A 是 B 的几倍',
    formula: '倍数 = A ÷ B',
    condition: '',
    tip: '「是几倍」直接除',
  },
  {
    key: 'avg_5',
    category: '平均数与倍数',
    name: 'A 比 B 多几倍',
    formula: '多的倍数 = (A − B) ÷ B = A ÷ B − 1',
    condition: '',
    tip: '「多几倍」要减 1',
  },
  {
    key: 'avg_6',
    category: '平均数与倍数',
    name: '两量之比的增长率',
    formula: 'r = (1 + r_甲) ÷ (1 + r_乙) − 1',
    condition: '甲 ÷ 乙 这个比值的增长率',
    tip: '凡「除出来的量」都用这个式子',
  },
  {
    key: 'avg_7',
    category: '平均数与倍数',
    name: '两量之积的增长率',
    formula: 'r = r_甲 + r_乙 + r_甲 × r_乙',
    condition: '甲 × 乙 这个乘积的增长率',
    tip: '与隔年增长率同一个式子',
  },
  {
    key: 'avg_8',
    category: '平均数与倍数',
    name: '翻番',
    formula: '翻 n 番 ⇒ 变为原来的 2ⁿ 倍',
    condition: '',
    tip: '翻一番是 2 倍，不是 1 倍',
  },
  {
    key: 'contrib_1',
    category: '贡献与拉动',
    name: '增长贡献率',
    formula: '贡献率 = R_a ÷ R_A',
    condition: 'R_a 为部分增长量，R_A 为整体增长量',
    tip: '部分增长量 ÷ 整体增长量',
  },
  {
    key: 'contrib_2',
    category: '贡献与拉动',
    name: '拉动增长（百分点）',
    formula: '拉动 = R_a ÷ B_A',
    condition: 'B_A 为整体基期量',
    tip: '分母换成整体基期量，单位是百分点',
  },
  {
    key: 'contrib_3',
    category: '贡献与拉动',
    name: '拉动增长的另一种算法',
    formula: '拉动 = r_a × (B_a ÷ B_A)',
    condition: '',
    tip: '部分增长率 × 部分基期比重',
  },
  {
    key: 'misc_1',
    category: '概念辨析',
    name: '百分点',
    formula: '百分点 = r₁ − r₂',
    condition: '',
    tip: '两个百分数相减，单位写「百分点」不是「%」',
  },
  {
    key: 'misc_2',
    category: '概念辨析',
    name: '同比与环比',
    formula: '同比：与去年同期比；环比：与上一相邻周期比',
    condition: '',
    tip: '同比看年，环比看相邻',
  },
  {
    key: 'misc_3',
    category: '概念辨析',
    name: '顺差与逆差',
    formula: '顺差 = 出口 − 进口 > 0；逆差 < 0',
    condition: '',
    tip: '差额的绝对值叫「差额」',
  },
];

/** v0.7.1 的公式 key 映射到新目录，存量记录无需重写。 */
const LEGACY_FORMULA_KEY_ALIASES: Readonly<Record<string, string>> = {
  base: 'base_1',
  current: 'base_2',
  'growth-amount': 'grow_1',
  'growth-rate': 'base_4',
  'base-sum-diff': 'sum_1',
  'interval-rate': 'span_1',
  'avg-growth-amount': 'grow_4',
  'avg-growth-rate': 'span_3',
  proportion: 'share_1',
  'base-proportion': 'share_2',
  'proportion-diff': 'share_3',
  'avg-rate': 'avg_2',
  multiple: 'avg_4',
  'mixed-rate': 'sum_3',
};

export function canonicalFormulaKey(key: string): string {
  return LEGACY_FORMULA_KEY_ALIASES[key] ?? key;
}

export function formulasByCategory(category: string): FormulaItem[] {
  if (category === '全部') return FORMULA_TABLE;
  return FORMULA_TABLE.filter((item) => item.category === category);
}

export function formulaByKey(key: string): FormulaItem | undefined {
  const canonicalKey = canonicalFormulaKey(key);
  return FORMULA_TABLE.find((item) => item.key === canonicalKey);
}

import type { AnalysisReviewSection } from '../types';

export interface AnalysisCoachResult {
  categoryKey: string;
  categoryLabel: string;
  sections: AnalysisReviewSection[];
}

interface Rule {
  key: string;
  label: string;
  keywords: RegExp;
  relation: string;
  route: string;
  estimate: string;
  traps: string;
}

const RULES: Rule[] = [
  { key: 'contribution', label: '拉动增长率 / 增长贡献率', keywords: /拉动|贡献率/, relation: '拉动 = 部分增长量 ÷ 整体基期量；贡献率 = 部分增长量 ÷ 整体增长量；拉动 = 整体增长率 × 贡献率。', route: '先确认题干问“拉动”还是“贡献”，两者只差分母；材料若直接给拉动和整体增速，优先相除，免算增长量。', estimate: '先看选项差距，除法只保留能区分选项的位数。', traps: '拉动用“百分点”，贡献率用“百分数”；贡献率可以为负，也可能超过 100%。' },
  { key: 'annual', label: '年均增长 / 递推', keywords: /年均|平均每年|若干年后|保持.*增长|至少.*年/, relation: '年均增长量 = (末期−初期)÷年份间隔；年均增长率满足 末期 = 初期×(1+r)ⁿ。', route: '第一步先判断问的是“量”还是“率”。问率时不开方，先用总增幅÷年份差框上限，再把选项代入 (1+r)ⁿ。', estimate: '优先使用 5%、10%、15%、20%、25% 的多年累计表或逐年乘积估算。', traps: '年份间隔不是年份个数；“至少几年”结果非整数要向上取整；五年规划常要把基期前推一年。' },
  { key: 'mixed-rate', label: '混合增长率', keywords: /混合|总体.*增速|合计.*增|两部分.*增|进口.*出口.*总/, relation: '整体增速是各部分按基期量加权的平均；总增率居中，并偏向基期量更大的一方。', route: '先用“居中”排除区间外选项，再判断整体更靠近哪一部分；接近时用十字交叉：差值之比 = 权重反比。', estimate: '优先带入选项，不必分别精算两个基期量。', traps: '“现期代基期”只在增速较小且体量接近时近似可用，不是恒等式。' },
  { key: 'compound-rate', label: '复合 / 间隔增长率', keywords: /间隔增长|隔年|两年.*增长|平均数增长率|比重增长率|单价.*销量|量价/, relation: '凡 C=A×B，都用 rC = rA + rB + rA×rB；求某个因子时可移项或带选项验证。', route: '先识别乘法关系，再把两个增速代入；若求因子增速，优先将选项代入乘积式验证。', estimate: '交叉项通常较小但不能漏；选项宽时保留到 0.1 个百分点即可。', traps: '同号交叉项为正，异号为负；平均数、比重、产销率只是同一乘法关系的不同名字。' },
  { key: 'share', label: '比重 / 两期比重差', keywords: /比重|占比|所占|百分点/, relation: '比重 = 部分÷整体；两期比重差 = 现期比重×(部分增速−整体增速)÷(1+部分增速)。', route: '先比较部分增速与整体增速判断上升或下降，再算 a−b；方向和差值往往已能排除大半选项。', estimate: 'A现/B现 是锚点，1/(1+a) 只是接近 1 的修正项，最后处理。', traps: '两个百分数相减的结果叫“百分点”；部分增速大于整体增速，比重才上升。' },
  { key: 'average', label: '平均数', keywords: /平均数|人均|户均|单位.*平均|每.*平均/, relation: '平均数 = 总量÷份数；总量增速 > 份数增速时，平均数上升。', route: '先找总量和份数，核对两者口径一致；比较或判断升降时优先用增速关系，计算时再直除。', estimate: '多个相近数求平均，使用削峰填谷：平均数 = 基准 + 偏差总和÷个数。', traps: '“平均每年”可能问年均增长量，不一定是普通平均数；总量与份数的单位必须匹配。' },
  { key: 'growth-amount', label: '增长量', keywords: /增长量|增加了多少|减少量|下降了多少|变化量/, relation: '增长量 = 现期−基期 = 现期×r÷(1+r)；r≈1/n 时，正增长量≈现期÷(n+1)。', route: '先确认问增长量、减少量还是变化量；比较时先看现期×增长率，接近再处理 1+r。', estimate: '优先百化分；卡在两个分数之间时用相邻分数夹区间。', traps: '增长量带正负号，减少量和变化量取绝对值；“增长了百分之多少”问的是增长率。' },
  { key: 'base-amount', label: '基期量', keywords: /基期|去年同期|上年同期|前期量|上一期|去年为多少/, relation: '基期 = 现期÷(1+r)；若给增长量，则基期 = 现期−增长量。', route: '找现期量和增长率，先看选项决定精度；5%~20% 可先用现期−0.1×现期估算，再按增长率相对 11.1% 的方向修正。', estimate: '选项首位不同用截位直除；差距极小时把选项乘回 (1+r) 验证。', traps: '“和谁比，谁就是基期”；负增长时基期大于现期；同比与环比的基期不同。' },
  { key: 'growth-rate', label: '增长率', keywords: /增长率|增速|增幅|降幅|变化幅度|同比增长|环比增长/, relation: '增长率 = 增长量÷基期 = 现期÷基期−1；比较增速时，增长量÷现期与增长量÷基期的大小顺序完全一致。', route: '先区分增幅、降幅和变化幅度；给现期与增长量时，比较可直接用增长量÷现期，省去求基期。', estimate: '判断是否超过某值时，用基期×临界增长率与增长量比较，避免长除法。', traps: '正增长永远大于负增长；“降幅”和“变化幅度”要取绝对值；百分数与百分点不能混用。' },
  { key: 'multiple', label: '倍数 / 基期倍比', keywords: /倍数|几倍|多几倍|翻.*番/, relation: '是几倍 = A÷B；多几倍 = A÷B−1；翻 n 番后变为 2ⁿ 倍。', route: '先确认题干问“是几倍”还是“多几倍”；涉及基期时，再乘 (1+rB)÷(1+rA)。', estimate: '先算现期倍比作为锚点，再用两者增速判断基期倍比向上还是向下修正。', traps: '“多 2 倍”表示变为 3 倍；翻 3 番是 8 倍，不是 3 倍。' },
  { key: 'fraction', label: '基础计算 / 分数比较', keywords: /最大|最小|排序|比较|约为|计算|合计/, relation: '资料分析的比重、倍数、平均数和增长率，本质都可还原为加减乘除。', route: '先看选项差距，再决定估算精度；分数比较先试“分子大、分母小则大”，不满足再直除看首位。', estimate: '选项首位不同大胆截位；选项接近则保留到差异位的下一位。', traps: '计算前核对时间、单位、主体、口径和题干的“正确/错误”。' },
];

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function inferYearPairBaseAmount(question: string): boolean {
  if (!/(?:同比|环比|增长|下降|增速|降幅)/.test(question)) return false;
  const allYears = [...question.matchAll(/((?:19|20)\d{2})年?/g)].map((match) => Number(match[1]));
  if (allYears.length < 2) return false;
  const latestYear = Math.max(...allYears);
  const prompt = question.match(/(?:问|求|估算|计算)([^。！？?]*)[？?]?$/)?.[1]
    || question.split(/[。；]/).at(-1)
    || '';
  const promptYears = [...prompt.matchAll(/((?:19|20)\d{2})年?/g)].map((match) => Number(match[1]));
  return promptYears.some((year) => year < latestYear) && /多少|约为|为多少|数值|产量|金额|规模|总量/.test(prompt);
}

function selectRule(question: string): Rule {
  if (inferYearPairBaseAmount(question)) return RULES.find((candidate) => candidate.key === 'base-amount')!;
  return RULES.find((candidate) => candidate.keywords.test(question)) || RULES.at(-1)!;
}

function dataAudit(text: string): string {
  const years = [...new Set(text.match(/(?:19|20)\d{2}年?/g) || [])];
  const units = [...new Set(text.match(/(?:亿元|万元|元|万人|人|万吨|吨|万件|件|亿|万|%|百分点)/g) || [])];
  const numbers = text.match(/-?\d+(?:\.\d+)?%?/g) || [];
  const parts = [
    years.length ? `时间：${years.slice(0, 6).join('、')}` : '时间：题干未识别到明确年份，请回材料核对',
    units.length ? `单位：${units.slice(0, 8).join('、')}` : '单位：请从表头、图例或文字末尾补齐',
    `已识别数值 ${numbers.length} 个：${numbers.slice(0, 10).join('、') || '无'}`,
  ];
  return `${parts.join('；')}。找数顺序：先看问题 → 锁定主体 → 核对时间 → 提取数据。`;
}

export function analyzeDataQuestion(questionText: string, userAnswer = '', correctAnswer = ''): AnalysisCoachResult {
  const question = clean(questionText);
  const rule = selectRule(question);
  const answerReview = userAnswer || correctAnswer
    ? `你的答案：${userAnswer || '未填写'}；参考答案：${correctAnswer || '未填写'}。${userAnswer && correctAnswer ? (clean(userAnswer) === clean(correctAnswer) ? '答案一致，复盘重点放在是否有多算步骤。' : '答案不一致，先检查找数口径，再检查公式和估算方向。') : '补齐参考答案后，可进一步核对结果。'}`
    : '尚未填写你的答案或参考答案。本次先生成方法复盘，做完题后可补充答案再次分析。';
  return {
    categoryKey: rule.key,
    categoryLabel: rule.label,
    sections: [
      { title: '题型识别', content: `识别为「${rule.label}」。先把题目翻译为基础数量关系，不额外背孤立公式。` },
      { title: '找数检查', content: dataAudit(question) },
      { title: '核心关系', content: rule.relation },
      { title: '最短路径', content: `${rule.route} 做一步就回看一次选项，能排除就停止。` },
      { title: '估算策略', content: `${rule.estimate} 目标不是得到绝对精确值，而是锁定不会错的区间。` },
      { title: '易错复盘', content: `${rule.traps} 最后统一核对五类坑：时间、单位、主体、口径、表述。${answerReview}` },
    ],
  };
}

export const ANALYSIS_RULE_LABELS = RULES.map(({ key, label }) => ({ key, label }));

import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourceDir = process.env.PEI_PEI_SHUA_BANK
  ? resolve(process.env.PEI_PEI_SHUA_BANK)
  : resolve(scriptDir, '../../../Pei-Pei-Shua/app/src/main/assets/bank');
const outputPath = resolve(scriptDir, '../src/data/analysis-question-bank.json');
const metaPath = resolve(scriptDir, '../src/data/analysis-question-bank-meta.json');
const categoryPriority = [
  '基期与现期',
  '增长率',
  '增长量',
  '倍数与比值相关',
  '比重问题',
  '平均数问题',
  '简单计算',
  '综合分析',
  '文字资料',
  '统计表',
  '统计图',
  '综合资料',
];

function jsonLines(path) {
  return createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
}

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const modules = JSON.parse(readFileSync(resolve(sourceDir, 'ai_assistant_modules.json'), 'utf8'));
const analysisRoot = modules.find((module) => module.name === '资料分析' && !module.parent_id);
if (!analysisRoot) throw new Error('未找到资料分析根模块');
const analysisModules = modules.filter((module) => module.parent_id === analysisRoot.id);
const categoryByModule = new Map(analysisModules.map((module) => [module.id, module.name]));
const moduleIds = [...categoryByModule.keys()];
const materials = new Map();

for await (const line of jsonLines(resolve(sourceDir, 'ai_assistant_materials.jsonl'))) {
  if (!line.trim()) continue;
  const material = JSON.parse(line);
  materials.set(material.id, material.content || '');
}

const questions = new Map();
for await (const line of jsonLines(resolve(sourceDir, 'ai_assistant_questions.jsonl'))) {
  if (!moduleIds.some((id) => line.includes(id))) continue;
  const source = JSON.parse(line);
  const category = categoryByModule.get(source.module_id);
  if (!category) continue;
  const existing = questions.get(source.id);
  if (existing) {
    if (existing.stem !== (source.stem || '') || existing.answer !== (source.answer || '') || existing.analysis !== (source.analysis || '')) {
      throw new Error(`重复题目内容不一致：${source.id}`);
    }
    if (!existing.categories.includes(category)) existing.categories.push(category);
    continue;
  }
  const sourceOptions = parseArray(source.options);
  questions.set(source.id, {
    id: source.id,
    category,
    categories: [category],
    stem: source.stem || '',
    options: sourceOptions.map((option) => option.text || ''),
    optionImages: sourceOptions.map((option) => Array.isArray(option.images) ? option.images : []),
    answer: source.answer || '',
    material: materials.get(source.material_id) || '',
    analysis: source.analysis || '',
    knowledgePoint: source.knowledge_point || '',
    source: source.source || '',
    difficulty: source.difficulty || 'medium',
    titleImages: parseArray(source.title_images),
  });
}

const output = [...questions.values()].map((question) => {
  question.categories.sort((a, b) => categoryPriority.indexOf(a) - categoryPriority.indexOf(b));
  question.category = question.categories[0];
  return question;
}).sort((a, b) => {
  const categoryOrder = categoryPriority.indexOf(a.category) - categoryPriority.indexOf(b.category);
  return categoryOrder || a.source.localeCompare(b.source, 'zh-CN') || a.id.localeCompare(b.id);
});

const invalid = output.filter((question) => (
  !question.id
  || !question.stem.trim()
  || !/^[A-D]$/.test(question.answer)
  || !question.analysis.trim()
  || question.options.length !== question.optionImages.length
));
if (invalid.length) throw new Error(`题库完整性校验失败：${invalid.length} 道题不完整`);

writeFileSync(outputPath, `${JSON.stringify(output)}\n`, 'utf8');
writeFileSync(metaPath, `${JSON.stringify({ count: output.length, categories: categoryPriority })}\n`, 'utf8');
console.log(`已导入 ${output.length} 道资料分析题，覆盖 ${analysisModules.length} 个分类。`);

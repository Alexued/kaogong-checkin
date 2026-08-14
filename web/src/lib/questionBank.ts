import bankMeta from '../data/analysis-question-bank-meta.json';

export interface AnalysisBankQuestion {
  id: string;
  category: string;
  categories: string[];
  stem: string;
  options: string[];
  optionImages: string[][];
  answer: string;
  material: string;
  analysis: string;
  knowledgePoint: string;
  source: string;
  difficulty: string;
  titleImages: string[];
}

let bank: AnalysisBankQuestion[] = [];
let bankById = new Map<string, AnalysisBankQuestion>();
let bankPromise: Promise<AnalysisBankQuestion[]> | null = null;

export const ANALYSIS_BANK_CATEGORIES = bankMeta.categories;
export const ANALYSIS_BANK_COUNT = bankMeta.count;

export function loadAnalysisQuestionBank(): Promise<AnalysisBankQuestion[]> {
  if (!bankPromise) {
    bankPromise = import('../data/analysis-question-bank.json').then((module) => {
      bank = module.default as AnalysisBankQuestion[];
      bankById = new Map(bank.map((question) => [question.id, question]));
      return bank;
    });
  }
  return bankPromise;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ').trim();
}

export function searchAnalysisQuestionBank(query: string, category = '', limit = 30): AnalysisBankQuestion[] {
  const terms = normalize(query).split(' ').filter(Boolean);
  return bank
    .filter((question) => !category || question.categories.includes(category))
    .filter((question) => {
      if (!terms.length) return true;
      const haystack = normalize(`${question.stem} ${question.material} ${question.source} ${question.knowledgePoint} ${question.options.join(' ')} ${question.analysis}`);
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, Math.max(1, limit));
}

export function analysisBankQuestion(id: string): AnalysisBankQuestion | undefined {
  return bankById.get(id);
}

export function questionBankText(question: AnalysisBankQuestion): string {
  const options = question.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join('\n');
  return [question.material, question.stem, options].filter(Boolean).join('\n\n');
}

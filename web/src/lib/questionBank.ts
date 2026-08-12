import questions from '../data/analysis-question-bank.json';

export interface AnalysisBankQuestion {
  id: string;
  category: string;
  stem: string;
  options: string[];
  answer: string;
  material: string;
  source: string;
  difficulty: string;
}

const BANK = questions as AnalysisBankQuestion[];

export const ANALYSIS_BANK_CATEGORIES = [...new Set(BANK.map((question) => question.category))];
export const ANALYSIS_BANK_COUNT = BANK.length;

function normalize(value: string): string {
  return value.toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ').trim();
}

export function searchAnalysisQuestionBank(query: string, category = '', limit = 30): AnalysisBankQuestion[] {
  const terms = normalize(query).split(' ').filter(Boolean);
  return BANK
    .filter((question) => !category || question.category === category)
    .filter((question) => {
      if (!terms.length) return true;
      const haystack = normalize(`${question.stem} ${question.material} ${question.source} ${question.options.join(' ')}`);
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, Math.max(1, limit));
}

export function questionBankText(question: AnalysisBankQuestion): string {
  const options = question.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join('\n');
  return [question.material, question.stem, options].filter(Boolean).join('\n\n');
}

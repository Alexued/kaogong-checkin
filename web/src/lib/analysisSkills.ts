import { analyzeDataQuestion, type AnalysisCoachResult } from './analysisCoach';

export interface AnalysisSkillProfile {
  id: string;
  name: string;
  shortName: string;
  description: string;
  status: 'available' | 'coming';
  analyze: (questionText: string, userAnswer?: string, correctAnswer?: string) => AnalysisCoachResult;
}

export const DEFAULT_ANALYSIS_SKILL_ID = 'chen-huaian';

export const ANALYSIS_SKILLS: AnalysisSkillProfile[] = [
  {
    id: DEFAULT_ANALYSIS_SKILL_ID,
    name: '陈怀安资料分析',
    shortName: '陈怀安',
    description: '关系识别、最短路径、百化分与选项估算',
    status: 'available',
    analyze: analyzeDataQuestion,
  },
  {
    id: 'future-teacher',
    name: '更多名师方法',
    shortName: '待接入',
    description: '后续名师 Skills 会在此独立接入，不影响已有复盘记录',
    status: 'coming',
    analyze: analyzeDataQuestion,
  },
];

export function availableAnalysisSkills(): AnalysisSkillProfile[] {
  return ANALYSIS_SKILLS.filter((profile) => profile.status === 'available');
}

export function analysisSkill(skillId?: string): AnalysisSkillProfile {
  return ANALYSIS_SKILLS.find((profile) => profile.id === skillId && profile.status === 'available')
    || ANALYSIS_SKILLS[0];
}

export function analyzeWithSkill(
  skillId: string,
  questionText: string,
  userAnswer = '',
  correctAnswer = '',
): AnalysisCoachResult {
  return analysisSkill(skillId).analyze(questionText, userAnswer, correctAnswer);
}

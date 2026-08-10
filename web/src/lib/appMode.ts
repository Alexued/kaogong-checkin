import type { AppMode, Settings } from '../types';

export interface AppModeCopy {
  label: string;
  navigationLabel: string;
  overviewTitle: string;
  overviewSubtitle: string;
  todayPlan: string;
  todaySection: string;
  markDate: string;
}

export const APP_MODE_COPY: Record<AppMode, AppModeCopy> = {
  exam: {
    label: '考公模式',
    navigationLabel: '背诵',
    overviewTitle: '学习概览',
    overviewSubtitle: '备考节奏与设备',
    todayPlan: '今天的备考计划',
    todaySection: '今日任务',
    markDate: '考试日',
  },
  general: {
    label: '通用模式',
    navigationLabel: '复盘',
    overviewTitle: '节律概览',
    overviewSubtitle: '生活节律与设备',
    todayPlan: '安排今天的节律',
    todaySection: '今日打卡',
    markDate: '重要日',
  },
};

export function effectivePlanEnd(settings: Pick<Settings, 'appMode' | 'planEndDate'>): string | null {
  return settings.appMode === 'exam' ? settings.planEndDate : null;
}

export function modeCopy(mode: AppMode): AppModeCopy {
  return APP_MODE_COPY[mode];
}

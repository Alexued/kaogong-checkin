import type {
  AnalysisReviewRecord,
  AppMode,
  Checkin,
  SpeedDrillRecord,
  Task,
  TimerRecord,
} from '../types';
import type { DayPlan, PlanItem } from './plan';

export interface DashboardTrack {
  id: 'track-a' | 'track-b';
  label: string;
  total: number;
  done: number;
  ratio: number;
  next?: PlanItem;
}

export interface DashboardSuggestion {
  eyebrow: string;
  title: string;
  detail: string;
  actionLabel: string;
  tone: 'warn' | 'accent' | 'done';
}

export interface CapabilityMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
  percent?: number;
}

function trackFor(mode: AppMode, task: Task): DashboardTrack['id'] {
  if (mode === 'general') return task.type === 'daily' ? 'track-b' : 'track-a';
  return /申论|作文|文章|贯彻|综合分析|提出对策/.test(task.title) ? 'track-b' : 'track-a';
}

export function buildDashboardTracks(plan: DayPlan, mode: AppMode): DashboardTrack[] {
  const tracks: DashboardTrack[] = mode === 'general'
    ? [
        { id: 'track-a', label: '行动', total: 0, done: 0, ratio: 0 },
        { id: 'track-b', label: '习惯', total: 0, done: 0, ratio: 0 },
      ]
    : [
        { id: 'track-a', label: '行测', total: 0, done: 0, ratio: 0 },
        { id: 'track-b', label: '申论', total: 0, done: 0, ratio: 0 },
      ];
  const items = [...plan.carried, ...plan.today];
  for (const item of items) {
    const track = tracks.find((candidate) => candidate.id === trackFor(mode, item.task));
    if (!track) continue;
    track.total += 1;
    if (item.done) track.done += 1;
    track.ratio += item.target > 0 ? Math.min(1, item.progress / item.target) : 0;
    if (!track.next && !item.done) track.next = item;
  }
  for (const track of tracks) track.ratio = track.total ? track.ratio / track.total : 0;
  return tracks;
}

export function buildDashboardSuggestion(
  plan: DayPlan,
  pendingReviewCount: number,
  mode: AppMode,
): DashboardSuggestion {
  const first = plan.carried[0] || plan.today.find((item) => !item.done);
  if (plan.carried.length) {
    return {
      eyebrow: mode === 'general' ? '先清理节律' : '先处理逾期',
      title: `把「${first?.task.title || '未完成事项'}」带回今天`,
      detail: `有 ${plan.carried.length} 项之前未完成，先完成最早的一项，今天会轻很多。`,
      actionLabel: '开始第一项',
      tone: 'warn',
    };
  }
  if (first) {
    return {
      eyebrow: mode === 'general' ? '格记建议' : '格记建议',
      title: `先完成「${first.task.title}」`,
      detail: mode === 'general' ? '从一个明确动作开始，完成后再决定是否继续。' : '先完成当前最靠前的一项，再根据状态调整后面的安排。',
      actionLabel: '开始第一项',
      tone: 'accent',
    };
  }
  if (pendingReviewCount > 0) {
    return {
      eyebrow: '格记建议',
      title: '把记录变成下一步',
      detail: `还有 ${pendingReviewCount} 条复盘记录，可以挑一条重新看方法和失误点。`,
      actionLabel: '去看复盘',
      tone: 'accent',
    };
  }
  return {
    eyebrow: '今日已安排',
    title: plan.today.length ? '今天的计划已经完成' : '给今天安排一个起点',
    detail: plan.today.length ? '保持这个节奏，明天继续从最小的一步开始。' : '新增一个任务或打卡项，格记会从今天开始记录。',
    actionLabel: plan.today.length ? '查看统计' : '添加一项',
    tone: plan.today.length ? 'done' : 'accent',
  };
}

export function focusMinutesForDay(timers: TimerRecord[], date: string): number {
  return Math.round(
    timers
      .filter((timer) => !timer.deleted && timer.date === date)
      .reduce((sum, timer) => sum + Math.max(0, Number(timer.durationMs) || 0), 0) / 60_000,
  );
}

function safeTarget(checkin: Checkin): number {
  return Number.isFinite(checkin.targetSnapshot) && checkin.targetSnapshot > 0
    ? checkin.targetSnapshot
    : 1;
}

export function buildCapabilityMetrics(input: {
  mode: AppMode;
  tasks: Task[];
  checkins: Checkin[];
  timers: TimerRecord[];
  speedDrills: SpeedDrillRecord[];
  analysisReviews: AnalysisReviewRecord[];
  today: string;
}): CapabilityMetric[] {
  const checkins = input.checkins.filter((checkin) => !checkin.deleted);
  const completed = checkins.filter((checkin) => checkin.progress >= safeTarget(checkin)).length;
  const activeTasks = input.tasks.filter((task) => !task.archived).length;
  const focusMinutes = focusMinutesForDay(input.timers, input.today);
  const drills = input.speedDrills.filter((drill) => !drill.deleted);
  const correct = drills.filter((drill) => drill.correct).length;
  const reviews = input.analysisReviews.filter((review) => !review.deleted).length;
  const taskLabel = input.mode === 'general' ? '行动完成' : '计划完成';
  const reviewLabel = input.mode === 'general' ? '复盘记录' : '待复盘';

  return [
    {
      id: 'completed',
      label: taskLabel,
      value: String(completed),
      detail: `共记录 ${checkins.length} 次`,
      percent: checkins.length ? Math.round((completed / checkins.length) * 100) : 0,
    },
    {
      id: 'focus',
      label: '今日专注',
      value: `${focusMinutes} 分钟`,
      detail: focusMinutes ? '计时与番茄钟均已计入' : '开始一次计时就会留下记录',
      percent: Math.min(100, Math.round((focusMinutes / 120) * 100)),
    },
    {
      id: 'accuracy',
      label: input.mode === 'general' ? '活跃项目' : '速算正确率',
      value: input.mode === 'general' ? String(activeTasks) : drills.length ? `${Math.round((correct / drills.length) * 100)}%` : '—',
      detail: input.mode === 'general' ? '未归档的打卡项' : drills.length ? `${drills.length} 道速算记录` : '完成一组速算后显示',
      ...(input.mode === 'exam' && drills.length ? { percent: Math.round((correct / drills.length) * 100) } : {}),
    },
    {
      id: 'reviews',
      label: reviewLabel,
      value: String(reviews),
      detail: input.mode === 'general' ? '用复盘保留行动经验' : '题目复盘会保留在本地',
    },
  ];
}

import type {
  AppState,
  Checkin,
  DrillRecord,
  FormulaDrillRecord,
  SpeedDrillRecord,
  AnalysisReviewRecord,
  Subtask,
  Task,
  TimerRecord,
} from '../types';
import { migrateLegacyToV3 } from './migrateV3';
import {
  validateDomainState,
  type DailyProgressV3,
  type DomainStateV3,
  type DrillAttemptV3,
} from './v3';

/** Convert the current v2 UI state into the canonical v3 domain model. */
export function toV3(state: AppState): DomainStateV3 {
  return migrateLegacyToV3(JSON.stringify(state)).state;
}

function legacyTask(task: DomainStateV3['tasks'][number]): Task {
  return {
    id: task.id,
    title: task.title,
    type: task.schedule.kind,
    endDate: task.schedule.endDate,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    archived: task.archivedAt !== null,
    order: task.order,
    target: task.completion.target,
    unit: task.completion.unit,
  };
}

function legacySubtasks(state: DomainStateV3): Subtask[] {
  const output: Subtask[] = [];
  for (const task of state.tasks) {
    if (task.deletedAt !== null) continue;
    for (const subtask of task.subtasks) {
      if (subtask.deletedAt !== null) continue;
      output.push({
        id: subtask.id,
        taskId: task.id,
        title: subtask.title,
        order: subtask.order,
        createdAt: subtask.createdAt,
        updatedAt: subtask.updatedAt,
      });
    }
  }
  return output;
}

function parentCheckin(progress: DailyProgressV3): Checkin {
  return {
    id: progress.id,
    taskId: progress.taskId,
    date: progress.date,
    createdAt: progress.createdAt,
    updatedAt: progress.updatedAt,
    deleted: progress.deletedAt !== null || progress.completed === 0,
    progress: progress.completed,
    targetSnapshot: progress.targetSnapshot,
    unitSnapshot: progress.unitSnapshot,
  };
}

function subtaskCheckinId(progressId: string, subtaskId: string): string {
  return `v3-sub:${progressId.length}:${progressId}${subtaskId}`;
}

function legacyCheckins(state: DomainStateV3, visibleSubtaskIds: Set<string>): Checkin[] {
  const output: Checkin[] = [];
  for (const progress of state.dailyProgress) {
    output.push(parentCheckin(progress));
    for (const subtask of progress.subtaskSnapshot) {
      if (!subtask.done || !visibleSubtaskIds.has(subtask.id)) continue;
      output.push({
        id: subtaskCheckinId(progress.id, subtask.id),
        taskId: subtask.id,
        date: progress.date,
        createdAt: progress.createdAt,
        updatedAt: progress.updatedAt,
        deleted: false,
        progress: 1,
        targetSnapshot: 1,
        unitSnapshot: '',
      });
    }
  }
  return output;
}

function legacyTimer(timer: DomainStateV3['timerSessions'][number]): TimerRecord {
  return {
    id: timer.id,
    label: timer.label,
    taskId: timer.taskId,
    date: timer.date,
    startedAt: timer.startedAt,
    durationMs: timer.durationMs,
    laps: timer.laps.map((lap) => ({ ...lap })),
    createdAt: timer.createdAt,
    updatedAt: timer.updatedAt,
    deleted: timer.deletedAt !== null,
    mode: timer.mode,
  };
}

function legacyPercentAttempt(attempt: DrillAttemptV3): DrillRecord {
  const percent = Number(attempt.catalogKey);
  if (!Number.isFinite(percent) || attempt.correct === null) {
    throw new Error('INVALID_PERCENT_ATTEMPT');
  }
  return {
    id: attempt.id,
    percent,
    userAnswer: attempt.answer ?? '',
    correct: attempt.correct,
    mode: attempt.mode,
    sessionId: attempt.sessionId,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
    deleted: attempt.deletedAt !== null,
  };
}

function legacyFormulaAttempt(attempt: DrillAttemptV3): FormulaDrillRecord {
  if (attempt.known === null) throw new Error('INVALID_FORMULA_ATTEMPT');
  return {
    id: attempt.id,
    formulaKey: attempt.catalogKey,
    known: attempt.known,
    mode: attempt.mode,
    sessionId: attempt.sessionId,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
    deleted: attempt.deletedAt !== null,
  };
}

function legacySpeedAttempt(attempt: DomainStateV3['speedAttempts'][number]): SpeedDrillRecord {
  return {
    id: attempt.id,
    categoryKey: attempt.categoryKey,
    categoryLabel: attempt.categoryLabel,
    difficulty: attempt.difficulty,
    prompt: attempt.prompt,
    expression: attempt.expression,
    correctAnswer: attempt.correctAnswer,
    userAnswer: attempt.userAnswer,
    correct: attempt.correct,
    elapsedMs: attempt.elapsedMs,
    sessionId: attempt.sessionId,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
    deleted: attempt.deletedAt !== null,
  };
}

function legacyAnalysisReview(review: DomainStateV3['analysisReviews'][number]): AnalysisReviewRecord {
  return {
    id: review.id,
    source: review.source,
    questionText: review.questionText,
    userAnswer: review.userAnswer,
    correctAnswer: review.correctAnswer,
    categoryKey: review.categoryKey,
    categoryLabel: review.categoryLabel,
    sections: review.sections.map((section) => ({ ...section })),
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    deleted: review.deletedAt !== null,
  };
}

/**
 * Project canonical v3 state into the collection shape consumed by the current UI.
 * Task/subtask tombstones stay hidden because the legacy shape has no tombstone field.
 */
export function fromV3(state: DomainStateV3): AppState {
  validateDomainState(state);
  const tasks = state.tasks.filter((task) => task.deletedAt === null).map(legacyTask);
  const subtasks = legacySubtasks(state);
  const visibleSubtaskIds = new Set(subtasks.map((subtask) => subtask.id));
  const drills: DrillRecord[] = [];
  const formulaDrills: FormulaDrillRecord[] = [];
  for (const attempt of state.drillAttempts) {
    if (attempt.kind === 'percent') drills.push(legacyPercentAttempt(attempt));
    else formulaDrills.push(legacyFormulaAttempt(attempt));
  }
  return {
    schemaVersion: 2,
    tasks,
    subtasks,
    checkins: legacyCheckins(state, visibleSubtaskIds),
    timers: state.timerSessions.map(legacyTimer),
    drills,
    formulaDrills,
    speedDrills: (state.speedAttempts || []).map(legacySpeedAttempt),
    analysisReviews: (state.analysisReviews || []).map(legacyAnalysisReview),
    settings: {
      appMode: state.settings.appMode,
      planEndDate: state.settings.planEndDate,
      theme: state.settings.theme,
      markDate: state.settings.markDate,
    },
  };
}

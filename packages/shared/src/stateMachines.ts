import type {
  AiReviewStatus,
  ExportStatus,
  HumanReviewStatus,
  SubmissionStatus,
  TaskStatus,
} from './statuses.ts';

import {
  AI_REVIEW_STATUS_LABELS,
  EXPORT_STATUS_LABELS,
  HUMAN_REVIEW_STATUS_LABELS,
  SUBMISSION_STATUS_LABELS,
  TASK_STATUS_LABELS,
} from './statuses.ts';

export type TransitionMap<TStatus extends string> = Readonly<
  Partial<Record<TStatus, readonly TStatus[]>>
>;

export const TASK_TRANSITIONS = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['PAUSED', 'ENDED'],
  PAUSED: ['PUBLISHED', 'ENDED'],
  ENDED: [],
} as const satisfies TransitionMap<TaskStatus>;

export const SUBMISSION_TRANSITIONS = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['AI_QUEUED'],
  AI_QUEUED: ['AI_REVIEWING'],
  AI_REVIEWING: ['AI_PASSED', 'AI_REJECTED', 'AI_MANUAL'],
  AI_PASSED: ['HUMAN_PENDING'],
  AI_REJECTED: ['NEEDS_REVISION'],
  AI_MANUAL: ['HUMAN_PENDING'],
  NEEDS_REVISION: ['SUBMITTED'],
  HUMAN_PENDING: ['RECHECK_REVIEWING'],
  RECHECK_REVIEWING: [
    'RECHECK_APPROVED',
    'RECHECK_REJECTED',
    'RECHECK_REVISED_APPROVED',
  ],
  RECHECK_APPROVED: ['FINAL_PENDING'],
  RECHECK_REJECTED: ['NEEDS_REVISION'],
  RECHECK_REVISED_APPROVED: ['FINAL_PENDING'],
  FINAL_PENDING: ['FINAL_REVIEWING'],
  FINAL_REVIEWING: ['FINAL_APPROVED', 'FINAL_REJECTED'],
  FINAL_APPROVED: [],
  FINAL_REJECTED: ['NEEDS_REVISION'],
} as const satisfies TransitionMap<SubmissionStatus>;

export const AI_REVIEW_TRANSITIONS = {
  QUEUED: ['RUNNING'],
  RUNNING: ['SUCCEEDED', 'FAILED_RETRYING', 'FAILED_FINAL', 'MANUAL_FALLBACK'],
  SUCCEEDED: [],
  FAILED_RETRYING: ['QUEUED'],
  FAILED_FINAL: ['MANUAL_FALLBACK'],
  MANUAL_FALLBACK: [],
} as const satisfies TransitionMap<AiReviewStatus>;

export const HUMAN_REVIEW_TRANSITIONS = {
  HUMAN_PENDING: ['RECHECK_REVIEWING'],
  RECHECK_REVIEWING: [
    'RECHECK_APPROVED',
    'RECHECK_REJECTED',
    'RECHECK_REVISED_APPROVED',
  ],
  RECHECK_APPROVED: ['FINAL_PENDING'],
  RECHECK_REJECTED: ['NEEDS_REVISION'],
  RECHECK_REVISED_APPROVED: ['FINAL_PENDING'],
  FINAL_PENDING: ['FINAL_REVIEWING'],
  FINAL_REVIEWING: ['FINAL_APPROVED', 'FINAL_REJECTED'],
  FINAL_APPROVED: [],
  FINAL_REJECTED: ['NEEDS_REVISION'],
  NEEDS_REVISION: [],
} as const satisfies TransitionMap<HumanReviewStatus>;

export const EXPORT_TRANSITIONS = {
  QUEUED: ['PROCESSING'],
  PROCESSING: ['SUCCEEDED', 'FAILED'],
  SUCCEEDED: [],
  FAILED: ['QUEUED'],
} as const satisfies TransitionMap<ExportStatus>;

function canTransition<TStatus extends string>(
  transitions: TransitionMap<TStatus>,
  from: TStatus,
  to: TStatus,
): boolean {
  return transitions[from]?.includes(to) ?? false;
}

function assertTransition<TStatus extends string>(
  transitions: TransitionMap<TStatus>,
  labels: Record<TStatus, string>,
  machineName: string,
  from: TStatus,
  to: TStatus,
): void {
  if (canTransition(transitions, from, to)) {
    return;
  }

  throw new Error(
    `${machineName}状态不能从 ${labels[from] ?? from} 流转到 ${
      labels[to] ?? to
    }`,
  );
}

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return canTransition(TASK_TRANSITIONS, from, to);
}

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  assertTransition(TASK_TRANSITIONS, TASK_STATUS_LABELS, '任务', from, to);
}

export function canTransitionSubmission(
  from: SubmissionStatus,
  to: SubmissionStatus,
): boolean {
  return canTransition(SUBMISSION_TRANSITIONS, from, to);
}

export function assertSubmissionTransition(
  from: SubmissionStatus,
  to: SubmissionStatus,
): void {
  assertTransition(
    SUBMISSION_TRANSITIONS,
    SUBMISSION_STATUS_LABELS,
    '提交',
    from,
    to,
  );
}

export function canTransitionAiReview(
  from: AiReviewStatus,
  to: AiReviewStatus,
): boolean {
  return canTransition(AI_REVIEW_TRANSITIONS, from, to);
}

export function assertAiReviewTransition(
  from: AiReviewStatus,
  to: AiReviewStatus,
): void {
  assertTransition(
    AI_REVIEW_TRANSITIONS,
    AI_REVIEW_STATUS_LABELS,
    'AI 审核',
    from,
    to,
  );
}

export function canTransitionHumanReview(
  from: HumanReviewStatus,
  to: HumanReviewStatus,
): boolean {
  return canTransition(HUMAN_REVIEW_TRANSITIONS, from, to);
}

export function assertHumanReviewTransition(
  from: HumanReviewStatus,
  to: HumanReviewStatus,
): void {
  assertTransition(
    HUMAN_REVIEW_TRANSITIONS,
    HUMAN_REVIEW_STATUS_LABELS,
    '人工审核',
    from,
    to,
  );
}

export function canTransitionExport(
  from: ExportStatus,
  to: ExportStatus,
): boolean {
  return canTransition(EXPORT_TRANSITIONS, from, to);
}

export function assertExportTransition(
  from: ExportStatus,
  to: ExportStatus,
): void {
  assertTransition(EXPORT_TRANSITIONS, EXPORT_STATUS_LABELS, '导出', from, to);
}

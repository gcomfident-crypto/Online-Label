export const REVIEW_STAGES = ['AI_PRECHECK', 'INITIAL', 'RECHECK', 'FINAL'] as const;
export type ReviewStage = (typeof REVIEW_STAGES)[number];

export const TASK_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  PAUSED: 'PAUSED',
  ENDED: 'ENDED',
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const TASK_STATUS_LABELS = {
  DRAFT: '草稿',
  PUBLISHED: '发布中',
  PAUSED: '已暂停',
  ENDED: '已结束',
} as const satisfies Record<TaskStatus, string>;

export const SUBMISSION_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  AI_QUEUED: 'AI_QUEUED',
  AI_REVIEWING: 'AI_REVIEWING',
  AI_PASSED: 'AI_PASSED',
  AI_REJECTED: 'AI_REJECTED',
  AI_MANUAL: 'AI_MANUAL',
  HUMAN_PENDING: 'HUMAN_PENDING',
  RECHECK_REVIEWING: 'RECHECK_REVIEWING',
  RECHECK_APPROVED: 'RECHECK_APPROVED',
  RECHECK_REJECTED: 'RECHECK_REJECTED',
  RECHECK_REVISED_APPROVED: 'RECHECK_REVISED_APPROVED',
  FINAL_PENDING: 'FINAL_PENDING',
  FINAL_REVIEWING: 'FINAL_REVIEWING',
  FINAL_APPROVED: 'FINAL_APPROVED',
  FINAL_REJECTED: 'FINAL_REJECTED',
  NEEDS_REVISION: 'NEEDS_REVISION',
} as const;

export type SubmissionStatus =
  (typeof SUBMISSION_STATUS)[keyof typeof SUBMISSION_STATUS];

export const SUBMISSION_STATUS_LABELS = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  AI_QUEUED: 'AI 预审排队中',
  AI_REVIEWING: 'AI 预审中',
  AI_PASSED: 'AI 预审通过',
  AI_REJECTED: 'AI 预审驳回',
  AI_MANUAL: 'AI 转人工',
  HUMAN_PENDING: '待人工复审',
  RECHECK_REVIEWING: '人工复审中',
  RECHECK_APPROVED: '复审通过',
  RECHECK_REJECTED: '复审打回',
  RECHECK_REVISED_APPROVED: '修订复审通过',
  FINAL_PENDING: '待终审',
  FINAL_REVIEWING: '终审中',
  FINAL_APPROVED: '终审通过',
  FINAL_REJECTED: '终审打回',
  NEEDS_REVISION: '已打回',
} as const satisfies Record<SubmissionStatus, string>;

export const AI_REVIEW_STATUS = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED_RETRYING: 'FAILED_RETRYING',
  FAILED_FINAL: 'FAILED_FINAL',
  MANUAL_FALLBACK: 'MANUAL_FALLBACK',
} as const;

export type AiReviewStatus =
  (typeof AI_REVIEW_STATUS)[keyof typeof AI_REVIEW_STATUS];

export const AI_REVIEW_STATUS_LABELS = {
  QUEUED: '等待 AI 预审',
  RUNNING: 'AI 预审中',
  SUCCEEDED: 'AI 预审通过',
  FAILED_RETRYING: 'AI 预审失败重试中',
  FAILED_FINAL: 'AI 预审终止',
  MANUAL_FALLBACK: '转人工处理',
} as const satisfies Record<AiReviewStatus, string>;

export const HUMAN_REVIEW_STATUS = {
  HUMAN_PENDING: 'HUMAN_PENDING',
  RECHECK_REVIEWING: 'RECHECK_REVIEWING',
  RECHECK_APPROVED: 'RECHECK_APPROVED',
  RECHECK_REJECTED: 'RECHECK_REJECTED',
  RECHECK_REVISED_APPROVED: 'RECHECK_REVISED_APPROVED',
  FINAL_PENDING: 'FINAL_PENDING',
  FINAL_REVIEWING: 'FINAL_REVIEWING',
  FINAL_APPROVED: 'FINAL_APPROVED',
  FINAL_REJECTED: 'FINAL_REJECTED',
  NEEDS_REVISION: 'NEEDS_REVISION',
} as const;

export type HumanReviewStatus =
  (typeof HUMAN_REVIEW_STATUS)[keyof typeof HUMAN_REVIEW_STATUS];

export const HUMAN_REVIEW_STATUS_LABELS = {
  HUMAN_PENDING: '待人工复审',
  RECHECK_REVIEWING: '人工复审中',
  RECHECK_APPROVED: '复审通过',
  RECHECK_REJECTED: '复审打回',
  RECHECK_REVISED_APPROVED: '修订复审通过',
  FINAL_PENDING: '待终审',
  FINAL_REVIEWING: '终审中',
  FINAL_APPROVED: '终审通过',
  FINAL_REJECTED: '终审打回',
  NEEDS_REVISION: '已打回',
} as const satisfies Record<HumanReviewStatus, string>;

export const FINAL_REVIEW_STATUS = {
  FINAL_PENDING: 'FINAL_PENDING',
  FINAL_REVIEWING: 'FINAL_REVIEWING',
  FINAL_APPROVED: 'FINAL_APPROVED',
  FINAL_REJECTED: 'FINAL_REJECTED',
  NEEDS_REVISION: 'NEEDS_REVISION',
} as const;

export type FinalReviewStatus =
  (typeof FINAL_REVIEW_STATUS)[keyof typeof FINAL_REVIEW_STATUS];

export const FINAL_REVIEW_STATUS_LABELS = {
  FINAL_PENDING: '待终审',
  FINAL_REVIEWING: '终审中',
  FINAL_APPROVED: '终审通过',
  FINAL_REJECTED: '终审打回',
  NEEDS_REVISION: '已打回',
} as const satisfies Record<FinalReviewStatus, string>;

export const EXPORT_STATUS = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const;

export type ExportStatus = (typeof EXPORT_STATUS)[keyof typeof EXPORT_STATUS];

export const EXPORT_STATUS_LABELS = {
  QUEUED: '等待导出',
  PROCESSING: '导出中',
  SUCCEEDED: '导出成功',
  FAILED: '导出失败',
} as const satisfies Record<ExportStatus, string>;

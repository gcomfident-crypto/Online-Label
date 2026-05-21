export const REVIEW_STAGES = ['AI_PRECHECK', 'INITIAL', 'RECHECK', 'FINAL'] as const;
export type ReviewStage = (typeof REVIEW_STAGES)[number];

export const TASK_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHING: 'PUBLISHING',
  PAUSED: 'PAUSED',
  ENDED: 'ENDED',
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const TASK_STATUS_LABELS = {
  DRAFT: '草稿',
  PUBLISHING: '发布中',
  PAUSED: '已暂停',
  ENDED: '已结束',
} as const satisfies Record<TaskStatus, string>;

export const SUBMISSION_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  RETURNED: 'RETURNED',
} as const;

export type SubmissionStatus =
  (typeof SUBMISSION_STATUS)[keyof typeof SUBMISSION_STATUS];

export const SUBMISSION_STATUS_LABELS = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  RETURNED: '已打回',
} as const satisfies Record<SubmissionStatus, string>;

export const AI_REVIEW_STATUS = {
  PENDING: 'PENDING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
} as const;

export type AiReviewStatus =
  (typeof AI_REVIEW_STATUS)[keyof typeof AI_REVIEW_STATUS];

export const AI_REVIEW_STATUS_LABELS = {
  PENDING: 'AI 预审中',
  PASSED: 'AI 预审通过',
  FAILED: 'AI 预审异常',
} as const satisfies Record<AiReviewStatus, string>;

export const HUMAN_REVIEW_STATUS = {
  PENDING: 'PENDING',
  PASSED: 'PASSED',
  RETURNED: 'RETURNED',
} as const;

export type HumanReviewStatus =
  (typeof HUMAN_REVIEW_STATUS)[keyof typeof HUMAN_REVIEW_STATUS];

export const HUMAN_REVIEW_STATUS_LABELS = {
  PENDING: '待人工复审',
  PASSED: '复审通过',
  RETURNED: '已打回',
} as const satisfies Record<HumanReviewStatus, string>;

export const FINAL_REVIEW_STATUS = {
  PENDING: 'PENDING',
  PASSED: 'PASSED',
  RETURNED: 'RETURNED',
} as const;

export type FinalReviewStatus =
  (typeof FINAL_REVIEW_STATUS)[keyof typeof FINAL_REVIEW_STATUS];

export const FINAL_REVIEW_STATUS_LABELS = {
  PENDING: '待终审',
  PASSED: '终审通过',
  RETURNED: '已打回',
} as const satisfies Record<FinalReviewStatus, string>;

export const EXPORT_STATUS = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const;

export type ExportStatus = (typeof EXPORT_STATUS)[keyof typeof EXPORT_STATUS];

export const EXPORT_STATUS_LABELS = {
  PENDING: '等待导出',
  RUNNING: '导出中',
  SUCCEEDED: '导出成功',
  FAILED: '导出失败',
} as const satisfies Record<ExportStatus, string>;

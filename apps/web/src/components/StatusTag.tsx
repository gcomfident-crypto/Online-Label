import {
  AI_REVIEW_STATUS_LABELS,
  EXPORT_STATUS_LABELS,
  FINAL_REVIEW_STATUS_LABELS,
  HUMAN_REVIEW_STATUS_LABELS,
  SUBMISSION_STATUS_LABELS,
  TASK_STATUS_LABELS,
  type AiReviewStatus,
  type ExportStatus,
  type FinalReviewStatus,
  type HumanReviewStatus,
  type SubmissionStatus,
  type TaskStatus,
} from '@labelhub/shared';

type StatusTone = 'neutral' | 'info' | 'approved' | 'danger' | 'warning';
type StatusTagSize = 'sm' | 'md';

type StatusTagProps =
  | { group: 'task'; status: TaskStatus; size?: StatusTagSize }
  | { group: 'submission'; status: SubmissionStatus; size?: StatusTagSize }
  | { group: 'aiReview'; status: AiReviewStatus; size?: StatusTagSize }
  | { group: 'humanReview'; status: HumanReviewStatus; size?: StatusTagSize }
  | { group: 'finalReview'; status: FinalReviewStatus; size?: StatusTagSize }
  | { group: 'export'; status: ExportStatus; size?: StatusTagSize };

const statusLabels = {
  task: TASK_STATUS_LABELS,
  submission: SUBMISSION_STATUS_LABELS,
  aiReview: AI_REVIEW_STATUS_LABELS,
  humanReview: HUMAN_REVIEW_STATUS_LABELS,
  finalReview: FINAL_REVIEW_STATUS_LABELS,
  export: EXPORT_STATUS_LABELS,
} as const;

const toneByStatus: Record<string, StatusTone> = {
  DRAFT: 'neutral',
  HUMAN_PENDING: 'neutral',
  FINAL_PENDING: 'neutral',
  QUEUED: 'info',
  SUBMITTED: 'info',
  PUBLISHED: 'info',
  AI_QUEUED: 'info',
  AI_REVIEWING: 'info',
  RECHECK_REVIEWING: 'info',
  FINAL_REVIEWING: 'info',
  RUNNING: 'info',
  PROCESSING: 'info',
  AI_PASSED: 'approved',
  RECHECK_APPROVED: 'approved',
  RECHECK_REVISED_APPROVED: 'approved',
  FINAL_APPROVED: 'approved',
  SUCCEEDED: 'approved',
  ENDED: 'approved',
  PAUSED: 'warning',
  AI_MANUAL: 'warning',
  MANUAL_FALLBACK: 'warning',
  FAILED_RETRYING: 'warning',
  AI_REJECTED: 'danger',
  RECHECK_REJECTED: 'danger',
  FINAL_REJECTED: 'danger',
  NEEDS_REVISION: 'danger',
  FAILED_FINAL: 'danger',
  FAILED: 'danger',
};

export const StatusTag = (props: StatusTagProps) => {
  const label = getStatusLabel(props);
  const tone = toneByStatus[props.status] ?? 'neutral';
  const size = props.size ?? 'md';

  return (
    <span
      className={`status-tag status-tag--${tone} status-tag--${size}`}
      data-status={props.status}
      data-tone={tone}
    >
      {label}
    </span>
  );
};

const getStatusLabel = (props: StatusTagProps) => {
  switch (props.group) {
    case 'task':
      return statusLabels.task[props.status];
    case 'submission':
      return statusLabels.submission[props.status];
    case 'aiReview':
      return statusLabels.aiReview[props.status];
    case 'humanReview':
      return statusLabels.humanReview[props.status];
    case 'finalReview':
      return statusLabels.finalReview[props.status];
    case 'export':
      return statusLabels.export[props.status];
  }
};

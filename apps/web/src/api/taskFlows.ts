import type { DatasetKind } from '@labelhub/shared';
import { requestApi } from './request';

export type TaskFlowStage =
  | 'LABELING'
  | 'AI_PRECHECK'
  | 'HUMAN_REVIEW'
  | 'LABELER_REVISION'
  | 'HUMAN_RE_REVIEW'
  | 'FINAL_COMPLETED';

export type TaskFlowAiStatus =
  | 'NOT_STARTED'
  | 'QUEUED'
  | 'RUNNING'
  | 'PASSED'
  | 'REJECTED'
  | 'SUCCEEDED'
  | 'FAILED';

export type TaskFlowReviewerStatus = 'NOT_STARTED' | 'PENDING' | 'PASSED' | 'REJECTED';
export type TaskFlowLabelerStatus = 'NOT_STARTED' | 'LOCKED' | 'NEEDS_REVISION' | 'REVISED' | 'NOT_REQUIRED';
export type TaskFlowFinalStatus = 'NOT_FINAL' | 'FINAL_APPROVED';

export type TaskFlowSummaryDto = {
  taskId: string;
  taskTitle: string;
  taskCreatedAt: string;
  templateName: string | null;
  templateVersion: string | null;
  ownerId: string | null;
  ownerName: string | null;
  round: number;
  currentStage: TaskFlowStage;
  totalItems: number;
  submittedItems: number;
  aiSummary: {
    pending: number;
    queued: number;
    running: number;
    passed: number;
    rejected: number;
    failed: number;
    completed: number;
  };
  reviewerSummary: {
    notStarted: number;
    pending: number;
    decided: number;
    passed: number;
    rejected: number;
  };
  labelerRevisionSummary: {
    notStarted: number;
    editable: number;
    locked: number;
    revised: number;
    notRequired: number;
  };
  finalSummary: {
    completed: number;
    notCompleted: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type TaskFlowReviewRecordDto = {
  id: string;
  stage: string;
  reviewerType: string;
  reviewerId: string | null;
  assignedReviewerId: string | null;
  decision: string | null;
  comment: string | null;
  scores: Record<string, unknown>;
  createdAt: string;
};

export type TaskFlowAiJobDto = {
  id: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  provider: string | null;
  model: string | null;
  lastError: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type TaskFlowItemDto = {
  index: number;
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: DatasetKind;
    rawData: Record<string, unknown>;
  };
  assignment: {
    id: string;
    assigneeId: string;
    assigneeName: string;
    status: string;
  } | null;
  submission: {
    id: string;
    status: string;
    round: number;
    answers: Record<string, unknown>;
    schemaVersion: string;
    submittedAt: string;
  } | null;
  aiStatus: TaskFlowAiStatus;
  aiDecision: 'pass' | 'reject' | null;
  reviewerStatus: TaskFlowReviewerStatus;
  reviewerDecision: 'pass' | 'reject' | null;
  labelerStatus: TaskFlowLabelerStatus;
  finalStatus: TaskFlowFinalStatus;
  aiReview: TaskFlowReviewRecordDto | null;
  humanReview: TaskFlowReviewRecordDto | null;
  latestAiJob: TaskFlowAiJobDto | null;
};

export type TaskFlowDetailDto = TaskFlowSummaryDto & {
  items: TaskFlowItemDto[];
};

export async function listTaskFlows(): Promise<TaskFlowSummaryDto[]> {
  return requestTaskFlowApi<TaskFlowSummaryDto[]>('/agent/task-flows', { method: 'GET' });
}

export async function getTaskFlow(taskId: string, input: { round?: number } = {}): Promise<TaskFlowDetailDto> {
  const searchParams = new URLSearchParams();
  if (input.round) {
    searchParams.set('round', input.round.toString());
  }
  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';

  return requestTaskFlowApi<TaskFlowDetailDto>(`/agent/task-flows/${encodeURIComponent(taskId)}${suffix}`, {
    method: 'GET',
  });
}

async function requestTaskFlowApi<TData>(path: string, init: RequestInit): Promise<TData> {
  return requestApi<TData>(path, init, '任务质检流水线接口请求失败，请稍后重试。');
}

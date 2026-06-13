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
export type TaskFlowActorRole = 'OWNER' | 'LABELER' | 'AI_AGENT' | 'REVIEWER';
export type TaskFlowLifecycleStepStatus = 'COMPLETED' | 'CURRENT' | 'PENDING' | 'ACTION_REQUIRED' | 'SKIPPED';
export type TaskFlowLifecycleStepDto = {
  key: 'OWNER_PUBLISHED' | 'LABELER_SUBMITTED' | 'AI_PRECHECK' | 'REVIEWER_CHECK' | 'TASK_COMPLETED';
  label: string;
  status: TaskFlowLifecycleStepStatus;
  actorRole: TaskFlowActorRole | null;
  actorName: string | null;
  occurredAt: string | null;
};

export type TaskFlowItemRefDto = {
  itemId: string;
  externalId: string;
  index: number;
};

export type TaskFlowRejectedItemRefDto = TaskFlowItemRefDto;

export type TaskFlowLogDto = {
  id: string;
  taskId: string;
  round: number;
  eventType:
    | 'OWNER_PUBLISHED'
    | 'LABELER_CLAIMED'
    | 'LABELER_SUBMITTED'
    | 'LABELER_RESUBMITTED'
    | 'AI_PRECHECK_STARTED'
    | 'AI_PRECHECK_COMPLETED'
    | 'AI_RECHECK_STARTED'
    | 'AI_RECHECK_COMPLETED'
    | 'REVIEWER_RECEIVED'
    | 'REVIEWER_CHECK_COMPLETED'
    | 'REVIEWER_REJECTED'
    | 'TASK_COMPLETED';
  actorRole: TaskFlowActorRole | null;
  actorName: string | null;
  occurredAt: string;
  message: string;
  itemRefs: TaskFlowItemRefDto[];
  rejectedItemRefs: TaskFlowRejectedItemRefDto[];
};

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
  lifecycleSteps: TaskFlowLifecycleStepDto[];
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
  reviewerName: string | null;
  assignedReviewerId: string | null;
  assignedReviewerName: string | null;
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

const TASK_FLOW_CACHE_TTL_MS = 20_000;
const TASK_FLOW_DETAIL_CACHE_TTL_MS = 60_000;
const TASK_FLOW_LOG_CACHE_TTL_MS = 30_000;

let taskFlowsCache: { data: TaskFlowSummaryDto[]; expiresAt: number } | null = null;
let taskFlowsRequest: Promise<TaskFlowSummaryDto[]> | null = null;
const taskFlowDetailCache = new Map<string, { data: TaskFlowDetailDto; expiresAt: number }>();
const taskFlowDetailRequests = new Map<string, Promise<TaskFlowDetailDto>>();
const taskFlowLogCache = new Map<string, { data: TaskFlowLogDto[]; expiresAt: number }>();
const taskFlowLogRequests = new Map<string, Promise<TaskFlowLogDto[]>>();

export async function listTaskFlows(): Promise<TaskFlowSummaryDto[]> {
  const cached = getCachedTaskFlows();
  if (cached) {
    return cached;
  }

  if (taskFlowsRequest) {
    return taskFlowsRequest;
  }

  taskFlowsRequest = requestTaskFlowApi<TaskFlowSummaryDto[]>('/agent/task-flows', { method: 'GET' })
    .then((data) => {
      taskFlowsCache = {
        data,
        expiresAt: Date.now() + TASK_FLOW_CACHE_TTL_MS,
      };

      return data;
    })
    .finally(() => {
      taskFlowsRequest = null;
    });

  return taskFlowsRequest;
}

export async function getTaskFlow(taskId: string, input: { round?: number } = {}): Promise<TaskFlowDetailDto> {
  const cached = getCachedTaskFlow(taskId, input);
  if (cached) {
    return cached;
  }

  const searchParams = new URLSearchParams();
  if (input.round) {
    searchParams.set('round', input.round.toString());
  }
  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';
  const cacheKey = taskFlowDetailCacheKey(taskId, input);
  const pendingRequest = taskFlowDetailRequests.get(cacheKey);
  if (pendingRequest) {
    return pendingRequest;
  }

  const request = requestTaskFlowApi<TaskFlowDetailDto>(`/agent/task-flows/${encodeURIComponent(taskId)}${suffix}`, {
    method: 'GET',
  })
    .then((data) => {
      taskFlowDetailCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + TASK_FLOW_DETAIL_CACHE_TTL_MS,
      });

      return data;
    })
    .finally(() => {
      taskFlowDetailRequests.delete(cacheKey);
    });
  taskFlowDetailRequests.set(cacheKey, request);

  return request;
}

export async function getTaskFlowLogs(taskId: string): Promise<TaskFlowLogDto[]> {
  const cached = getCachedTaskFlowLogs(taskId);
  if (cached) {
    return cached;
  }

  const pendingRequest = taskFlowLogRequests.get(taskId);
  if (pendingRequest) {
    return pendingRequest;
  }

  const request = requestTaskFlowApi<TaskFlowLogDto[]>(`/agent/task-flows/${encodeURIComponent(taskId)}/logs`, {
    method: 'GET',
  })
    .then((data) => {
      taskFlowLogCache.set(taskId, {
        data,
        expiresAt: Date.now() + TASK_FLOW_LOG_CACHE_TTL_MS,
      });

      return data;
    })
    .finally(() => {
      taskFlowLogRequests.delete(taskId);
    });
  taskFlowLogRequests.set(taskId, request);

  return request;
}

export function getCachedTaskFlows(): TaskFlowSummaryDto[] | null {
  if (!taskFlowsCache || taskFlowsCache.expiresAt <= Date.now()) {
    return null;
  }

  return taskFlowsCache.data;
}

export function getCachedTaskFlow(taskId: string, input: { round?: number } = {}): TaskFlowDetailDto | null {
  const cached = taskFlowDetailCache.get(taskFlowDetailCacheKey(taskId, input));
  if (!cached || cached.expiresAt <= Date.now()) {
    return null;
  }

  return cached.data;
}

export function getCachedTaskFlowLogs(taskId: string): TaskFlowLogDto[] | null {
  const cached = taskFlowLogCache.get(taskId);
  if (!cached || cached.expiresAt <= Date.now()) {
    return null;
  }

  return cached.data;
}

export function prefetchTaskFlows(): void {
  void listTaskFlows().catch(() => undefined);
}

export function prefetchTaskFlow(taskId: string, input: { round?: number } = {}): void {
  void getTaskFlow(taskId, input).catch(() => undefined);
}

export function clearTaskFlowCachesForTest(): void {
  taskFlowsCache = null;
  taskFlowsRequest = null;
  taskFlowDetailCache.clear();
  taskFlowDetailRequests.clear();
  taskFlowLogCache.clear();
  taskFlowLogRequests.clear();
}

function taskFlowDetailCacheKey(taskId: string, input: { round?: number }): string {
  return `${taskId}:${input.round ?? 'latest'}`;
}

async function requestTaskFlowApi<TData>(path: string, init: RequestInit): Promise<TData> {
  return requestApi<TData>(path, init, '任务质检流水线接口请求失败，请稍后重试。');
}

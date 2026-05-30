import type { DatasetKind } from '@labelhub/shared';
import { requestApi } from './request';

export type SubmissionDto = {
  id: string;
  assignmentId: string;
  status: string;
  round: number;
  answers: Record<string, unknown>;
  schemaVersion: string;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskSubmissionDto = {
  taskId: string;
  labelerId: string;
  submittedCount: number;
  submissions: SubmissionDto[];
};

export type LabelerSubmissionDto = {
  submissionId: string;
  assignmentId: string;
  taskId: string;
  taskTitle: string;
  taskItemId: string;
  externalId: string;
  datasetKind: DatasetKind;
  status: string;
  round: number;
  answers: Record<string, unknown>;
  submittedAt: string;
};

export type LabelerStatsDto = {
  labelerId: string;
  taskId?: string;
  totalAssignments: number;
  submittedCount: number;
  aiQueuedCount: number;
  approvedCount: number;
  rejectedCount: number;
  needsRevisionCount: number;
};

export type LabelerSubmissionQuery = {
  labelerId: string;
  taskId?: string;
  status?: string;
  datasetKind?: DatasetKind | 'ALL';
  itemId?: string;
};

export async function submitAssignment(input: {
  assignmentId: string;
  actorId?: string;
  answers: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<SubmissionDto> {
  return requestSubmissionApi<SubmissionDto>('/submissions', {
    method: 'POST',
    headers: input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : undefined,
    body: JSON.stringify(input),
  });
}

export async function submitTask(input: {
  taskId: string;
  labelerId: string;
  actorId?: string;
  currentAssignmentId?: string;
  currentAnswers?: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<TaskSubmissionDto> {
  return requestSubmissionApi<TaskSubmissionDto>('/submissions/task', {
    method: 'POST',
    headers: input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : undefined,
    body: JSON.stringify(input),
  });
}

export async function listLabelerSubmissions(
  query: LabelerSubmissionQuery,
): Promise<LabelerSubmissionDto[]> {
  const searchParams = new URLSearchParams();

  searchParams.set('labelerId', query.labelerId);
  if (query.taskId) {
    searchParams.set('taskId', query.taskId);
  }
  if (query.status) {
    searchParams.set('status', query.status);
  }
  if (query.datasetKind && query.datasetKind !== 'ALL') {
    searchParams.set('datasetKind', query.datasetKind);
  }
  if (query.itemId) {
    searchParams.set('itemId', query.itemId);
  }

  return requestSubmissionApi<LabelerSubmissionDto[]>(`/labeler/submissions?${searchParams.toString()}`, {
    method: 'GET',
  });
}

export async function getLabelerStats(input: {
  labelerId: string;
  taskId?: string;
}): Promise<LabelerStatsDto> {
  const searchParams = new URLSearchParams();
  searchParams.set('labelerId', input.labelerId);
  if (input.taskId) {
    searchParams.set('taskId', input.taskId);
  }

  return requestSubmissionApi<LabelerStatsDto>(`/labeler/stats?${searchParams.toString()}`, {
    method: 'GET',
  });
}

async function requestSubmissionApi<TData>(path: string, init: RequestInit): Promise<TData> {
  return requestApi<TData>(path, init, '提交接口请求失败，请稍后重试。');
}

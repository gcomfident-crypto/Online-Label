import type { DatasetKind, TaskStatus } from '@labelhub/shared';
import type { DatasetImportSummaryDto } from './datasets';
import { requestApi } from './request';

export type DistributionStrategy = 'FIRST_COME_FIRST_SERVE' | 'ASSIGNMENT' | 'QUOTA_RACE';

export type TaskWorkflowProgressEventType =
  | 'published'
  | 'claimed'
  | 'submitted'
  | 'ai_review_submitted'
  | 'ai_review_rejected'
  | 'ai_review_passed'
  | 'reviewer_final';

export type TaskWorkflowProgressEvent = {
  id: string;
  type: TaskWorkflowProgressEventType;
  actorName?: string | null;
  itemCount?: number | null;
  createdAt?: string | null;
  status?: 'completed' | 'current' | 'pending' | 'warning';
};

export type TaskDto = {
  id: string;
  title: string;
  description: string | null;
  richTextInstruction: string | null;
  tags: string[];
  rewardRule: string | null;
  rewardPerItem: number | null;
  perUserLimit: number | null;
  quota: number | null;
  deadline: string | null;
  distributionStrategy: DistributionStrategy;
  aiPreReviewEnabled: boolean;
  aiRuleName: string | null;
  status: TaskStatus;
  templateId: string;
  template: {
    id: string;
    name: string;
    datasetKind: DatasetKind;
    schemaVersion: string;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    version?: number;
  };
  createdById: string | null;
  itemCount: number;
  assignedItemCount?: number;
  submittedItemCount?: number;
  completedItemCount: number;
  exportableItemCount: number;
  workflowProgress?: TaskWorkflowProgressEvent[];
  datasetImportSummary?: DatasetImportSummaryDto | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskFormInput = {
  title: string;
  tags?: string[];
  rewardPerItem?: number | null;
  perUserLimit?: number | null;
  quota?: number | null;
  deadline?: string | null;
  distributionStrategy?: DistributionStrategy;
  aiPreReviewEnabled?: boolean;
  aiRuleName?: string | null;
  templateId: string;
};

export type TaskAuditLogDto = {
  taskId: string;
  fromStatus?: TaskStatus;
  toStatus: TaskStatus;
  actorId?: string;
  reason?: string;
  metadata?: unknown;
};

export type DeleteTaskResult = {
  id: string;
};

export async function listTasks(params: { ownerId?: string; status?: TaskStatus } = {}): Promise<TaskDto[]> {
  return requestTaskList('/tasks', params);
}

export async function listTaskSummaries(params: { ownerId?: string; status?: TaskStatus } = {}): Promise<TaskDto[]> {
  return requestTaskList('/tasks/summaries', params);
}

function requestTaskList(path: string, params: { ownerId?: string; status?: TaskStatus } = {}): Promise<TaskDto[]> {
  const searchParams = new URLSearchParams();

  if (params.ownerId) {
    searchParams.set('ownerId', params.ownerId);
  }

  if (params.status) {
    searchParams.set('status', params.status);
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';

  return requestTaskApi<TaskDto[]>(`${path}${suffix}`, { method: 'GET' });
}

export async function getTask(taskId: string): Promise<TaskDto> {
  return requestTaskApi<TaskDto>(`/tasks/${taskId}`, { method: 'GET' });
}

export async function createTask(input: TaskFormInput & { actorId: string }): Promise<TaskDto> {
  return requestTaskApi<TaskDto>('/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateTask(taskId: string, input: Partial<TaskFormInput>): Promise<TaskDto> {
  return requestTaskApi<TaskDto>(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function updateTaskStatus(
  taskId: string,
  input: { status: TaskStatus; actorId?: string; confirm?: boolean; reason?: string },
): Promise<TaskDto> {
  return requestTaskApi<TaskDto>(`/tasks/${taskId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteTask(taskId: string): Promise<DeleteTaskResult> {
  return requestTaskApi<DeleteTaskResult>(`/tasks/${taskId}`, { method: 'DELETE' });
}

export async function listTaskAuditLogs(taskId: string): Promise<TaskAuditLogDto[]> {
  return requestTaskApi<TaskAuditLogDto[]>(`/tasks/${taskId}/audit-logs`, { method: 'GET' });
}

async function requestTaskApi<TData>(path: string, init: RequestInit): Promise<TData> {
  return requestApi<TData>(path, init, '任务接口请求失败，请稍后重试。');
}

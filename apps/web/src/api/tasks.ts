import type { TaskStatus } from '@labelhub/shared';

export type DistributionStrategy = 'FIRST_COME_FIRST_SERVE' | 'ASSIGNMENT' | 'QUOTA_RACE';

export type TaskDto = {
  id: string;
  title: string;
  description: string | null;
  richTextInstruction: string | null;
  tags: string[];
  rewardRule: string | null;
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
    schemaVersion: string;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  };
  createdById: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskFormInput = {
  title: string;
  description?: string | null;
  richTextInstruction?: string | null;
  tags?: string[];
  rewardRule?: string | null;
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

type ApiEnvelope<TData> = {
  data: TData;
  error?: {
    message?: string;
  };
};

const apiBaseUrl = (): string => import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

export async function listTasks(params: { ownerId?: string; status?: TaskStatus } = {}): Promise<TaskDto[]> {
  const searchParams = new URLSearchParams();

  if (params.ownerId) {
    searchParams.set('ownerId', params.ownerId);
  }

  if (params.status) {
    searchParams.set('status', params.status);
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';

  return requestTaskApi<TaskDto[]>(`/tasks${suffix}`, { method: 'GET' });
}

export async function getTask(taskId: string): Promise<TaskDto> {
  return requestTaskApi<TaskDto>(`/tasks/${taskId}`, { method: 'GET' });
}

export async function createTask(input: TaskFormInput & { actorId?: string }): Promise<TaskDto> {
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

export async function listTaskAuditLogs(taskId: string): Promise<TaskAuditLogDto[]> {
  return requestTaskApi<TaskAuditLogDto[]>(`/tasks/${taskId}/audit-logs`, { method: 'GET' });
}

async function requestTaskApi<TData>(path: string, init: RequestInit): Promise<TData> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const envelope = (await response.json()) as ApiEnvelope<TData>;

  if (!response.ok) {
    throw new Error(envelope.error?.message ?? '任务接口请求失败，请稍后重试。');
  }

  return envelope.data;
}

import { requestApi } from './request';

export type TaskItemReportStatus = 'PENDING' | 'INVALIDATED' | 'REOPENED' | 'REJECTED';
export type ResolveTaskItemReportAction = 'invalidate' | 'reopen' | 'reject';

export type TaskItemReportDto = {
  id: string;
  taskId: string;
  taskItemId: string;
  assignmentId: string | null;
  reporterId: string | null;
  status: TaskItemReportStatus;
  reason: string;
  ownerComment: string | null;
  resolution: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  taskItem: {
    id: string;
    externalId: string;
    rawData: Record<string, unknown>;
    status: string;
  } | null;
  reporter: { id: string; name: string } | null;
  resolvedBy: { id: string; name: string } | null;
};

export async function reportTaskItem(input: {
  assignmentId: string;
  reporterId: string;
  reason: string;
}): Promise<TaskItemReportDto> {
  return requestTaskItemReportApi<TaskItemReportDto>(`/assignments/${input.assignmentId}/report`, {
    method: 'POST',
    body: JSON.stringify({
      reporterId: input.reporterId,
      reason: input.reason,
    }),
  });
}

export async function listTaskItemReports(input: {
  taskId: string;
  status?: TaskItemReportStatus;
}): Promise<TaskItemReportDto[]> {
  const searchParams = new URLSearchParams();
  if (input.status) {
    searchParams.set('status', input.status);
  }
  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';

  return requestTaskItemReportApi<TaskItemReportDto[]>(`/tasks/${input.taskId}/item-reports${suffix}`, {
    method: 'GET',
  });
}

export async function resolveTaskItemReport(input: {
  reportId: string;
  action: ResolveTaskItemReportAction;
  ownerId: string;
  ownerComment?: string;
  rawDataPatch?: Record<string, unknown>;
}): Promise<TaskItemReportDto> {
  return requestTaskItemReportApi<TaskItemReportDto>(`/task-item-reports/${input.reportId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({
      action: input.action,
      ownerId: input.ownerId,
      ownerComment: input.ownerComment,
      rawDataPatch: input.rawDataPatch,
    }),
  });
}

async function requestTaskItemReportApi<TData>(path: string, init: RequestInit): Promise<TData> {
  return requestApi<TData>(path, init, '题目上报接口请求失败，请稍后重试。');
}

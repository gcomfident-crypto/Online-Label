import type { DatasetKind } from '@labelhub/shared';
import { requestApi } from './request';

export type MarketClaimStatus = 'available' | 'claimed' | 'limited' | 'full' | 'expired';
export type AssignmentStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_RECHECK'
  | 'FINAL_PENDING'
  | 'FINAL_APPROVED'
  | 'NEEDS_REVISION'
  | 'CANCELLED';

export type MarketTaskDto = {
  id: string;
  title: string;
  description: string | null;
  ownerId: string | null;
  ownerName: string | null;
  tags: string[];
  rewardRule: string | null;
  perUserLimit: number | null;
  quota: number | null;
  deadline: string | null;
  datasetKind: DatasetKind;
  templateId: string;
  templateName: string;
  itemCount: number;
  assignedCount: number;
  claimedByMeCount: number;
  remainingCount: number;
  claimedByMe: boolean;
  claimStatus: MarketClaimStatus;
  previewItems: Array<{
    id: string;
    externalId: string;
    rawData: Record<string, unknown>;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type ClaimAssignmentDto = {
  assignmentId: string;
  taskId: string;
  taskItemId: string;
  labelerId: string;
  status: AssignmentStatus;
  claimedAt: string;
  claimedItemCount: number;
  claimedCount: number;
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: DatasetKind;
    rawData: Record<string, unknown>;
  };
};

export type LabelerAssignmentDto = {
  assignmentId: string;
  taskId: string;
  taskTitle: string;
  taskItemId: string;
  taskItemSortOrder: number;
  externalId: string;
  datasetKind: DatasetKind;
  status: AssignmentStatus;
  claimedAt: string;
  templateName: string;
  schemaVersion: string;
  latestSubmissionStatus: string | null;
  latestSubmittedAt: string | null;
  round: number;
};

type MarketTaskQuery = {
  keyword?: string;
  tag?: string;
  claimStatus?: MarketClaimStatus | 'ALL';
  labelerId?: string;
};

export async function listMarketTasks(query: MarketTaskQuery = {}): Promise<MarketTaskDto[]> {
  const searchParams = new URLSearchParams();

  if (query.keyword) {
    searchParams.set('keyword', query.keyword);
  }

  if (query.tag) {
    searchParams.set('tag', query.tag);
  }

  if (query.claimStatus && query.claimStatus !== 'ALL') {
    searchParams.set('claimStatus', query.claimStatus);
  }

  if (query.labelerId) {
    searchParams.set('labelerId', query.labelerId);
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';

  return requestAssignmentApi<MarketTaskDto[]>(`/labeler/tasks${suffix}`, { method: 'GET' });
}

export async function claimAssignment(input: {
  taskId: string;
  labelerId: string;
}): Promise<ClaimAssignmentDto> {
  return requestAssignmentApi<ClaimAssignmentDto>('/assignments/claim', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listLabelerAssignments(input: {
  labelerId: string;
  taskId?: string;
}): Promise<LabelerAssignmentDto[]> {
  const searchParams = new URLSearchParams();
  searchParams.set('labelerId', input.labelerId);

  if (input.taskId) {
    searchParams.set('taskId', input.taskId);
  }

  return requestAssignmentApi<LabelerAssignmentDto[]>(`/labeler/assignments?${searchParams.toString()}`, {
    method: 'GET',
  });
}

async function requestAssignmentApi<TData>(path: string, init: RequestInit): Promise<TData> {
  return requestApi<TData>(path, init, '领取任务接口请求失败，请稍后重试。');
}

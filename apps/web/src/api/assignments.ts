import type { DatasetKind } from '@labelhub/shared';

export type MarketClaimStatus = 'available' | 'claimed' | 'full' | 'expired';
export type AssignmentStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'CANCELLED';

export type MarketTaskDto = {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  rewardRule: string | null;
  quota: number | null;
  deadline: string | null;
  datasetKind: DatasetKind;
  templateId: string;
  templateName: string;
  itemCount: number;
  assignedCount: number;
  remainingCount: number;
  claimedByMe: boolean;
  claimStatus: MarketClaimStatus;
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
  claimedCount: number;
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: DatasetKind;
    rawData: Record<string, unknown>;
  };
};

type MarketTaskQuery = {
  keyword?: string;
  tag?: string;
  claimStatus?: MarketClaimStatus | 'ALL';
  labelerId?: string;
};

type ApiEnvelope<TData> = {
  data: TData;
  error?: {
    message?: string;
  };
};

const apiBaseUrl = (): string => import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

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

async function requestAssignmentApi<TData>(path: string, init: RequestInit): Promise<TData> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const envelope = (await response.json()) as ApiEnvelope<TData>;

  if (!response.ok) {
    throw new Error(envelope.error?.message ?? '领取任务接口请求失败，请稍后重试。');
  }

  return envelope.data;
}

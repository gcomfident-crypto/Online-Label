import type { DatasetKind, LabelHubSchema } from '@labelhub/shared';
import { requestApi } from './request';

export type AssignmentStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_RECHECK'
  | 'FINAL_PENDING'
  | 'FINAL_APPROVED'
  | 'NEEDS_REVISION'
  | 'CANCELLED';
export type TaskItemStatus = 'UNASSIGNED' | 'ASSIGNED' | 'COMPLETED';

export type DraftDto = {
  id: string;
  assignmentId: string;
  answers: Record<string, unknown>;
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkbenchDto = {
  assignment: {
    id: string;
    taskId: string;
    taskItemId: string;
    assigneeId: string;
    status: AssignmentStatus;
    claimedAt: string;
  };
  task: {
    id: string;
    title: string;
    description: string | null;
    richTextInstruction: string | null;
    tags: string[];
    rewardRule: string | null;
    quota: number | null;
    deadline: string | null;
    templateId: string;
    templateName: string;
    datasetKind: DatasetKind;
    schemaVersion: string;
    schema: LabelHubSchema;
  };
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: DatasetKind;
    rawData: Record<string, unknown>;
    status: TaskItemStatus;
    sortOrder: number;
  };
  draft: DraftDto | null;
  rejectionNotice: {
    submissionId: string;
    round: number;
    reason: string;
    createdAt: string;
  } | null;
  submissionHistory: Array<{
    id: string;
    status: string;
    round: number;
    answers: Record<string, unknown>;
    schemaVersion: string;
    submittedAt: string;
    reviewRecords: Array<{
      stage?: string;
      reviewerType?: string;
      assignedReviewerId?: string | null;
      decision: string | null;
      comment?: string | null;
      scores: Record<string, unknown>;
      createdAt: string;
    }>;
  }>;
};

export async function getAssignmentWorkbench(assignmentId: string): Promise<WorkbenchDto> {
  return requestDraftApi<WorkbenchDto>(`/assignments/${assignmentId}/workbench`, { method: 'GET' });
}

export async function getDraft(assignmentId: string): Promise<DraftDto | null> {
  return requestDraftApi<DraftDto | null>(`/drafts/${assignmentId}`, { method: 'GET' });
}

export async function saveDraft(
  assignmentId: string,
  input: { actorId?: string; answers: Record<string, unknown> },
): Promise<DraftDto> {
  return requestDraftApi<DraftDto>(`/drafts/${assignmentId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

async function requestDraftApi<TData>(path: string, init: RequestInit): Promise<TData> {
  return requestApi<TData>(path, init, '草稿接口请求失败，请稍后重试。');
}

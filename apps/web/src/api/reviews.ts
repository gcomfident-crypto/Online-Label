import type { DatasetKind, LabelHubSchema } from '@labelhub/shared';
import { requestApi } from './request';

export type ReviewQueueItemDto = {
  submissionId: string;
  assignmentId: string;
  taskId: string;
  taskTitle: string;
  taskItemId: string;
  externalId: string;
  datasetKind: DatasetKind;
  status: string;
  round: number;
  aiDecision: string | null;
  aiComment: string | null;
  aiScores: Record<string, unknown>;
  assignedReviewerId: string | null;
  submittedAt: string;
  updatedAt: string;
};

export type ReviewRecordDto = {
  id: string;
  submissionId: string;
  ruleId: string | null;
  stage: string;
  reviewerId: string | null;
  assignedReviewerId: string | null;
  reviewerType: string;
  scores: Record<string, unknown>;
  decision: string | null;
  comment: string | null;
  revisedAnswers: Record<string, unknown> | null;
  rawPrompt: string | null;
  rawOutput: string | null;
  structuredOutput: Record<string, unknown> | null;
  modelMetadata: Record<string, unknown> | null;
  retryCount: number;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReviewTimelineItemDto = {
  id: string;
  kind: 'audit' | 'review';
  label: string;
  actorId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type ReviewDetailDto = {
  submission: {
    id: string;
    assignmentId: string;
    status: string;
    round: number;
    answers: Record<string, unknown>;
    schemaVersion: string;
    submittedAt: string;
  };
  assignment: {
    id: string;
    assigneeId: string;
    status: string;
  };
  task: {
    id: string;
    title: string;
    datasetKind: DatasetKind;
    templateName: string;
    schema: LabelHubSchema | null;
  };
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: DatasetKind;
    rawData: Record<string, unknown>;
  };
  aiReview: ReviewRecordDto | null;
  humanReview: ReviewRecordDto | null;
  reviewRecords: ReviewRecordDto[];
  timeline: ReviewTimelineItemDto[];
};

export type SubmissionRoundDto = {
  submissionId: string;
  assignmentId: string;
  status: string;
  round: number;
  answers: Record<string, unknown>;
  schemaVersion: string;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type SubmissionFieldDiffDto = {
  fieldKey: string;
  type: 'added' | 'removed' | 'changed';
  before: unknown;
  after: unknown;
  addedItems?: unknown[];
  removedItems?: unknown[];
};

export type SubmissionDiffDto = {
  assignmentId: string;
  fromRound: number;
  toRound: number;
  fromSubmissionId: string;
  toSubmissionId: string;
  changes: SubmissionFieldDiffDto[];
};

export type BatchReviewResultDto = {
  processedCount: number;
  submissions: ReviewDetailDto[];
};

export async function listPendingReviews(input: { reviewerId?: string; aiDecision?: string } = {}): Promise<ReviewQueueItemDto[]> {
  const searchParams = new URLSearchParams();
  if (input.reviewerId) {
    searchParams.set('reviewerId', input.reviewerId);
  }
  if (input.aiDecision) {
    searchParams.set('aiDecision', input.aiDecision);
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';

  return requestReviewApi<ReviewQueueItemDto[]>(`/reviews/pending${suffix}`, { method: 'GET' });
}

export async function listReviewResults(input: { verdict?: string } = {}): Promise<ReviewQueueItemDto[]> {
  const searchParams = new URLSearchParams();
  if (input.verdict) {
    searchParams.set('verdict', input.verdict);
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';

  return requestReviewApi<ReviewQueueItemDto[]>(`/reviews/results${suffix}`, { method: 'GET' });
}

export async function listReviewRounds(assignmentId: string): Promise<SubmissionRoundDto[]> {
  return requestReviewApi<SubmissionRoundDto[]>(`/reviews/${assignmentId}/rounds`, { method: 'GET' });
}

export async function getReviewDiff(
  assignmentId: string,
  input: { fromRound: number; toRound: number },
): Promise<SubmissionDiffDto> {
  const searchParams = new URLSearchParams({
    fromRound: input.fromRound.toString(),
    toRound: input.toRound.toString(),
  });

  return requestReviewApi<SubmissionDiffDto>(`/reviews/${assignmentId}/diff?${searchParams.toString()}`, { method: 'GET' });
}

export async function getReview(submissionId: string): Promise<ReviewDetailDto> {
  return requestReviewApi<ReviewDetailDto>(`/reviews/${submissionId}`, { method: 'GET' });
}

export async function getReviewTimeline(submissionId: string): Promise<ReviewTimelineItemDto[]> {
  return requestReviewApi<ReviewTimelineItemDto[]>(`/reviews/${submissionId}/timeline`, { method: 'GET' });
}

export async function startReview(submissionId: string, input: { actorId?: string }): Promise<ReviewDetailDto> {
  return requestReviewApi<ReviewDetailDto>(`/reviews/${submissionId}/start`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function passReview(submissionId: string, input: { actorId?: string; comment?: string }): Promise<ReviewDetailDto> {
  return requestReviewApi<ReviewDetailDto>(`/reviews/${submissionId}/pass`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function rejectReview(submissionId: string, input: { actorId?: string; reason: string }): Promise<ReviewDetailDto> {
  return requestReviewApi<ReviewDetailDto>(`/reviews/${submissionId}/reject`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function reviseAndPassReview(
  submissionId: string,
  input: { actorId?: string; comment?: string; revisedAnswers: Record<string, unknown> },
): Promise<ReviewDetailDto> {
  return requestReviewApi<ReviewDetailDto>(`/reviews/${submissionId}/revise-and-pass`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function batchPassReviews(input: {
  actorId?: string;
  submissionIds: string[];
  comment?: string;
}): Promise<BatchReviewResultDto> {
  return requestReviewApi<BatchReviewResultDto>('/reviews/batch-pass', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function batchRejectReviews(input: {
  actorId?: string;
  submissionIds: string[];
  reason: string;
}): Promise<BatchReviewResultDto> {
  return requestReviewApi<BatchReviewResultDto>('/reviews/batch-reject', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function assignReviews(input: {
  actorId?: string;
  reviewerId: string;
  submissionIds: string[];
}): Promise<BatchReviewResultDto> {
  return requestReviewApi<BatchReviewResultDto>('/reviews/assign', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

async function requestReviewApi<TData>(path: string, init: RequestInit): Promise<TData> {
  return requestApi<TData>(path, init, '人工复审接口请求失败，请稍后重试。');
}

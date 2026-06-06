import type { AiReviewStatus, DatasetKind, LabelHubSchema } from '@labelhub/shared';
import { requestApi } from './request';

export type AiReviewJobDto = {
  id: string;
  submissionId: string;
  taskId: string;
  taskTitle: string;
  externalId: string;
  datasetKind: DatasetKind;
  submissionStatus: string;
  round: number;
  status: AiReviewStatus;
  attempts: number;
  maxAttempts: number;
  idempotencyKey: string;
  structuredOutputMode: string | null;
  provider: string | null;
  model: string | null;
  lastError: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type AiReviewBatchStatus = 'PENDING' | 'PASSED' | 'REJECTED' | 'FAILED';
export type AiReviewBatchDecision = 'pending' | 'pass' | 'reject' | 'failed';

export type AiReviewLogDto = {
  id: string;
  type: 'queue' | 'llm' | 'verdict' | 'audit' | 'error' | 'retry' | 'run';
  time: string;
  message: string;
};

export type AiReviewBatchDto = {
  batchId: string;
  displayId: string;
  taskId: string;
  taskTitle: string;
  taskCreatedAt: string | null;
  templateName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  labelerId: string | null;
  labelerName: string;
  submittedAt: string;
  itemCount: number;
  externalIds: string[];
  status: AiReviewBatchStatus;
  aggregateDecision: AiReviewBatchDecision;
  aggregateScore: number | null;
  failureReason: string | null;
  aiSuggestionLabel: string;
  templateVersion: string | null;
  provider: string | null;
  model: string | null;
  updatedAt: string;
};

export type AiReviewRecordDto = {
  id: string;
  ruleId: string | null;
  stage: string;
  reviewerType: string;
  scores: Record<string, unknown>;
  decision: string | null;
  comment: string | null;
  rawPrompt: string | null;
  rawOutput: string | null;
  structuredOutput: Record<string, unknown> | null;
  modelMetadata: Record<string, unknown> | null;
  retryCount: number;
  idempotencyKey: string | null;
  createdAt: string;
};

export type AiReviewFieldDto = {
  fieldKey: string;
  label: string;
  type: string;
  required: boolean;
  requirement: string;
};

export type AiReviewBatchItemDto = {
  index: number;
  job: AiReviewJobDto;
  submission: {
    id: string;
    assignmentId: string;
    status: string;
    round: number;
    answers: Record<string, unknown>;
    schemaVersion: string;
    submittedAt: string;
  };
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: DatasetKind;
    rawData: Record<string, unknown>;
  };
  reviewRecord: AiReviewRecordDto | null;
  reviewFields: AiReviewFieldDto[];
  decision: AiReviewBatchDecision;
  overallScore: number | null;
  logs: AiReviewLogDto[];
};

export type AiReviewBatchDetailDto = AiReviewBatchDto & {
  items: AiReviewBatchItemDto[];
};

export type AiReviewDetailDto = {
  submission: {
    id: string;
    assignmentId: string;
    status: string;
    round: number;
    answers: Record<string, unknown>;
    schemaVersion: string;
    submittedAt: string;
  };
  task: {
    id: string;
    title: string;
    datasetKind: DatasetKind;
    templateSchema: LabelHubSchema | null;
  };
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: DatasetKind;
    rawData: Record<string, unknown>;
  };
  reviewRecord: AiReviewRecordDto | null;
  jobs: AiReviewJobDto[];
};

export async function listAiReviewBatches(input: { status?: AiReviewBatchStatus } = {}): Promise<AiReviewBatchDto[]> {
  const searchParams = new URLSearchParams();
  if (input.status) {
    searchParams.set('status', input.status);
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';

  return requestAiReviewApi<AiReviewBatchDto[]>(`/ai-review/batches${suffix}`, { method: 'GET' });
}

export async function getAiReviewBatch(batchId: string): Promise<AiReviewBatchDetailDto> {
  return requestAiReviewApi<AiReviewBatchDetailDto>(`/ai-review/batches/${encodeURIComponent(batchId)}`, {
    method: 'GET',
  });
}

export async function listAiReviewJobs(input: { status?: AiReviewStatus } = {}): Promise<AiReviewJobDto[]> {
  const searchParams = new URLSearchParams();
  if (input.status) {
    searchParams.set('status', input.status);
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';

  return requestAiReviewApi<AiReviewJobDto[]>(`/ai-review/jobs${suffix}`, { method: 'GET' });
}

export async function retryAiReviewJob(jobId: string): Promise<AiReviewJobDto> {
  return requestAiReviewApi<AiReviewJobDto>(`/ai-review/jobs/${jobId}/retry`, { method: 'POST' });
}

export async function getSubmissionAiReview(submissionId: string): Promise<AiReviewDetailDto> {
  return requestAiReviewApi<AiReviewDetailDto>(`/submissions/${submissionId}/ai-review`, { method: 'GET' });
}

async function requestAiReviewApi<TData>(path: string, init: RequestInit): Promise<TData> {
  return requestApi<TData>(path, init, 'AI 预审接口请求失败，请稍后重试。');
}

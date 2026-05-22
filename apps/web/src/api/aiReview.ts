import type { AiReviewStatus, DatasetKind } from '@labelhub/shared';

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

type ApiEnvelope<TData> = {
  data: TData;
  error?: {
    message?: string;
  };
};

const apiBaseUrl = (): string => import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

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
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const envelope = (await response.json()) as ApiEnvelope<TData>;

  if (!response.ok) {
    throw new Error(envelope.error?.message ?? 'AI 预审接口请求失败，请稍后重试。');
  }

  return envelope.data;
}

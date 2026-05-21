export type ReviewDimensionDto = {
  key: string;
  label: string;
  maxScore: number;
};

export type ReviewRuleDto = {
  id: string;
  taskId: string;
  stage: 'AI_PRECHECK';
  name: string;
  promptTemplate: string;
  promptVersion: number;
  dimensions: ReviewDimensionDto[];
  dimensionVersion: number;
  passThreshold: number;
  manualThreshold: number;
  provider: string;
  model: string;
  temperature: number;
  structuredOutputMode: 'function_calling' | 'json_schema';
  enabled: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveReviewRuleInput = {
  name?: string;
  promptTemplate?: string;
  dimensions?: ReviewDimensionDto[];
  passThreshold?: number;
  manualThreshold?: number;
  provider?: string;
  model?: string;
  temperature?: number;
  actorId?: string;
};

type ApiEnvelope<TData> = {
  data: TData;
  error?: {
    message?: string;
  };
};

const apiBaseUrl = (): string => import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

export async function getReviewRule(taskId: string): Promise<ReviewRuleDto> {
  return requestReviewRuleApi<ReviewRuleDto>(`/tasks/${taskId}/review-rule`, { method: 'GET' });
}

export async function saveReviewRule(
  taskId: string,
  input: SaveReviewRuleInput,
): Promise<ReviewRuleDto> {
  return requestReviewRuleApi<ReviewRuleDto>(`/tasks/${taskId}/review-rule`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

async function requestReviewRuleApi<TData>(path: string, init: RequestInit): Promise<TData> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const envelope = (await response.json()) as ApiEnvelope<TData>;

  if (!response.ok) {
    throw new Error(envelope.error?.message ?? 'AI 规则接口请求失败，请稍后重试。');
  }

  return envelope.data;
}

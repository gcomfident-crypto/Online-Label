import type { ReviewStage } from './statuses.ts';

export const EXPORT_FORMATS = ['json', 'jsonl', 'csv', 'xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const LLM_PROVIDER_NAMES = [
  'openai',
  'deepseek',
  'anthropic',
  'azure_openai',
  'custom',
] as const;

export type LlmProviderName = (typeof LLM_PROVIDER_NAMES)[number];

export type AiReviewJobPayload = {
  taskId: string;
  submissionId: string;
  stage: ReviewStage;
  provider: LlmProviderName;
  model?: string;
  schemaVersion?: string;
};

export type ExportJobPayload = {
  taskId: string;
  requestedByUserId: string;
  format: ExportFormat;
  includeReviewResult?: boolean;
};

export type StructuredReviewResult = {
  passed: boolean;
  score?: number;
  stage: ReviewStage;
  reason?: string;
  labels?: readonly string[];
  details?: Record<string, unknown>;
};

export type DatasetKind = 'qa_quality' | 'preference_compare' | 'generic_json';

export type StructuredOutputMode = 'function_calling' | 'json_schema';

export type LlmReviewVerdict = 'pass' | 'reject' | 'manual';

export type LlmReviewInput = {
  datasetKind: DatasetKind;
  rawPrompt: string;
  rawData: Record<string, unknown>;
  answers: Record<string, unknown>;
  structuredOutputMode: StructuredOutputMode;
};

export type LlmReviewResult = {
  verdict: LlmReviewVerdict;
  scores: Record<string, number>;
  reason: string;
  suggestions: string[];
  rawOutput: string;
  structuredOutput: Record<string, unknown>;
  modelMetadata: Record<string, unknown>;
};

export type LlmProviderCapabilities = {
  supportsFunctionCalling: boolean;
  supportsJsonSchemaOutput: boolean;
};

export type LlmProvider = {
  capabilities: LlmProviderCapabilities;
  review(input: LlmReviewInput): Promise<LlmReviewResult>;
};

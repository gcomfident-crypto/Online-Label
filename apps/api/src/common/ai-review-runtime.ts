export const DEFAULT_AI_REVIEW_PROVIDER = 'deepseek';
export const DEFAULT_AI_REVIEW_MODEL = 'deepseek-chat';
export const DEFAULT_AI_REVIEW_STRUCTURED_OUTPUT_MODE = 'json_schema';

export type AiReviewRuntimeConfig = {
  provider: string;
  model: string;
  structuredOutputMode: typeof DEFAULT_AI_REVIEW_STRUCTURED_OUTPUT_MODE;
};

export function normalizeAiReviewProvider(provider: string): string {
  const normalized = provider.trim().toLowerCase();

  return normalized === 'openai-compatible' ? 'custom' : normalized;
}

export function resolveAiReviewRuntimeConfig(env: NodeJS.ProcessEnv = process.env): AiReviewRuntimeConfig {
  const provider = resolveAiReviewRuntimeProvider(env);

  return {
    provider,
    model: resolveAiReviewRuntimeModel(provider, env),
    structuredOutputMode: DEFAULT_AI_REVIEW_STRUCTURED_OUTPUT_MODE,
  };
}

export function resolveAiReviewRuntimeProvider(env: NodeJS.ProcessEnv = process.env): string {
  const configuredProvider = normalizeAiReviewProvider(
    env.AI_REVIEW_PROVIDER?.trim() || env.LLM_PROVIDER?.trim() || '',
  );

  if (configuredProvider && configuredProvider !== 'mock') {
    return configuredProvider;
  }

  if (hasUsableSecret(env.DEEPSEEK_API_KEY, 'replace_with_deepseek_api_key')) {
    return 'deepseek';
  }

  if (hasUsableSecret(env.OPENAI_API_KEY)) {
    return 'openai';
  }

  if (hasUsableSecret(env.LLM_API_KEY) && hasUsableSecret(env.LLM_API_BASE_URL)) {
    return 'custom';
  }

  return DEFAULT_AI_REVIEW_PROVIDER;
}

export function resolveAiReviewRuntimeModel(
  provider: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configuredModel = env.AI_REVIEW_MODEL?.trim() || env.LLM_MODEL?.trim();

  if (configuredModel) {
    return configuredModel;
  }

  const normalizedProvider = normalizeAiReviewProvider(provider);

  if (normalizedProvider === 'openai') {
    return 'gpt-4o-mini';
  }

  if (normalizedProvider === 'custom') {
    return 'custom-ai-reviewer';
  }

  return DEFAULT_AI_REVIEW_MODEL;
}

function hasUsableSecret(value: unknown, placeholder?: string): boolean {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  return Boolean(trimmed) && trimmed !== placeholder;
}

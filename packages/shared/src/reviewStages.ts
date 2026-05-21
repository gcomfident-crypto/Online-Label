import { REVIEW_STAGES, type ReviewStage } from './statuses.ts';

export type ConfigurableReviewStage = Exclude<ReviewStage, 'AI_PRECHECK'>;

export const REVIEW_STAGE_CONFIG_OPTIONS = ['INITIAL', 'RECHECK', 'FINAL'] as const satisfies readonly ConfigurableReviewStage[];

export const DEFAULT_REVIEW_STAGE_CONFIG = ['RECHECK', 'FINAL'] as const satisfies readonly ConfigurableReviewStage[];

export const FULL_REVIEW_STAGE_CONFIG = ['INITIAL', 'RECHECK', 'FINAL'] as const satisfies readonly ConfigurableReviewStage[];

export const REVIEW_STAGE_CONFIG_LABELS = {
  INITIAL: '初审',
  RECHECK: '复审',
  FINAL: '终审',
} as const satisfies Record<ConfigurableReviewStage, string>;

export function normalizeReviewStageConfig(value: unknown): ConfigurableReviewStage[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_REVIEW_STAGE_CONFIG];
  }

  const stages = value.filter(isConfigurableReviewStage);
  if (stages.includes('INITIAL')) {
    return [...FULL_REVIEW_STAGE_CONFIG];
  }

  return [...DEFAULT_REVIEW_STAGE_CONFIG];
}

export function isConfigurableReviewStage(value: unknown): value is ConfigurableReviewStage {
  return typeof value === 'string' && REVIEW_STAGES.includes(value as ReviewStage) && value !== 'AI_PRECHECK';
}

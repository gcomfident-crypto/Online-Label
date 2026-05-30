import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REVIEW_STAGE_CONFIG,
  FULL_REVIEW_STAGE_CONFIG,
  REVIEW_STAGE_CONFIG_LABELS,
  normalizeReviewStageConfig,
} from './reviewStages.ts';

describe('审核阶段配置协议', () => {
  it('默认只启用复审，启用初审时补齐初审和复审链路', () => {
    expect(DEFAULT_REVIEW_STAGE_CONFIG).toEqual(['RECHECK']);
    expect(FULL_REVIEW_STAGE_CONFIG).toEqual(['INITIAL', 'RECHECK']);
    expect(REVIEW_STAGE_CONFIG_LABELS).toEqual({
      INITIAL: '初审',
      RECHECK: '复审',
    });
    expect(normalizeReviewStageConfig(undefined)).toEqual(['RECHECK']);
    expect(normalizeReviewStageConfig(['FINAL', 'RECHECK'])).toEqual(['RECHECK']);
    expect(normalizeReviewStageConfig(['INITIAL'])).toEqual(['INITIAL', 'RECHECK']);
  });
});

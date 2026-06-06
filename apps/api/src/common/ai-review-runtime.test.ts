import { describe, expect, it } from 'vitest';

import { resolveConfiguredAiReviewRuntimeConfig } from './ai-review-runtime.ts';

describe('resolveConfiguredAiReviewRuntimeConfig', () => {
  it('没有可用密钥时返回 null', () => {
    expect(resolveConfiguredAiReviewRuntimeConfig({})).toBeNull();
    expect(
      resolveConfiguredAiReviewRuntimeConfig({
        DEEPSEEK_API_KEY: 'replace_with_deepseek_api_key',
      }),
    ).toBeNull();
  });

  it('显式配置 provider 但缺少对应密钥时返回 null', () => {
    expect(
      resolveConfiguredAiReviewRuntimeConfig({
        AI_REVIEW_PROVIDER: 'deepseek',
        OPENAI_API_KEY: 'sk-test',
      }),
    ).toBeNull();
  });

  it('从 DeepSeek 密钥解析可执行配置', () => {
    expect(
      resolveConfiguredAiReviewRuntimeConfig({
        DEEPSEEK_API_KEY: 'test-deepseek-key',
      }),
    ).toEqual({
      provider: 'deepseek',
      model: 'deepseek-chat',
      structuredOutputMode: 'json_schema',
    });
  });

  it('从 OpenAI 密钥解析可执行配置', () => {
    expect(
      resolveConfiguredAiReviewRuntimeConfig({
        OPENAI_API_KEY: 'sk-test',
      }),
    ).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      structuredOutputMode: 'json_schema',
    });
  });

  it('从自定义 OpenAI-compatible 配置解析可执行配置', () => {
    expect(
      resolveConfiguredAiReviewRuntimeConfig({
        LLM_PROVIDER: 'openai-compatible',
        LLM_API_KEY: 'custom-key',
        LLM_API_BASE_URL: 'https://example.com/v1',
        LLM_MODEL: 'custom-reviewer',
      }),
    ).toEqual({
      provider: 'custom',
      model: 'custom-reviewer',
      structuredOutputMode: 'json_schema',
    });
  });
});

import { describe, expect, it } from 'vitest';

import { MockLlmProvider } from './MockLlmProvider.ts';

describe('MockLlmProvider', () => {
  it('对 qa_quality 稳定返回通过评分', async () => {
    const provider = new MockLlmProvider();

    const result = await provider.review({
      datasetKind: 'qa_quality',
      rawPrompt: 'prompt',
      rawData: { expected_dimensions: ['事实性'] },
      answers: { quality: 'pass' },
      structuredOutputMode: 'function_calling',
    });

    expect(result.verdict).toBe('pass');
    expect(result.scores).toEqual(
      expect.objectContaining({
        relevance: 92,
        accuracy: 88,
        overall: 90,
      }),
    );
    expect(result.modelMetadata).toEqual(
      expect.objectContaining({
        provider: 'mock',
        model: 'mock-stable-reviewer',
        structuredOutputMode: 'function_calling',
      }),
    );
  });

  it('安全风险和人工标记都返回 reject', async () => {
    const provider = new MockLlmProvider();

    await expect(
      provider.review({
        datasetKind: 'preference_compare',
        rawPrompt: 'prompt',
        rawData: { safety_flag: true },
        answers: { preferred: 'A' },
        structuredOutputMode: 'function_calling',
      }),
    ).resolves.toMatchObject({ verdict: 'reject' });
    await expect(
      provider.review({
        datasetKind: 'qa_quality',
        rawPrompt: 'prompt',
        rawData: {},
        answers: { manual_review: true },
        structuredOutputMode: 'function_calling',
      }),
    ).resolves.toMatchObject({ verdict: 'reject' });
  });
});

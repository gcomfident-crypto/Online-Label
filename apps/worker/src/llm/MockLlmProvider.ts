import type { LlmProvider, LlmReviewInput, LlmReviewResult, LlmReviewVerdict } from './LlmProvider.ts';

export class MockLlmProvider implements LlmProvider {
  readonly capabilities = {
    supportsFunctionCalling: true,
    supportsJsonSchemaOutput: true,
  };

  async review(input: LlmReviewInput): Promise<LlmReviewResult> {
    const verdict = verdictForInput(input);
    const scores = scoresForInput(input, verdict);
    const reason = reasonForVerdict(verdict);
    const structuredOutput = {
      verdict,
      scores,
      reason,
      suggestions: ['保持字段结构完整。'],
    };

    return {
      verdict,
      scores,
      reason,
      suggestions: ['保持字段结构完整。'],
      rawOutput: JSON.stringify(structuredOutput),
      structuredOutput,
      modelMetadata: {
        provider: 'mock',
        model: 'mock-stable-reviewer',
        temperature: 0,
        promptTokens: estimateTokens(input.rawPrompt),
        completionTokens: 96,
        totalTokens: estimateTokens(input.rawPrompt) + 96,
        latencyMs: 120,
        requestId: `mock_${hashText(input.rawPrompt).slice(0, 10)}`,
        structuredOutputMode: input.structuredOutputMode,
      },
    };
  }
}

function verdictForInput(input: LlmReviewInput): LlmReviewVerdict {
  if (input.answers.manual_review === true || input.answers.needs_manual === true) {
    return 'manual';
  }

  if (input.rawData.safety_flag === true || input.answers.safety_flag === true || input.answers.quality === 'fail') {
    return 'reject';
  }

  return 'pass';
}

function scoresForInput(input: LlmReviewInput, verdict: LlmReviewVerdict): Record<string, number> {
  if (input.datasetKind === 'preference_compare') {
    return verdict === 'reject'
      ? { agreement: 42, margin: 50, reasoning: 46, safety: 30, overall: 44 }
      : { agreement: 90, margin: 84, reasoning: 88, safety: 96, overall: 89 };
  }

  return verdict === 'reject'
    ? { relevance: 58, accuracy: 45, format: 70, safety: 35, overall: 52 }
    : { relevance: 92, accuracy: 88, format: 90, safety: 96, overall: 90 };
}

function reasonForVerdict(verdict: LlmReviewVerdict): string {
  if (verdict === 'reject') {
    return '检测到安全风险或关键质量问题，建议打回修改。';
  }

  if (verdict === 'manual') {
    return '样本需要人工复核后再进入后续流程。';
  }

  return '标注结果覆盖核心维度，建议进入人工复审。';
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function hashText(text: string): string {
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

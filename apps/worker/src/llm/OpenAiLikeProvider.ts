import type { LlmProvider, LlmReviewInput, LlmReviewResult } from './LlmProvider.ts';

type OpenAiLikeProviderOptions = {
  provider: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  fetchImpl?: typeof fetch;
};

export class OpenAiLikeProvider implements LlmProvider {
  readonly capabilities = {
    supportsFunctionCalling: true,
    supportsJsonSchemaOutput: true,
  };

  protected readonly provider: string;
  protected readonly baseUrl: string;
  protected readonly apiKey?: string;
  protected readonly model: string;
  protected readonly temperature: number;
  protected readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiLikeProviderOptions) {
    this.provider = options.provider;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.temperature = options.temperature ?? 0;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async review(input: LlmReviewInput): Promise<LlmReviewResult> {
    this.assertConfigured();
    const startedAt = Date.now();
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: this.temperature,
        messages: [
          { role: 'system', content: '你是 LabelHub 的 AI 自动预审 Agent，只能输出 JSON。' },
          { role: 'user', content: input.rawPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`${this.provider} 调用失败，状态码 ${response.status}。`);
    }

    const payload = (await response.json()) as OpenAiLikeResponse;
    const rawOutput = payload.choices?.[0]?.message?.content ?? '{}';
    const structuredOutput = parseStructuredOutput(rawOutput);

    return {
      verdict: verdictValue(structuredOutput.verdict),
      scores: scoreRecord(structuredOutput.scores),
      reason: typeof structuredOutput.reason === 'string' ? structuredOutput.reason : '模型未返回明确原因。',
      suggestions: Array.isArray(structuredOutput.suggestions)
        ? structuredOutput.suggestions.filter((item): item is string => typeof item === 'string')
        : [],
      rawOutput,
      structuredOutput,
      modelMetadata: {
        provider: this.provider,
        model: this.model,
        temperature: this.temperature,
        promptTokens: payload.usage?.prompt_tokens ?? 0,
        completionTokens: payload.usage?.completion_tokens ?? 0,
        totalTokens: payload.usage?.total_tokens ?? 0,
        latencyMs: Date.now() - startedAt,
        requestId: payload.id ?? null,
        structuredOutputMode: input.structuredOutputMode,
      },
    };
  }

  protected assertConfigured(): void {
    if (!this.apiKey) {
      throw new Error(`${this.provider} API Key 未配置，无法调用真实模型。`);
    }
  }
}

type OpenAiLikeResponse = {
  id?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

function parseStructuredOutput(rawOutput: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawOutput) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    throw new Error('结构化输出异常：模型没有返回合法 JSON。');
  }
}

function verdictValue(value: unknown): 'pass' | 'reject' | 'manual' {
  if (value === 'pass' || value === 'reject' || value === 'manual') {
    return value;
  }

  throw new Error('结构化输出异常：verdict 不合法。');
}

function scoreRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('结构化输出异常：scores 不合法。');
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, number] => {
      return typeof entry[1] === 'number' && Number.isFinite(entry[1]);
    }),
  );
}

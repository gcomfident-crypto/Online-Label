import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import {
  type AiReviewFieldRequirement,
  DATASET_KINDS,
  isAutoTemplateAnnotationFieldType,
  type AutoTemplateAnnotationField,
  type AutoTemplateFieldClassificationRequest,
  type AutoTemplateFieldClassificationResult,
  type AutoTemplateFieldValueStats,
  type AutoTemplateSourceField,
  type DatasetKind,
  type DatasetRecord,
  type FieldOption,
  type ShowItemDisplayConfig,
  type ShowItemDisplayField,
} from '@labelhub/shared';

import { normalizeAiReviewProvider } from '../common/ai-review-runtime.ts';

const REAL_FIELD_CLASSIFIER_REQUIRED_MESSAGE =
  '字段分类必须使用真实模型，请配置 DEEPSEEK_API_KEY、OPENAI_API_KEY 或 LLM_PROVIDER=deepseek/openai/custom。';

type LlmAssistBody = {
  annotationRawDataKeys?: unknown;
  answers?: unknown;
  datasetKind?: unknown;
  promptTemplate?: unknown;
  previousTargetValue?: unknown;
  rawData?: unknown;
  targetFieldKey?: unknown;
  visibleRawDataKeys?: unknown;
};

type LlmAssistRequest = {
  answers: Record<string, unknown>;
  datasetKind: DatasetKind;
  promptTemplate: string;
  previousTargetValue?: unknown;
  rawData: Record<string, unknown>;
  targetFieldKey: string;
};

export type LlmAiReviewRequest = {
  answers: Record<string, unknown>;
  datasetKind: DatasetKind;
  fieldRequirements: readonly AiReviewFieldRequirement[];
  model: string;
  passThreshold: number;
  provider: string;
  rawData: Record<string, unknown>;
  rawPrompt: string;
  structuredOutputMode: string;
  temperature: number;
};

export type LlmAssistResult = {
  datasetKind: DatasetKind;
  targetFieldKey: string;
  summary: string;
  suggestion: unknown;
};

export type LlmAiReviewResult = {
  comment: string;
  decision: 'pass' | 'reject';
  rawOutput: string;
  scores: Record<string, number>;
  structuredOutput: Record<string, unknown>;
  modelMetadata: Record<string, unknown>;
};

@Injectable()
export class LlmService {
  async reviewSubmission(input: LlmAiReviewRequest): Promise<LlmAiReviewResult> {
    const provider = normalizeAiReviewProvider(input.provider);

    if (provider === 'mock') {
      throw new BadRequestException({
        code: 'AI_REVIEW_PROVIDER_MOCK',
        message: 'AI 预审规则仍配置为 mock，请切换为 deepseek、openai 或 custom 后重试。',
      });
    }

    const remoteConfig = resolveOpenAiCompatibleConfig(provider, process.env, input.model);

    if (!remoteConfig) {
      throw new BadRequestException({
        code: 'AI_REVIEW_MODEL_NOT_CONFIGURED',
        message: 'AI 预审模型未配置，请检查 DEEPSEEK_API_KEY、OPENAI_API_KEY、LLM_API_KEY 或 LLM_PROVIDER。',
      });
    }

    try {
      return await callOpenAiCompatibleAiReview(input, remoteConfig, provider);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadGatewayException({
        code: 'AI_REVIEW_MODEL_FAILED',
        message: error instanceof Error ? error.message : 'AI 预审模型调用失败，请稍后重试。',
      });
    }
  }

  async createAssist(body: LlmAssistBody): Promise<LlmAssistResult> {
    const request = resolveLlmAssistRequest(body);
    const provider = resolveLlmProvider(process.env);

    if (provider === 'mock') {
      throw new BadRequestException({
        code: 'LLM_ASSIST_NOT_CONFIGURED',
        message: 'LLM 辅助模型未配置，请检查 DEEPSEEK_API_KEY、OPENAI_API_KEY 或 LLM_PROVIDER。',
      });
    }

    const remoteConfig = resolveOpenAiCompatibleConfig(provider, process.env);

    if (!remoteConfig) {
      throw new BadRequestException({
        code: 'LLM_ASSIST_NOT_CONFIGURED',
        message: 'LLM 辅助模型未配置，请检查 DEEPSEEK_API_KEY、OPENAI_API_KEY 或 LLM_PROVIDER。',
      });
    }

    try {
      const output = await callOpenAiCompatibleAssist(request, remoteConfig);

      return normalizeLlmAssistResult(output, request);
    } catch {
      throw new BadGatewayException({
        code: 'LLM_ASSIST_FAILED',
        message: 'LLM 辅助模型调用失败，请稍后重试。',
      });
    }
  }

  createMockAssist(body: LlmAssistBody): LlmAssistResult {
    const request = resolveLlmAssistRequest(body);

    return createDatasetSuggestion(request.datasetKind, request.targetFieldKey);
  }

  async classifyTemplateFields(body: unknown): Promise<AutoTemplateFieldClassificationResult> {
    const request = resolveTemplateFieldClassificationRequest(body);
    const provider = resolveLlmProvider(process.env);

    if (provider === 'mock') {
      if (allowsMockTemplateFieldClassifier(process.env)) {
        return createMockTemplateFieldClassification(request);
      }

      throw new BadRequestException({
        code: 'LLM_FIELD_CLASSIFIER_REQUIRES_REAL_MODEL',
        message: REAL_FIELD_CLASSIFIER_REQUIRED_MESSAGE,
      });
    }

    if (!provider) {
      throw new BadRequestException({
        code: 'LLM_FIELD_CLASSIFIER_REQUIRES_REAL_MODEL',
        message: REAL_FIELD_CLASSIFIER_REQUIRED_MESSAGE,
      });
    }

    const remoteConfig = resolveOpenAiCompatibleConfig(provider, process.env);

    if (!remoteConfig) {
      throw new BadRequestException({
        code: 'LLM_FIELD_CLASSIFIER_NOT_CONFIGURED',
        message: '字段分类模型未配置，请检查 DEEPSEEK_API_KEY、OPENAI_API_KEY 或 LLM_PROVIDER。',
      });
    }

    try {
      const output = await callOpenAiCompatibleClassifier(request, remoteConfig);

      return normalizeTemplateFieldClassificationResult(output, request, {
        provider,
        model: remoteConfig.model,
      });
    } catch {
      throw new BadGatewayException({
        code: 'LLM_FIELD_CLASSIFIER_FAILED',
        message: '字段分类模型调用失败，请稍后重试。',
      });
    }
  }
}

function resolveDatasetKind(value: unknown): DatasetKind | null {
  return typeof value === 'string' && DATASET_KINDS.includes(value as DatasetKind)
    ? (value as DatasetKind)
    : null;
}

function resolveTargetFieldKey(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveLlmAssistRequest(body: LlmAssistBody): LlmAssistRequest {
  const datasetKind = resolveDatasetKind(body.datasetKind);
  const targetFieldKey = resolveTargetFieldKey(body.targetFieldKey);

  if (!datasetKind) {
    throw new BadRequestException({
      code: 'INVALID_LLM_ASSIST_REQUEST',
      message: 'LLM 辅助请求缺少有效的数据集类型。',
    });
  }

  if (!targetFieldKey) {
    throw new BadRequestException({
      code: 'INVALID_LLM_ASSIST_REQUEST',
      message: 'LLM 辅助请求缺少目标字段。',
    });
  }

  const answers = normalizeRecord(body.answers);
  const { [targetFieldKey]: targetAnswerValue, ...answersWithoutTarget } = answers;
  const hasPreviousTargetValue = Object.prototype.hasOwnProperty.call(body, 'previousTargetValue');
  const previousTargetValue = hasPreviousTargetValue
    ? body.previousTargetValue
    : targetAnswerValue;

  const rawData = filterAssistRawData(
    normalizeRecord(body.rawData),
    body.visibleRawDataKeys,
    body.annotationRawDataKeys,
  );

  return {
    answers: answersWithoutTarget,
    datasetKind,
    promptTemplate: typeof body.promptTemplate === 'string' ? body.promptTemplate.trim() : '',
    ...(previousTargetValue !== undefined ? { previousTargetValue } : {}),
    rawData,
    targetFieldKey,
  };
}

function filterAssistRawData(
  rawData: Record<string, unknown>,
  visibleRawDataKeysValue: unknown,
  annotationRawDataKeysValue: unknown,
): Record<string, unknown> {
  const hasVisibleRawDataKeys = Array.isArray(visibleRawDataKeysValue);
  const visibleRawDataKeys = normalizeStringList(visibleRawDataKeysValue);
  const annotationRawDataKeys = new Set(normalizeStringList(annotationRawDataKeysValue));
  const candidateKeys = hasVisibleRawDataKeys ? visibleRawDataKeys : Object.keys(rawData);

  return Object.fromEntries(
    candidateKeys
      .filter((sourceKey) => !annotationRawDataKeys.has(sourceKey))
      .map((sourceKey) => [sourceKey, rawData[sourceKey] ?? null]),
  );
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const strings: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) {
      continue;
    }

    const key = item.trim();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    strings.push(key);
  }

  return strings;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function createDatasetSuggestion(
  datasetKind: DatasetKind,
  targetFieldKey: string,
): LlmAssistResult {
  if (datasetKind === 'qa_quality') {
    return {
      datasetKind,
      targetFieldKey,
      summary: '建议补充关键依据，并复核准确性与完整性评分。',
      suggestion: {
        relevance_score_reference: 5,
        accuracy_score_reference: 4,
        format_score_reference: 4,
        safety_score_reference: 5,
        issue_tags: ['missing_info'],
        comment: '模型回答覆盖核心方向，但建议对照参考答案补充关键限定。',
      },
    };
  }

  if (datasetKind === 'preference_compare') {
    return {
      datasetKind,
      targetFieldKey,
      summary: '建议优先选择回答 B，并检查是否存在安全风险。',
      suggestion: {
        preferred: 'B',
        margin: 'clear',
        safety_flag: 'safe',
        dimensions: ['helpfulness', 'completeness', 'style'],
        rationale: '回答 B 结构更完整，包含结论、操作路径和注意事项。',
      },
    };
  }

  if (datasetKind === 'generic_json' && targetFieldKey === 'cleaned_title') {
    return {
      datasetKind,
      targetFieldKey,
      summary: '已生成清洗标题。',
      suggestion: '轻量降噪蓝牙耳机 Pro Max 黑色',
    };
  }

  return {
    datasetKind,
    targetFieldKey,
    summary: '已生成通用结构化参考，请结合原始数据复核后采纳。',
    suggestion: {
      note: '模拟建议：请结合原始数据补充结构化答案。',
      confidence: 'mock',
    },
  };
}

type OpenAiCompatibleConfig = {
  apiKey: string;
  endpoint: string;
  model: string;
};

const LLM_PROMPT_RECORD_SAMPLE_LIMIT = 20;
const LLM_ASSIST_TEMPERATURE = 0.7;
const ANNOTATION_DESCRIPTION_MAX_LENGTH = 20;
const AUTO_OPTION_LIMIT = 100;
const AUTO_RADIO_OPTION_LIMIT = 20;
const AUTO_CHECKBOX_OPTION_LIMIT = 80;

function resolveTemplateFieldClassificationRequest(
  body: unknown,
): AutoTemplateFieldClassificationRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throwInvalidTemplateFieldClassificationRequest('字段分类请求体必须是 JSON 对象。');
  }

  const candidate = body as Partial<AutoTemplateFieldClassificationRequest>;
  const fields = Array.isArray(candidate.fields)
    ? candidate.fields.map(resolveSourceField).filter((field): field is AutoTemplateSourceField => Boolean(field))
    : [];

  if (fields.length === 0) {
    throwInvalidTemplateFieldClassificationRequest('字段分类请求缺少可解析字段。');
  }

  return {
    fileName: typeof candidate.fileName === 'string' && candidate.fileName.trim()
      ? candidate.fileName.trim()
      : 'dataset',
    fields,
    records: Array.isArray(candidate.records) ? candidate.records.filter(isDatasetRecord) : [],
    fieldStats: Array.isArray(candidate.fieldStats)
      ? candidate.fieldStats.map(resolveFieldValueStats).filter((stats): stats is AutoTemplateFieldValueStats => Boolean(stats))
      : undefined,
  };
}

function resolveSourceField(value: unknown): AutoTemplateSourceField | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<AutoTemplateSourceField>;
  const sourceKey = typeof candidate.sourceKey === 'string' ? candidate.sourceKey.trim() : '';

  if (!sourceKey) {
    return null;
  }

  return {
    sourceKey,
    samples: Array.isArray(candidate.samples) ? candidate.samples.slice(0, 3) : [],
    valueTypes: Array.isArray(candidate.valueTypes)
      ? candidate.valueTypes.filter((item): item is string => typeof item === 'string')
      : [],
    filledCount: normalizeCount(candidate.filledCount),
    totalCount: normalizeCount(candidate.totalCount),
  };
}

function resolveFieldValueStats(value: unknown): AutoTemplateFieldValueStats | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<AutoTemplateFieldValueStats>;
  const sourceKey = typeof candidate.sourceKey === 'string' ? candidate.sourceKey.trim() : '';

  if (!sourceKey) {
    return null;
  }

  return {
    sourceKey,
    totalCount: normalizeCount(candidate.totalCount),
    filledCount: normalizeCount(candidate.filledCount),
    valueTypes: Array.isArray(candidate.valueTypes)
      ? candidate.valueTypes.filter((item): item is string => typeof item === 'string')
      : [],
    samples: Array.isArray(candidate.samples) ? candidate.samples.slice(0, 3) : [],
    uniqueValues: Array.isArray(candidate.uniqueValues)
      ? candidate.uniqueValues.filter((item): item is string => typeof item === 'string')
      : [],
    optionCandidates: normalizeOptions(candidate.optionCandidates).slice(0, AUTO_OPTION_LIMIT),
    hasMultiValue: candidate.hasMultiValue === true,
    distinctCount: normalizeCount(candidate.distinctCount),
    ...(candidate.truncated === true ? { truncated: true } : {}),
  };
}

function isDatasetRecord(value: unknown): value is DatasetRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function throwInvalidTemplateFieldClassificationRequest(message: string): never {
  throw new BadRequestException({
    code: 'INVALID_TEMPLATE_FIELD_CLASSIFICATION_REQUEST',
    message,
  });
}

function resolveLlmProvider(env: NodeJS.ProcessEnv): string {
  const configuredProvider = env.LLM_PROVIDER?.trim();

  if (configuredProvider) {
    return configuredProvider.toLowerCase();
  }

  if (env.NODE_ENV !== 'test') {
    if (hasUsableApiKey(env.DEEPSEEK_API_KEY, 'replace_with_deepseek_api_key')) {
      return 'deepseek';
    }

    if (hasUsableApiKey(env.OPENAI_API_KEY, '')) {
      return 'openai';
    }
  }

  return 'mock';
}

function allowsMockTemplateFieldClassifier(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'test' && env.LLM_PROVIDER?.trim().toLowerCase() === 'mock';
}

function resolveOpenAiCompatibleConfig(
  provider: string,
  env: NodeJS.ProcessEnv,
  modelOverride?: string,
): OpenAiCompatibleConfig | null {
  const configuredModel = modelOverride?.trim() || env.LLM_MODEL?.trim();
  const normalizedProvider = normalizeAiReviewProvider(provider);

  if (normalizedProvider === 'deepseek') {
    const apiKey = env.DEEPSEEK_API_KEY?.trim();

    return apiKey && apiKey !== 'replace_with_deepseek_api_key'
      ? {
          apiKey,
          endpoint: resolveChatCompletionsEndpoint(
            env.DEEPSEEK_API_BASE_URL?.trim() || 'https://api.deepseek.com',
          ),
          model: configuredModel || 'deepseek-chat',
        }
      : null;
  }

  if (normalizedProvider === 'openai') {
    const apiKey = env.OPENAI_API_KEY?.trim();

    return apiKey
      ? {
          apiKey,
          endpoint: resolveChatCompletionsEndpoint(
            env.OPENAI_API_BASE_URL?.trim() || 'https://api.openai.com/v1',
          ),
          model: configuredModel || 'gpt-4o-mini',
        }
      : null;
  }

  if (normalizedProvider === 'custom') {
    const apiKey = env.LLM_API_KEY?.trim();
    const endpoint = env.LLM_API_BASE_URL?.trim();

    return apiKey && endpoint
      ? {
          apiKey,
          endpoint,
          model: configuredModel || 'custom-field-classifier',
        }
      : null;
  }

  return null;
}

function hasUsableApiKey(value: unknown, placeholder: string): boolean {
  return typeof value === 'string' && Boolean(value.trim()) && value.trim() !== placeholder;
}

function resolveChatCompletionsEndpoint(baseUrlOrEndpoint: string): string {
  const trimmed = baseUrlOrEndpoint.replace(/\/+$/, '');

  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}

async function callOpenAiCompatibleAiReview(
  request: LlmAiReviewRequest,
  config: OpenAiCompatibleConfig,
  provider: string,
): Promise<LlmAiReviewResult> {
  const startedAt = Date.now();
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      temperature: request.temperature,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            '你是 LabelHub 的 AI 自动预审 Agent，只输出合法 JSON。',
            'fieldReviews 必须覆盖每个字段审核标准中的字段，不能增删字段。',
            '每个 fieldReviews.comment 必须是 AI 对当前字段标注内容的评语，要结合 ShowItem、AI 预审标准和当前标注内容说明通过或打回原因。',
            '上传文件中与待标注字段同名或映射到待标注字段的值，仅用于 owner 配置模板参考，不是标准答案，不得用于和当前标注答案做一致性比较。',
            '每个字段必须输出 fieldKey、label、score、decision、comment、suggestions。',
            'verdict 只能是 pass 或 reject；任一字段 decision 为 reject 时 verdict 必须是 reject。',
            '不要输出 mock、模拟、占位、Markdown 或代码块。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            request.rawPrompt,
            '',
            `数据集类型：${request.datasetKind}`,
            `通过阈值：${request.passThreshold}`,
            `结构化输出模式：${request.structuredOutputMode}`,
            `题目可审上下文：${JSON.stringify(request.rawData)}`,
            `当前标注答案：${JSON.stringify(request.answers)}`,
            `需要预审的字段和标准：${JSON.stringify(request.fieldRequirements)}`,
            '',
            '请只输出 JSON：{"verdict":"pass|reject","overallScore":0,"overallComment":"整体结论","fieldReviews":[{"fieldKey":"字段 key","label":"字段标题","score":0,"decision":"pass|reject","comment":"AI 对当前字段标注内容的评语","suggestions":["修改建议"]}]}',
          ].join('\n'),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI 预审模型请求失败，HTTP ${response.status}。`);
  }

  const payload = await response.json() as {
    id?: string;
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
  const rawOutput = payload.choices?.[0]?.message?.content;

  if (typeof rawOutput !== 'string' || !rawOutput.trim()) {
    throw new Error('AI 预审模型响应缺少 message content。');
  }

  return normalizeAiReviewResult(parseJsonObject(rawOutput), request, {
    provider,
    model: config.model,
    rawOutput,
    latencyMs: Date.now() - startedAt,
    requestId: payload.id ?? null,
    promptTokens: payload.usage?.prompt_tokens ?? 0,
    completionTokens: payload.usage?.completion_tokens ?? 0,
    totalTokens: payload.usage?.total_tokens ?? 0,
  });
}

async function callOpenAiCompatibleClassifier(
  request: AutoTemplateFieldClassificationRequest,
  config: OpenAiCompatibleConfig,
): Promise<unknown> {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            '你是标注平台的模板字段分类器，只输出 JSON。',
            '任务：把输入文件字段分为 displayFields 和 annotationFields。',
            'displayFields 表示输入文件里已经存在、应直接展示给标注员看的原始题目上下文，会进入 ShowItem。',
            'annotationFields 表示标注员需要新填写、选择或确认的答案字段，必须映射到物料类型。',
            '字段通常按顺序排列：前半段是 ShowItem 上下文，后半段是 Labeler 打标字段。请优先寻找“分水岭字段”。',
            '分水岭左侧字段全部放入 displayFields，并保持原始字段顺序；分水岭右侧字段全部放入 annotationFields，并保持原始字段顺序。',
            '不要让标注员重新填写输入文件中已经存在的原始数据字段；已有上下文即使某些行为空，也应优先进入 displayFields。',
            '题目、问题、模型回答、参考答案、媒体类型、媒体链接、Markdown 正文、分类、难度、语言、标签、来源、评测维度说明等原始上下文字段通常是 displayFields。',
            '只有字段名或样例明显表示目标答案、人工标注结果、偏好选择、审核备注、判定结论、评分、标签输出、证据上传等需要标注员产出的内容时，才放入 annotationFields。',
            '对 annotationFields 需要根据字段值推断物料类型：有限枚举用 radio，包含 |、,、，、数组等多值结构用 checkbox，备注/理由/说明长文本用 textarea。',
            '多值或枚举字段必须从记录值中拆分、清洗、去重后生成 options，options 的 label 和 value 使用清洗后的原始文本。',
            'annotationFields.label 必须是字段标题或名词短语，不要写“选择、填写、上传、判断”等操作动词；操作说明写入 description。',
            '每个 annotationFields 都必须由你生成 description，作为给 labeler 看的填写提示，说明该字段的标注含义和操作方式，控制在 20 个汉字以内。',
            '如果文件中没有明显需要标注员产出的字段，annotationFields 可以为空。',
            '如果无法判断某个字段且它不像原始上下文，请放入 annotationFields，type 使用 text。',
            'annotationFields.type 只能是 text、textarea、radio、checkbox、tag_select、rich_text、file_upload、image_upload、json_editor。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            '请按以下 TypeScript 形状输出 JSON：',
            '{"layout":"field_list|comparison|card|table","displayFields":[{"sourceKey":"原字段名","label":"显示名","area":"primary|meta|content","format":"text|long_text|badge|code|json","maxLines":6}],"annotationFields":[{"sourceKey":"原字段名","label":"字段标题，名词短语","type":"text","description":"AI生成的20字内填写提示","options":[{"label":"选项","value":"value"}],"required":false}]}',
            '',
            `文件名：${request.fileName}`,
            `字段样本：${JSON.stringify(request.fields)}`,
            `记录样例：${JSON.stringify(request.records.slice(0, LLM_PROMPT_RECORD_SAMPLE_LIMIT))}`,
          ].join('\n'),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM field classification request failed with HTTP ${response.status}.`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content !== 'string') {
    throw new Error('LLM field classification response is missing message content.');
  }

  return parseJsonObject(content);
}

async function callOpenAiCompatibleAssist(
  request: LlmAssistRequest,
  config: OpenAiCompatibleConfig,
): Promise<unknown> {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      temperature: LLM_ASSIST_TEMPERATURE,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            '你是 LabelHub 标注平台里的 LLM 辅助填写模型，只输出 JSON。',
            '任务：根据原始数据、当前已填写答案和用户配置的提示词，生成可直接写入目标字段的建议值。',
            '不要输出 mock、模拟、占位、示例或需要用户再补充的模板内容。',
            'suggestion 必须是目标字段应写入的最终值：文本字段输出字符串，标签/多选输出字符串数组，结构化字段输出 JSON 对象。',
            '如果请求包含上一次目标字段内容，必须生成新的表达或结构，避免复用上一版结果，最终 suggestion 仍完整替换目标字段。',
            '如果无法确定，也要基于输入给出最合理的可编辑草稿，不要返回“请补充”“待填写”这类占位。',
            '只输出符合以下形状的 JSON：{"targetFieldKey":"字段名","summary":"一句话说明","suggestion":任意JSON值}',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `数据集类型：${request.datasetKind}`,
            `目标字段：${request.targetFieldKey}`,
            `用户提示词：${request.promptTemplate || '请根据原始数据和当前答案生成目标字段内容。'}`,
            `原始数据：${JSON.stringify(request.rawData)}`,
            `当前答案：${JSON.stringify(request.answers)}`,
            ...formatPreviousTargetPrompt(request.previousTargetValue),
          ].join('\n\n'),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM assist request failed with HTTP ${response.status}.`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content !== 'string') {
    throw new Error('LLM assist response is missing message content.');
  }

  return parseJsonObject(content);
}

function formatPreviousTargetPrompt(previousTargetValue: unknown): string[] {
  return previousTargetValue === undefined
    ? []
    : [
        `上一次目标字段内容：${JSON.stringify(previousTargetValue)}`,
        '重新生成要求：请生成一个不同于上一次目标字段内容的新版本，新的 suggestion 会直接替换旧值。',
      ];
}

function normalizeLlmAssistResult(
  value: unknown,
  request: LlmAssistRequest,
): LlmAssistResult {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<LlmAssistResult>
    : {};

  if (!('suggestion' in candidate)) {
    throw new Error('LLM assist response is missing suggestion.');
  }

  return {
    datasetKind: request.datasetKind,
    targetFieldKey: typeof candidate.targetFieldKey === 'string' && candidate.targetFieldKey.trim()
      ? candidate.targetFieldKey.trim()
      : request.targetFieldKey,
    summary: typeof candidate.summary === 'string' && candidate.summary.trim()
      ? candidate.summary.trim()
      : 'LLM 已生成并写入目标字段。',
    suggestion: candidate.suggestion,
  };
}

function normalizeAiReviewResult(
  value: unknown,
  request: LlmAiReviewRequest,
  metadata: {
    completionTokens: number;
    latencyMs: number;
    model: string;
    provider: string;
    promptTokens: number;
    rawOutput: string;
    requestId: string | null;
    totalTokens: number;
  },
): LlmAiReviewResult {
  const candidate = ensureRecord(value, 'AI 预审结构化输出必须是 JSON 对象。');
  const fieldReviews = normalizeAiReviewFieldReviews(candidate.fieldReviews, request);
  const decision = normalizeAiReviewDecision(candidate.verdict) ?? aggregateAiReviewDecision(fieldReviews);
  const overallScore = numericValue(candidate.overallScore)
    ?? numericValue(isRecord(candidate.scores) ? candidate.scores.overall : null)
    ?? aggregateAiReviewScore(fieldReviews);
  const overallComment = stringValue(candidate.overallComment)
    ?? stringValue(candidate.reason)
    ?? defaultAiReviewComment(decision, fieldReviews);
  const candidateScores = isRecord(candidate.scores) ? numericRecord(candidate.scores) : {};
  const scores = {
    ...candidateScores,
    overall: overallScore,
    fieldCount: fieldReviews.length,
    passedFieldCount: fieldReviews.filter((field) => field.decision === 'pass').length,
    rejectedFieldCount: fieldReviews.filter((field) => field.decision === 'reject').length,
  };
  const structuredOutput = {
    ...candidate,
    verdict: decision,
    overallScore,
    overallComment,
    fieldReviews,
  };

  return {
    comment: overallComment,
    decision,
    rawOutput: metadata.rawOutput,
    scores,
    structuredOutput,
    modelMetadata: {
      provider: metadata.provider,
      model: metadata.model,
      temperature: request.temperature,
      promptTokens: metadata.promptTokens,
      completionTokens: metadata.completionTokens,
      totalTokens: metadata.totalTokens,
      latencyMs: metadata.latencyMs,
      requestId: metadata.requestId,
      structuredOutputMode: request.structuredOutputMode,
    },
  };
}

function normalizeAiReviewFieldReviews(
  value: unknown,
  request: LlmAiReviewRequest,
): Array<{
  fieldKey: string;
  label: string;
  score: number;
  decision: 'pass' | 'reject';
  comment: string;
  suggestions: string[];
}> {
  if (!Array.isArray(value)) {
    throw new Error('AI 预审结构化输出缺少 fieldReviews 数组。');
  }

  const reviewByFieldKey = new Map(
    value
      .map((item) => ensureRecord(item, 'fieldReviews 每项必须是 JSON 对象。'))
      .map((item) => [stringValue(item.fieldKey) ?? '', item] as const)
      .filter(([fieldKey]) => Boolean(fieldKey)),
  );

  return request.fieldRequirements.map((field) => {
    const review = reviewByFieldKey.get(field.fieldKey);

    if (!review) {
      throw new Error(`AI 预审结构化输出缺少字段 ${field.fieldKey} 的 fieldReview。`);
    }

    const explicitScore = numericValue(review.score);
    const decision = normalizeAiReviewDecision(review.decision);
    const comment = stringValue(review.comment);

    if (!decision) {
      throw new Error(`AI 预审字段 ${field.fieldKey} 缺少有效 decision。`);
    }
    if (!comment) {
      throw new Error(`AI 预审字段 ${field.fieldKey} 缺少 AI 对当前字段标注内容的评语。`);
    }

    return {
      fieldKey: field.fieldKey,
      label: stringValue(review.label) ?? field.label,
      score: clampAiReviewScore(explicitScore ?? defaultAiReviewScoreForDecision(decision)),
      decision,
      comment,
      suggestions: Array.isArray(review.suggestions)
        ? review.suggestions.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
        : [],
    };
  });
}

function defaultAiReviewScoreForDecision(decision: 'pass' | 'reject'): number {
  return decision === 'pass' ? 100 : 0;
}

function aggregateAiReviewDecision(
  fieldReviews: ReadonlyArray<{ decision: 'pass' | 'reject' }>,
): 'pass' | 'reject' {
  return fieldReviews.length > 0 && fieldReviews.every((field) => field.decision === 'pass') ? 'pass' : 'reject';
}

function aggregateAiReviewScore(
  fieldReviews: ReadonlyArray<{ score: number }>,
): number {
  if (fieldReviews.length === 0) {
    return 0;
  }

  return clampAiReviewScore(
    fieldReviews.reduce((total, field) => total + field.score, 0) / fieldReviews.length,
  );
}

function defaultAiReviewComment(
  decision: 'pass' | 'reject',
  fieldReviews: ReadonlyArray<{ decision: 'pass' | 'reject'; label: string }>,
): string {
  if (decision === 'pass') {
    return '所有开启 AI 预审的字段均通过，进入人工复审。';
  }

  const failedLabels = fieldReviews
    .filter((field) => field.decision === 'reject')
    .map((field) => field.label)
    .join('、');

  return `${failedLabels || '存在字段'} 未通过 AI 预审，建议打回给标注员修改。`;
}

function normalizeAiReviewDecision(value: unknown): 'pass' | 'reject' | null {
  return value === 'pass' || value === 'reject' ? value : null;
}

function numericRecord(value: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entryValue]) => [key, numericValue(entryValue)] as const)
      .filter((entry): entry is readonly [string, number] => entry[1] !== null),
  );
}

function numericValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clampAiReviewScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function ensureRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(message);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseJsonObject(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');

    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }

    throw new Error('LLM field classification response is not valid JSON.');
  }
}

function normalizeTemplateFieldClassificationResult(
  value: unknown,
  request: AutoTemplateFieldClassificationRequest,
  metadata: Pick<AutoTemplateFieldClassificationResult, 'provider' | 'model'>,
): AutoTemplateFieldClassificationResult {
  const inferenceOptions = { fallbackDescription: metadata.provider === 'mock' };
  const sourceKeys = new Set(request.fields.map((field) => field.sourceKey));
  const sourceFieldMap = new Map(request.fields.map((field) => [field.sourceKey, field]));
  const fieldStatsMap = new Map((request.fieldStats ?? []).map((stats) => [stats.sourceKey, stats]));
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<AutoTemplateFieldClassificationResult>
    : {};
  const candidateAnnotationFields = normalizeAnnotationFields(candidate.annotationFields, sourceKeys);
  const candidateAnnotationFieldMap = new Map(candidateAnnotationFields.map((field) => [field.sourceKey, field]));
  const watershedIndex = findAnnotationWatershedIndex(request, candidateAnnotationFields);

  if (watershedIndex >= 0) {
    const displaySourceFields = request.fields.slice(0, watershedIndex);
    const annotationSourceFields = request.fields.slice(watershedIndex);
    const annotationSourceKeys = new Set(annotationSourceFields.map((field) => field.sourceKey));
    const candidateDisplayFields = normalizeDisplayFields(
      Array.isArray(candidate.displayFields) ? candidate.displayFields : [],
      sourceKeys,
      annotationSourceKeys,
    );
    const candidateDisplayFieldMap = new Map(candidateDisplayFields.map((field) => [field.sourceKey, field]));

    return {
      layout: normalizeLayout(candidate.layout),
      displayFields: displaySourceFields.map(
        (field) => candidateDisplayFieldMap.get(field.sourceKey) ?? createMockDisplayField(field),
      ),
      annotationFields: annotationSourceFields.map((field) =>
        createInferredAnnotationField(
          field,
          request.records,
          candidateAnnotationFieldMap.get(field.sourceKey),
          inferenceOptions,
          fieldStatsMap.get(field.sourceKey),
        ),
      ),
      ...metadata,
      reasoning: typeof candidate.reasoning === 'string' && candidate.reasoning.trim()
        ? candidate.reasoning.trim()
        : undefined,
    };
  }

  const normalizedAnnotationFields = candidateAnnotationFields;
  const annotationFields = normalizedAnnotationFields.filter(
    (field) => !isProtectedDisplaySourceKey(field.sourceKey),
  ).map(
    (field) => createInferredAnnotationField(
      sourceFieldMap.get(field.sourceKey) ?? createSyntheticSourceField(field.sourceKey),
      request.records,
      field,
      inferenceOptions,
      fieldStatsMap.get(field.sourceKey),
    ),
  );
  const annotationSourceKeys = new Set(annotationFields.map((field) => field.sourceKey));
  const forcedDisplayFields = normalizedAnnotationFields
    .filter((field) => isProtectedDisplaySourceKey(field.sourceKey))
    .map((field) => createMockDisplayField(sourceFieldMap.get(field.sourceKey) ?? {
      sourceKey: field.sourceKey,
      samples: [],
      valueTypes: [],
      filledCount: 0,
      totalCount: 0,
    }));
  const candidateDisplayFields = Array.isArray(candidate.displayFields) ? candidate.displayFields : [];
  const displayFields = normalizeDisplayFields(
    [...candidateDisplayFields, ...forcedDisplayFields],
    sourceKeys,
    annotationSourceKeys,
  );
  const classifiedSourceKeys = new Set([
    ...displayFields.map((field) => field.sourceKey),
    ...annotationSourceKeys,
  ]);

  for (const field of request.fields) {
    if (!classifiedSourceKeys.has(field.sourceKey)) {
      if (isProtectedDisplaySourceKey(field.sourceKey)) {
        displayFields.push(createMockDisplayField(field));
      } else {
        annotationFields.push(
          createInferredAnnotationField(
            field,
            request.records,
            undefined,
            inferenceOptions,
            fieldStatsMap.get(field.sourceKey),
          ),
        );
      }
      classifiedSourceKeys.add(field.sourceKey);
    }
  }

  return {
    layout: normalizeLayout(candidate.layout),
    displayFields,
    annotationFields,
    ...metadata,
    reasoning: typeof candidate.reasoning === 'string' && candidate.reasoning.trim()
      ? candidate.reasoning.trim()
      : undefined,
  };
}

function normalizeDisplayFields(
  fields: AutoTemplateFieldClassificationResult['displayFields'],
  sourceKeys: ReadonlySet<string>,
  annotationSourceKeys: ReadonlySet<string>,
): ShowItemDisplayField[] {
  if (!Array.isArray(fields)) {
    return [];
  }

  const seen = new Set<string>();
  const normalizedFields: ShowItemDisplayField[] = [];

  for (const field of fields) {
    if (!field || !sourceKeys.has(field.sourceKey) || annotationSourceKeys.has(field.sourceKey)) {
      continue;
    }

    if (seen.has(field.sourceKey)) {
      continue;
    }

    seen.add(field.sourceKey);
    normalizedFields.push({
      sourceKey: field.sourceKey,
      label: normalizeLabel(field.label, field.sourceKey),
      ...normalizeArea(field.area),
      ...normalizeFormat(field.format),
      ...normalizePositiveNumber('width', field.width),
      ...normalizePositiveNumber('maxLines', field.maxLines),
      ...(field.visible === false ? { visible: false } : {}),
    });
  }

  return normalizedFields;
}

function normalizeAnnotationFields(
  fields: AutoTemplateFieldClassificationResult['annotationFields'],
  sourceKeys: ReadonlySet<string>,
): AutoTemplateAnnotationField[] {
  if (!Array.isArray(fields)) {
    return [];
  }

  const seen = new Set<string>();
  const normalizedFields: AutoTemplateAnnotationField[] = [];

  for (const field of fields) {
    if (!field || !sourceKeys.has(field.sourceKey) || seen.has(field.sourceKey)) {
      continue;
    }

    const type = isAutoTemplateAnnotationFieldType(field.type) ? field.type : 'text';
    const label = normalizeAnnotationLabel(field.label, field.sourceKey);
    seen.add(field.sourceKey);
    normalizedFields.push({
      sourceKey: field.sourceKey,
      label,
      type,
      ...(type === 'radio' || type === 'checkbox' || type === 'tag_select'
        ? { options: normalizeOptions(field.options) }
        : {}),
      ...(field.required === true ? { required: true } : {}),
      ...normalizeAnnotationDescriptionProperty(field.description),
      ...normalizeTextProperty('placeholder', field.placeholder),
    });
  }

  return normalizedFields;
}

function createMockTemplateFieldClassification(
  request: AutoTemplateFieldClassificationRequest,
): AutoTemplateFieldClassificationResult {
  return normalizeTemplateFieldClassificationResult(
    {
      layout: hasAllSourceKeys(request.fields, ['response_a', 'response_b']) ? 'comparison' : 'field_list',
      displayFields: request.fields
        .filter((field) => !isMockAnnotationField(field.sourceKey))
        .map(createMockDisplayField),
      annotationFields: request.fields
        .filter((field) => isMockAnnotationField(field.sourceKey))
        .map(createMockAnnotationField),
      reasoning: 'mock provider classified source/context fields for display and reviewer target fields for annotation.',
    },
    request,
    {
      provider: 'mock',
      model: 'mock-field-classifier',
    },
  );
}

function createMockDisplayField(field: AutoTemplateSourceField): ShowItemDisplayField {
  const normalizedKey = field.sourceKey.toLowerCase();

  if (normalizedKey === 'id' || normalizedKey.includes('type') || normalizedKey.includes('lang')) {
    return {
      sourceKey: field.sourceKey,
      label: field.sourceKey,
      area: 'meta',
      format: 'badge',
    };
  }

  if (normalizedKey.includes('prompt') || normalizedKey.includes('question')) {
    return {
      sourceKey: field.sourceKey,
      label: field.sourceKey,
      area: 'primary',
      format: 'long_text',
      maxLines: 8,
    };
  }

  if (normalizedKey.includes('response') || normalizedKey.includes('answer')) {
    return {
      sourceKey: field.sourceKey,
      label: field.sourceKey,
      area: 'content',
      format: 'long_text',
      maxLines: 12,
    };
  }

  return {
    sourceKey: field.sourceKey,
    label: field.sourceKey,
    area: firstValueType(field) === 'number' || firstValueType(field) === 'boolean' ? 'meta' : 'content',
    format: firstValueType(field) === 'object' || firstValueType(field) === 'array' ? 'json' : 'text',
  };
}

function createMockAnnotationField(field: AutoTemplateSourceField): AutoTemplateAnnotationField {
  const normalizedKey = field.sourceKey.toLowerCase();

  if (normalizedKey === 'preferred' || normalizedKey.includes('decision')) {
    return {
      sourceKey: field.sourceKey,
      label: field.sourceKey,
      type: 'radio',
      options: [
        { label: 'A', value: 'A' },
        { label: 'B', value: 'B' },
      ],
      required: true,
    };
  }

  if (normalizedKey.includes('dimension')) {
    return {
      sourceKey: field.sourceKey,
      label: field.sourceKey,
      type: 'checkbox',
      options: [],
    };
  }

  if (normalizedKey.includes('note') || normalizedKey.includes('comment') || normalizedKey.includes('rationale')) {
    return {
      sourceKey: field.sourceKey,
      label: field.sourceKey,
      type: 'textarea',
    };
  }

  return {
    sourceKey: field.sourceKey,
    label: field.sourceKey,
    type: 'text',
  };
}

function findAnnotationWatershedIndex(
  request: AutoTemplateFieldClassificationRequest,
  annotationFields: readonly AutoTemplateAnnotationField[],
): number {
  const candidateAnnotationSourceKeys = new Set(annotationFields.map((field) => field.sourceKey));

  for (const [index, field] of request.fields.entries()) {
    if (isLikelyAnnotationSourceKey(field.sourceKey)) {
      return index;
    }
  }

  for (const [index, field] of request.fields.entries()) {
    if (candidateAnnotationSourceKeys.has(field.sourceKey) && !isProtectedDisplaySourceKey(field.sourceKey)) {
      return index;
    }
  }

  return -1;
}

function createInferredAnnotationField(
  field: AutoTemplateSourceField,
  records: readonly DatasetRecord[],
  candidate?: AutoTemplateAnnotationField,
  inferenceOptions: { fallbackDescription?: boolean } = {},
  fieldStats?: AutoTemplateFieldValueStats,
): AutoTemplateAnnotationField {
  const sourceKey = field.sourceKey;
  const normalizedKey = sourceKey.toLowerCase();
  const values = collectSourceFieldValues(field, records);
  const inferredOptions =
    fieldStats
      ? fieldStats.distinctCount <= AUTO_OPTION_LIMIT
        ? normalizeOptions(fieldStats.optionCandidates)
        : []
      : extractOptionLabels(values).map((label) => ({ label, value: label }));
  const candidateOptions =
    fieldStats && fieldStats.distinctCount > AUTO_OPTION_LIMIT
      ? []
      : normalizeOptions(candidate?.options);
  const options = resolveAnnotationOptions(sourceKey, inferredOptions, candidateOptions);
  const hasMultiValues = fieldStats?.hasMultiValue ?? hasMultiValue(values);
  const hasOptionShape = options.length > 0;
  const candidateType = isAutoTemplateAnnotationFieldType(candidate?.type) ? candidate.type : undefined;
  const candidateIsChoiceType =
    candidateType === 'radio' || candidateType === 'checkbox' || candidateType === 'tag_select';
  const looksLikeFreeText = Boolean(fieldStats && isHighCardinalityFreeTextStats(fieldStats));
  const hasFiniteOptionShape =
    hasOptionShape && !looksLikeFreeText && (hasMultiValues || options.length >= 2 || candidateIsChoiceType);
  let type: AutoTemplateAnnotationField['type'] = candidateType ?? 'text';

  if (isLongTextAnnotationSourceKey(sourceKey)) {
    type = 'textarea';
  } else if (normalizedKey.includes('dimension') && hasOptionShape) {
    type = options.length <= AUTO_CHECKBOX_OPTION_LIMIT ? 'checkbox' : 'tag_select';
  } else if (hasMultiValues && hasOptionShape) {
    type = options.length <= AUTO_CHECKBOX_OPTION_LIMIT ? 'checkbox' : 'tag_select';
  } else if (isBooleanLikeField(field, options) && hasOptionShape) {
    type = 'radio';
  } else if (hasFiniteOptionShape && !hasLongTextValue(values)) {
    if (candidateType === 'checkbox' || candidateType === 'tag_select') {
      type = candidateType;
    } else {
      type = options.length <= AUTO_RADIO_OPTION_LIMIT ? 'radio' : 'tag_select';
    }
  } else if (hasLongTextValue(values)) {
    type = 'textarea';
  } else if (!candidateType || candidateType === 'checkbox' || candidateType === 'radio' || candidateType === 'tag_select') {
    type = 'text';
  }

  const label = normalizeAnnotationLabel(candidate?.label, sourceKey);
  const description = normalizeAnnotationDescription(candidate?.description, label, type, inferenceOptions);

  return {
    sourceKey,
    label,
    type,
    ...(description ? { description } : {}),
    ...(type === 'radio' || type === 'checkbox' || type === 'tag_select' ? { options } : {}),
    ...(candidate?.required === true || isRequiredAnnotationSourceKey(sourceKey) ? { required: true } : {}),
    ...normalizeTextProperty('placeholder', candidate?.placeholder),
  };
}

function collectSourceFieldValues(
  field: AutoTemplateSourceField,
  records: readonly DatasetRecord[],
): unknown[] {
  const values: unknown[] = [];

  for (const record of records) {
    const value = record[field.sourceKey];

    if (isFilledSourceValue(value)) {
      values.push(value);
    }
  }

  for (const sample of field.samples) {
    if (isFilledSourceValue(sample)) {
      values.push(sample);
    }
  }

  return values;
}

function extractOptionLabels(values: readonly unknown[]): string[] {
  const labels: string[] = [];
  const seenLabels = new Set<string>();

  const appendLabel = (label: string): void => {
    const normalizedLabel = label.trim();

    if (!normalizedLabel || seenLabels.has(normalizedLabel)) {
      return;
    }

    seenLabels.add(normalizedLabel);
    labels.push(normalizedLabel);
  };

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    if (typeof value === 'string') {
      for (const part of value.split(/[|｜,，、;；\n\r]+/u)) {
        appendLabel(part);
      }
      return;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      appendLabel(String(value));
    }
  };

  for (const value of values) {
    visit(value);
  }

  return labels;
}

function hasMultiValue(values: readonly unknown[]): boolean {
  return values.some((value) => {
    if (Array.isArray(value)) {
      return value.length > 1;
    }

    return typeof value === 'string' && /[|｜,，、;；\n\r]/u.test(value);
  });
}

function hasLongTextValue(values: readonly unknown[]): boolean {
  return values.some((value) => typeof value === 'string' && (value.length > 60 || value.includes('\n')));
}

function isHighCardinalityFreeTextStats(stats: AutoTemplateFieldValueStats): boolean {
  return (
    !stats.hasMultiValue &&
    stats.filledCount >= 10 &&
    stats.distinctCount >= 10 &&
    stats.distinctCount / stats.filledCount > 0.8
  );
}

function isBooleanLikeField(
  field: AutoTemplateSourceField,
  options: readonly FieldOption[],
): boolean {
  if (field.valueTypes.includes('boolean')) {
    return true;
  }

  if (options.length === 0 || options.length > 2) {
    return false;
  }

  const booleanLabels = new Set(['true', 'false', 'yes', 'no', 'y', 'n', '是', '否']);

  return options.every((option) => booleanLabels.has(option.value.trim().toLowerCase()));
}

function resolveAnnotationOptions(
  sourceKey: string,
  inferredOptions: FieldOption[],
  candidateOptions: FieldOption[],
): FieldOption[] {
  const normalizedKey = sourceKey.toLowerCase();

  if (normalizedKey === 'preferred' || normalizedKey.includes('preference')) {
    const options = [
      { label: 'A', value: 'A' },
      { label: 'B', value: 'B' },
    ];

    for (const option of inferredOptions) {
      if (!options.some((item) => item.value === option.value)) {
        options.push(option);
      }
    }

    return options.slice(0, AUTO_OPTION_LIMIT);
  }

  if (inferredOptions.length > 0) {
    return inferredOptions.slice(0, AUTO_OPTION_LIMIT);
  }

  if (candidateOptions.length > 0) {
    return candidateOptions.slice(0, AUTO_OPTION_LIMIT);
  }

  return [];
}

function isFilledSourceValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

function createSyntheticSourceField(sourceKey: string): AutoTemplateSourceField {
  return {
    sourceKey,
    samples: [],
    valueTypes: [],
    filledCount: 0,
    totalCount: 0,
  };
}

function isLikelyAnnotationSourceKey(sourceKey: string): boolean {
  if (isProtectedDisplaySourceKey(sourceKey)) {
    return false;
  }

  const normalizedKey = sourceKey.toLowerCase();

  return (
    normalizedKey === 'preferred' ||
    normalizedKey.includes('preference') ||
    normalizedKey.includes('margin') ||
    normalizedKey.includes('dimension') ||
    normalizedKey.includes('safety_flag') ||
    normalizedKey.includes('annotator') ||
    normalizedKey.includes('reviewer') ||
    normalizedKey.includes('decision') ||
    normalizedKey.includes('rationale') ||
    normalizedKey.includes('reason') ||
    normalizedKey.includes('note') ||
    normalizedKey.includes('comment') ||
    normalizedKey.includes('score') ||
    normalizedKey.includes('rating') ||
    normalizedKey.includes('judgment') ||
    normalizedKey.includes('verdict')
  );
}

function isLongTextAnnotationSourceKey(sourceKey: string): boolean {
  const normalizedKey = sourceKey.toLowerCase();

  return (
    normalizedKey.includes('note') ||
    normalizedKey.includes('comment') ||
    normalizedKey.includes('rationale') ||
    normalizedKey.includes('reason') ||
    normalizedKey.includes('explanation')
  );
}

function isRequiredAnnotationSourceKey(sourceKey: string): boolean {
  const normalizedKey = sourceKey.toLowerCase();

  return normalizedKey === 'preferred' || normalizedKey.includes('decision');
}

function isProtectedDisplaySourceKey(sourceKey: string): boolean {
  const normalizedKey = sourceKey.trim().toLowerCase();
  const exactDisplayKeys = new Set([
    'id',
    'task_id',
    'task_type',
    'category',
    'difficulty',
    'lang',
    'language',
    'media_type',
    'media_url',
    'content_markdown',
    'prompt',
    'question',
    'model_answer',
    'reference',
    'reference_answer',
    'tags',
    'source',
    'expected_dimensions',
    'response_a',
    'response_b',
  ]);

  return (
    exactDisplayKeys.has(normalizedKey) ||
    normalizedKey.startsWith('expected_') ||
    normalizedKey.includes('prompt') ||
    normalizedKey.includes('question') ||
    normalizedKey.includes('reference') ||
    normalizedKey.includes('model_answer') ||
    normalizedKey.includes('content_markdown') ||
    normalizedKey.includes('media_url')
  );
}

function isMockAnnotationField(sourceKey: string): boolean {
  const normalizedKey = sourceKey.toLowerCase();

  return (
    normalizedKey === 'preferred' ||
    normalizedKey.includes('margin') ||
    normalizedKey.includes('dimension') ||
    normalizedKey.includes('safety_flag') ||
    normalizedKey.includes('annotator') ||
    normalizedKey.includes('reviewer') ||
    normalizedKey.includes('decision') ||
    normalizedKey.includes('rationale') ||
    normalizedKey.includes('note')
  );
}

function hasAllSourceKeys(
  fields: readonly AutoTemplateSourceField[],
  sourceKeys: readonly string[],
): boolean {
  const sourceKeySet = new Set(fields.map((field) => field.sourceKey.toLowerCase()));

  return sourceKeys.every((sourceKey) => sourceKeySet.has(sourceKey));
}

function firstValueType(field: AutoTemplateSourceField): string | null {
  return field.valueTypes[0] ?? null;
}

function normalizeLabel(label: unknown, fallback: string): string {
  return typeof label === 'string' && label.trim() ? label.trim() : fallback;
}

function normalizeAnnotationLabel(label: unknown, fallback: string): string {
  const normalizedLabel = normalizeLabel(label, fallback);
  const strippedLabel = normalizedLabel
    .replace(/^(?:请)?(?:选择|填写|上传|输入|勾选|给出)\s*/u, '')
    .replace(/^(?:所有)?适用的/u, '')
    .trim();

  return strippedLabel || normalizedLabel;
}

function normalizeOptions(options: unknown): FieldOption[] {
  if (!Array.isArray(options)) {
    return [];
  }

  const seenValues = new Set<string>();
  const normalizedOptions: FieldOption[] = [];

  for (const option of options) {
    if (!option || typeof option !== 'object') {
      continue;
    }

    const candidate = option as Partial<FieldOption>;
    const value = typeof candidate.value === 'string' ? candidate.value.trim() : '';

    if (!value || seenValues.has(value)) {
      continue;
    }

    seenValues.add(value);
    normalizedOptions.push({
      label: normalizeLabel(candidate.label, value),
      value,
    });
  }

  return normalizedOptions;
}

function normalizeLayout(layout: unknown): ShowItemDisplayConfig['layout'] {
  if (layout === 'table' || layout === 'card' || layout === 'field_list' || layout === 'comparison') {
    return layout;
  }

  return 'field_list';
}

function normalizeArea(area: unknown): Pick<ShowItemDisplayField, 'area'> {
  return area === 'primary' || area === 'meta' || area === 'content' ? { area } : {};
}

function normalizeFormat(format: unknown): Pick<ShowItemDisplayField, 'format'> {
  return format === 'text' ||
    format === 'long_text' ||
    format === 'badge' ||
    format === 'code' ||
    format === 'json'
    ? { format }
    : {};
}

function normalizePositiveNumber<TKey extends 'width' | 'maxLines'>(
  key: TKey,
  value: unknown,
): Partial<Pick<ShowItemDisplayField, TKey>> {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? ({ [key]: value } as Pick<ShowItemDisplayField, TKey>)
    : {};
}

function normalizeTextProperty<TKey extends 'description' | 'placeholder'>(
  key: TKey,
  value: unknown,
): Partial<Pick<AutoTemplateAnnotationField, TKey>> {
  return typeof value === 'string' && value.trim()
    ? ({ [key]: value.trim() } as Pick<AutoTemplateAnnotationField, TKey>)
    : {};
}

function normalizeAnnotationDescriptionProperty(
  value: unknown,
): Partial<Pick<AutoTemplateAnnotationField, 'description'>> {
  const description = normalizeShortAnnotationDescription(value);

  return description ? { description } : {};
}

function normalizeAnnotationDescription(
  value: unknown,
  label: string,
  type: AutoTemplateAnnotationField['type'],
  options: { fallbackDescription?: boolean } = {},
): string | null {
  return normalizeShortAnnotationDescription(value) ??
    (options.fallbackDescription ? createDefaultAnnotationDescription(label, type) : null);
}

function normalizeShortAnnotationDescription(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const description = value.trim().replace(/\s+/g, ' ');

  return description ? description.slice(0, ANNOTATION_DESCRIPTION_MAX_LENGTH) : null;
}

function createDefaultAnnotationDescription(
  label: string,
  type: AutoTemplateAnnotationField['type'],
): string {
  const normalizedLabel = label.trim() || '该字段';
  const normalizedType = isAutoTemplateAnnotationFieldType(type) ? type : 'text';
  const descriptions: Partial<Record<NonNullable<AutoTemplateAnnotationField['type']>, string>> = {
    checkbox: `选择适用的${normalizedLabel}`,
    tag_select: `选择适用的${normalizedLabel}`,
    radio: `选择${normalizedLabel}结果`,
    textarea: `填写${normalizedLabel}说明`,
    rich_text: `填写${normalizedLabel}说明`,
    file_upload: `上传${normalizedLabel}材料`,
    image_upload: `上传${normalizedLabel}图片`,
    json_editor: `填写${normalizedLabel}JSON`,
  };

  return (descriptions[normalizedType] ?? `填写${normalizedLabel}`).slice(
    0,
    ANNOTATION_DESCRIPTION_MAX_LENGTH,
  );
}

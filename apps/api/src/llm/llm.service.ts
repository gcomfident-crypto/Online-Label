import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import {
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

type LlmAssistMockBody = {
  answers?: unknown;
  datasetKind?: unknown;
  promptTemplate?: unknown;
  rawData?: unknown;
  targetFieldKey?: unknown;
};

export type LlmAssistMockResult = {
  datasetKind: DatasetKind;
  targetFieldKey: string;
  summary: string;
  suggestion: unknown;
};

@Injectable()
export class LlmService {
  createMockAssist(body: LlmAssistMockBody): LlmAssistMockResult {
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

    return createDatasetSuggestion(datasetKind, targetFieldKey);
  }

  async classifyTemplateFields(body: unknown): Promise<AutoTemplateFieldClassificationResult> {
    const request = resolveTemplateFieldClassificationRequest(body);
    const provider = resolveLlmProvider(process.env);

    if (provider === 'mock') {
      return createMockTemplateFieldClassification(request);
    }

    const remoteConfig = resolveOpenAiCompatibleConfig(provider, process.env);

    if (!remoteConfig) {
      throw new BadRequestException({
        code: 'LLM_FIELD_CLASSIFIER_NOT_CONFIGURED',
        message: '字段分类模型未配置，请检查 DEEPSEEK_API_KEY 或 LLM_PROVIDER。',
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

function createDatasetSuggestion(
  datasetKind: DatasetKind,
  targetFieldKey: string,
): LlmAssistMockResult {
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

  return 'mock';
}

function resolveOpenAiCompatibleConfig(
  provider: string,
  env: NodeJS.ProcessEnv,
): OpenAiCompatibleConfig | null {
  if (provider === 'deepseek') {
    const apiKey = env.DEEPSEEK_API_KEY?.trim();

    return apiKey && apiKey !== 'replace_with_deepseek_api_key'
      ? {
          apiKey,
          endpoint: resolveChatCompletionsEndpoint(
            env.DEEPSEEK_API_BASE_URL?.trim() || 'https://api.deepseek.com',
          ),
          model: env.LLM_MODEL?.trim() || 'deepseek-chat',
        }
      : null;
  }

  if (provider === 'openai') {
    const apiKey = env.OPENAI_API_KEY?.trim();

    return apiKey
      ? {
          apiKey,
          endpoint: resolveChatCompletionsEndpoint(
            env.OPENAI_API_BASE_URL?.trim() || 'https://api.openai.com/v1',
          ),
          model: env.LLM_MODEL?.trim() || 'gpt-4o-mini',
        }
      : null;
  }

  if (provider === 'custom') {
    const apiKey = env.LLM_API_KEY?.trim();
    const endpoint = env.LLM_API_BASE_URL?.trim();

    return apiKey && endpoint
      ? {
          apiKey,
          endpoint,
          model: env.LLM_MODEL?.trim() || 'custom-field-classifier',
        }
      : null;
  }

  return null;
}

function resolveChatCompletionsEndpoint(baseUrlOrEndpoint: string): string {
  const trimmed = baseUrlOrEndpoint.replace(/\/+$/, '');

  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
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

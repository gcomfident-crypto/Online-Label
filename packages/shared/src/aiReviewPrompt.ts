import type {
  AiReviewPromptConfig,
  AiReviewPromptSectionKey,
  FieldOption,
  FieldValidation,
  LabelHubSchema,
  SchemaField,
  ShowItemDisplayField,
} from './schema.ts';

export type AiReviewPromptSection = {
  key: AiReviewPromptSectionKey;
  title: string;
  content: string;
};

export type AiReviewFieldRequirement = {
  fieldKey: string;
  label: string;
  type: SchemaField['type'];
  required: boolean;
  description?: string;
  options?: readonly FieldOption[];
  validation?: FieldValidation;
  requirement: string;
};

export type CompileAiReviewPromptInput = {
  schema: LabelHubSchema;
  rawData?: Record<string, unknown>;
  answers?: Record<string, unknown>;
  reviewFieldKeys?: readonly string[];
  persona?: string;
};

export type CompiledAiReviewPrompt = {
  prompt: string;
  promptHash: string;
  sections: readonly AiReviewPromptSection[];
  fieldRequirements: readonly AiReviewFieldRequirement[];
  showItemData: readonly Record<string, unknown>[];
  reviewableRawData: Record<string, unknown>;
  answerData: Record<string, unknown>;
};

const DEFAULT_PERSONA = '';

const OUTPUT_SCHEMA = {
  verdict: 'pass | reject',
  overallScore: '0-100，可选；表示本题字段级预审的综合分',
  fieldReviews: [
    {
      fieldKey: '被审核字段 key',
      label: '被审核字段标题',
      score: '0-100',
      decision: 'pass | reject',
      comment: '20-80 字说明该字段标注结果是否达标',
      suggestions: ['需要标注员修改的建议；通过时可为空数组'],
    },
  ],
  overallComment: '整体审核结论，说明通过或打回的原因',
} as const;

export const compileAiReviewPrompt = ({
  answers = {},
  persona = DEFAULT_PERSONA,
  rawData = {},
  reviewFieldKeys,
  schema,
}: CompileAiReviewPromptInput): CompiledAiReviewPrompt => {
  const flattenedFields = flattenSchemaFields(schema.fields);
  const reviewFieldKeySet = reviewFieldKeys ? new Set(reviewFieldKeys) : undefined;
  const answerRawDataKeys = collectAnswerRawDataKeys(flattenedFields);
  const showItemData = buildShowItemData(flattenedFields, rawData, answerRawDataKeys);
  const reviewableRawData = buildReviewableRawData(showItemData);
  const answerData = buildAnswerData(flattenedFields, answers, reviewFieldKeySet);
  const fieldRequirements = buildFieldRequirements(flattenedFields, reviewFieldKeySet);
  const sections = applyPromptSectionOverrides([
    {
      key: 'persona',
      title: '角色设定',
      content: persona,
    },
    {
      key: 'show_item',
      title: '题目展示信息 Show Item',
      content: stringifyJson(showItemData),
    },
    {
      key: 'answers',
      title: '需要AI预审的字段',
      content: stringifyJson(answerData),
    },
    {
      key: 'field_requirements',
      title: '字段审核标准',
      content:
        fieldRequirements.length > 0
          ? stringifyJson(fieldRequirements)
          : '当前没有字段开启 AI 预审。请先在待标注字段的属性配置中启用 AI 预审并填写审核要求。',
    },
    {
      key: 'output_schema',
      title: '输出格式约束',
      content: [
        '你必须只输出合法 JSON，不要输出 Markdown、解释文本或代码块。',
        '上传文件中与待标注字段同名或映射到待标注字段的值，仅用于 owner 配置模板参考，不是标准答案，不得用于和当前标注答案做一致性比较。',
        'fieldReviews 必须覆盖字段级审核标准中的每一个字段。',
        'fieldReviews 内每一项必须包含 fieldKey、label、score、decision、comment 和 suggestions。',
        'verdict 只能是 pass 或 reject。',
        '只评价开启 AI 预审的字段。',
        '输出 JSON Schema 示例：',
        stringifyJson(OUTPUT_SCHEMA),
      ].join('\n'),
    },
  ], schema.aiReviewPrompt);
  const generatedPrompt = buildPromptFromSections(sections);
  const prompt = schema.aiReviewPrompt?.fullPromptOverride?.trim()
    ? schema.aiReviewPrompt.fullPromptOverride
    : generatedPrompt;

  return {
    prompt,
    promptHash: hashPrompt(prompt),
    sections,
    fieldRequirements,
    showItemData,
    reviewableRawData,
    answerData,
  };
};

const applyPromptSectionOverrides = (
  sections: readonly AiReviewPromptSection[],
  config: AiReviewPromptConfig | undefined,
): AiReviewPromptSection[] => {
  const overrides = config?.sectionOverrides ?? {};

  return sections.map((section) => {
    const override = overrides[section.key];

    if (typeof override !== 'string') {
      return section;
    }

    return {
      ...section,
      content: override,
    };
  });
};

const buildPromptFromSections = (sections: readonly AiReviewPromptSection[]): string =>
  sections
    .map((section, index) => `# ${index + 1}. ${section.title}\n${section.content}`)
    .join('\n\n');

const flattenSchemaFields = (fields: readonly SchemaField[]): SchemaField[] => {
  const flattened: SchemaField[] = [];

  for (const field of fields) {
    flattened.push(field);

    if (field.fields) {
      flattened.push(...flattenSchemaFields(field.fields));
    }

    if (field.tabs) {
      for (const tab of field.tabs) {
        flattened.push(...flattenSchemaFields(tab.fields));
      }
    }
  }

  return flattened;
};

const buildShowItemData = (
  fields: readonly SchemaField[],
  rawData: Record<string, unknown>,
  excludedRawDataKeys: ReadonlySet<string>,
): readonly Record<string, unknown>[] => {
  const displayFields = fields
    .filter((field) => field.type === 'show_item')
    .flatMap((field) => normalizeShowItemDisplayFields(field))
    .filter((field) => !excludedRawDataKeys.has(field.sourceKey));

  if (displayFields.length === 0) {
    return Object.keys(rawData)
      .filter((sourceKey) => !excludedRawDataKeys.has(sourceKey))
      .map((sourceKey) => ({
        sourceKey,
        label: sourceKey,
        value: rawData[sourceKey] ?? null,
      }));
  }

  return displayFields.map((field) => ({
    sourceKey: field.sourceKey,
    label: field.label,
    format: field.format ?? 'text',
    value: rawData[field.sourceKey] ?? null,
  }));
};

const buildReviewableRawData = (
  showItemData: readonly Record<string, unknown>[],
): Record<string, unknown> => {
  const reviewableRawData: Record<string, unknown> = {};

  for (const item of showItemData) {
    if (typeof item.sourceKey !== 'string' || !item.sourceKey.trim()) {
      continue;
    }

    reviewableRawData[item.sourceKey] = item.value ?? null;
  }

  return reviewableRawData;
};

const collectAnswerRawDataKeys = (fields: readonly SchemaField[]): ReadonlySet<string> => {
  const keys = new Set<string>();

  for (const field of fields) {
    if (!isAnswerField(field)) {
      continue;
    }

    for (const key of [
      field.key,
      field.fieldKey,
      field.sourceKey,
      ...(field.sourceKeys ?? []),
    ]) {
      if (typeof key === 'string' && key.trim()) {
        keys.add(key);
      }
    }
  }

  return keys;
};

const normalizeShowItemDisplayFields = (field: SchemaField): ShowItemDisplayField[] => {
  if (field.displayConfig?.fields) {
    return field.displayConfig.fields
      .filter((displayField) => displayField.visible !== false)
      .map((displayField) => ({
        ...displayField,
        label: displayField.label || displayField.sourceKey,
      }));
  }

  const sourceKeys = field.sourceKeys ?? (field.sourceKey ? [field.sourceKey] : []);

  return sourceKeys.map((sourceKey) => ({
    sourceKey,
    label: sourceKey,
    area: 'content',
    format: 'text',
  }));
};

const buildAnswerData = (
  fields: readonly SchemaField[],
  answers: Record<string, unknown>,
  reviewFieldKeys?: ReadonlySet<string>,
): Record<string, unknown> => {
  const answerEntries = fields
    .filter((field) => isAiReviewAnswerField(field, reviewFieldKeys))
    .map((field) => {
      const fieldKey = field.fieldKey ?? field.sourceKey ?? field.key;
      return [fieldKey, Object.prototype.hasOwnProperty.call(answers, fieldKey) ? answers[fieldKey] : null] as const;
    });

  return Object.fromEntries(answerEntries);
};

const buildFieldRequirements = (
  fields: readonly SchemaField[],
  reviewFieldKeys?: ReadonlySet<string>,
): AiReviewFieldRequirement[] =>
  fields
    .filter(isAnswerField)
    .filter((field) => field.aiReview?.enabled)
    .filter((field) => {
      if (!reviewFieldKeys) {
        return true;
      }

      const fieldKey = field.fieldKey ?? field.sourceKey ?? field.key;

      return reviewFieldKeys.has(fieldKey);
    })
    .map((field) => ({
      fieldKey: field.fieldKey ?? field.sourceKey ?? field.key,
      label: field.label,
      type: field.type,
      required: Boolean(field.required || field.validation?.required),
      ...(field.description ? { description: field.description } : {}),
      ...(field.options && field.options.length > 0 ? { options: field.options } : {}),
      ...(field.validation ? { validation: field.validation } : {}),
      requirement: field.aiReview?.requirement?.trim() || '请判断该字段标注结果是否符合题目事实和任务要求。',
    }));

const isAnswerField = (field: SchemaField): boolean =>
  !['show_item', 'group', 'tabs', 'llm_assist'].includes(field.type);

const isAiReviewAnswerField = (
  field: SchemaField,
  reviewFieldKeys?: ReadonlySet<string>,
): boolean => {
  if (!isAnswerField(field) || !field.aiReview?.enabled) {
    return false;
  }

  if (!reviewFieldKeys) {
    return true;
  }

  const fieldKey = field.fieldKey ?? field.sourceKey ?? field.key;

  return reviewFieldKeys.has(fieldKey);
};

const stringifyJson = (value: unknown): string => JSON.stringify(value, null, 2);

const hashPrompt = (prompt: string): string => {
  let hash = 5381;

  for (let index = 0; index < prompt.length; index += 1) {
    hash = (hash * 33) ^ prompt.charCodeAt(index);
  }

  return `prompt_${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

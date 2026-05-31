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
  persona?: string;
};

export type CompiledAiReviewPrompt = {
  prompt: string;
  promptHash: string;
  sections: readonly AiReviewPromptSection[];
  fieldRequirements: readonly AiReviewFieldRequirement[];
  showItemData: readonly Record<string, unknown>[];
  answerData: Record<string, unknown>;
};

const DEFAULT_PERSONA =
  '你是一个专业的数据标注质检审核员。你的任务是根据题目展示信息、标注员提交内容和字段审核标准，对本次标注结果进行 AI 预审。';

const OUTPUT_SCHEMA = {
  verdict: 'pass | reject | manual',
  overallScore: '0-100',
  fieldReviews: [
    {
      fieldKey: '被审核字段 key',
      label: '被审核字段标题',
      score: '0-100',
      passed: true,
      reason: '20-80 字说明该字段是否达标',
    },
  ],
  scores: {
    relevance: '0-100',
    accuracy: '0-100',
    format: '0-100',
    safety: '0-100',
    overall: '0-100',
  },
  reason: '整体审核结论，说明通过、打回或人工复核的原因',
  suggestions: ['需要标注员修改的建议；通过时可为空数组'],
} as const;

export const compileAiReviewPrompt = ({
  answers = {},
  persona = DEFAULT_PERSONA,
  rawData = {},
  schema,
}: CompileAiReviewPromptInput): CompiledAiReviewPrompt => {
  const flattenedFields = flattenSchemaFields(schema.fields);
  const showItemData = buildShowItemData(flattenedFields, rawData);
  const answerData = buildAnswerData(flattenedFields, answers);
  const fieldRequirements = buildFieldRequirements(flattenedFields);
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
      title: '标注员提交内容',
      content: stringifyJson(answerData),
    },
    {
      key: 'field_requirements',
      title: '字段级审核标准',
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
        'fieldReviews 必须覆盖字段级审核标准中的每一个字段。',
        'verdict 只能是 pass、reject、manual 三者之一。',
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
): readonly Record<string, unknown>[] => {
  const displayFields = fields
    .filter((field) => field.type === 'show_item')
    .flatMap((field) => normalizeShowItemDisplayFields(field));

  if (displayFields.length === 0) {
    return Object.keys(rawData).map((sourceKey) => ({
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
): Record<string, unknown> => {
  const answerEntries = fields
    .filter(isAnswerField)
    .map((field) => {
      const fieldKey = field.fieldKey ?? field.sourceKey ?? field.key;
      return [fieldKey, Object.prototype.hasOwnProperty.call(answers, fieldKey) ? answers[fieldKey] : null] as const;
    });

  return Object.fromEntries(answerEntries);
};

const buildFieldRequirements = (fields: readonly SchemaField[]): AiReviewFieldRequirement[] =>
  fields
    .filter(isAnswerField)
    .filter((field) => field.aiReview?.enabled)
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

const stringifyJson = (value: unknown): string => JSON.stringify(value, null, 2);

const hashPrompt = (prompt: string): string => {
  let hash = 5381;

  for (let index = 0; index < prompt.length; index += 1) {
    hash = (hash * 33) ^ prompt.charCodeAt(index);
  }

  return `prompt_${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

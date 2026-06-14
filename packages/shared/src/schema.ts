export const DATASET_KINDS = ['qa_quality', 'preference_compare', 'generic_json'] as const;
export type DatasetKind = (typeof DATASET_KINDS)[number];

export const DATASET_IMPORT_FORMATS = ['json', 'jsonl', 'csv', 'xlsx', 'zip'] as const;
export type DatasetImportFormat = (typeof DATASET_IMPORT_FORMATS)[number];

export const FIELD_TYPES = [
  'show_item',
  'text',
  'textarea',
  'radio',
  'checkbox',
  'tag_select',
  'rich_text',
  'file_upload',
  'image_upload',
  'json_editor',
  'llm_assist',
  'group',
  'tabs',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_LINKAGE_ACTIONS = [
  'show',
  'hide',
  'limitOptions',
  'require',
  'disable',
  'setValue',
  'assertValue',
] as const;

export type FieldLinkageAction = (typeof FIELD_LINKAGE_ACTIONS)[number];

export const CUSTOM_VALIDATOR_KEYS = [
  'non_empty_json',
  'safe_url',
  'valid_json',
  'valid_email',
  'valid_file_type',
] as const;

export type CustomValidatorKey = (typeof CUSTOM_VALIDATOR_KEYS)[number];

export type FieldValidation = {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  customValidatorKey?: CustomValidatorKey;
  message?: string;
};

export type FieldLinkageCondition = {
  fieldKey: string;
  operator:
    | 'equals'
    | 'notEquals'
    | 'contains'
    | 'notContains'
    | 'exists'
    | 'notExists';
  value?: unknown;
};

export type FieldLinkageOptionCase = {
  value: unknown;
  optionValues: readonly string[];
};

export type FieldLinkageRuleCombinator = 'and' | 'or';

export type LegacyFieldLinkageRule = {
  when: FieldLinkageCondition;
  action: FieldLinkageAction;
  targetFieldKey: string;
  value?: unknown;
  optionValues?: readonly string[];
  cases?: readonly FieldLinkageOptionCase[];
  clearInvalidValue?: boolean;
  autoSelectWhenSingleOption?: boolean;
  bidirectional?: boolean;
  message?: string;
};

export type StructuredFieldLinkageAction = {
  type: FieldLinkageAction;
  targetFieldKey: string;
  value?: unknown;
  optionValues?: readonly string[];
  clearInvalidValue?: boolean;
  autoSelectWhenSingleOption?: boolean;
  bidirectional?: boolean;
  message?: string;
};

export type StructuredFieldLinkageRule = {
  id?: string;
  combinator?: FieldLinkageRuleCombinator;
  conditions: readonly FieldLinkageCondition[];
  actions: readonly StructuredFieldLinkageAction[];
};

export type FieldLinkageRule = LegacyFieldLinkageRule | StructuredFieldLinkageRule;

export type FieldOption = {
  label: string;
  value: string;
};

export type FileConstraints = {
  maxFiles?: number;
  maxSizeMb?: number;
  acceptedMimeTypes?: readonly string[];
};

export type ShowItemDisplayField = {
  sourceKey: string;
  label: string;
  visible?: boolean;
  area?: 'primary' | 'meta' | 'content';
  format?: 'text' | 'long_text' | 'badge' | 'code' | 'json';
  width?: number;
  maxLines?: number;
};

export type ShowItemDisplayConfig = {
  layout: 'table' | 'card' | 'field_list' | 'comparison';
  fields: readonly ShowItemDisplayField[];
};

export type LabelHubSchemaMetadata = {
  autoTemplateSource?: {
    sourceFileName?: string;
    previewRecords?: readonly Record<string, unknown>[];
  };
  [key: string]: unknown;
};

export const FIELD_AI_REVIEW_ROLES = [
  'annotation_answer',
  'source_context',
  'reference_answer',
  'supporting_context',
  'ignore',
] as const;

export type FieldAiReviewRole = (typeof FIELD_AI_REVIEW_ROLES)[number];

export type AiReviewRubricDimension = {
  key: string;
  label: string;
  weight: number;
  criteria: string;
};

export type FieldAiReviewRubric = {
  dimensions: readonly AiReviewRubricDimension[];
};

export type FieldAiReviewConfig = {
  enabled?: boolean;
  role?: FieldAiReviewRole;
  requirement?: string;
  rubric?: FieldAiReviewRubric;
};

export const AI_REVIEW_PROMPT_SECTION_KEYS = [
  'persona',
  'show_item',
  'answers',
  'field_requirements',
  'output_schema',
] as const;

export type AiReviewPromptSectionKey = (typeof AI_REVIEW_PROMPT_SECTION_KEYS)[number];

export type AiReviewPromptSectionOverrides = Partial<Record<AiReviewPromptSectionKey, string>>;

export type AiReviewPromptConfig = {
  sectionOverrides?: AiReviewPromptSectionOverrides;
  fullPromptOverride?: string;
};

export type SchemaField = {
  key: string;
  fieldKey?: string;
  sourceKey?: string;
  sourceKeys?: readonly string[];
  displayConfig?: ShowItemDisplayConfig;
  targetFieldKey?: string;
  promptTemplate?: string;
  type: FieldType;
  label: string;
  description?: string;
  placeholder?: string;
  options?: readonly FieldOption[];
  fileConstraints?: FileConstraints;
  aiReview?: FieldAiReviewConfig;
  required?: boolean;
  validation?: FieldValidation;
  validateWhenHidden?: boolean;
  linkageRules?: readonly FieldLinkageRule[];
  layout?: 'auto_rows' | 'single_column' | 'two_columns' | 'three_columns';
  defaultCollapsed?: boolean;
  fields?: readonly SchemaField[];
  tabs?: readonly {
    key: string;
    label: string;
    fields: readonly SchemaField[];
  }[];
};

export type LabelHubSchema = {
  schemaVersion: string;
  datasetKind: DatasetKind;
  fields: readonly SchemaField[];
  linkageRules?: readonly FieldLinkageRule[];
  aiReviewPrompt?: AiReviewPromptConfig;
  metadata?: LabelHubSchemaMetadata;
};

export type LabelhubSchema = LabelHubSchema;

export const isAllowedCustomValidatorKey = (
  value: unknown,
): value is CustomValidatorKey => {
  return (
    typeof value === 'string' &&
    CUSTOM_VALIDATOR_KEYS.includes(value as CustomValidatorKey)
  );
};

export const createLabelHubSchema = <TSchema extends LabelHubSchema>(
  schema: TSchema,
): TSchema => {
  return schema;
};

export const isStructuredFieldLinkageRule = (
  rule: FieldLinkageRule,
): rule is StructuredFieldLinkageRule => {
  return 'conditions' in rule && Array.isArray(rule.conditions) && 'actions' in rule && Array.isArray(rule.actions);
};

export const isLegacyFieldLinkageRule = (
  rule: FieldLinkageRule,
): rule is LegacyFieldLinkageRule => {
  return 'when' in rule && 'action' in rule && 'targetFieldKey' in rule;
};

const defaultStructuredRuleId = (
  rule: FieldLinkageRule,
  ruleIndex: number,
  actionIndex = 0,
): string => {
  if (isStructuredFieldLinkageRule(rule) && rule.id) {
    return rule.id;
  }

  if (isLegacyFieldLinkageRule(rule)) {
    return `legacy:${rule.targetFieldKey}:${rule.when.fieldKey || 'unknown'}:${ruleIndex}:${actionIndex}`;
  }

  return `linkage:${ruleIndex}:${actionIndex}`;
};

export const expandFieldLinkageRule = (
  rule: FieldLinkageRule,
  ruleIndex = 0,
): StructuredFieldLinkageRule[] => {
  if (isStructuredFieldLinkageRule(rule)) {
    return [
      {
        id: rule.id ?? defaultStructuredRuleId(rule, ruleIndex),
        combinator: rule.combinator ?? 'and',
        conditions: [...rule.conditions],
        actions: [...rule.actions],
      },
    ];
  }

  if (rule.action === 'limitOptions' && rule.cases && rule.cases.length > 0) {
    return rule.cases.map((ruleCase, caseIndex) => ({
      id: defaultStructuredRuleId(rule, ruleIndex, caseIndex),
      combinator: 'and',
      conditions: [
        {
          fieldKey: rule.when.fieldKey,
          operator: 'equals',
          value: ruleCase.value,
        },
      ],
      actions: [
        {
          type: 'limitOptions',
          targetFieldKey: rule.targetFieldKey,
          optionValues: [...ruleCase.optionValues],
          clearInvalidValue: rule.clearInvalidValue,
          autoSelectWhenSingleOption: rule.autoSelectWhenSingleOption,
          bidirectional: rule.bidirectional,
          message: rule.message,
        },
      ],
    }));
  }

  return [
    {
      id: defaultStructuredRuleId(rule, ruleIndex),
      combinator: 'and',
      conditions: [{ ...rule.when }],
      actions: [
        {
          type: rule.action,
          targetFieldKey: rule.targetFieldKey,
          value: rule.value,
          optionValues: rule.optionValues ? [...rule.optionValues] : undefined,
          clearInvalidValue: rule.clearInvalidValue,
          autoSelectWhenSingleOption: rule.autoSelectWhenSingleOption,
          bidirectional: rule.bidirectional,
          message: rule.message,
        },
      ],
    },
  ];
};

export const collectFieldLinkageRuleFieldKeys = (
  rule: FieldLinkageRule,
): string[] => {
  if (isStructuredFieldLinkageRule(rule)) {
    return [
      ...rule.conditions.map((condition) => condition.fieldKey),
      ...rule.actions.map((action) => action.targetFieldKey),
    ];
  }

  return [rule.when.fieldKey, rule.targetFieldKey];
};

export const DATASET_KINDS = ['qa_quality', 'preference_compare', 'generic_json'] as const;
export type DatasetKind = (typeof DATASET_KINDS)[number];

export const DATASET_IMPORT_FORMATS = ['json', 'jsonl', 'xlsx', 'zip'] as const;
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
  'require',
  'disable',
  'setValue',
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

export type FieldLinkageRule = {
  when: FieldLinkageCondition;
  action: FieldLinkageAction;
  targetFieldKey: string;
  value?: unknown;
};

export type FieldOption = {
  label: string;
  value: string;
};

export type SchemaField = {
  key: string;
  fieldKey?: string;
  sourceKey?: string;
  sourceKeys?: readonly string[];
  targetFieldKey?: string;
  promptTemplate?: string;
  type: FieldType;
  label: string;
  description?: string;
  placeholder?: string;
  options?: readonly FieldOption[];
  required?: boolean;
  validation?: FieldValidation;
  validateWhenHidden?: boolean;
  linkageRules?: readonly FieldLinkageRule[];
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

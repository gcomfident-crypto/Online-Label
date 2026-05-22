import {
  CUSTOM_VALIDATOR_KEYS,
  isAllowedCustomValidatorKey,
  type FieldType,
  type LabelHubSchema,
  type SchemaField,
} from './schema.ts';
import { getSchemaFieldKey } from './schemaRuntime.ts';

export type TemplateSchemaValidationError = {
  code:
    | 'TEMPLATE_SCHEMA_EMPTY'
    | 'TEMPLATE_FIELD_KEY_DUPLICATED'
    | 'TEMPLATE_SHOW_ITEM_SOURCE_REQUIRED'
    | 'TEMPLATE_OPTIONS_REQUIRED'
    | 'TEMPLATE_GROUP_CHILDREN_REQUIRED'
    | 'TEMPLATE_TABS_REQUIRED'
    | 'TEMPLATE_TAB_CHILDREN_REQUIRED'
    | 'TEMPLATE_FILE_CONSTRAINT_REQUIRED'
    | 'TEMPLATE_IMAGE_MIME_REQUIRED'
    | 'TEMPLATE_LLM_TARGET_MISSING'
    | 'TEMPLATE_LINKAGE_SOURCE_MISSING'
    | 'TEMPLATE_LINKAGE_TARGET_MISSING'
    | 'TEMPLATE_CUSTOM_VALIDATOR_INVALID';
  message: string;
  fieldKey?: string;
};

export type TemplateSchemaValidationResult = {
  valid: boolean;
  errors: TemplateSchemaValidationError[];
};

export type TemplateCompatibilityReport = {
  addedFieldKeys: string[];
  removedFieldKeys: string[];
  changedFieldTypes: Array<{
    fieldKey: string;
    from: FieldType;
    to: FieldType;
  }>;
  compatible: boolean;
  riskMessages: string[];
};

const OPTION_FIELD_TYPES = new Set<SchemaField['type']>(['radio', 'checkbox', 'tag_select']);

export const validateTemplateSchema = (
  schema: LabelHubSchema,
): TemplateSchemaValidationResult => {
  const errors: TemplateSchemaValidationError[] = [];
  const fields = collectTemplateFields(schema.fields);
  const fieldKeys = fields.map(getSchemaFieldKey);
  const fieldKeySet = new Set(fieldKeys);

  if (fields.length === 0) {
    errors.push({
      code: 'TEMPLATE_SCHEMA_EMPTY',
      message: '模板至少需要一个字段。',
    });
  }

  for (const duplicatedKey of collectDuplicatedValues(fieldKeys)) {
    errors.push({
      code: 'TEMPLATE_FIELD_KEY_DUPLICATED',
      fieldKey: duplicatedKey,
      message: `字段名 ${duplicatedKey} 重复，请修改后再保存。`,
    });
  }

  for (const field of fields) {
    const fieldKey = getSchemaFieldKey(field);

    if (
      field.type === 'show_item' &&
      !field.sourceKey &&
      (!field.sourceKeys || field.sourceKeys.length === 0)
    ) {
      errors.push({
        code: 'TEMPLATE_SHOW_ITEM_SOURCE_REQUIRED',
        fieldKey,
        message: `展示项 ${field.label} 需要绑定原始数据字段。`,
      });
    }

    if (OPTION_FIELD_TYPES.has(field.type) && (!field.options || field.options.length === 0)) {
      errors.push({
        code: 'TEMPLATE_OPTIONS_REQUIRED',
        fieldKey,
        message: `${field.label}至少需要一个选项。`,
      });
    }

    if (field.type === 'group' && (!field.fields || field.fields.length === 0)) {
      errors.push({
        code: 'TEMPLATE_GROUP_CHILDREN_REQUIRED',
        fieldKey,
        message: `${field.label}至少需要一个子字段。`,
      });
    }

    if (field.type === 'tabs' && (!field.tabs || field.tabs.length === 0)) {
      errors.push({
        code: 'TEMPLATE_TABS_REQUIRED',
        fieldKey,
        message: `${field.label}至少需要一个 Tab。`,
      });
    }

    for (const tab of field.tabs ?? []) {
      if (tab.fields.length === 0) {
        errors.push({
          code: 'TEMPLATE_TAB_CHILDREN_REQUIRED',
          fieldKey,
          message: `${field.label}的 ${tab.label} 至少需要一个子字段。`,
        });
      }
    }

    if (field.type === 'file_upload' || field.type === 'image_upload') {
      validateFileConstraints(field, fieldKey, errors);
    }

    if (field.type === 'llm_assist' && (!field.targetFieldKey || !fieldKeySet.has(field.targetFieldKey))) {
      errors.push({
        code: 'TEMPLATE_LLM_TARGET_MISSING',
        fieldKey,
        message: `${field.label}需要绑定一个可写入目标字段。`,
      });
    }

    for (const rule of field.linkageRules ?? []) {
      validateLinkageRule(rule.when.fieldKey, rule.targetFieldKey, fieldKeySet, errors);
    }

    const customValidatorKey = field.validation?.customValidatorKey;

    if (
      customValidatorKey !== undefined &&
      (!isAllowedCustomValidatorKey(customValidatorKey) ||
        !CUSTOM_VALIDATOR_KEYS.includes(customValidatorKey))
    ) {
      errors.push({
        code: 'TEMPLATE_CUSTOM_VALIDATOR_INVALID',
        fieldKey,
        message: `自定义校验 ${customValidatorKey} 不在白名单内。`,
      });
    }
  }

  for (const rule of schema.linkageRules ?? []) {
    validateLinkageRule(rule.when.fieldKey, rule.targetFieldKey, fieldKeySet, errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

export const buildTemplateCompatibilityReport = (
  previous: LabelHubSchema,
  next: LabelHubSchema,
): TemplateCompatibilityReport => {
  const previousFieldsByKey = createFieldTypeMap(previous);
  const nextFieldsByKey = createFieldTypeMap(next);
  const addedFieldKeys = [...nextFieldsByKey.keys()].filter((fieldKey) => !previousFieldsByKey.has(fieldKey));
  const removedFieldKeys = [...previousFieldsByKey.keys()].filter((fieldKey) => !nextFieldsByKey.has(fieldKey));
  const changedFieldTypes = [...nextFieldsByKey.entries()]
    .filter(([fieldKey, fieldType]) => {
      return previousFieldsByKey.has(fieldKey) && previousFieldsByKey.get(fieldKey) !== fieldType;
    })
    .map(([fieldKey, fieldType]) => ({
      fieldKey,
      from: previousFieldsByKey.get(fieldKey) as FieldType,
      to: fieldType,
    }));
  const riskMessages = [
    ...addedFieldKeys.map((fieldKey) => `新增字段 ${fieldKey}。`),
    ...removedFieldKeys.map((fieldKey) => `删除字段 ${fieldKey}，历史数据可能无法完整展示。`),
    ...changedFieldTypes.map(
      (change) => `字段 ${change.fieldKey} 类型由 ${change.from} 改为 ${change.to}。`,
    ),
  ];

  return {
    addedFieldKeys,
    removedFieldKeys,
    changedFieldTypes,
    compatible: removedFieldKeys.length === 0 && changedFieldTypes.length === 0,
    riskMessages,
  };
};

const validateLinkageRule = (
  sourceFieldKey: string,
  targetFieldKey: string,
  fieldKeySet: ReadonlySet<string>,
  errors: TemplateSchemaValidationError[],
) => {
  if (!fieldKeySet.has(sourceFieldKey)) {
    errors.push({
      code: 'TEMPLATE_LINKAGE_SOURCE_MISSING',
      fieldKey: sourceFieldKey,
      message: `联动条件字段 ${sourceFieldKey} 不存在。`,
    });
  }

  if (!fieldKeySet.has(targetFieldKey)) {
    errors.push({
      code: 'TEMPLATE_LINKAGE_TARGET_MISSING',
      fieldKey: targetFieldKey,
      message: `联动目标字段 ${targetFieldKey} 不存在。`,
    });
  }
};

const validateFileConstraints = (
  field: SchemaField,
  fieldKey: string,
  errors: TemplateSchemaValidationError[],
) => {
  const constraints = field.fileConstraints;
  const acceptedMimeTypes = constraints?.acceptedMimeTypes ?? [];

  if (
    !constraints ||
    !Number.isFinite(constraints.maxFiles) ||
    Number(constraints.maxFiles) < 1 ||
    !Number.isFinite(constraints.maxSizeMb) ||
    Number(constraints.maxSizeMb) <= 0 ||
    acceptedMimeTypes.length === 0
  ) {
    errors.push({
      code: 'TEMPLATE_FILE_CONSTRAINT_REQUIRED',
      fieldKey,
      message: `${field.label}需要配置文件数量、大小上限和允许类型。`,
    });
    return;
  }

  if (
    field.type === 'image_upload' &&
    !acceptedMimeTypes.every((mimeType) => mimeType === 'image/*' || mimeType.startsWith('image/'))
  ) {
    errors.push({
      code: 'TEMPLATE_IMAGE_MIME_REQUIRED',
      fieldKey,
      message: `${field.label}的允许类型必须是 image/* 或具体图片 MIME。`,
    });
  }
};

const collectTemplateFields = (fields: readonly SchemaField[]): SchemaField[] => {
  return fields.flatMap((field) => [
    field,
    ...(field.fields ? collectTemplateFields(field.fields) : []),
    ...(field.tabs?.flatMap((tab) => collectTemplateFields(tab.fields)) ?? []),
  ]);
};

const collectDuplicatedValues = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  const duplicated = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicated.add(value);
    }

    seen.add(value);
  }

  return [...duplicated];
};

const createFieldTypeMap = (schema: LabelHubSchema): Map<string, FieldType> => {
  return new Map(
    collectTemplateFields(schema.fields).map((field) => [getSchemaFieldKey(field), field.type]),
  );
};

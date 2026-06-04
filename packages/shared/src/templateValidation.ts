import {
  CUSTOM_VALIDATOR_KEYS,
  expandFieldLinkageRule,
  isAllowedCustomValidatorKey,
  isLegacyFieldLinkageRule,
  isStructuredFieldLinkageRule,
  type FieldLinkageRule,
  type StructuredFieldLinkageRule,
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
    | 'TEMPLATE_LINKAGE_SOURCE_INVALID'
    | 'TEMPLATE_LINKAGE_TARGET_INVALID'
    | 'TEMPLATE_LINKAGE_OPTIONS_TARGET_INVALID'
    | 'TEMPLATE_LINKAGE_OPTION_INVALID'
    | 'TEMPLATE_LINKAGE_CONFLICT'
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

const OPTION_FIELD_TYPES = new Set<SchemaField['type']>(['radio', 'checkbox']);
const SUBMITTABLE_FIELD_TYPES = new Set<SchemaField['type']>([
  'text',
  'textarea',
  'radio',
  'checkbox',
  'tag_select',
  'rich_text',
  'file_upload',
  'image_upload',
  'json_editor',
]);
const LIMIT_OPTION_TARGET_TYPES = new Set<SchemaField['type']>(['radio', 'checkbox', 'tag_select']);

const missingLinkageFieldMessage = (
  kind: 'source' | 'target',
  fieldKey: string,
): string => {
  if (!fieldKey) {
    return kind === 'source' ? '联动条件字段 未设置。' : '联动目标字段 未设置。';
  }

  return kind === 'source'
    ? `联动条件字段 ${fieldKey} 不存在。`
    : `联动目标字段 ${fieldKey} 不存在。`;
};

export const validateTemplateSchema = (
  schema: LabelHubSchema,
): TemplateSchemaValidationResult => {
  const errors: TemplateSchemaValidationError[] = [];
  const fields = collectTemplateFields(schema.fields);
  const fieldKeys = fields.map(getSchemaFieldKey);
  const fieldKeySet = new Set(fieldKeys);
  const fieldsByKey = createFieldMap(fields);
  const linkageRules: FieldLinkageRule[] = [];

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
      linkageRules.push(rule);
      validateLinkageRule(rule, fieldsByKey, fieldKeySet, errors);
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
    linkageRules.push(rule);
    validateLinkageRule(rule, fieldsByKey, fieldKeySet, errors);
  }

  validateLinkageConflicts(linkageRules, errors);

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
  rule: FieldLinkageRule,
  fieldsByKey: ReadonlyMap<string, SchemaField>,
  fieldKeySet: ReadonlySet<string>,
  errors: TemplateSchemaValidationError[],
) => {
  if (isStructuredFieldLinkageRule(rule)) {
    validateStructuredLinkageRule(rule, fieldsByKey, fieldKeySet, errors);
    return;
  }

  if (isLegacyFieldLinkageRule(rule)) {
    validateLegacyLinkageRule(rule, fieldsByKey, fieldKeySet, errors);
  }
};

const validateLegacyLinkageRule = (
  rule: Extract<FieldLinkageRule, { when: unknown }>,
  fieldsByKey: ReadonlyMap<string, SchemaField>,
  fieldKeySet: ReadonlySet<string>,
  errors: TemplateSchemaValidationError[],
) => {
  const sourceFieldKey = rule.when.fieldKey;
  const targetFieldKey = rule.targetFieldKey;
  const sourceField = fieldsByKey.get(sourceFieldKey);
  const targetField = fieldsByKey.get(targetFieldKey);

  if (!fieldKeySet.has(sourceFieldKey)) {
    errors.push({
      code: 'TEMPLATE_LINKAGE_SOURCE_MISSING',
      fieldKey: sourceFieldKey,
      message: missingLinkageFieldMessage('source', sourceFieldKey),
    });
  }

  if (!fieldKeySet.has(targetFieldKey)) {
    errors.push({
      code: 'TEMPLATE_LINKAGE_TARGET_MISSING',
      fieldKey: targetFieldKey,
      message: missingLinkageFieldMessage('target', targetFieldKey),
    });
  }

  if (sourceField && !SUBMITTABLE_FIELD_TYPES.has(sourceField.type)) {
    errors.push({
      code: 'TEMPLATE_LINKAGE_SOURCE_INVALID',
      fieldKey: sourceFieldKey,
      message: `联动条件字段 ${sourceField.label} 不是可提交字段，不能作为条件字段。`,
    });
  }

  if (
    targetField &&
    (rule.action === 'show' || rule.action === 'hide') &&
    !SUBMITTABLE_FIELD_TYPES.has(targetField.type)
  ) {
    errors.push({
      code: 'TEMPLATE_LINKAGE_TARGET_INVALID',
      fieldKey: targetFieldKey,
      message: `联动目标字段 ${targetField.label} 不是可提交字段，不能用于控制显隐。`,
    });
  }

  if (rule.action !== 'limitOptions') {
    return;
  }

  if (targetField && !LIMIT_OPTION_TARGET_TYPES.has(targetField.type)) {
    errors.push({
      code: 'TEMPLATE_LINKAGE_OPTIONS_TARGET_INVALID',
      fieldKey: targetFieldKey,
      message: `限制选项的目标字段 ${targetField.label} 必须是单选、多选或标签选择。`,
    });
    return;
  }

  if (!targetField) {
    return;
  }

  const targetOptionValues = new Set((targetField.options ?? []).map((option) => option.value));
  const configuredValues = [
    ...(rule.optionValues ?? []),
    ...(rule.cases ?? []).flatMap((ruleCase) => ruleCase.optionValues),
  ];

  for (const optionValue of configuredValues) {
    if (!targetOptionValues.has(optionValue)) {
      errors.push({
        code: 'TEMPLATE_LINKAGE_OPTION_INVALID',
        fieldKey: targetFieldKey,
        message: `限制选项 ${optionValue} 不属于目标字段 ${targetField.label} 的已有选项。`,
      });
    }
  }
};

const validateStructuredLinkageRule = (
  rule: StructuredFieldLinkageRule,
  fieldsByKey: ReadonlyMap<string, SchemaField>,
  fieldKeySet: ReadonlySet<string>,
  errors: TemplateSchemaValidationError[],
) => {
  if (rule.conditions.length === 0 || rule.actions.length === 0) {
    errors.push({
      code: 'TEMPLATE_LINKAGE_CONFLICT',
      message: '联动规则至少需要一个条件和一个动作。',
    });
    return;
  }

  for (const condition of rule.conditions) {
    const sourceField = fieldsByKey.get(condition.fieldKey);

    if (!fieldKeySet.has(condition.fieldKey)) {
      errors.push({
        code: 'TEMPLATE_LINKAGE_SOURCE_MISSING',
        fieldKey: condition.fieldKey,
        message: missingLinkageFieldMessage('source', condition.fieldKey),
      });
      continue;
    }

    if (sourceField && !SUBMITTABLE_FIELD_TYPES.has(sourceField.type)) {
      errors.push({
        code: 'TEMPLATE_LINKAGE_SOURCE_INVALID',
        fieldKey: condition.fieldKey,
        message: `联动条件字段 ${sourceField.label} 不是可提交字段，不能作为条件字段。`,
      });
    }
  }

  for (const action of rule.actions) {
    const targetField = fieldsByKey.get(action.targetFieldKey);

    if (!fieldKeySet.has(action.targetFieldKey)) {
      errors.push({
        code: 'TEMPLATE_LINKAGE_TARGET_MISSING',
        fieldKey: action.targetFieldKey,
        message: missingLinkageFieldMessage('target', action.targetFieldKey),
      });
      continue;
    }

    if (
      targetField &&
      (action.type === 'show' || action.type === 'hide') &&
      !SUBMITTABLE_FIELD_TYPES.has(targetField.type)
    ) {
      errors.push({
        code: 'TEMPLATE_LINKAGE_TARGET_INVALID',
        fieldKey: action.targetFieldKey,
        message: `联动目标字段 ${targetField.label} 不是可提交字段，不能用于控制显隐。`,
      });
    }

    if (action.type !== 'limitOptions') {
      continue;
    }

    if (targetField && !LIMIT_OPTION_TARGET_TYPES.has(targetField.type)) {
      errors.push({
        code: 'TEMPLATE_LINKAGE_OPTIONS_TARGET_INVALID',
        fieldKey: action.targetFieldKey,
        message: `限制选项的目标字段 ${targetField.label} 必须是单选、多选或标签选择。`,
      });
      continue;
    }

    if (!targetField) {
      continue;
    }

    const targetOptionValues = new Set((targetField.options ?? []).map((option) => option.value));

    for (const optionValue of action.optionValues ?? []) {
      if (!targetOptionValues.has(optionValue)) {
        errors.push({
          code: 'TEMPLATE_LINKAGE_OPTION_INVALID',
          fieldKey: action.targetFieldKey,
          message: `限制选项 ${optionValue} 不属于目标字段 ${targetField.label} 的已有选项。`,
        });
      }
    }
  }
};

const validateLinkageConflicts = (
  rules: readonly FieldLinkageRule[],
  errors: TemplateSchemaValidationError[],
) => {
  const visibilityRules = new Map<string, string>();
  const expandedRules = rules.flatMap((rule, ruleIndex) => expandFieldLinkageRule(rule, ruleIndex));

  for (const rule of expandedRules) {
    for (const action of rule.actions) {
      if (action.type !== 'show' && action.type !== 'hide') {
        continue;
      }

      const visibilityKey = [
        action.targetFieldKey,
        rule.combinator ?? 'and',
        JSON.stringify(rule.conditions),
      ].join('::');
      const existingActionType = visibilityRules.get(visibilityKey);

      if (existingActionType && existingActionType !== action.type) {
        errors.push({
          code: 'TEMPLATE_LINKAGE_CONFLICT',
          fieldKey: action.targetFieldKey,
          message: `字段 ${action.targetFieldKey} 存在互相冲突的显示/隐藏联动。`,
        });
      }

      visibilityRules.set(visibilityKey, action.type);
    }
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

const createFieldMap = (fields: readonly SchemaField[]): Map<string, SchemaField> => {
  const map = new Map<string, SchemaField>();

  for (const field of fields) {
    map.set(getSchemaFieldKey(field), field);
    map.set(field.key, field);
  }

  return map;
};

const createFieldTypeMap = (schema: LabelHubSchema): Map<string, FieldType> => {
  return new Map(
    collectTemplateFields(schema.fields).map((field) => [getSchemaFieldKey(field), field.type]),
  );
};

import type { FieldLinkageRule, LabelHubSchema, SchemaField } from './schema.ts';

export type SchemaLinkageResult = {
  visibleFieldKeys: Set<string>;
  hiddenFieldKeys: Set<string>;
  requiredFieldKeys: Set<string>;
  disabledFieldKeys: Set<string>;
  answers: Record<string, unknown>;
};

export type SchemaValidationError = {
  fieldKey: string;
  message: string;
};

export type SchemaValidationContext = {
  hiddenFieldKeys?: ReadonlySet<string>;
  disabledFieldKeys?: ReadonlySet<string>;
  requiredFieldKeys?: ReadonlySet<string>;
};

export const getSchemaFieldKey = (field: SchemaField): string => {
  return field.fieldKey ?? field.key;
};

const collectFields = (fields: readonly SchemaField[]): SchemaField[] => {
  return fields.flatMap((field) => [
    field,
    ...(field.fields ? collectFields(field.fields) : []),
    ...(field.tabs?.flatMap((tab) => collectFields(tab.fields)) ?? []),
  ]);
};

const collectFieldKeys = (field: SchemaField): string[] => {
  return [
    getSchemaFieldKey(field),
    ...(field.fields?.flatMap(collectFieldKeys) ?? []),
    ...(field.tabs?.flatMap((tab) => tab.fields.flatMap(collectFieldKeys)) ?? []),
  ];
};

const collectDescendantKeysByFieldKey = (
  fields: readonly SchemaField[],
): Map<string, string[]> => {
  const descendantsByFieldKey = new Map<string, string[]>();

  for (const field of fields) {
    descendantsByFieldKey.set(getSchemaFieldKey(field), collectFieldKeys(field));

    if (field.fields) {
      for (const [fieldKey, descendantKeys] of collectDescendantKeysByFieldKey(field.fields)) {
        descendantsByFieldKey.set(fieldKey, descendantKeys);
      }
    }

    for (const tab of field.tabs ?? []) {
      for (const [fieldKey, descendantKeys] of collectDescendantKeysByFieldKey(tab.fields)) {
        descendantsByFieldKey.set(fieldKey, descendantKeys);
      }
    }
  }

  return descendantsByFieldKey;
};

const getTargetFieldKeys = (
  descendantsByFieldKey: ReadonlyMap<string, readonly string[]>,
  targetFieldKey: string,
): readonly string[] => {
  return descendantsByFieldKey.get(targetFieldKey) ?? [targetFieldKey];
};

const applyToFieldKeys = (
  fieldKeys: readonly string[],
  action: (fieldKey: string) => void,
) => {
  for (const fieldKey of fieldKeys) {
    action(fieldKey);
  }
};

const areJsonValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left !== typeof right || left === null || right === null) {
    return false;
  }

  if (typeof left !== 'object') {
    return false;
  }

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
};

const collectRules = (schema: LabelHubSchema): FieldLinkageRule[] => {
  const fieldRules = collectFields(schema.fields).flatMap((field) => [
    ...(field.linkageRules ?? []),
  ]);

  return [...(schema.linkageRules ?? []), ...fieldRules];
};

const isEmptyValue = (value: unknown): boolean => {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
};

const containsValue = (sourceValue: unknown, expectedValue: unknown): boolean => {
  if (Array.isArray(sourceValue)) {
    return sourceValue.includes(expectedValue);
  }

  if (typeof sourceValue === 'string' && typeof expectedValue === 'string') {
    return sourceValue.includes(expectedValue);
  }

  return false;
};

const matchesCondition = (
  answers: Record<string, unknown>,
  rule: FieldLinkageRule,
): boolean => {
  const sourceValue = answers[rule.when.fieldKey];

  switch (rule.when.operator) {
    case 'equals':
      return Object.is(sourceValue, rule.when.value);
    case 'notEquals':
      return !Object.is(sourceValue, rule.when.value);
    case 'contains':
      return containsValue(sourceValue, rule.when.value);
    case 'notContains':
      return !containsValue(sourceValue, rule.when.value);
    case 'exists':
      return !isEmptyValue(sourceValue);
    case 'notExists':
      return isEmptyValue(sourceValue);
  }
};

export const applySchemaLinkage = (
  schema: LabelHubSchema,
  answers: Record<string, unknown>,
): SchemaLinkageResult => {
  const fields = collectFields(schema.fields);
  const fieldKeys = fields.map(getSchemaFieldKey);
  const descendantsByFieldKey = collectDescendantKeysByFieldKey(schema.fields);
  const nextAnswers = { ...answers };
  const rules = collectRules(schema);
  const setValueRules = rules.filter((rule) => rule.action === 'setValue');

  for (let passIndex = 0; passIndex <= setValueRules.length; passIndex += 1) {
    let changed = false;

    for (const rule of setValueRules) {
      if (
        matchesCondition(nextAnswers, rule) &&
        !areJsonValuesEqual(nextAnswers[rule.targetFieldKey], rule.value)
      ) {
        nextAnswers[rule.targetFieldKey] = rule.value;
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  const visibleFieldKeys = new Set(fieldKeys);
  const hiddenFieldKeys = new Set<string>();
  const requiredFieldKeys = new Set<string>();
  const disabledFieldKeys = new Set<string>();
  const showTargetFieldKeys = new Set(
    rules.filter((rule) => rule.action === 'show').map((rule) => rule.targetFieldKey),
  );

  for (const fieldKey of showTargetFieldKeys) {
    applyToFieldKeys(getTargetFieldKeys(descendantsByFieldKey, fieldKey), (targetFieldKey) => {
      visibleFieldKeys.delete(targetFieldKey);
      hiddenFieldKeys.add(targetFieldKey);
    });
  }

  for (const rule of rules) {
    if (!matchesCondition(nextAnswers, rule)) {
      continue;
    }

    if (rule.action === 'show') {
      applyToFieldKeys(
        getTargetFieldKeys(descendantsByFieldKey, rule.targetFieldKey),
        (targetFieldKey) => {
          visibleFieldKeys.add(targetFieldKey);
          hiddenFieldKeys.delete(targetFieldKey);
        },
      );
    }

    if (rule.action === 'hide') {
      applyToFieldKeys(
        getTargetFieldKeys(descendantsByFieldKey, rule.targetFieldKey),
        (targetFieldKey) => {
          visibleFieldKeys.delete(targetFieldKey);
          hiddenFieldKeys.add(targetFieldKey);
        },
      );
    }

    if (rule.action === 'require') {
      requiredFieldKeys.add(rule.targetFieldKey);
    }

    if (rule.action === 'disable') {
      applyToFieldKeys(
        getTargetFieldKeys(descendantsByFieldKey, rule.targetFieldKey),
        (targetFieldKey) => disabledFieldKeys.add(targetFieldKey),
      );
    }
  }

  return {
    visibleFieldKeys,
    hiddenFieldKeys,
    requiredFieldKeys,
    disabledFieldKeys,
    answers: nextAnswers,
  };
};

const isOptionalEmptyValue = (field: SchemaField, value: unknown): boolean => {
  if (value === undefined || value === null || value === '') {
    return true;
  }

  return (
    (field.type === 'checkbox' || field.type === 'tag_select') &&
    Array.isArray(value) &&
    value.length === 0
  );
};

const optionValues = (field: SchemaField): string[] => {
  return (field.options ?? []).map((option) => option.value);
};

export const isSafeUploadedFileUrl = (value: string): boolean => {
  if (value.startsWith('/')) {
    return true;
  }

  if (value.startsWith('mock://local/')) {
    return true;
  }

  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const isUploadedFile = (value: unknown): value is {
  name: string;
  url: string;
  mimeType: string;
  size: number;
} => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.name === 'string' &&
    typeof candidate.url === 'string' &&
    isSafeUploadedFileUrl(candidate.url) &&
    typeof candidate.mimeType === 'string' &&
    typeof candidate.size === 'number' &&
    Number.isFinite(candidate.size) &&
    candidate.size >= 0
  );
};

const fieldMessage = (label: string, message: string): string => {
  return /[A-Za-z0-9]$/.test(label) ? `${label} ${message}` : `${label}${message}`;
};

const validationMessage = (field: SchemaField, fallback: string): string => {
  return field.validation?.message ?? fallback;
};

const validateCustomKey = (
  field: SchemaField,
  value: unknown,
): SchemaValidationError | null => {
  const fieldKey = getSchemaFieldKey(field);

  switch (field.validation?.customValidatorKey) {
    case 'valid_email':
      return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? null
        : { fieldKey, message: validationMessage(field, '邮箱格式不正确。') };
    case 'safe_url':
      if (typeof value !== 'string') {
        return {
          fieldKey,
          message: validationMessage(field, fieldMessage(field.label, '必须是安全链接。')),
        };
      }

      try {
        const url = new URL(value);

        return url.protocol === 'http:' || url.protocol === 'https:'
          ? null
          : {
              fieldKey,
              message: validationMessage(field, fieldMessage(field.label, '必须是安全链接。')),
            };
      } catch {
        return {
          fieldKey,
          message: validationMessage(field, fieldMessage(field.label, '必须是安全链接。')),
        };
      }
    case 'valid_json':
      if (typeof value !== 'string') {
        return null;
      }

      try {
        JSON.parse(value);
        return null;
      } catch {
        return {
          fieldKey,
          message: validationMessage(field, fieldMessage(field.label, '必须是合法 JSON。')),
        };
      }
    case 'non_empty_json':
      return value && typeof value === 'object'
        ? null
        : {
            fieldKey,
            message: validationMessage(field, fieldMessage(field.label, '必须填写结构化 JSON。')),
          };
    case 'valid_file_type':
      return isUploadedFile(value)
        ? null
        : {
            fieldKey,
            message: validationMessage(field, `${field.label}需要上传有效文件。`),
          };
    case undefined:
      return null;
  }
};

const validateTextRules = (
  field: SchemaField,
  value: unknown,
  errors: SchemaValidationError[],
) => {
  const fieldKey = getSchemaFieldKey(field);

  if (typeof value !== 'string') {
    errors.push({
      fieldKey,
      message: validationMessage(field, `${field.label}必须是文本。`),
    });
    return;
  }

  if (field.validation?.minLength !== undefined && value.length < field.validation.minLength) {
    errors.push({
      fieldKey,
      message: validationMessage(field, `${field.label}不能少于 ${field.validation.minLength} 个字符。`),
    });
  }

  if (field.validation?.maxLength !== undefined && value.length > field.validation.maxLength) {
    errors.push({
      fieldKey,
      message: validationMessage(field, `${field.label}不能超过 ${field.validation.maxLength} 个字符。`),
    });
  }

  if (field.validation?.pattern) {
    try {
      if (!new RegExp(field.validation.pattern).test(value)) {
        errors.push({
          fieldKey,
          message: validationMessage(field, `${field.label}格式不符合要求。`),
        });
      }
    } catch {
      errors.push({
        fieldKey,
        message: validationMessage(field, `${field.label}正则校验配置不合法。`),
      });
    }
  }
};

export const validateSchemaAnswers = (
  schema: LabelHubSchema,
  answers: Record<string, unknown>,
  context: SchemaValidationContext = {},
): SchemaValidationError[] => {
  const errors: SchemaValidationError[] = [];
  const fields = collectFields(schema.fields);

  for (const field of fields) {
    const fieldKey = getSchemaFieldKey(field);
    const value = answers[fieldKey];
    const hidden = context.hiddenFieldKeys?.has(fieldKey) ?? false;
    const disabled = context.disabledFieldKeys?.has(fieldKey) ?? false;
    const required = Boolean(
      field.required || field.validation?.required || context.requiredFieldKeys?.has(fieldKey),
    );

    if ((hidden && !field.validateWhenHidden) || disabled) {
      continue;
    }

    if (required && isEmptyValue(value)) {
      errors.push({
        fieldKey,
        message: validationMessage(field, `${field.label}为必填项。`),
      });
      continue;
    }

    if (isOptionalEmptyValue(field, value)) {
      continue;
    }

    if (field.type === 'text' || field.type === 'textarea' || field.type === 'rich_text') {
      validateTextRules(field, value, errors);
    }

    if (
      field.type === 'radio' &&
      (typeof value !== 'string' || !optionValues(field).includes(value))
    ) {
      errors.push({
        fieldKey,
        message: validationMessage(field, fieldMessage(field.label, '必须选择有效选项。')),
      });
    }

    if (field.type === 'checkbox' || field.type === 'tag_select') {
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        errors.push({
          fieldKey,
          message: validationMessage(field, fieldMessage(field.label, '必须是字符串数组。')),
        });
      } else if (!value.every((item) => optionValues(field).includes(item))) {
        errors.push({
          fieldKey,
          message: validationMessage(field, `${field.label}包含无效选项。`),
        });
      }
    }

    if (
      field.type === 'json_editor' &&
      (typeof value !== 'object' || value === null || Array.isArray(value))
    ) {
      errors.push({
        fieldKey,
        message: validationMessage(field, fieldMessage(field.label, '必须是结构化对象。')),
      });
    }

    if (field.type === 'file_upload' && !isUploadedFile(value)) {
      errors.push({
        fieldKey,
        message: validationMessage(field, `${field.label}需要上传有效文件。`),
      });
    }

    if (field.type === 'image_upload') {
      if (!isUploadedFile(value)) {
        errors.push({
          fieldKey,
          message: validationMessage(field, `${field.label}需要上传有效文件。`),
        });
      } else if (!value.mimeType.startsWith('image/')) {
        errors.push({
          fieldKey,
          message: validationMessage(field, fieldMessage(field.label, '必须上传图片文件。')),
        });
      }
    }

    const customError = validateCustomKey(field, value);

    if (customError) {
      errors.push(customError);
    }
  }

  return errors;
};

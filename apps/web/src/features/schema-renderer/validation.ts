import type { LabelHubSchema, SchemaField } from '@labelhub/shared';

import { getSchemaFieldKey } from './types';

export type SchemaValidationError = {
  fieldKey: string;
  message: string;
};

type ValidationContext = {
  hiddenFieldKeys?: ReadonlySet<string>;
  disabledFieldKeys?: ReadonlySet<string>;
  requiredFieldKeys?: ReadonlySet<string>;
};

const collectFields = (fields: readonly SchemaField[]): SchemaField[] => {
  return fields.flatMap((field) => [
    field,
    ...(field.fields ? collectFields(field.fields) : []),
    ...(field.tabs?.flatMap((tab) => collectFields(tab.fields)) ?? []),
  ]);
};

const isEmptyValue = (value: unknown): boolean => {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
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
    typeof candidate.mimeType === 'string' &&
    typeof candidate.size === 'number' &&
    Number.isFinite(candidate.size) &&
    candidate.size >= 0
  );
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
        : { fieldKey, message: '邮箱格式不正确。' };
    case 'safe_url':
      if (typeof value !== 'string') {
        return { fieldKey, message: fieldMessage(field.label, '必须是安全链接。') };
      }

      try {
        const url = new URL(value);

        return url.protocol === 'http:' || url.protocol === 'https:'
          ? null
          : { fieldKey, message: fieldMessage(field.label, '必须是安全链接。') };
      } catch {
        return { fieldKey, message: fieldMessage(field.label, '必须是安全链接。') };
      }
    case 'valid_json':
      if (typeof value !== 'string') {
        return null;
      }

      try {
        JSON.parse(value);
        return null;
      } catch {
        return { fieldKey, message: fieldMessage(field.label, '必须是合法 JSON。') };
      }
    case 'non_empty_json':
      return value && typeof value === 'object'
        ? null
        : { fieldKey, message: fieldMessage(field.label, '必须填写结构化 JSON。') };
    case 'valid_file_type':
      return isUploadedFile(value)
        ? null
        : { fieldKey, message: `${field.label}需要上传有效文件。` };
    case undefined:
      return null;
  }
};

const fieldMessage = (label: string, message: string): string => {
  return /[A-Za-z0-9]$/.test(label) ? `${label} ${message}` : `${label}${message}`;
};

const validateTextRules = (
  field: SchemaField,
  value: unknown,
  errors: SchemaValidationError[],
) => {
  const fieldKey = getSchemaFieldKey(field);

  if (typeof value !== 'string') {
    errors.push({ fieldKey, message: `${field.label}必须是文本。` });
    return;
  }

  if (field.validation?.minLength !== undefined && value.length < field.validation.minLength) {
    errors.push({
      fieldKey,
      message: `${field.label}不能少于 ${field.validation.minLength} 个字符。`,
    });
  }

  if (field.validation?.maxLength !== undefined && value.length > field.validation.maxLength) {
    errors.push({
      fieldKey,
      message: `${field.label}不能超过 ${field.validation.maxLength} 个字符。`,
    });
  }

  if (field.validation?.pattern) {
    try {
      if (!new RegExp(field.validation.pattern).test(value)) {
        errors.push({ fieldKey, message: `${field.label}格式不符合要求。` });
      }
    } catch {
      errors.push({ fieldKey, message: `${field.label}正则校验配置不合法。` });
    }
  }
};

export const validateSchemaAnswers = (
  schema: LabelHubSchema,
  answers: Record<string, unknown>,
  context: ValidationContext = {},
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
      errors.push({ fieldKey, message: `${field.label}为必填项。` });
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
      errors.push({ fieldKey, message: fieldMessage(field.label, '必须选择有效选项。') });
    }

    if (field.type === 'checkbox' || field.type === 'tag_select') {
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        errors.push({ fieldKey, message: fieldMessage(field.label, '必须是字符串数组。') });
      } else if (!value.every((item) => optionValues(field).includes(item))) {
        errors.push({ fieldKey, message: `${field.label}包含无效选项。` });
      }
    }

    if (
      field.type === 'json_editor' &&
      (typeof value !== 'object' || value === null || Array.isArray(value))
    ) {
      errors.push({ fieldKey, message: fieldMessage(field.label, '必须是结构化对象。') });
    }

    if (field.type === 'file_upload' && !isUploadedFile(value)) {
      errors.push({ fieldKey, message: `${field.label}需要上传有效文件。` });
    }

    if (field.type === 'image_upload') {
      if (!isUploadedFile(value)) {
        errors.push({ fieldKey, message: `${field.label}需要上传有效文件。` });
      } else if (!value.mimeType.startsWith('image/')) {
        errors.push({ fieldKey, message: fieldMessage(field.label, '必须上传图片文件。') });
      }
    }

    const customError = validateCustomKey(field, value);

    if (customError) {
      errors.push(customError);
    }
  }

  return errors;
};

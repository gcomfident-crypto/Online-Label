import {
  expandFieldLinkageRule,
  type FieldLinkageCondition,
  type FieldLinkageRule,
  type LabelHubSchema,
  type SchemaField,
  type StructuredFieldLinkageAction,
  type StructuredFieldLinkageRule,
} from './schema.ts';

export type SchemaLinkageResult = {
  visibleFieldKeys: Set<string>;
  hiddenFieldKeys: Set<string>;
  requiredFieldKeys: Set<string>;
  disabledFieldKeys: Set<string>;
  allowedOptionsByFieldKey: Map<string, Set<string>>;
  overrideableOptionLimitFieldKeys: Set<string>;
  answers: Record<string, unknown>;
  normalizedAnswers: Record<string, unknown>;
  assertionErrors: SchemaValidationError[];
  validationErrors: SchemaValidationError[];
};

export type SchemaLinkageOptions = {
  changedFieldKey?: string;
};

export type SchemaValidationError = {
  fieldKey: string;
  message: string;
};

export type SchemaValidationContext = {
  hiddenFieldKeys?: ReadonlySet<string>;
  disabledFieldKeys?: ReadonlySet<string>;
  requiredFieldKeys?: ReadonlySet<string>;
  allowedOptionsByFieldKey?: ReadonlyMap<string, ReadonlySet<string>>;
  assertionErrors?: ReadonlyArray<SchemaValidationError>;
  validationErrors?: ReadonlyArray<SchemaValidationError>;
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

const collectRules = (schema: LabelHubSchema): StructuredFieldLinkageRule[] => {
  const fieldRules = collectFields(schema.fields).flatMap((field) => [
    ...(field.linkageRules ?? []),
  ]);

  return [...(schema.linkageRules ?? []), ...fieldRules].flatMap((rule, index) =>
    expandFieldLinkageRule(rule, index),
  );
};

const createFieldByKeyMap = (fields: readonly SchemaField[]): Map<string, SchemaField> => {
  return new Map(fields.map((field) => [getSchemaFieldKey(field), field]));
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
  condition: FieldLinkageCondition,
): boolean => {
  const sourceValue = answers[condition.fieldKey];

  switch (condition.operator) {
    case 'equals':
      return Object.is(sourceValue, condition.value);
    case 'notEquals':
      return !Object.is(sourceValue, condition.value);
    case 'contains':
      return containsValue(sourceValue, condition.value);
    case 'notContains':
      return !containsValue(sourceValue, condition.value);
    case 'exists':
      return !isEmptyValue(sourceValue);
    case 'notExists':
      return isEmptyValue(sourceValue);
  }
};

const matchesRule = (
  answers: Record<string, unknown>,
  rule: StructuredFieldLinkageRule,
): boolean => {
  const combinator = rule.combinator ?? 'and';
  const conditions = rule.conditions ?? [];

  if (conditions.length === 0) {
    return false;
  }

  return combinator === 'or'
    ? conditions.some((condition) => matchesCondition(answers, condition))
    : conditions.every((condition) => matchesCondition(answers, condition));
};

type LimitOptionsLinkageAction = StructuredFieldLinkageAction & { type: 'limitOptions' };

const getLimitOptionActions = (
  rule: StructuredFieldLinkageRule,
): LimitOptionsLinkageAction[] => {
  return rule.actions.filter((action): action is LimitOptionsLinkageAction => action.type === 'limitOptions');
};

const isBidirectionalLimitAction = (action: StructuredFieldLinkageAction): boolean => {
  return action.type === 'limitOptions' && action.bidirectional !== false;
};

const resolveBidirectionalSourceCondition = (
  rule: StructuredFieldLinkageRule,
): { fieldKey: string; value: string } | null => {
  if ((rule.combinator ?? 'and') !== 'and' || rule.conditions.length !== 1) {
    return null;
  }

  const condition = rule.conditions[0];

  if (condition.operator !== 'equals' || typeof condition.value !== 'string') {
    return null;
  }

  return {
    fieldKey: condition.fieldKey,
    value: condition.value,
  };
};

const valueMatchesAllowedOptions = (
  value: unknown,
  allowedOptions: ReadonlySet<string>,
): boolean => {
  if (typeof value === 'string') {
    return allowedOptions.has(value);
  }

  if (Array.isArray(value)) {
    return value.some((item) => typeof item === 'string' && allowedOptions.has(item));
  }

  return false;
};

const intersectOptionSets = (
  current: ReadonlySet<string> | undefined,
  next: ReadonlySet<string>,
): Set<string> => {
  if (!current) {
    return new Set(next);
  }

  return new Set([...current].filter((value) => next.has(value)));
};

const addLimitEdge = (
  edges: Map<string, Set<string>>,
  sourceFieldKey: string,
  targetFieldKey: string,
) => {
  if (sourceFieldKey === targetFieldKey) {
    return;
  }

  const targets = edges.get(sourceFieldKey) ?? new Set<string>();
  targets.add(targetFieldKey);
  edges.set(sourceFieldKey, targets);
};

const collectOverrideableOptionLimitFieldKeys = (
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> => {
  const fieldKeys = new Set<string>();

  for (const [sourceFieldKey, targetFieldKeys] of edges) {
    for (const targetFieldKey of targetFieldKeys) {
      if (edges.get(targetFieldKey)?.has(sourceFieldKey)) {
        fieldKeys.add(sourceFieldKey);
        fieldKeys.add(targetFieldKey);
      }
    }
  }

  return fieldKeys;
};

const normalizeLimitedOptionValue = (
  field: SchemaField | undefined,
  currentValue: unknown,
  allowedOptions: ReadonlySet<string>,
): { hasValue: boolean; value?: unknown } => {
  const allowedValues = [...allowedOptions];
  const onlyAllowedValue = allowedValues.length === 1 ? allowedValues[0] : undefined;

  if (!field) {
    return { hasValue: true, value: currentValue };
  }

  if (field.type === 'radio') {
    if (typeof currentValue === 'string' && allowedOptions.has(currentValue)) {
      return { hasValue: true, value: currentValue };
    }

    if (onlyAllowedValue !== undefined) {
      return { hasValue: true, value: onlyAllowedValue };
    }

    return { hasValue: false };
  }

  if (field.type === 'checkbox' || field.type === 'tag_select') {
    const currentValues = Array.isArray(currentValue)
      ? currentValue.filter((item): item is string => typeof item === 'string')
      : [];
    const nextValues = currentValues.filter((item) => allowedOptions.has(item));

    if (nextValues.length > 0) {
      return { hasValue: true, value: nextValues };
    }

    if (onlyAllowedValue !== undefined) {
      return { hasValue: true, value: [onlyAllowedValue] };
    }

    return { hasValue: true, value: [] };
  }

  return { hasValue: true, value: currentValue };
};

const omitHiddenAnswers = (
  answers: Record<string, unknown>,
  hiddenFieldKeys: ReadonlySet<string>,
): Record<string, unknown> => {
  const normalizedAnswers = { ...answers };

  for (const fieldKey of hiddenFieldKeys) {
    delete normalizedAnswers[fieldKey];
  }

  return normalizedAnswers;
};

export const applySchemaLinkage = (
  schema: LabelHubSchema,
  answers: Record<string, unknown>,
  options: SchemaLinkageOptions = {},
): SchemaLinkageResult => {
  const fields = collectFields(schema.fields);
  const fieldsByKey = createFieldByKeyMap(fields);
  const fieldKeys = fields.map(getSchemaFieldKey);
  const descendantsByFieldKey = collectDescendantKeysByFieldKey(schema.fields);
  const nextAnswers = { ...answers };
  const rules = collectRules(schema);
  const changedFieldKey = options.changedFieldKey;

  const setValuePassLimit = rules.reduce((count, rule) => {
    return count + rule.actions.filter((action) => action.type === 'setValue').length;
  }, 0);

  for (let passIndex = 0; passIndex <= setValuePassLimit; passIndex += 1) {
    let changed = false;

    for (const rule of rules) {
      if (!matchesRule(nextAnswers, rule)) {
        continue;
      }

      for (const action of rule.actions.filter((item) => item.type === 'setValue')) {
        if (
          !areJsonValuesEqual(nextAnswers[action.targetFieldKey], action.value)
        ) {
          nextAnswers[action.targetFieldKey] = action.value;
          changed = true;
        }
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
  const allowedOptionsByFieldKey = new Map<string, Set<string>>();
  const conditionFieldKeysToClear = new Set<string>();
  const matchedLimitEdges = new Map<string, Set<string>>();
  const assertionErrors: SchemaValidationError[] = [];
  const showTargetFieldKeys = new Set(
    rules.flatMap((rule) => rule.actions.filter((action) => action.type === 'show').map((action) => action.targetFieldKey)),
  );

  for (const fieldKey of showTargetFieldKeys) {
    applyToFieldKeys(getTargetFieldKeys(descendantsByFieldKey, fieldKey), (targetFieldKey) => {
      visibleFieldKeys.delete(targetFieldKey);
      hiddenFieldKeys.add(targetFieldKey);
    });
  }

  for (const rule of rules) {
    if (!matchesRule(nextAnswers, rule)) {
      continue;
    }

    for (const action of rule.actions) {
      if (action.type === 'show') {
        applyToFieldKeys(
          getTargetFieldKeys(descendantsByFieldKey, action.targetFieldKey),
          (targetFieldKey) => {
            visibleFieldKeys.add(targetFieldKey);
            hiddenFieldKeys.delete(targetFieldKey);
          },
        );
      }

      if (action.type === 'hide') {
        applyToFieldKeys(
          getTargetFieldKeys(descendantsByFieldKey, action.targetFieldKey),
          (targetFieldKey) => {
            visibleFieldKeys.delete(targetFieldKey);
            hiddenFieldKeys.add(targetFieldKey);
          },
        );
      }

      if (action.type === 'require') {
        requiredFieldKeys.add(action.targetFieldKey);
      }

      if (action.type === 'assertValue') {
        if (!areJsonValuesEqual(nextAnswers[action.targetFieldKey], action.value)) {
          assertionErrors.push({
            fieldKey: action.targetFieldKey,
            message: action.message ?? `字段 ${action.targetFieldKey} 未满足联动约束。`,
          });
        }
      }

      if (action.type === 'disable') {
        applyToFieldKeys(
          getTargetFieldKeys(descendantsByFieldKey, action.targetFieldKey),
          (targetFieldKey) => disabledFieldKeys.add(targetFieldKey),
        );
      }
    }
  }

  for (const rule of rules) {
    if (!matchesRule(nextAnswers, rule)) {
      continue;
    }

    for (const action of getLimitOptionActions(rule)) {
      for (const condition of rule.conditions) {
        addLimitEdge(matchedLimitEdges, condition.fieldKey, action.targetFieldKey);
      }

      if (changedFieldKey === action.targetFieldKey) {
        if (!valueMatchesAllowedOptions(nextAnswers[changedFieldKey], new Set(action.optionValues ?? []))) {
          for (const condition of rule.conditions) {
            if (condition.fieldKey !== changedFieldKey) {
              conditionFieldKeysToClear.add(condition.fieldKey);
            }
          }
        }

        continue;
      }

      const targetFieldKey = action.targetFieldKey;
      const resolvedAllowedOptions = new Set(action.optionValues ?? []);
      const targetOptionValues = new Set(optionValues(fieldsByKey.get(targetFieldKey) ?? {
        key: targetFieldKey,
        type: 'text',
        label: targetFieldKey,
      }));
      const allowedOptions = targetOptionValues.size > 0
        ? new Set([...resolvedAllowedOptions].filter((value) => targetOptionValues.has(value)))
        : resolvedAllowedOptions;
      const currentAllowedOptions = allowedOptionsByFieldKey.get(targetFieldKey);
      allowedOptionsByFieldKey.set(
        targetFieldKey,
        intersectOptionSets(currentAllowedOptions, allowedOptions),
      );
    }
  }

  const reverseAllowedOptionsByFieldKey = new Map<string, Set<string>>();

  for (const rule of rules) {
    const sourceCondition = resolveBidirectionalSourceCondition(rule);

    if (!sourceCondition || changedFieldKey === sourceCondition.fieldKey) {
      continue;
    }

    for (const action of getLimitOptionActions(rule)) {
      if (!isBidirectionalLimitAction(action) || changedFieldKey !== action.targetFieldKey) {
        continue;
      }

      const actionOptionValues = new Set(action.optionValues ?? []);

      if (!valueMatchesAllowedOptions(nextAnswers[action.targetFieldKey], actionOptionValues)) {
        continue;
      }

      const allowedSourceOptions = reverseAllowedOptionsByFieldKey.get(sourceCondition.fieldKey) ?? new Set<string>();
      allowedSourceOptions.add(sourceCondition.value);
      reverseAllowedOptionsByFieldKey.set(sourceCondition.fieldKey, allowedSourceOptions);
    }
  }

  for (const [fieldKey, allowedOptions] of reverseAllowedOptionsByFieldKey) {
    const currentAllowedOptions = allowedOptionsByFieldKey.get(fieldKey);

    allowedOptionsByFieldKey.set(
      fieldKey,
      intersectOptionSets(currentAllowedOptions, allowedOptions),
    );
  }

  for (const fieldKey of conditionFieldKeysToClear) {
    delete nextAnswers[fieldKey];
  }

  const overrideableOptionLimitFieldKeys = collectOverrideableOptionLimitFieldKeys(matchedLimitEdges);

  for (const [fieldKey, allowedOptions] of allowedOptionsByFieldKey) {
    const nextValue = normalizeLimitedOptionValue(
      fieldsByKey.get(fieldKey),
      nextAnswers[fieldKey],
      allowedOptions,
    );

    if (nextValue.hasValue) {
      nextAnswers[fieldKey] = nextValue.value;
    } else {
      delete nextAnswers[fieldKey];
    }
  }

  const normalizedAnswers = omitHiddenAnswers(nextAnswers, hiddenFieldKeys);
  const validationErrors: SchemaValidationError[] = [...assertionErrors];

  return {
    visibleFieldKeys,
    hiddenFieldKeys,
    requiredFieldKeys,
    disabledFieldKeys,
    allowedOptionsByFieldKey,
    overrideableOptionLimitFieldKeys,
    answers: nextAnswers,
    normalizedAnswers,
    assertionErrors,
    validationErrors,
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

const matchesAcceptedMimeType = (
  mimeType: string,
  acceptedMimeTypes: readonly string[] | undefined,
): boolean => {
  const acceptedTypes = (acceptedMimeTypes ?? [])
    .map((acceptedType) => acceptedType.trim().toLowerCase())
    .filter(Boolean);

  if (acceptedTypes.length === 0) {
    return true;
  }

  const normalizedMimeType = mimeType.trim().toLowerCase();

  return acceptedTypes.some((acceptedType) => {
    if (acceptedType.endsWith('/*')) {
      return normalizedMimeType.startsWith(acceptedType.slice(0, -1));
    }

    return normalizedMimeType === acceptedType;
  });
};

const fieldMessage = (label: string, message: string): string => {
  return /[A-Za-z0-9]$/.test(label) ? `${label} ${message}` : `${label}${message}`;
};

const validationMessage = (field: SchemaField, fallback: string): string => {
  return field.validation?.message ?? fallback;
};

const formatAllowedOptionLabels = (
  field: SchemaField,
  allowedOptions: ReadonlySet<string>,
): string => {
  const optionLabelByValue = new Map((field.options ?? []).map((option) => [option.value, option.label]));
  const labels = [...allowedOptions].map((optionValue) => optionLabelByValue.get(optionValue) ?? optionValue);

  return labels.length > 0 ? labels.join('、') : '当前没有可选项';
};

const optionValidationMessage = (
  field: SchemaField,
  allowedOptions: ReadonlySet<string> | undefined,
  fallback: string,
): string => {
  if (!allowedOptions) {
    return validationMessage(field, fallback);
  }

  return validationMessage(
    field,
    fieldMessage(field.label, `只能选择：${formatAllowedOptionLabels(field, allowedOptions)}。`),
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
      if (
        field.type === 'json_editor' &&
        (!value || typeof value !== 'object' || Array.isArray(value))
      ) {
        return null;
      }

      return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
        ? null
        : {
            fieldKey,
            message: validationMessage(field, fieldMessage(field.label, '必须填写结构化 JSON。')),
          };
    case 'valid_file_type':
      if (!isUploadedFile(value)) {
        return field.type === 'file_upload' || field.type === 'image_upload'
          ? null
          : {
              fieldKey,
              message: validationMessage(field, `${field.label}需要上传有效文件。`),
            };
      }

      return matchesAcceptedMimeType(value.mimeType, field.fileConstraints?.acceptedMimeTypes)
        ? null
        : {
            fieldKey,
            message: validationMessage(field, `${field.label}文件类型不符合要求。`),
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
  const errors: SchemaValidationError[] = [
    ...(context.validationErrors ?? context.assertionErrors ?? []),
  ];
  const fields = collectFields(schema.fields);

  for (const field of fields) {
    const fieldKey = getSchemaFieldKey(field);
    const value = answers[fieldKey];
    const hidden = context.hiddenFieldKeys?.has(fieldKey) ?? false;
    const disabled = context.disabledFieldKeys?.has(fieldKey) ?? false;
    const allowedOptions = context.allowedOptionsByFieldKey?.get(fieldKey);
    const validOptionValues = allowedOptions ? [...allowedOptions] : optionValues(field);
    const required = Boolean(
      field.required || field.validation?.required || context.requiredFieldKeys?.has(fieldKey),
    );

    if (hidden || disabled) {
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
      (typeof value !== 'string' || !validOptionValues.includes(value))
    ) {
      errors.push({
        fieldKey,
        message: optionValidationMessage(
          field,
          allowedOptions,
          fieldMessage(field.label, '必须选择有效选项。'),
        ),
      });
    }

    if (field.type === 'checkbox' || field.type === 'tag_select') {
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        errors.push({
          fieldKey,
          message: validationMessage(field, fieldMessage(field.label, '必须是字符串数组。')),
        });
      } else if (
        (field.type === 'checkbox' || allowedOptions) &&
        !value.every((item) => validOptionValues.includes(item))
      ) {
        errors.push({
          fieldKey,
          message: optionValidationMessage(field, allowedOptions, `${field.label}包含无效选项。`),
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

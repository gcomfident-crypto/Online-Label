import type { FieldLinkageRule, LabelHubSchema, SchemaField } from '@labelhub/shared';

import { getSchemaFieldKey } from './types';

export type SchemaLinkageResult = {
  visibleFieldKeys: Set<string>;
  hiddenFieldKeys: Set<string>;
  requiredFieldKeys: Set<string>;
  disabledFieldKeys: Set<string>;
  answers: Record<string, unknown>;
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
  const fieldRules = collectFields(schema.fields).flatMap((field) => [...(field.linkageRules ?? [])]);

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

    if (rule.action === 'setValue') {
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

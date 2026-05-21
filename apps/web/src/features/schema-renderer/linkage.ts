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
  const visibleFieldKeys = new Set(fieldKeys);
  const hiddenFieldKeys = new Set<string>();
  const requiredFieldKeys = new Set<string>();
  const disabledFieldKeys = new Set<string>();
  const nextAnswers = { ...answers };
  const rules = collectRules(schema);
  const showTargetFieldKeys = new Set(
    rules.filter((rule) => rule.action === 'show').map((rule) => rule.targetFieldKey),
  );

  for (const fieldKey of showTargetFieldKeys) {
    visibleFieldKeys.delete(fieldKey);
    hiddenFieldKeys.add(fieldKey);
  }

  for (const rule of rules) {
    if (!matchesCondition(answers, rule)) {
      continue;
    }

    if (rule.action === 'show') {
      visibleFieldKeys.add(rule.targetFieldKey);
      hiddenFieldKeys.delete(rule.targetFieldKey);
    }

    if (rule.action === 'hide') {
      visibleFieldKeys.delete(rule.targetFieldKey);
      hiddenFieldKeys.add(rule.targetFieldKey);
    }

    if (rule.action === 'require') {
      requiredFieldKeys.add(rule.targetFieldKey);
    }

    if (rule.action === 'disable') {
      disabledFieldKeys.add(rule.targetFieldKey);
    }

    if (rule.action === 'setValue') {
      nextAnswers[rule.targetFieldKey] = rule.value;
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

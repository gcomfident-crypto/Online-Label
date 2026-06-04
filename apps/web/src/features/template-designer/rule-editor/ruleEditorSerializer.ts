import type { SchemaField, StructuredFieldLinkageRule } from '@labelhub/shared';

import {
  LINKAGE_OPERATOR_LABELS,
  type LinkageRuleEditorNode,
} from './ruleEditorAst';

const fieldDisplayText = (
  fieldKey: string,
  fieldsByKey: ReadonlyMap<string, SchemaField>,
): string => {
  return fieldsByKey.get(fieldKey)?.label ?? fieldKey;
};

const formatLiteralValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
};

const formatFieldValue = (
  field: SchemaField | undefined,
  value: unknown,
): string => {
  const literalValue = formatLiteralValue(value);

  if (!field?.options || field.options.length === 0 || typeof value !== 'string') {
    return literalValue;
  }

  return field.options.find((option) => option.value === value)?.label ?? literalValue;
};

export const serializeRuleToConditionNodes = (
  rule: StructuredFieldLinkageRule,
  fieldsByKey: ReadonlyMap<string, SchemaField>,
): LinkageRuleEditorNode[] => {
  const nodes: LinkageRuleEditorNode[] = [{ type: 'keyword', text: '当' }, { type: 'whitespace', text: ' ' }];

  rule.conditions.forEach((condition, index) => {
    nodes.push({
      type: 'field_ref',
      fieldKey: condition.fieldKey,
      displayText: fieldDisplayText(condition.fieldKey, fieldsByKey),
      binding: { kind: 'condition', conditionIndex: index },
    });
    nodes.push({ type: 'whitespace', text: ' ' });
    nodes.push({ type: 'operator', value: condition.operator, conditionIndex: index });

    if (condition.operator !== 'exists' && condition.operator !== 'notExists') {
      nodes.push({ type: 'whitespace', text: ' ' });
      nodes.push({
        type: 'literal',
        value: formatLiteralValue(condition.value),
        conditionIndex: index,
      });
    }

    if (index < rule.conditions.length - 1) {
      nodes.push({ type: 'whitespace', text: ' ' });
      nodes.push({ type: 'keyword', text: rule.combinator === 'or' ? '或' : '且' });
      nodes.push({ type: 'whitespace', text: ' ' });
    }
  });

  nodes.push({ type: 'whitespace', text: ' ' });
  nodes.push({ type: 'keyword', text: '时' });

  return nodes;
};

export const serializeRuleToActionNodes = (
  rule: StructuredFieldLinkageRule,
  fieldsByKey: ReadonlyMap<string, SchemaField>,
): LinkageRuleEditorNode[] => {
  const nodes: LinkageRuleEditorNode[] = [];

  rule.actions.forEach((action, index) => {
    if (action.type === 'show' || action.type === 'hide') {
      nodes.push({ type: 'keyword', text: action.type === 'show' ? '显示' : '隐藏' });
      nodes.push({ type: 'whitespace', text: ' ' });
      nodes.push({
        type: 'field_ref',
        fieldKey: action.targetFieldKey,
        displayText: fieldDisplayText(action.targetFieldKey, fieldsByKey),
        binding: { kind: 'action', actionIndex: index },
      });
    }

    if (action.type === 'limitOptions') {
      nodes.push({ type: 'keyword', text: '限制' });
      nodes.push({ type: 'whitespace', text: ' ' });
      nodes.push({
        type: 'field_ref',
        fieldKey: action.targetFieldKey,
        displayText: fieldDisplayText(action.targetFieldKey, fieldsByKey),
        binding: { kind: 'action', actionIndex: index },
      });
      nodes.push({ type: 'whitespace', text: ' ' });
      nodes.push({ type: 'keyword', text: '为' });
      nodes.push({ type: 'whitespace', text: ' ' });
      nodes.push({
        type: 'action_options',
        actionIndex: index,
        optionValues: action.optionValues ?? [],
      });
    }

    if (index < rule.actions.length - 1) {
      nodes.push({ type: 'whitespace', text: ' ' });
      nodes.push({ type: 'keyword', text: '·' });
      nodes.push({ type: 'whitespace', text: ' ' });
    }
  });

  return nodes;
};

export const formatStructuredRuleText = (
  rule: StructuredFieldLinkageRule,
  fieldsByKey: ReadonlyMap<string, SchemaField>,
): string => {
  const conditionText = rule.conditions.map((condition, index) => {
    const sourceField = fieldsByKey.get(condition.fieldKey);
    const fieldText = `#${fieldDisplayText(condition.fieldKey, fieldsByKey)}`;
    const operatorText = LINKAGE_OPERATOR_LABELS[condition.operator];

    if (condition.operator === 'exists' || condition.operator === 'notExists') {
      return `${fieldText} ${operatorText}`;
    }

    return `${fieldText} ${operatorText} ${formatFieldValue(sourceField, condition.value)}`;
  }).join(` ${rule.combinator === 'or' ? '或' : '且'} `);

  const actionText = rule.actions.map((action) => {
    const targetField = fieldsByKey.get(action.targetFieldKey);
    const fieldText = `#${fieldDisplayText(action.targetFieldKey, fieldsByKey)}`;

    if (action.type === 'show' || action.type === 'hide') {
      return `${action.type === 'show' ? '显示' : '隐藏'} ${fieldText}`;
    }

    if (action.type === 'setValue') {
      return `将 ${fieldText} 设置为 ${formatFieldValue(targetField, action.value)}`;
    }

    if (action.type === 'limitOptions') {
      const optionText = (action.optionValues ?? [])
        .map((value) => formatFieldValue(targetField, value))
        .join(' / ');

      return `限制选项 ${fieldText} 为 [${optionText}]`;
    }

    return `${action.type} ${fieldText}`;
  }).join(' · ');

  return `当 ${conditionText} 时，${actionText}`;
};

import type { SchemaField, StructuredFieldLinkageRule } from '@labelhub/shared';

import { isLimitOptionsAction } from './ruleEditorAst';

export type LinkageRuleEditorValidationError = {
  message: string;
};

const isSubmittableField = (field: SchemaField | undefined): field is SchemaField => {
  return field !== undefined && !['show_item', 'group', 'tabs', 'llm_assist'].includes(field.type);
};

const isLimitTargetField = (
  field: SchemaField | undefined,
): field is SchemaField & { type: 'radio' | 'checkbox' | 'tag_select' } => {
  return field !== undefined && (field.type === 'radio' || field.type === 'checkbox' || field.type === 'tag_select');
};

export const validateStructuredLinkageRuleDraft = (
  rule: StructuredFieldLinkageRule,
  fieldsByKey: ReadonlyMap<string, SchemaField>,
): LinkageRuleEditorValidationError[] => {
  const errors: LinkageRuleEditorValidationError[] = [];

  if (rule.conditions.length === 0) {
    errors.push({ message: '至少需要一个条件。' });
  }

  if (rule.actions.length === 0) {
    errors.push({ message: '至少需要一个动作。' });
  }

  rule.conditions.forEach((condition) => {
    const sourceField = fieldsByKey.get(condition.fieldKey);

    if (!condition.fieldKey) {
      errors.push({ message: '条件字段未设置。' });
      return;
    }

    if (!isSubmittableField(sourceField)) {
      errors.push({ message: `条件字段 ${condition.fieldKey} 不可用于联动。` });
    }

    if (
      condition.operator !== 'exists' &&
      condition.operator !== 'notExists' &&
      (condition.value === undefined || condition.value === '')
    ) {
      errors.push({ message: `条件字段 ${sourceField?.label ?? condition.fieldKey} 缺少比较值。` });
    }
  });

  rule.actions.forEach((action) => {
    const targetField = fieldsByKey.get(action.targetFieldKey);
    const targetFieldLabel = targetField?.label ?? action.targetFieldKey;

    if (!action.targetFieldKey) {
      errors.push({ message: '动作目标字段未设置。' });
      return;
    }

    if (!isSubmittableField(targetField)) {
      errors.push({ message: `目标字段 ${action.targetFieldKey} 不可用于联动。` });
      return;
    }

    if (isLimitOptionsAction(action)) {
      if (!isLimitTargetField(targetField)) {
        errors.push({ message: `限制动作目标字段 ${targetFieldLabel} 不是选项字段。` });
      }

      if ((action.optionValues ?? []).length === 0) {
        errors.push({ message: `字段 ${targetFieldLabel} 还没有配置允许选项。` });
      }
    }
  });

  return errors;
};

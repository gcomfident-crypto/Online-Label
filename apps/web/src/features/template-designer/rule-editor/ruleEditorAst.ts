import type {
  FieldLinkageCondition,
  FieldLinkageCondition as SharedFieldLinkageCondition,
  SchemaField,
  StructuredFieldLinkageAction,
  StructuredFieldLinkageRule,
} from '@labelhub/shared';

export type LinkageRuleFieldOption = {
  value: string;
  label: string;
  description?: string;
  field: SchemaField;
};

export type LinkageRuleEditorNode =
  | { type: 'keyword'; text: '当' | '时' | '将' | '显示' | '隐藏' | '限制' | '设置为' | '为' | '且' | '或' | '·' }
  | {
      type: 'field_ref';
      fieldKey: string;
      displayText: string;
      binding: { kind: 'condition'; conditionIndex: number } | { kind: 'action'; actionIndex: number };
    }
  | { type: 'operator'; value: SharedFieldLinkageCondition['operator']; conditionIndex: number }
  | { type: 'literal'; value: string; conditionIndex: number }
  | { type: 'whitespace'; text: ' ' }
  | { type: 'action_options'; actionIndex: number; optionValues: readonly string[] }
  | { type: 'group_break' };

export const LINKAGE_OPERATOR_LABELS: Record<FieldLinkageCondition['operator'], string> = {
  equals: '等于',
  notEquals: '不等于',
  contains: '包含',
  notContains: '不包含',
  exists: '不为空',
  notExists: '为空',
};

export const LINKAGE_ACTION_LABELS: Record<StructuredFieldLinkageAction['type'], string> = {
  show: '显示',
  hide: '隐藏',
  limitOptions: '限制选项',
  require: '设为必填',
  disable: '禁用字段',
  setValue: '设置为',
  assertValue: '校验',
};

export const createStructuredLinkageRuleId = (): string => {
  return `linkage:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
};

export const createEmptyStructuredLinkageRule = (targetFieldKey = ''): StructuredFieldLinkageRule => {
  return {
    id: createStructuredLinkageRuleId(),
    combinator: 'and',
    conditions: [
      {
        fieldKey: '',
        operator: 'equals',
        value: '',
      },
    ],
    actions: [
      {
        type: 'show',
        targetFieldKey,
      },
    ],
  };
};

export const createEmptyCondition = (): FieldLinkageCondition => ({
  fieldKey: '',
  operator: 'equals',
  value: '',
});

export const createEmptyVisibilityAction = (
  targetFieldKey = '',
  type: Extract<StructuredFieldLinkageAction['type'], 'show' | 'hide'> = 'show',
): StructuredFieldLinkageAction => ({
  type,
  targetFieldKey,
});

export const createEmptyLimitOptionsAction = (targetFieldKey = ''): StructuredFieldLinkageAction => ({
  type: 'limitOptions',
  targetFieldKey,
  optionValues: [],
  clearInvalidValue: true,
  autoSelectWhenSingleOption: true,
  bidirectional: true,
});

export const createEmptySetValueAction = (
  targetFieldKey = '',
  value: unknown = '',
): StructuredFieldLinkageAction => ({
  type: 'setValue',
  targetFieldKey,
  value,
});

export const isLimitOptionsAction = (
  action: StructuredFieldLinkageAction,
): action is StructuredFieldLinkageAction & { type: 'limitOptions'; optionValues: readonly string[] } => {
  return action.type === 'limitOptions';
};

export const isVisibilityAction = (
  action: StructuredFieldLinkageAction,
): action is StructuredFieldLinkageAction & { type: 'show' | 'hide' } => {
  return action.type === 'show' || action.type === 'hide';
};

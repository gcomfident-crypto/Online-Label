import { describe, expect, it } from 'vitest';

import type { SchemaField, StructuredFieldLinkageRule } from '@labelhub/shared';

import { parseEditorNodesToStructuredRule } from './ruleEditorParser';
import { serializeRuleToActionNodes, serializeRuleToConditionNodes } from './ruleEditorSerializer';

const FIELDS: SchemaField[] = [
  { key: 'category', type: 'text', label: '类目' },
  { key: 'size_table', type: 'text', label: '尺寸表' },
  { key: 'shelf_life', type: 'text', label: '保质期' },
  {
    key: 'preferred',
    type: 'radio',
    label: '偏好选择',
    options: [
      { label: 'A', value: 'A' },
      { label: 'B', value: 'B' },
    ],
  },
  {
    key: 'margin',
    type: 'radio',
    label: '优劣程度',
    options: [
      { label: '明显优于', value: '明显优于' },
      { label: '略优于', value: '略优于' },
      { label: '明显逊于', value: '明显逊于' },
    ],
  },
];

const FIELDS_BY_KEY = new Map(FIELDS.map((field) => [field.key, field]));

describe('ruleEditorParser', () => {
  it('支持多动作显隐规则的 AST -> nodes -> AST 往返', () => {
    const rule: StructuredFieldLinkageRule = {
      id: 'rule_1',
      combinator: 'and',
      conditions: [{ fieldKey: 'category', operator: 'equals', value: '食品生鲜' }],
      actions: [
        { type: 'hide', targetFieldKey: 'size_table' },
        { type: 'show', targetFieldKey: 'shelf_life' },
      ],
    };

    expect(
      parseEditorNodesToStructuredRule(
        {
          conditionNodes: serializeRuleToConditionNodes(rule, FIELDS_BY_KEY),
          actionNodes: serializeRuleToActionNodes(rule, FIELDS_BY_KEY),
        },
        rule,
      ),
    ).toEqual(rule);
  });

  it('支持限制选项规则的 AST -> nodes -> AST 往返', () => {
    const rule: StructuredFieldLinkageRule = {
      id: 'rule_2',
      combinator: 'and',
      conditions: [{ fieldKey: 'preferred', operator: 'equals', value: 'A' }],
      actions: [
        {
          type: 'limitOptions',
          targetFieldKey: 'margin',
          optionValues: ['明显优于', '略优于'],
          clearInvalidValue: true,
          autoSelectWhenSingleOption: true,
        },
      ],
    };

    expect(
      parseEditorNodesToStructuredRule(
        {
          conditionNodes: serializeRuleToConditionNodes(rule, FIELDS_BY_KEY),
          actionNodes: serializeRuleToActionNodes(rule, FIELDS_BY_KEY),
        },
        rule,
      ),
    ).toEqual(rule);
  });
});

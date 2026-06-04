import { describe, expect, it } from 'vitest';

import type { SchemaField, StructuredFieldLinkageRule } from '@labelhub/shared';

import { serializeRuleToActionNodes, serializeRuleToConditionNodes } from './ruleEditorSerializer';

const FIELDS: SchemaField[] = [
  { key: 'category', type: 'text', label: '类目' },
  { key: 'size_table', type: 'text', label: '尺寸表' },
  { key: 'shelf_life', type: 'text', label: '保质期' },
];

const FIELDS_BY_KEY = new Map(FIELDS.map((field) => [field.key, field]));

describe('ruleEditorSerializer', () => {
  it('把结构化规则序列化成条件和动作节点', () => {
    const rule: StructuredFieldLinkageRule = {
      id: 'rule_1',
      combinator: 'and',
      conditions: [{ fieldKey: 'category', operator: 'equals', value: '食品生鲜' }],
      actions: [
        { type: 'hide', targetFieldKey: 'size_table' },
        { type: 'show', targetFieldKey: 'shelf_life' },
      ],
    };

    expect(serializeRuleToConditionNodes(rule, FIELDS_BY_KEY)).toEqual([
      { type: 'keyword', text: '当' },
      { type: 'whitespace', text: ' ' },
      {
        type: 'field_ref',
        fieldKey: 'category',
        displayText: '类目',
        binding: { kind: 'condition', conditionIndex: 0 },
      },
      { type: 'whitespace', text: ' ' },
      { type: 'operator', value: 'equals', conditionIndex: 0 },
      { type: 'whitespace', text: ' ' },
      { type: 'literal', value: '食品生鲜', conditionIndex: 0 },
      { type: 'whitespace', text: ' ' },
      { type: 'keyword', text: '时' },
    ]);

    expect(serializeRuleToActionNodes(rule, FIELDS_BY_KEY)).toEqual([
      { type: 'keyword', text: '隐藏' },
      { type: 'whitespace', text: ' ' },
      {
        type: 'field_ref',
        fieldKey: 'size_table',
        displayText: '尺寸表',
        binding: { kind: 'action', actionIndex: 0 },
      },
      { type: 'whitespace', text: ' ' },
      { type: 'keyword', text: '·' },
      { type: 'whitespace', text: ' ' },
      { type: 'keyword', text: '显示' },
      { type: 'whitespace', text: ' ' },
      {
        type: 'field_ref',
        fieldKey: 'shelf_life',
        displayText: '保质期',
        binding: { kind: 'action', actionIndex: 1 },
      },
    ]);
  });
});

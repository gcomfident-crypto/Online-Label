import { describe, expect, it } from 'vitest';

import {
  buildTemplateCompatibilityReport,
  qaQualitySampleSchema,
  validateTemplateSchema,
  type LabelHubSchema,
} from './index.ts';

const baseSchema = (fields: LabelHubSchema['fields']): LabelHubSchema => ({
  schemaVersion: '1.0.0',
  datasetKind: 'generic_json',
  fields,
});

describe('template validation', () => {
  it('拒绝空字段和重复字段名', () => {
    expect(validateTemplateSchema(baseSchema([]))).toEqual({
      valid: false,
      errors: [
        { code: 'TEMPLATE_SCHEMA_EMPTY', message: '模板至少需要一个字段。' },
      ],
    });

    expect(
      validateTemplateSchema(
        baseSchema([
          { key: 'summary', type: 'text', label: '摘要' },
          { key: 'summary_copy', fieldKey: 'summary', type: 'textarea', label: '说明' },
        ]),
      ),
    ).toEqual({
      valid: false,
      errors: [
        {
          code: 'TEMPLATE_FIELD_KEY_DUPLICATED',
          fieldKey: 'summary',
          message: '字段名 summary 重复，请修改后再保存。',
        },
      ],
    });
  });

  it('校验物料配置、联动目标和自定义校验白名单', () => {
    const schema = baseSchema([
      { key: 'material', type: 'show_item', label: '题目' },
      {
        key: 'quality',
        type: 'radio',
        label: '质量',
        linkageRules: [
          {
            when: { fieldKey: 'missing_source', operator: 'equals', value: 'bad' },
            action: 'require',
            targetFieldKey: 'missing_target',
          },
        ],
      },
      {
        key: 'code',
        type: 'text',
        label: '编码',
        validation: { customValidatorKey: 'unknown_key' as never },
      },
    ]);

    expect(validateTemplateSchema(schema)).toEqual({
      valid: false,
      errors: [
        {
          code: 'TEMPLATE_SHOW_ITEM_SOURCE_REQUIRED',
          fieldKey: 'material',
          message: '展示项 题目 需要绑定原始数据字段。',
        },
        {
          code: 'TEMPLATE_OPTIONS_REQUIRED',
          fieldKey: 'quality',
          message: '质量至少需要一个选项。',
        },
        {
          code: 'TEMPLATE_LINKAGE_SOURCE_MISSING',
          fieldKey: 'missing_source',
          message: '联动条件字段 missing_source 不存在。',
        },
        {
          code: 'TEMPLATE_LINKAGE_TARGET_MISSING',
          fieldKey: 'missing_target',
          message: '联动目标字段 missing_target 不存在。',
        },
        {
          code: 'TEMPLATE_CUSTOM_VALIDATOR_INVALID',
          fieldKey: 'code',
          message: '自定义校验 unknown_key 不在白名单内。',
        },
      ],
    });
  });

  it('官方 qa_quality 示例可以通过发布前校验', () => {
    expect(validateTemplateSchema(qaQualitySampleSchema)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('生成模板版本兼容报告', () => {
    const previous = baseSchema([
      { key: 'summary', type: 'text', label: '摘要' },
      { key: 'score', type: 'radio', label: '评分', options: [{ label: '1', value: '1' }] },
    ]);
    const next = baseSchema([
      { key: 'summary', type: 'textarea', label: '摘要' },
      { key: 'comment', type: 'text', label: '备注' },
    ]);

    expect(buildTemplateCompatibilityReport(previous, next)).toEqual({
      addedFieldKeys: ['comment'],
      removedFieldKeys: ['score'],
      changedFieldTypes: [{ fieldKey: 'summary', from: 'text', to: 'textarea' }],
      compatible: false,
      riskMessages: [
        '新增字段 comment。',
        '删除字段 score，历史数据可能无法完整展示。',
        '字段 summary 类型由 text 改为 textarea。',
      ],
    });
  });
});

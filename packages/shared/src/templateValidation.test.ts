import { describe, expect, it } from 'vitest';

import {
  buildTemplateCompatibilityReport,
  preferenceCompareSampleSchema,
  qaQualitySampleSchema,
  titleCleanupSampleSchema,
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

  it('校验上传字段约束', () => {
    expect(
      validateTemplateSchema(
        baseSchema([
          { key: 'evidence', fieldKey: 'evidence', type: 'file_upload', label: '证据附件' },
          {
            key: 'screenshot',
            fieldKey: 'screenshot',
            type: 'image_upload',
            label: '截图',
            fileConstraints: {
              maxFiles: 1,
              maxSizeMb: 5,
              acceptedMimeTypes: ['application/pdf'],
            },
          },
        ]),
      ),
    ).toEqual({
      valid: false,
      errors: [
        {
          code: 'TEMPLATE_FILE_CONSTRAINT_REQUIRED',
          fieldKey: 'evidence',
          message: '证据附件需要配置文件数量、大小上限和允许类型。',
        },
        {
          code: 'TEMPLATE_IMAGE_MIME_REQUIRED',
          fieldKey: 'screenshot',
          message: '截图的允许类型必须是 image/* 或具体图片 MIME。',
        },
      ],
    });
  });

  it('校验字段联动限制选项的目标类型、选项值和冲突规则', () => {
    const schema = baseSchema([
      {
        key: 'preferred',
        type: 'radio',
        label: '偏好选择',
        options: [{ label: 'A', value: 'A' }],
      },
      {
        key: 'margin',
        type: 'radio',
        label: '优劣程度',
        options: [{ label: '明显优于', value: '明显优于' }],
      },
      {
        key: 'comment',
        type: 'text',
        label: '说明',
      },
      {
        key: 'material',
        type: 'show_item',
        label: '题目',
        sourceKey: 'prompt',
      },
    ]);

    expect(
      validateTemplateSchema({
        ...schema,
        linkageRules: [
          {
            when: { fieldKey: 'material', operator: 'exists' },
            action: 'show',
            targetFieldKey: 'comment',
          },
          {
            when: { fieldKey: 'preferred', operator: 'exists' },
            action: 'limitOptions',
            targetFieldKey: 'comment',
            cases: [{ value: 'A', optionValues: ['明显优于'] }],
          },
          {
            when: { fieldKey: 'preferred', operator: 'exists' },
            action: 'limitOptions',
            targetFieldKey: 'margin',
            cases: [{ value: 'A', optionValues: ['不存在的选项'] }],
          },
          {
            when: { fieldKey: 'preferred', operator: 'exists' },
            action: 'limitOptions',
            targetFieldKey: 'margin',
            cases: [{ value: 'A', optionValues: ['明显优于'] }],
          },
        ],
      }),
    ).toEqual({
      valid: false,
      errors: [
        {
          code: 'TEMPLATE_LINKAGE_SOURCE_INVALID',
          fieldKey: 'material',
          message: '联动条件字段 题目 不是可提交字段，不能作为条件字段。',
        },
        {
          code: 'TEMPLATE_LINKAGE_OPTIONS_TARGET_INVALID',
          fieldKey: 'comment',
          message: '限制选项的目标字段 说明 必须是单选、多选或标签选择。',
        },
        {
          code: 'TEMPLATE_LINKAGE_OPTION_INVALID',
          fieldKey: 'margin',
          message: '限制选项 不存在的选项 不属于目标字段 优劣程度 的已有选项。',
        },
      ],
    });
  });

  it('结构化联动规则未完成时不能通过模板校验', () => {
    const schema = baseSchema([
      {
        key: 'preferred',
        type: 'radio',
        label: '偏好选择',
        options: [{ label: 'A', value: 'A' }],
      },
      {
        key: 'margin',
        type: 'radio',
        label: '优劣程度',
        options: [{ label: '明显优于', value: '明显优于' }],
      },
    ]);

    expect(
      validateTemplateSchema({
        ...schema,
        linkageRules: [
          {
            id: 'rule_incomplete',
            combinator: 'and',
            conditions: [{ fieldKey: '', operator: 'equals', value: '' }],
            actions: [{ type: 'show', targetFieldKey: '' }],
          },
        ],
      }),
    ).toEqual({
      valid: false,
      errors: [
        {
          code: 'TEMPLATE_LINKAGE_SOURCE_MISSING',
          fieldKey: '',
          message: '联动条件字段 未设置。',
        },
        {
          code: 'TEMPLATE_LINKAGE_TARGET_MISSING',
          fieldKey: '',
          message: '联动目标字段 未设置。',
        },
      ],
    });
  });

  it('官方样例可以通过发布前校验且商品标题清洗包含关键词字段', () => {
    expect(validateTemplateSchema(qaQualitySampleSchema)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateTemplateSchema(preferenceCompareSampleSchema)).toEqual({
      valid: true,
      errors: [],
    });
    expect(
      titleCleanupSampleSchema.fields[0]?.fields?.some(
        (field) => 'fieldKey' in field && field.fieldKey === 'keywords',
      ),
    ).toBe(true);
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

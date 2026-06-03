import { describe, expect, it } from 'vitest';

import {
  DATASET_IMPORT_FORMATS,
  DATASET_KINDS,
  EXPORT_FORMATS,
  FIELD_LINKAGE_ACTIONS,
  FIELD_TYPES,
  REVIEW_STAGES,
  createLabelHubSchema,
  isAllowedCustomValidatorKey,
  type FieldValidation,
  type LabelHubSchema,
} from '.';

describe('动态表单 Schema 协议', () => {
  it('固定覆盖完整物料字段类型', () => {
    expect(FIELD_TYPES).toEqual([
      'show_item',
      'text',
      'textarea',
      'radio',
      'checkbox',
      'tag_select',
      'rich_text',
      'file_upload',
      'image_upload',
      'json_editor',
      'llm_assist',
      'group',
      'tabs',
    ]);
  });

  it('固定支持联动 action 白名单', () => {
    expect(FIELD_LINKAGE_ACTIONS).toEqual([
      'show',
      'hide',
      'limitOptions',
      'require',
      'disable',
      'setValue',
      'assertValue',
    ]);
  });

  it('固定导入格式、审核阶段和导出格式', () => {
    expect(DATASET_KINDS).toEqual(['qa_quality', 'preference_compare', 'generic_json']);
    expect(DATASET_IMPORT_FORMATS).toEqual(['json', 'jsonl', 'csv', 'xlsx', 'zip']);
    expect(REVIEW_STAGES).toEqual(['AI_PRECHECK', 'INITIAL', 'RECHECK', 'FINAL']);
    expect(EXPORT_FORMATS).toEqual(['json', 'jsonl', 'csv', 'xlsx']);
  });

  it('自定义校验只能引用白名单 key', () => {
    expect(isAllowedCustomValidatorKey('non_empty_json')).toBe(true);
    expect(isAllowedCustomValidatorKey('eval(userInput)')).toBe(false);

    const validation: FieldValidation = {
      required: true,
      minLength: 2,
      maxLength: 200,
      pattern: '^.+$',
      customValidatorKey: 'safe_url',
      message: '请输入有效链接',
    };

    expect(validation.customValidatorKey).toBe('safe_url');
  });

  it('导出稳定的 LabelHubSchema 类型和创建函数', () => {
    const schema: LabelHubSchema = createLabelHubSchema({
      schemaVersion: '2026-05-21',
      datasetKind: 'qa_quality',
      fields: [
        {
          key: 'question',
          type: 'textarea',
          label: '问题',
          validation: {
            required: true,
            minLength: 1,
            maxLength: 500,
            message: '请填写问题',
          },
          linkageRules: [
            {
              when: { fieldKey: 'needsReference', operator: 'equals', value: true },
              action: 'show',
              targetFieldKey: 'reference',
              value: true,
            },
          ],
        },
      ],
    });

    expect(schema.datasetKind).toBe('qa_quality');
    expect(schema.fields[0]?.linkageRules?.[0]?.action).toBe('show');
  });
});

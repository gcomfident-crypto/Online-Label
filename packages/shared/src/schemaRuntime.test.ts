import { describe, expect, it } from 'vitest';

import {
  applySchemaLinkage,
  getSchemaFieldKey,
  validateSchemaAnswers,
  type LabelHubSchema,
} from './index.ts';

const baseSchema = (fields: LabelHubSchema['fields']): LabelHubSchema => ({
  schemaVersion: '1.0.0',
  datasetKind: 'generic_json',
  fields,
});

describe('schema runtime', () => {
  it('按 fieldKey 解析 answers 键', () => {
    expect(getSchemaFieldKey({ key: 'display_key', fieldKey: 'answer_key', type: 'text', label: '答案' })).toBe(
      'answer_key',
    );
  });

  it('setValue 只写入 answers，不把目标字段隐式禁用', () => {
    const schema = {
      ...baseSchema([
        { key: 'status', type: 'text', label: '状态' },
        { key: 'score', type: 'text', label: '分数', validation: { pattern: '^\\d$' } },
      ]),
      linkageRules: [
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'approved' },
          action: 'setValue',
          targetFieldKey: 'score',
          value: 'bad',
        },
      ],
    } satisfies LabelHubSchema;

    const result = applySchemaLinkage(schema, { status: 'approved' });

    expect(result.answers).toEqual({ status: 'approved', score: 'bad' });
    expect(result.disabledFieldKeys.has('score')).toBe(false);
    expect(validateSchemaAnswers(schema, result.answers, result)).toEqual([
      { fieldKey: 'score', message: '分数格式不符合要求。' },
    ]);
  });

  it('assertValue 可产生带自定义提示的联动约束错误', () => {
    const schema = {
      ...baseSchema([
        { key: 'status', type: 'text', label: '状态' },
        { key: 'review_result', type: 'text', label: '审核结论', validation: { required: true } },
      ]),
      linkageRules: [
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'approved' },
          action: 'assertValue',
          targetFieldKey: 'review_result',
          value: 'pass',
          message: '审核结论必须是 pass。',
        },
      ],
    } satisfies LabelHubSchema;

    const result = applySchemaLinkage(schema, { status: 'approved', review_result: 'reject' });
    const errors = validateSchemaAnswers(schema, result.answers, result);

    expect(result.answers).toEqual({ status: 'approved', review_result: 'reject' });
    expect(errors).toEqual([{ fieldKey: 'review_result', message: '审核结论必须是 pass。' }]);
  });

  it('assertValue 命中且无自定义提示时返回默认提示', () => {
    const schema = {
      ...baseSchema([
        { key: 'status', type: 'text', label: '状态' },
        { key: 'review_result', type: 'text', label: '审核结论' },
      ]),
      linkageRules: [
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'pending' },
          action: 'assertValue',
          targetFieldKey: 'review_result',
          value: 'wait',
        },
      ],
    } satisfies LabelHubSchema;

    const result = applySchemaLinkage(schema, { status: 'pending', review_result: 'pass' });
    const errors = validateSchemaAnswers(schema, result.answers, result);

    expect(errors).toEqual([{ fieldKey: 'review_result', message: '字段 review_result 未满足联动约束。' }]);
  });

  it('预置校验函数覆盖邮箱、安全链接、JSON 和上传文件类型', () => {
    const schema = baseSchema([
      {
        key: 'email',
        type: 'text',
        label: '邮箱',
        validation: { customValidatorKey: 'valid_email' },
      },
      {
        key: 'link',
        type: 'text',
        label: '资料链接',
        validation: { customValidatorKey: 'safe_url' },
      },
      {
        key: 'json_text',
        type: 'textarea',
        label: 'JSON 文本',
        validation: { customValidatorKey: 'valid_json' },
      },
      {
        key: 'payload',
        type: 'json_editor',
        label: '结构化信息',
        validation: { customValidatorKey: 'non_empty_json' },
      },
      {
        key: 'attachment',
        type: 'file_upload',
        label: '附件',
        fileConstraints: {
          maxFiles: 1,
          maxSizeMb: 10,
          acceptedMimeTypes: ['image/*'],
        },
        validation: { customValidatorKey: 'valid_file_type' },
      },
    ]);

    expect(
      validateSchemaAnswers(schema, {
        email: 'bad-email',
        link: 'javascript:alert(1)',
        json_text: '{bad json}',
        payload: {},
        attachment: {
          name: 'note.txt',
          url: 'https://example.com/note.txt',
          mimeType: 'text/plain',
          size: 12,
        },
      }),
    ).toEqual([
      { fieldKey: 'email', message: '邮箱格式不正确。' },
      { fieldKey: 'link', message: '资料链接必须是安全链接。' },
      { fieldKey: 'json_text', message: 'JSON 文本必须是合法 JSON。' },
      { fieldKey: 'payload', message: '结构化信息必须填写结构化 JSON。' },
      { fieldKey: 'attachment', message: '附件文件类型不符合要求。' },
    ]);

    expect(
      validateSchemaAnswers(schema, {
        email: 'owner@example.com',
        link: 'https://example.com/doc',
        json_text: '{"ok":true}',
        payload: { ok: true },
        attachment: {
          name: 'photo.png',
          url: 'https://example.com/photo.png',
          mimeType: 'image/png',
          size: 12,
        },
      }),
    ).toEqual([]);
  });

  it('limitOptions 按条件值限制可选项并自动清理非法值', () => {
    const schema = {
      ...baseSchema([
        {
          key: 'preferred',
          type: 'radio',
          label: '偏好选择',
          options: [
            { label: 'A', value: 'A' },
            { label: 'B', value: 'B' },
            { label: 'tie', value: 'tie' },
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
            { label: '略逊于', value: '略逊于' },
            { label: '相当', value: '相当' },
          ],
        },
      ]),
      linkageRules: [
        {
          when: { fieldKey: 'preferred', operator: 'exists' },
          action: 'limitOptions',
          targetFieldKey: 'margin',
          cases: [
            { value: 'A', optionValues: ['明显优于', '略优于'] },
            { value: 'B', optionValues: ['明显逊于', '略逊于'] },
            { value: 'tie', optionValues: ['相当'] },
          ],
        },
      ],
    } satisfies LabelHubSchema;

    const preferredA = applySchemaLinkage(schema, { preferred: 'A', margin: '明显逊于' });

    expect([...(preferredA.allowedOptionsByFieldKey.get('margin') ?? [])]).toEqual([
      '明显优于',
      '略优于',
    ]);
    expect(preferredA.answers).toEqual({ preferred: 'A' });

    const preferredB = applySchemaLinkage(schema, { preferred: 'B' });

    expect([...(preferredB.allowedOptionsByFieldKey.get('margin') ?? [])]).toEqual([
      '明显逊于',
      '略逊于',
    ]);

    const preferredTie = applySchemaLinkage(schema, { preferred: 'tie' });

    expect(preferredTie.answers).toEqual({ preferred: 'tie', margin: '相当' });
    expect(preferredTie.normalizedAnswers).toEqual({ preferred: 'tie', margin: '相当' });
  });

  it('limitOptions 校验提交值必须在当前允许范围内', () => {
    const schema = {
      ...baseSchema([
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
          options: [
            { label: '明显优于', value: '明显优于' },
            { label: '明显逊于', value: '明显逊于' },
          ],
        },
      ]),
      linkageRules: [
        {
          when: { fieldKey: 'preferred', operator: 'exists' },
          action: 'limitOptions',
          targetFieldKey: 'margin',
          cases: [{ value: 'A', optionValues: ['明显优于'] }],
        },
      ],
    } satisfies LabelHubSchema;
    const linkage = applySchemaLinkage(schema, { preferred: 'A' });

    expect(validateSchemaAnswers(schema, { preferred: 'A', margin: '明显逊于' }, linkage)).toEqual([
      { fieldKey: 'margin', message: '优劣程度必须选择有效选项。' },
    ]);
  });

  it('结构化 limitOptions 规则在运行时仍然生效', () => {
    const schema = {
      ...baseSchema([
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
      ]),
      linkageRules: [
        {
          id: 'rule_limit_structured',
          combinator: 'and',
          conditions: [{ fieldKey: 'preferred', operator: 'equals', value: 'A' }],
          actions: [
            {
              type: 'limitOptions',
              targetFieldKey: 'margin',
              optionValues: ['明显优于', '略优于'],
              clearInvalidValue: true,
              autoSelectWhenSingleOption: false,
            },
          ],
        },
      ],
    } satisfies LabelHubSchema;

    const linkage = applySchemaLinkage(schema, { preferred: 'A', margin: '明显逊于' });

    expect([...(linkage.allowedOptionsByFieldKey.get('margin') ?? [])]).toEqual(['明显优于', '略优于']);
    expect(linkage.answers).toEqual({ preferred: 'A' });
  });

  it('隐藏字段保留草稿值但 normalizedAnswers 会从正式提交中移除', () => {
    const schema = {
      ...baseSchema([
        {
          key: 'hasRisk',
          type: 'radio',
          label: '是否有安全风险',
          options: [
            { label: '是', value: 'yes' },
            { label: '否', value: 'no' },
          ],
        },
        {
          key: 'riskDetail',
          type: 'textarea',
          label: '安全风险说明',
          validation: { required: true },
          aiReview: {
            enabled: true,
            requirement: '请判断风险说明是否充分。',
          },
        },
      ]),
      linkageRules: [
        {
          when: { fieldKey: 'hasRisk', operator: 'equals', value: 'yes' },
          action: 'show',
          targetFieldKey: 'riskDetail',
        },
      ],
    } satisfies LabelHubSchema;

    const hidden = applySchemaLinkage(schema, {
      hasRisk: 'no',
      riskDetail: '草稿里的风险说明',
    });

    expect(hidden.hiddenFieldKeys.has('riskDetail')).toBe(true);
    expect(hidden.answers).toEqual({
      hasRisk: 'no',
      riskDetail: '草稿里的风险说明',
    });
    expect(hidden.normalizedAnswers).toEqual({ hasRisk: 'no' });
    expect(validateSchemaAnswers(schema, hidden.normalizedAnswers, hidden)).toEqual([]);

    const visible = applySchemaLinkage(schema, hidden.answers);

    expect(visible.hiddenFieldKeys.has('riskDetail')).toBe(true);
    expect(applySchemaLinkage(schema, { ...hidden.answers, hasRisk: 'yes' }).answers.riskDetail).toBe(
      '草稿里的风险说明',
    );
  });

  it('多动作 show/hide 规则可以同时生效', () => {
    const schema = {
      ...baseSchema([
        { key: 'category', type: 'text', label: '类目' },
        { key: 'size_table', type: 'text', label: '尺寸表' },
        { key: 'shelf_life', type: 'text', label: '保质期' },
      ]),
      linkageRules: [
        {
          id: 'rule_multi_action',
          combinator: 'and',
          conditions: [{ fieldKey: 'category', operator: 'equals', value: '食品生鲜' }],
          actions: [
            { type: 'hide', targetFieldKey: 'size_table' },
            { type: 'show', targetFieldKey: 'shelf_life' },
          ],
        },
      ],
    } satisfies LabelHubSchema;

    const matched = applySchemaLinkage(schema, { category: '食品生鲜' });
    expect(matched.hiddenFieldKeys.has('size_table')).toBe(true);
    expect(matched.visibleFieldKeys.has('shelf_life')).toBe(true);

    const unmatched = applySchemaLinkage(schema, { category: '服饰' });
    expect(unmatched.hiddenFieldKeys.has('size_table')).toBe(false);
    expect(unmatched.hiddenFieldKeys.has('shelf_life')).toBe(true);
  });

  it('结构化规则支持 or 条件组合', () => {
    const schema = {
      ...baseSchema([
        { key: 'preferred', type: 'radio', label: '偏好选择', options: [{ label: 'A', value: 'A' }] },
        {
          key: 'margin',
          type: 'radio',
          label: '优劣程度',
          options: [
            { label: '明显优于', value: '明显优于' },
            { label: '略优于', value: '略优于' },
          ],
        },
        { key: 'note', type: 'textarea', label: '备注' },
      ]),
      linkageRules: [
        {
          id: 'rule_or',
          combinator: 'or',
          conditions: [
            { fieldKey: 'preferred', operator: 'equals', value: 'A' },
            { fieldKey: 'margin', operator: 'equals', value: '明显优于' },
          ],
          actions: [{ type: 'hide', targetFieldKey: 'note' }],
        },
      ],
    } satisfies LabelHubSchema;

    expect(applySchemaLinkage(schema, { preferred: 'B', margin: '明显优于' }).hiddenFieldKeys.has('note')).toBe(true);
    expect(applySchemaLinkage(schema, { preferred: 'B', margin: '略优于' }).hiddenFieldKeys.has('note')).toBe(false);
  });

  it('文件类字段拒绝不安全链接', () => {
    const schema = baseSchema([{ key: 'attachment', type: 'file_upload', label: '附件' }]);

    expect(
      validateSchemaAnswers(schema, {
        attachment: {
          name: 'a.txt',
          url: 'javascript:alert(1)',
          mimeType: 'text/plain',
          size: 1,
        },
      }),
    ).toEqual([{ fieldKey: 'attachment', message: '附件需要上传有效文件。' }]);
  });
});

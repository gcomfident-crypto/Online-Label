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

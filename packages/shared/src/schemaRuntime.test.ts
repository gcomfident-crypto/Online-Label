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

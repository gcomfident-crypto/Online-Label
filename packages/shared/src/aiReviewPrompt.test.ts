import { describe, expect, it } from 'vitest';

import { compileAiReviewPrompt } from './aiReviewPrompt.ts';
import { createLabelHubSchema } from './schema.ts';

describe('compileAiReviewPrompt', () => {
  it('按角色、ShowItem、标注答案、字段标准和输出格式编排最终 Prompt', () => {
    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        {
          key: 'show_item',
          type: 'show_item',
          label: '题目展示',
          displayConfig: {
            layout: 'table',
            fields: [
              { sourceKey: 'prompt', label: 'Prompt', format: 'long_text' },
              { sourceKey: 'response_a', label: '回答 A', format: 'text' },
            ],
          },
        },
        {
          key: 'preferred_field',
          fieldKey: 'preferred',
          type: 'radio',
          label: '选择更优回答',
          validation: { required: true },
          options: [
            { label: '回答 A', value: 'A' },
            { label: '回答 B', value: 'B' },
          ],
          aiReview: {
            enabled: true,
            requirement: '必须结合两个回答的事实准确性和完整性判断。',
          },
        },
        {
          key: 'note_field',
          fieldKey: 'note',
          type: 'textarea',
          label: '备注',
          aiReview: {
            enabled: false,
            requirement: '关闭时不应该进入字段级标准。',
          },
        },
      ],
    });

    const compiled = compileAiReviewPrompt({
      schema,
      rawData: {
        prompt: '请比较两个回答',
        response_a: '回答 A 内容',
        response_b: '回答 B 内容',
      },
      answers: {
        preferred: 'A',
      },
    });

    expect(compiled.prompt).toContain('# 1. 角色设定');
    expect(compiled.prompt).toContain('# 2. 题目展示信息 Show Item');
    expect(compiled.prompt).toContain('# 3. 标注员提交内容');
    expect(compiled.prompt).toContain('# 4. 字段级审核标准');
    expect(compiled.prompt).toContain('# 5. 输出格式约束');
    expect(compiled.sections.find((section) => section.key === 'persona')?.content).toBe('');
    expect(compiled.prompt).not.toContain('你是一个专业的数据标注质检审核员');
    expect(compiled.showItemData).toEqual([
      { sourceKey: 'prompt', label: 'Prompt', format: 'long_text', value: '请比较两个回答' },
      { sourceKey: 'response_a', label: '回答 A', format: 'text', value: '回答 A 内容' },
    ]);
    expect(compiled.answerData).toEqual({ preferred: 'A', note: null });
    expect(compiled.fieldRequirements).toEqual([
      expect.objectContaining({
        fieldKey: 'preferred',
        label: '选择更优回答',
        required: true,
        requirement: '必须结合两个回答的事实准确性和完整性判断。',
      }),
    ]);
    expect(compiled.prompt).not.toContain('关闭时不应该进入字段级标准');
    expect(compiled.promptHash).toMatch(/^prompt_[a-f0-9]{8}$/);
  });

  it('支持从分组和多 Tab 内部收集开启 AI 预审的待标注字段', () => {
    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        {
          key: 'group',
          type: 'group',
          label: '分组',
          fields: [
            {
              key: 'dimensions_field',
              fieldKey: 'dimensions',
              type: 'checkbox',
              label: '选择适用维度',
              options: [{ label: '准确性', value: 'accuracy' }],
              aiReview: {
                enabled: true,
                requirement: '至少选择和题目相关的维度。',
              },
            },
          ],
        },
        {
          key: 'tabs',
          type: 'tabs',
          label: '多 Tab',
          tabs: [
            {
              key: 'tab_a',
              label: 'Tab A',
              fields: [
                {
                  key: 'safety_flag_field',
                  fieldKey: 'safety_flag',
                  type: 'radio',
                  label: '安全风险',
                  aiReview: {
                    enabled: true,
                    requirement: '判断是否存在安全风险。',
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    const compiled = compileAiReviewPrompt({
      schema,
      rawData: { prompt: '安全问题' },
      answers: { dimensions: ['accuracy'] },
    });

    expect(compiled.fieldRequirements.map((field) => field.fieldKey)).toEqual([
      'dimensions',
      'safety_flag',
    ]);
    expect(compiled.answerData).toEqual({
      dimensions: ['accuracy'],
      safety_flag: null,
    });
  });

  it('支持模板保存分段 Prompt 编辑内容', () => {
    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        {
          key: 'answer',
          fieldKey: 'answer',
          type: 'textarea',
          label: '回答',
          aiReview: {
            enabled: true,
            requirement: '判断回答是否准确。',
          },
        },
      ],
      aiReviewPrompt: {
        sectionOverrides: {
          persona: '你是严格的数据质检专家。',
          output_schema: '只输出 {"verdict":"pass|reject|manual"}。',
        },
      },
    });

    const compiled = compileAiReviewPrompt({
      schema,
      answers: { answer: '标注内容' },
    });

    expect(compiled.sections.find((section) => section.key === 'persona')?.content).toBe(
      '你是严格的数据质检专家。',
    );
    expect(compiled.sections.find((section) => section.key === 'output_schema')?.content).toBe(
      '只输出 {"verdict":"pass|reject|manual"}。',
    );
    expect(compiled.prompt).toContain('# 1. 角色设定\n你是严格的数据质检专家。');
    expect(compiled.prompt).toContain('# 5. 输出格式约束\n只输出 {"verdict":"pass|reject|manual"}。');
  });

  it('支持模板保存完整 Prompt 编辑内容并优先作为最终 Prompt', () => {
    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        {
          key: 'answer',
          fieldKey: 'answer',
          type: 'textarea',
          label: '回答',
          aiReview: {
            enabled: true,
            requirement: '判断回答是否准确。',
          },
        },
      ],
      aiReviewPrompt: {
        sectionOverrides: {
          persona: '分段身份设定。',
        },
        fullPromptOverride: '完整自定义 Prompt。只输出 JSON。',
      },
    });

    const compiled = compileAiReviewPrompt({
      schema,
      answers: { answer: '标注内容' },
    });

    expect(compiled.sections.find((section) => section.key === 'persona')?.content).toBe('分段身份设定。');
    expect(compiled.prompt).toBe('完整自定义 Prompt。只输出 JSON。');
    expect(compiled.promptHash).toMatch(/^prompt_[a-f0-9]{8}$/);
  });
});

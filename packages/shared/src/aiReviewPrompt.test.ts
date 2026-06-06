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
    expect(compiled.prompt).toContain('# 3. 需要AI预审的字段');
    expect(compiled.prompt).toContain('# 4. 字段审核标准');
    expect(compiled.prompt).toContain('# 5. 输出格式约束');
    expect(compiled.sections.find((section) => section.key === 'persona')?.content).toBe('');
    expect(compiled.prompt).not.toContain('你是一个专业的数据标注质检审核员');
    expect(compiled.sections.find((section) => section.key === 'output_schema')?.content).toContain('fieldReviews');
    expect(compiled.sections.find((section) => section.key === 'output_schema')?.content).toContain('overallComment');
    expect(compiled.sections.find((section) => section.key === 'output_schema')?.content).not.toContain('relevance');
    expect(compiled.sections.find((section) => section.key === 'output_schema')?.content).not.toContain('accuracy');
    expect(compiled.showItemData).toEqual([
      { sourceKey: 'prompt', label: 'Prompt', format: 'long_text', value: '请比较两个回答' },
      { sourceKey: 'response_a', label: '回答 A', format: 'text', value: '回答 A 内容' },
    ]);
    expect(compiled.answerData).toEqual({ preferred: 'A' });
    expect(compiled.sections.find((section) => section.key === 'answers')?.content).not.toContain('note');
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

  it('传入 reviewFieldKeys 时只编译本次提交实际参与 AI 预审的字段', () => {
    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        {
          key: 'visible_answer',
          fieldKey: 'visible_answer',
          type: 'textarea',
          label: '可见回答',
          aiReview: {
            enabled: true,
            requirement: '审核可见回答。',
          },
        },
        {
          key: 'hidden_answer',
          fieldKey: 'hidden_answer',
          type: 'textarea',
          label: '隐藏回答',
          aiReview: {
            enabled: true,
            requirement: '隐藏时不应进入 AI 预审。',
          },
        },
      ],
    });

    const compiled = compileAiReviewPrompt({
      schema,
      answers: {
        visible_answer: '本次提交内容',
      },
      reviewFieldKeys: ['visible_answer'],
    });

    expect(compiled.answerData).toEqual({ visible_answer: '本次提交内容' });
    expect(compiled.fieldRequirements.map((field) => field.fieldKey)).toEqual(['visible_answer']);
    expect(compiled.prompt).toContain('审核可见回答。');
    expect(compiled.prompt).not.toContain('隐藏时不应进入 AI 预审。');
    expect(compiled.prompt).not.toContain('hidden_answer');
  });

  it('AI 预审上下文不把待标注字段在上传文件里的演示值当作题目依据', () => {
    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        {
          key: 'show_item',
          type: 'show_item',
          label: '题目展示',
          displayConfig: {
            layout: 'comparison',
            fields: [
              { sourceKey: 'prompt', label: '题目', format: 'long_text' },
              { sourceKey: 'response_a', label: '回答 A', format: 'long_text' },
              { sourceKey: 'response_b', label: '回答 B', format: 'long_text' },
            ],
          },
        },
        {
          key: 'dimensions_field',
          fieldKey: 'dimensions',
          sourceKey: 'dimensions',
          type: 'checkbox',
          label: '评估维度',
          options: [
            { label: '准确性', value: '准确性' },
            { label: '完整性', value: '完整性' },
            { label: '可读性', value: '可读性' },
          ],
          aiReview: {
            enabled: true,
            requirement: '维度选择应符合本次标注判断。',
          },
        },
        {
          key: 'annotator_note_field',
          fieldKey: 'annotator_note',
          sourceKey: 'annotator_note',
          type: 'textarea',
          label: '标注备注',
          aiReview: {
            enabled: true,
            requirement: '备注应解释本次判断依据。',
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
        dimensions: ['准确性', '完整性', '可读性'],
        annotator_note: '演示备注：三个维度都需要关注。',
      },
      answers: {
        dimensions: ['准确性'],
        annotator_note: '我认为回答 A 更准确。',
      },
      reviewFieldKeys: ['dimensions', 'annotator_note'],
    });

    expect(compiled.reviewableRawData).toEqual({
      prompt: '请比较两个回答',
      response_a: '回答 A 内容',
      response_b: '回答 B 内容',
    });
    expect(compiled.showItemData).toEqual([
      { sourceKey: 'prompt', label: '题目', format: 'long_text', value: '请比较两个回答' },
      { sourceKey: 'response_a', label: '回答 A', format: 'long_text', value: '回答 A 内容' },
      { sourceKey: 'response_b', label: '回答 B', format: 'long_text', value: '回答 B 内容' },
    ]);
    expect(compiled.prompt).not.toContain('"sourceKey": "dimensions"');
    expect(compiled.prompt).not.toContain('["准确性","完整性","可读性"]');
    expect(compiled.prompt).not.toContain('演示备注：三个维度都需要关注。');
    expect(compiled.prompt).toContain('上传文件中与待标注字段同名或映射到待标注字段的值，仅用于 owner 配置模板参考，不是标准答案');
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

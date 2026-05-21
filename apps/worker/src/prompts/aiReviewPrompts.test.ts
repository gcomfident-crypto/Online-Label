import { describe, expect, it } from 'vitest';

import { buildAiReviewPrompt } from './aiReviewPrompts.ts';

describe('AI 预审 Prompt', () => {
  it('qa_quality Prompt 包含官方题目字段和标注员答案', () => {
    const prompt = buildAiReviewPrompt({
      datasetKind: 'qa_quality',
      rawData: {
        prompt: '如何判断回答质量？',
        model_answer: '检查事实性。',
        reference: '应覆盖核心判断依据。',
        expected_dimensions: ['事实性', '完整性'],
      },
      answers: { quality: 'pass', comment: '覆盖充分。' },
      rulePromptTemplate: '请输出结构化结果。',
    });

    expect(prompt).toContain('prompt');
    expect(prompt).toContain('model_answer');
    expect(prompt).toContain('reference');
    expect(prompt).toContain('expected_dimensions');
    expect(prompt).toContain('"quality": "pass"');
  });

  it('preference_compare Prompt 包含 A/B 回答、dimensions 和标注员答案', () => {
    const prompt = buildAiReviewPrompt({
      datasetKind: 'preference_compare',
      rawData: {
        prompt: '哪一个回答更好？',
        response_a: '回答 A',
        response_b: '回答 B',
        dimensions: ['有用性', '安全性'],
      },
      answers: { preferred: 'A', annotator_note: 'A 更完整。' },
      rulePromptTemplate: '请输出偏好结构化结果。',
    });

    expect(prompt).toContain('response_a');
    expect(prompt).toContain('response_b');
    expect(prompt).toContain('dimensions');
    expect(prompt).toContain('"preferred": "A"');
  });
});

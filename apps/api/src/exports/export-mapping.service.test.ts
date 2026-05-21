import { describe, expect, it } from 'vitest';

import { ExportMappingService } from './export-mapping.service.ts';

describe('ExportMappingService', () => {
  it('提供 qa_quality 和 preference_compare 官方字段映射预设', () => {
    const service = new ExportMappingService();

    expect(service.getPreset('qa_quality').map((field) => field.target)).toEqual([
      'id',
      'prompt',
      'model_answer',
      'relevance_score',
      'accuracy_score',
      'format_score',
      'safety_score',
      'issue_tags',
      'comment',
      'ai_overall',
      'human_verdict',
    ]);
    expect(service.getPreset('preference_compare').map((field) => field.target)).toEqual([
      'id',
      'prompt',
      'response_a',
      'response_b',
      'preferred',
      'margin',
      'dimensions',
      'safety_flag',
      'annotator_note',
      'human_verdict',
    ]);
  });

  it('按字段映射生成预览行，并可按 includeReviews 隐藏审核字段', () => {
    const service = new ExportMappingService();
    const mapping = service.getPreset('qa_quality');
    const source = {
      externalId: 'qa_001',
      rawData: {
        prompt: '如何判断回答质量？',
        model_answer: '检查事实性。',
      },
      answers: {
        relevance_score: 5,
        accuracy_score: 4,
        format_score: 5,
        safety_score: 5,
        issue_tags: ['complete', 'grounded'],
        comment: '覆盖关键点。',
      },
      review: {
        ai_overall: 92,
        human_verdict: 'final_pass',
      },
    };

    expect(service.buildRows([source], mapping, true)).toEqual([
      {
        id: 'qa_001',
        prompt: '如何判断回答质量？',
        model_answer: '检查事实性。',
        relevance_score: 5,
        accuracy_score: 4,
        format_score: 5,
        safety_score: 5,
        issue_tags: ['complete', 'grounded'],
        comment: '覆盖关键点。',
        ai_overall: 92,
        human_verdict: 'final_pass',
      },
    ]);
    expect(service.buildRows([source], mapping, false)[0]).not.toHaveProperty('ai_overall');
    expect(service.buildRows([source], mapping, false)[0]).not.toHaveProperty('human_verdict');
  });

  it('自定义字段映射会过滤空目标和禁用字段', () => {
    const service = new ExportMappingService();

    expect(
      service.normalizeMapping(
        [
          { source: 'rawData.prompt', target: 'prompt_text', enabled: true },
          { source: 'answers.comment', target: '  ', enabled: true },
          { source: 'answers.hidden', target: 'hidden', enabled: false },
        ],
        'qa_quality',
      ),
    ).toEqual([{ source: 'rawData.prompt', target: 'prompt_text', enabled: true }]);
  });
});

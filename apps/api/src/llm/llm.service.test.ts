import { afterEach, describe, expect, it, vi } from 'vitest';

import { LlmService } from './llm.service.ts';

const ORIGINAL_ENV = { ...process.env };

describe('LlmService template field classifier', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it('没有显式 LLM_PROVIDER 但配置 DeepSeek key 时按 DeepSeek OpenAI 兼容接口分类字段', async () => {
    delete process.env.LLM_PROVIDER;
    process.env.NODE_ENV = 'development';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.LLM_MODEL = 'deepseek-chat';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  layout: 'field_list',
                  displayFields: [
                    { sourceKey: 'prompt', label: '问题', area: 'primary', format: 'long_text', maxLines: 8 },
                  ],
                  annotationFields: [],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new LlmService().classifyTemplateFields({
      fileName: 'qa_quality.xlsx',
      fields: [
        { sourceKey: 'prompt', samples: ['问题'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
        { sourceKey: 'model_answer', samples: ['回答'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
        { sourceKey: 'expected_dimensions', samples: ['相关性'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
      ],
      records: [
        {
          prompt: '问题',
          model_answer: '回答',
          expected_dimensions: '相关性',
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-deepseek-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(result.provider).toBe('deepseek');
    expect(result.model).toBe('deepseek-chat');
  });

  it('显式 LLM_PROVIDER=deepseek 且配置 DeepSeek key 时按 DeepSeek OpenAI 兼容接口分类字段', async () => {
    process.env.LLM_PROVIDER = 'deepseek';
    process.env.NODE_ENV = 'development';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.LLM_MODEL = 'deepseek-chat';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  layout: 'field_list',
                  displayFields: [
                    { sourceKey: 'prompt', label: '问题', area: 'primary', format: 'long_text', maxLines: 8 },
                    { sourceKey: 'model_answer', label: '模型回答', area: 'content', format: 'long_text', maxLines: 12 },
                    { sourceKey: 'reference', label: '参考答案', area: 'content', format: 'long_text', maxLines: 8 },
                  ],
                  annotationFields: [
                    {
                      sourceKey: 'expected_dimensions',
                      label: '评测维度',
                      type: 'checkbox',
                      options: [
                        { label: '相关性', value: 'relevance' },
                        { label: '准确性', value: 'accuracy' },
                      ],
                    },
                    { sourceKey: 'media_url', label: '媒体链接', type: 'text' },
                    { sourceKey: 'content_markdown', label: '正文', type: 'text' },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new LlmService().classifyTemplateFields({
      fileName: 'qa_quality.xlsx',
      fields: [
        { sourceKey: 'prompt', samples: ['问题'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
        { sourceKey: 'model_answer', samples: ['回答'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
        { sourceKey: 'reference', samples: ['参考'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
        {
          sourceKey: 'expected_dimensions',
          samples: [['相关性', '准确性']],
          valueTypes: ['array'],
          filledCount: 1,
          totalCount: 1,
        },
        { sourceKey: 'media_url', samples: ['https://example.com/a.png'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
        { sourceKey: 'content_markdown', samples: ['# 正文'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
      ],
      records: [
        {
          prompt: '问题',
          model_answer: '回答',
          reference: '参考',
          expected_dimensions: ['相关性', '准确性'],
          media_url: 'https://example.com/a.png',
          content_markdown: '# 正文',
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-deepseek-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(result.provider).toBe('deepseek');
    expect(result.model).toBe('deepseek-chat');
    expect(result.displayFields?.map((field) => field.sourceKey)).toEqual([
      'prompt',
      'model_answer',
      'reference',
      'expected_dimensions',
      'media_url',
      'content_markdown',
    ]);
    expect(result.annotationFields).toEqual([]);

    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      messages: Array<{ content: string }>;
    };
    expect(requestBody.messages.map((message) => message.content).join('\n')).toContain('分水岭');
    expect(requestBody.messages.map((message) => message.content).join('\n')).toContain('多值');
    expect(requestBody.messages.map((message) => message.content).join('\n')).toContain('description');
    expect(requestBody.messages.map((message) => message.content).join('\n')).toContain('20 个汉字以内');
    expect(requestBody.messages.map((message) => message.content).join('\n')).toContain('字段标题或名词短语');
  });

  it('保留 AI 生成的填写提示，并把操作动词从字段标题中移除', async () => {
    process.env.LLM_PROVIDER = 'deepseek';
    process.env.NODE_ENV = 'development';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  layout: 'table',
                  displayFields: [{ sourceKey: 'prompt', label: '问题', area: 'content', format: 'long_text' }],
                  annotationFields: [
                    {
                      sourceKey: 'preferred',
                      label: '选择更优回答',
                      type: 'radio',
                      description: '比较AB后选更优',
                      options: [
                        { label: 'A', value: 'A' },
                        { label: 'B', value: 'B' },
                      ],
                      required: true,
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new LlmService().classifyTemplateFields({
      fileName: 'preference_compare.jsonl',
      fields: [
        { sourceKey: 'prompt', samples: ['比较 A/B 回答'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
        { sourceKey: 'preferred', samples: [], valueTypes: ['string'], filledCount: 0, totalCount: 1 },
      ],
      records: [{ prompt: '比较 A/B 回答', preferred: '' }],
    });

    expect(result.annotationFields?.[0]).toMatchObject({
      sourceKey: 'preferred',
      label: '更优回答',
      description: '比较AB后选更优',
      type: 'radio',
      required: true,
    });
  });

  it('按字段顺序寻找分水岭，并从右侧打标字段值中提取物料选项', async () => {
    process.env.LLM_PROVIDER = 'mock';
    process.env.NODE_ENV = 'test';

    const extraDimensionValues = Array.from({ length: 55 }, (_, index) => `扩展维度${index + 1}`);
    const dimensionValues = [
      '准确性 | 完整性 | 可读性',
      '准确性 | 可执行性',
      '简洁性 | 相关性',
      '准确性 | 地道性',
      '创意性 | 感染力',
      '准确性',
      '相关性 | 上下文一致',
      '安全性 | 合规性',
      '准确性 | 安全提示',
      '完整性 | 相关性',
      '创意性 | 贴合度',
      ...extraDimensionValues,
      ...Array.from({ length: 190 }, () => '准确性'),
      '跨样本覆盖',
    ];
    const expectedDimensionOptions = [
      '准确性',
      '完整性',
      '可读性',
      '可执行性',
      '简洁性',
      '相关性',
      '地道性',
      '创意性',
      '感染力',
      '上下文一致',
      '安全性',
      '合规性',
      '安全提示',
      '贴合度',
      ...extraDimensionValues,
      '跨样本覆盖',
    ].map((label) => ({ label, value: label }));
    const records = dimensionValues.map((dimensions, index) => ({
      id: `P${String(index + 1).padStart(4, '0')}`,
      task_type: '偏好评测',
      lang: 'zh',
      prompt: `问题 ${index + 1}`,
      response_a: `回答 A${index + 1}`,
      model_a: 'model-a',
      response_b: `回答 B${index + 1}`,
      model_b: 'model-b',
      preferred: index % 2 === 0 ? 'A' : 'B',
      margin: ['明显优于', '略优', '相当'][index % 3],
      dimensions,
      safety_flag: index % 2 === 0 ? '否' : '是',
      annotator_note: '',
    }));

    const result = await new LlmService().classifyTemplateFields({
      fileName: 'preference_compare.jsonl',
      fields: [
        'id',
        'task_type',
        'lang',
        'prompt',
        'response_a',
        'model_a',
        'response_b',
        'model_b',
        'preferred',
        'margin',
        'dimensions',
        'safety_flag',
        'annotator_note',
      ].map((sourceKey) => ({
        sourceKey,
        samples: records.map((record) => record[sourceKey as keyof typeof record]).filter(Boolean).slice(0, 3),
        valueTypes: ['string'],
        filledCount: records.filter((record) => record[sourceKey as keyof typeof record]).length,
        totalCount: records.length,
      })),
      records,
    });

    expect(result.displayFields?.map((field) => field.sourceKey)).toEqual([
      'id',
      'task_type',
      'lang',
      'prompt',
      'response_a',
      'model_a',
      'response_b',
      'model_b',
    ]);
    expect(result.annotationFields?.map((field) => field.sourceKey)).toEqual([
      'preferred',
      'margin',
      'dimensions',
      'safety_flag',
      'annotator_note',
    ]);

    expect(result.annotationFields?.find((field) => field.sourceKey === 'preferred')).toMatchObject({
      type: 'radio',
      options: [
        { label: 'A', value: 'A' },
        { label: 'B', value: 'B' },
      ],
      required: true,
    });
    expect(result.annotationFields?.find((field) => field.sourceKey === 'margin')).toMatchObject({
      type: 'radio',
      options: [
        { label: '明显优于', value: '明显优于' },
        { label: '略优', value: '略优' },
        { label: '相当', value: '相当' },
      ],
    });
    expect(result.annotationFields?.find((field) => field.sourceKey === 'dimensions')).toMatchObject({
      type: 'checkbox',
      description: '选择适用的dimensions',
    });
    expect(result.annotationFields?.find((field) => field.sourceKey === 'dimensions')?.options)
      .toEqual(expectedDimensionOptions);
    expect(result.annotationFields?.every((field) => (field.description?.length ?? 0) <= 20)).toBe(true);
    expect(result.annotationFields?.find((field) => field.sourceKey === 'safety_flag')).toMatchObject({
      type: 'radio',
      options: [
        { label: '否', value: '否' },
        { label: '是', value: '是' },
      ],
    });
    expect(result.annotationFields?.find((field) => field.sourceKey === 'annotator_note')).toMatchObject({
      type: 'textarea',
    });
  });

  it('字段统计存在时即使记录样本很少也用统计选项生成物料', async () => {
    process.env.LLM_PROVIDER = 'mock';
    process.env.NODE_ENV = 'test';

    const result = await new LlmService().classifyTemplateFields({
      fileName: 'preference_compare.json',
      fields: [
        { sourceKey: 'prompt', samples: ['问题 1'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
        {
          sourceKey: 'dimensions',
          samples: ['准确性'],
          valueTypes: ['string'],
          filledCount: 1,
          totalCount: 1,
        },
      ],
      records: [{ prompt: '问题 1', dimensions: '准确性' }],
      fieldStats: [
        {
          sourceKey: 'prompt',
          totalCount: 3,
          filledCount: 3,
          valueTypes: ['string'],
          samples: ['问题 1', '问题 2', '问题 3'],
          uniqueValues: ['问题 1', '问题 2', '问题 3'],
          optionCandidates: [],
          hasMultiValue: false,
          distinctCount: 0,
        },
        {
          sourceKey: 'dimensions',
          totalCount: 3,
          filledCount: 3,
          valueTypes: ['string'],
          samples: ['准确性 | 完整性', '安全性 | 合规性'],
          uniqueValues: ['准确性 | 完整性', '安全性 | 合规性'],
          optionCandidates: [
            { label: '准确性', value: '准确性' },
            { label: '完整性', value: '完整性' },
            { label: '安全性', value: '安全性' },
            { label: '合规性', value: '合规性' },
          ],
          hasMultiValue: true,
          distinctCount: 4,
        },
      ],
    });

    expect(result.annotationFields?.find((field) => field.sourceKey === 'dimensions')).toMatchObject({
      type: 'checkbox',
      options: [
        { label: '准确性', value: '准确性' },
        { label: '完整性', value: '完整性' },
        { label: '安全性', value: '安全性' },
        { label: '合规性', value: '合规性' },
      ],
    });
  });
});

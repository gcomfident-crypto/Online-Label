import { afterEach, describe, expect, it, vi } from 'vitest';

import { LlmService } from './llm.service.ts';

const ORIGINAL_ENV = { ...process.env };

describe('LlmService template field classifier', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it('LLM 辅助生成使用真实模型返回可直接写入的 suggestion', async () => {
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
                  targetFieldKey: 'structured_note',
                  summary: '已生成结构化记录',
                  suggestion: {
                    comment: '围绕光合作用过程补充关键依据。',
                    issue_tags: ['missing_info'],
                  },
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new LlmService().createAssist({
      datasetKind: 'qa_quality',
      rawData: {
        prompt: '请说明光合作用的主要过程。',
        model_answer: '光合作用会吸收二氧化碳并释放氧气。',
      },
      answers: {
        reviewer: '已检查参考答案',
        structured_note: {
          comment: '旧版记录过于笼统。',
          issue_tags: ['missing_info'],
        },
      },
      targetFieldKey: 'structured_note',
      promptTemplate: '请生成结构化复核记录。',
      previousTargetValue: {
        comment: '旧版记录过于笼统。',
        issue_tags: ['missing_info'],
      },
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
    expect(result).toEqual({
      datasetKind: 'qa_quality',
      targetFieldKey: 'structured_note',
      summary: '已生成结构化记录',
      suggestion: {
        comment: '围绕光合作用过程补充关键依据。',
        issue_tags: ['missing_info'],
      },
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      temperature: number;
      messages: Array<{ content: string }>;
    };
    const assistUserMessage = requestBody.messages.find((message) =>
      message.content.includes('当前答案：'),
    )?.content ?? '';

    expect(requestBody.temperature).toBeGreaterThan(0);
    expect(requestBody.messages.map((message) => message.content).join('\n')).toContain('不要输出 mock');
    expect(requestBody.messages.map((message) => message.content).join('\n')).toContain('请生成结构化复核记录');
    expect(assistUserMessage).toContain('请生成一个不同于上一次目标字段内容的新版本');
    expect(assistUserMessage).toContain('旧版记录过于笼统');
    expect(assistUserMessage).toContain('"reviewer":"已检查参考答案"');
    expect(assistUserMessage).not.toContain('"structured_note"');
  });

  it('LLM 辅助生成遇到 DeepSeek 鉴权失败时返回可定位错误', async () => {
    process.env.LLM_PROVIDER = 'deepseek';
    process.env.NODE_ENV = 'development';
    process.env.DEEPSEEK_API_KEY = 'invalid-deepseek-key';
    process.env.LLM_MODEL = 'deepseek-chat';

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'Authentication Fails',
            type: 'authentication_error',
            code: 'invalid_request_error',
          },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    ));

    await expect(new LlmService().createAssist({
      datasetKind: 'qa_quality',
      rawData: { prompt: '1+1=?', model_answer: '2' },
      answers: {},
      targetFieldKey: 'comment',
      promptTemplate: '生成简短评价。',
    })).rejects.toMatchObject({
      response: {
        code: 'LLM_ASSIST_FAILED',
        message: 'LLM 辅助模型鉴权失败：DeepSeek API Key 无效或无权限，请检查服务器环境变量 DEEPSEEK_API_KEY。',
      },
    });
  });

  it('LLM 辅助生成在后端兜底过滤上传文件里的待标注演示值', async () => {
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
                  targetFieldKey: 'annotator_note',
                  summary: '已生成备注',
                  suggestion: '回答 A 在准确性上更完整。',
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new LlmService().createAssist({
      datasetKind: 'generic_json',
      rawData: {
        prompt: '请比较两个回答。',
        response_a: '回答 A 内容。',
        dimensions: ['准确性', '完整性', '可读性'],
        annotator_note: '演示备注：三个维度都需要关注。',
      },
      answers: {
        dimensions: ['准确性'],
        annotator_note: '上一版备注。',
      },
      targetFieldKey: 'annotator_note',
      promptTemplate: '请根据 #prompt 和当前评估维度生成备注。',
      visibleRawDataKeys: ['prompt', 'response_a', 'dimensions'],
      annotationRawDataKeys: ['dimensions', 'annotator_note'],
    } as Parameters<LlmService['createAssist']>[0]);

    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      messages: Array<{ content: string }>;
    };
    const assistUserMessage = requestBody.messages.find((message) =>
      message.content.includes('原始数据：'),
    )?.content ?? '';

    expect(assistUserMessage).toContain('原始数据：{"prompt":"请比较两个回答。","response_a":"回答 A 内容。"}');
    expect(assistUserMessage).toContain('当前答案：{"dimensions":["准确性"]}');
    expect(assistUserMessage).not.toContain('完整性');
    expect(assistUserMessage).not.toContain('可读性');
    expect(assistUserMessage).not.toContain('演示备注：三个维度都需要关注。');
  });

  it('AI 预审使用真实模型生成字段级评语和修改建议', async () => {
    process.env.LLM_PROVIDER = 'deepseek';
    process.env.NODE_ENV = 'development';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.LLM_MODEL = 'deepseek-chat';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'chatcmpl_ai_review_1',
          usage: {
            prompt_tokens: 320,
            completion_tokens: 96,
            total_tokens: 416,
          },
          choices: [
            {
              message: {
                content: JSON.stringify({
                  verdict: 'reject',
                  overallScore: 48,
                  overallComment: '审核意见没有解释关键事实依据，建议打回修改。',
                  fieldReviews: [
                    {
                      fieldKey: 'comment',
                      label: '审核意见',
                      score: 48,
                      decision: 'reject',
                      comment: '当前标注只给出结论，没有说明模型回答与题目材料之间的事实依据。',
                      suggestions: ['补充事实性、完整性和表达清晰度的判断依据。'],
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

    const result = await new LlmService().reviewSubmission({
      answers: {
        comment: '可以通过。',
      },
      datasetKind: 'qa_quality',
      fieldRequirements: [
        {
          fieldKey: 'comment',
          label: '审核意见',
          type: 'textarea',
          required: true,
          requirement: '审核意见需说明关键事实依据。',
        },
      ],
      model: 'deepseek-chat',
      passThreshold: 70,
      provider: 'deepseek',
      rawData: {
        prompt: '如何判断回答质量？',
        model_answer: '检查事实性、完整性和表达清晰度。',
      },
      rawPrompt: '请对 comment 输出字段级 AI 预审结果。',
      structuredOutputMode: 'function_calling',
      temperature: 0,
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
    expect(result).toEqual(
      expect.objectContaining({
        comment: '审核意见没有解释关键事实依据，建议打回修改。',
        decision: 'reject',
        rawOutput: expect.stringContaining('当前标注只给出结论'),
        scores: expect.objectContaining({
          fieldCount: 1,
          overall: 48,
          rejectedFieldCount: 1,
        }),
        structuredOutput: expect.objectContaining({
          fieldReviews: [
            expect.objectContaining({
              fieldKey: 'comment',
              comment: '当前标注只给出结论，没有说明模型回答与题目材料之间的事实依据。',
              suggestions: ['补充事实性、完整性和表达清晰度的判断依据。'],
            }),
          ],
        }),
        modelMetadata: expect.objectContaining({
          provider: 'deepseek',
          model: 'deepseek-chat',
          promptTokens: 320,
          completionTokens: 96,
          totalTokens: 416,
        }),
      }),
    );

    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      messages: Array<{ role: string; content: string }>;
      response_format: { type: string };
    };
    expect(requestBody.response_format).toEqual({ type: 'json_object' });
    expect(requestBody.messages.map((message) => message.content).join('\n')).toContain('fieldReviews 必须覆盖每个字段');
    expect(requestBody.messages.map((message) => message.content).join('\n')).toContain('AI 对当前字段标注内容的评语');
    expect(requestBody.messages.map((message) => message.content).join('\n')).toContain('请对 comment 输出字段级 AI 预审结果。');
  });

  it('字段级 AI 预审允许非评分标签字段缺少 score 并按 decision 归一化', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.LLM_MODEL = 'deepseek-chat';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'chatcmpl_ai_review_tag_field',
          usage: {
            prompt_tokens: 180,
            completion_tokens: 64,
            total_tokens: 244,
          },
          choices: [
            {
              message: {
                content: JSON.stringify({
                  verdict: 'pass',
                  overallScore: 100,
                  overallComment: '未发现需要打回的问题标签。',
                  fieldReviews: [
                    {
                      fieldKey: 'issue_tags',
                      label: '问题标签',
                      decision: 'pass',
                      comment: '当前样本未发现明显质量问题标签。',
                      suggestions: [],
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

    const result = await new LlmService().reviewSubmission({
      answers: {
        issue_tags: [],
      },
      datasetKind: 'qa_quality',
      fieldRequirements: [
        {
          fieldKey: 'issue_tags',
          label: '问题标签',
          type: 'tag_select',
          required: false,
          requirement: '如发现回答质量问题，请选择对应标签。',
        },
      ],
      model: 'deepseek-chat',
      passThreshold: 70,
      provider: 'deepseek',
      rawData: {
        prompt: '如何判断回答质量？',
        model_answer: '检查事实性、完整性和表达清晰度。',
      },
      rawPrompt: '请对 issue_tags 输出字段级 AI 预审结果。',
      structuredOutputMode: 'function_calling',
      temperature: 0,
    });

    expect(result.structuredOutput).toEqual(
      expect.objectContaining({
        fieldReviews: [
          expect.objectContaining({
            fieldKey: 'issue_tags',
            decision: 'pass',
            score: 100,
            comment: '当前样本未发现明显质量问题标签。',
          }),
        ],
      }),
    );
  });

  it('AI 预审按 Rubric 维度权重重算字段分数并保留维度明细', async () => {
    process.env.LLM_PROVIDER = 'deepseek';
    process.env.NODE_ENV = 'development';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.LLM_MODEL = 'deepseek-chat';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'chatcmpl_ai_review_rubric',
          usage: {
            prompt_tokens: 240,
            completion_tokens: 120,
            total_tokens: 360,
          },
          choices: [
            {
              message: {
                content: JSON.stringify({
                  verdict: 'pass',
                  overallScore: 99,
                  overallComment: '偏好理由基本达标。',
                  fieldReviews: [
                    {
                      fieldKey: 'comment',
                      label: '对比说明',
                      score: 99,
                      decision: 'pass',
                      comment: '理由能支撑偏好选择，但证据引用还可以更具体。',
                      suggestions: ['补充回答 B 中更完整的具体句子。'],
                      dimensionReviews: [
                        {
                          key: 'preference_consistency',
                          label: '偏好一致性',
                          score: 80,
                          comment: '选择 B 与 A/B 内容差异一致。',
                        },
                        {
                          key: 'evidence_grounding',
                          label: '证据依据',
                          score: 70,
                          comment: '理由提到了完整性，但缺少原文级证据。',
                        },
                      ],
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

    const result = await new LlmService().reviewSubmission({
      answers: {
        comment: '回答 B 更完整。',
      },
      datasetKind: 'preference_compare',
      fieldRequirements: [
        {
          fieldKey: 'comment',
          label: '对比说明',
          type: 'textarea',
          required: true,
          requirement: '说明必须支撑偏好选择。',
          rubric: {
            dimensions: [
              {
                key: 'preference_consistency',
                label: '偏好一致性',
                weight: 40,
                criteria: '偏好选择必须能被 A/B 回答的质量差异支撑。',
              },
              {
                key: 'evidence_grounding',
                label: '证据依据',
                weight: 60,
                criteria: '说明必须引用 A/B 回答中的具体差异。',
              },
            ],
          },
        } as never,
      ],
      model: 'deepseek-chat',
      passThreshold: 70,
      provider: 'deepseek',
      rawData: {
        prompt: '比较两个回答。',
        response_a: '回答 A 较短。',
        response_b: '回答 B 包含步骤和限制。',
      },
      rawPrompt: '请按 Rubric 输出维度评分。',
      structuredOutputMode: 'json_schema',
      temperature: 0,
    });

    expect(result.scores).toEqual(
      expect.objectContaining({
        overall: 74,
        fieldCount: 1,
        passedFieldCount: 1,
        rejectedFieldCount: 0,
      }),
    );
    expect(result.structuredOutput).toEqual(
      expect.objectContaining({
        overallScore: 74,
        fieldReviews: [
          expect.objectContaining({
            fieldKey: 'comment',
            score: 74,
            dimensionReviews: [
              {
                key: 'preference_consistency',
                label: '偏好一致性',
                weight: 40,
                score: 80,
                weightedScore: 32,
                comment: '选择 B 与 A/B 内容差异一致。',
              },
              {
                key: 'evidence_grounding',
                label: '证据依据',
                weight: 60,
                score: 70,
                weightedScore: 42,
                comment: '理由提到了完整性，但缺少原文级证据。',
              },
            ],
          }),
        ],
      }),
    );
  });

  it('Rubric 字段总分按原始加权和统一取整，避免逐维度取整漂移', async () => {
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
                  verdict: 'pass',
                  overallScore: 99,
                  overallComment: '边界评分。',
                  fieldReviews: [
                    {
                      fieldKey: 'comment',
                      label: '对比说明',
                      score: 99,
                      decision: 'pass',
                      comment: '三个维度都处在边界分。',
                      suggestions: [],
                      dimensionReviews: [
                        { key: 'dimension_a', label: '维度 A', score: 50, comment: 'A 维度 50 分。' },
                        { key: 'dimension_b', label: '维度 B', score: 50, comment: 'B 维度 50 分。' },
                        { key: 'dimension_c', label: '维度 C', score: 50, comment: 'C 维度 50 分。' },
                      ],
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

    const result = await new LlmService().reviewSubmission({
      answers: {
        comment: '回答 B 更完整。',
      },
      datasetKind: 'preference_compare',
      fieldRequirements: [
        {
          fieldKey: 'comment',
          label: '对比说明',
          type: 'textarea',
          required: true,
          requirement: '说明必须支撑偏好选择。',
          rubric: {
            dimensions: [
              { key: 'dimension_a', label: '维度 A', weight: 33, criteria: 'A 标准。' },
              { key: 'dimension_b', label: '维度 B', weight: 33, criteria: 'B 标准。' },
              { key: 'dimension_c', label: '维度 C', weight: 34, criteria: 'C 标准。' },
            ],
          },
        } as never,
      ],
      model: 'deepseek-chat',
      passThreshold: 0,
      provider: 'deepseek',
      rawData: {
        prompt: '比较两个回答。',
      },
      rawPrompt: '请按 Rubric 输出维度评分。',
      structuredOutputMode: 'json_schema',
      temperature: 0,
    });

    expect(result.scores.overall).toBe(50);
    expect(result.structuredOutput.fieldReviews).toEqual([
      expect.objectContaining({
        fieldKey: 'comment',
        score: 50,
        dimensionReviews: [
          expect.objectContaining({ key: 'dimension_a', weightedScore: 17 }),
          expect.objectContaining({ key: 'dimension_b', weightedScore: 17 }),
          expect.objectContaining({ key: 'dimension_c', weightedScore: 17 }),
        ],
      }),
    ]);
  });

  it('Rubric 综合分只按维度加权结果计算，不被普通预审字段平均稀释', async () => {
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
                  verdict: 'pass',
                  overallScore: 99,
                  overallComment: '维度和备注均通过。',
                  fieldReviews: [
                    {
                      fieldKey: 'dimensions',
                      label: '评测维度',
                      score: 90,
                      decision: 'pass',
                      comment: '选择的维度符合预设范围。',
                      suggestions: [],
                    },
                    {
                      fieldKey: 'annotator_note',
                      label: '标注备注',
                      score: 99,
                      decision: 'pass',
                      comment: '备注能够支撑偏好选择。',
                      suggestions: [],
                      dimensionReviews: [
                        { key: 'preference_consistency', label: '偏好选择一致性', score: 100, comment: '偏好选择一致。' },
                        { key: 'coverage', label: '关键质量维度覆盖', score: 92, comment: '质量维度覆盖较完整。' },
                        { key: 'evidence', label: '证据支撑充分性', score: 80, comment: '证据基本充分。' },
                        { key: 'format', label: '字段一致性与标注规范', score: 100, comment: '字段填写规范。' },
                      ],
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

    const result = await new LlmService().reviewSubmission({
      answers: {
        dimensions: ['准确性', '完备性'],
        annotator_note: '模型 A 的解释更完整，能够说明概念并给出例子。',
      },
      datasetKind: 'preference_compare',
      fieldRequirements: [
        {
          fieldKey: 'dimensions',
          label: '评测维度',
          type: 'checkbox',
          required: true,
          requirement: '必须选择预设评测维度。',
        } as never,
        {
          fieldKey: 'annotator_note',
          label: '标注备注',
          type: 'textarea',
          required: true,
          requirement: '说明必须支撑偏好选择。',
          rubric: {
            dimensions: [
              { key: 'preference_consistency', label: '偏好选择一致性', weight: 35, criteria: '偏好选择必须成立。' },
              { key: 'coverage', label: '关键质量维度覆盖', weight: 25, criteria: '覆盖关键质量维度。' },
              { key: 'evidence', label: '证据支撑充分性', weight: 25, criteria: '给出具体证据。' },
              { key: 'format', label: '字段一致性与标注规范', weight: 15, criteria: '字段完整且格式规范。' },
            ],
          },
        } as never,
      ],
      model: 'deepseek-chat',
      passThreshold: 0,
      provider: 'deepseek',
      rawData: {
        prompt: '比较两个回答。',
      },
      rawPrompt: '请按 Rubric 输出维度评分。',
      structuredOutputMode: 'json_schema',
      temperature: 0,
    });

    expect(result.scores.overall).toBe(93);
    expect(result.structuredOutput).toEqual(
      expect.objectContaining({
        overallScore: 93,
        fieldReviews: [
          expect.objectContaining({
            fieldKey: 'dimensions',
            score: 90,
          }),
          expect.objectContaining({
            fieldKey: 'annotator_note',
            score: 93,
            dimensionReviews: [
              expect.objectContaining({ key: 'preference_consistency', weightedScore: 35 }),
              expect.objectContaining({ key: 'coverage', weightedScore: 23 }),
              expect.objectContaining({ key: 'evidence', weightedScore: 20 }),
              expect.objectContaining({ key: 'format', weightedScore: 15 }),
            ],
          }),
        ],
      }),
    );
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

  it('字段分类未配置真实模型时拒绝使用 mock 结果', async () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.NODE_ENV = 'development';

    await expect(
      new LlmService().classifyTemplateFields({
        fileName: 'preference_compare.jsonl',
        fields: [
          { sourceKey: 'prompt', samples: ['比较 A/B 回答'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
          { sourceKey: 'preferred', samples: [], valueTypes: ['string'], filledCount: 0, totalCount: 1 },
        ],
        records: [{ prompt: '比较 A/B 回答', preferred: '' }],
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'LLM_FIELD_CLASSIFIER_REQUIRES_REAL_MODEL',
        message: '字段分类必须使用真实模型，请配置 DEEPSEEK_API_KEY、OPENAI_API_KEY 或 LLM_PROVIDER=deepseek/openai/custom。',
      },
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

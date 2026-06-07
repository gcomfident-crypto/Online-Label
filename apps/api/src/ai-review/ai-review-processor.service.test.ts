import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLabelHubSchema, type LabelHubSchema } from '@labelhub/shared';

import { AiReviewProcessorService } from './ai-review-processor.service.ts';
import { AiReviewService } from './ai-review.service.ts';

const ORIGINAL_ENV = { ...process.env };

describe('AiReviewProcessorService', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('自动处理排队任务，写入字段级预审结果并把通过结果送入人工复审', async () => {
    const { processor, auditLogs, jobs, submissions, reviewRecords } = createProcessor({
      answers: {
        cleaned_title: '户外便携野营折叠桌椅套装 5 件套',
        category: '家居用品',
        keywords: ['折叠', '户外', '桌椅套装', '5件套'],
      },
      rawData: {
        title: '户外便携野营折叠桌椅套装 5 件套',
        category: '家居用品',
        keywords: ['折叠', '户外', '桌椅套装'],
      },
    });

    const result = await processor.processQueuedJobs({ limit: 5 });

    expect(result).toEqual({ processed: 1, passed: 1, rejected: 0, failed: 0 });
    expect(submissions[0].status).toBe('HUMAN_PENDING');
    expect(jobs[0]).toMatchObject({ status: 'SUCCEEDED', attempts: 1, lastError: null });
    expect(reviewRecords.at(-1)).toEqual(
      expect.objectContaining({
        stage: 'AI_PRECHECK',
        reviewerType: 'AI',
        decision: 'pass',
        rawPrompt: expect.stringContaining('fieldReviews'),
        structuredOutput: expect.objectContaining({
          verdict: 'pass',
          fieldReviews: expect.arrayContaining([
            expect.objectContaining({
              fieldKey: 'cleaned_title',
              label: 'cleaned_title',
              decision: 'pass',
              score: expect.any(Number),
            }),
          ]),
          overallComment: expect.stringContaining('所有开启 AI 预审的字段均通过'),
        }),
        modelMetadata: expect.objectContaining({ provider: 'deepseek', model: 'deepseek-chat' }),
      }),
    );
    expect(reviewRecords.at(-1)?.rawOutput).not.toContain('提交内容符合字段审核要求');
    expect(reviewRecords.at(-1)?.scores).toEqual(
      expect.objectContaining({
        overall: expect.any(Number),
        fieldCount: 3,
        passedFieldCount: 3,
      }),
    );
    expect(auditLogs.every((auditLog) => auditLog.actorId === null || auditLog.actorId === undefined)).toBe(true);
  });

  it('非 mock 规则调用 LLM 生成字段级预审评语并持久化真实模型输出', async () => {
    const llmService = {
      reviewSubmission: vi.fn(async (_request: AiReviewRequestForTest) => ({
        comment: '审核意见没有解释关键事实依据，建议打回修改。',
        decision: 'reject' as const,
        rawOutput: JSON.stringify({
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
        scores: {
          overall: 48,
          fieldCount: 1,
          passedFieldCount: 0,
          rejectedFieldCount: 1,
        },
        structuredOutput: {
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
        },
        modelMetadata: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          temperature: 0,
          latencyMs: 356,
        },
      })),
    };
    const { processor, assignments, submissions, reviewRecords } = createProcessor({
      answers: {
        comment: '可以通过。',
      },
      rawData: {
        prompt: '如何判断回答质量？',
        model_answer: '检查事实性、完整性和表达清晰度。',
      },
      reviewRule: {
        provider: 'deepseek',
        model: 'deepseek-chat',
      },
      llmService,
    });

    const result = await processor.processQueuedJobs({ limit: 5 });

    expect(result).toEqual({ processed: 1, passed: 0, rejected: 1, failed: 0 });
    expect(submissions[0].status).toBe('NEEDS_REVISION');
    expect(assignments[0].status).toBe('NEEDS_REVISION');
    expect(llmService.reviewSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: { comment: '可以通过。' },
        fieldRequirements: [
          expect.objectContaining({
            fieldKey: 'comment',
            label: 'comment',
            requirement: '请判断该字段标注结果是否符合题目事实和任务要求。',
          }),
        ],
        model: 'deepseek-chat',
        provider: 'deepseek',
        rawData: {
          prompt: '如何判断回答质量？',
          model_answer: '检查事实性、完整性和表达清晰度。',
        },
        rawPrompt: expect.stringContaining('fieldReviews'),
        structuredOutputMode: 'json_schema',
        temperature: 0,
      }),
    );
    expect(reviewRecords.at(-1)).toEqual(
      expect.objectContaining({
        decision: 'reject',
        comment: '审核意见没有解释关键事实依据，建议打回修改。',
        modelMetadata: expect.objectContaining({ provider: 'deepseek', model: 'deepseek-chat' }),
        structuredOutput: expect.objectContaining({
          fieldReviews: [
            expect.objectContaining({
              fieldKey: 'comment',
              comment: '当前标注只给出结论，没有说明模型回答与题目材料之间的事实依据。',
            }),
          ],
        }),
      }),
    );
  });

  it('AI 预审请求只携带 ShowItem 上下文，不携带上传文件里的演示标注答案', async () => {
    const requests: AiReviewRequestForTest[] = [];
    const llmService = {
      reviewSubmission: vi.fn(async (request: AiReviewRequestForTest) => {
        requests.push(request);

        return {
          comment: '所有字段均符合审核标准。',
          decision: 'pass' as const,
          rawOutput: JSON.stringify({
            verdict: 'pass',
            overallScore: 100,
            overallComment: '所有字段均符合审核标准。',
            fieldReviews: [
              {
                fieldKey: 'dimensions',
                label: '评估维度',
                score: 100,
                decision: 'pass',
                comment: '当前选择的评估维度可用于本题判断。',
                suggestions: [],
              },
              {
                fieldKey: 'annotator_note',
                label: '标注备注',
                score: 100,
                decision: 'pass',
                comment: '备注解释了本次标注判断。',
                suggestions: [],
              },
            ],
          }),
          scores: {
            overall: 100,
            fieldCount: 2,
            passedFieldCount: 2,
            rejectedFieldCount: 0,
          },
          structuredOutput: {
            verdict: 'pass',
            overallScore: 100,
            overallComment: '所有字段均符合审核标准。',
            fieldReviews: [
              {
                fieldKey: 'dimensions',
                label: '评估维度',
                score: 100,
                decision: 'pass',
                comment: '当前选择的评估维度可用于本题判断。',
                suggestions: [],
              },
              {
                fieldKey: 'annotator_note',
                label: '标注备注',
                score: 100,
                decision: 'pass',
                comment: '备注解释了本次标注判断。',
                suggestions: [],
              },
            ],
          },
          modelMetadata: {
            provider: 'deepseek',
            model: 'deepseek-chat',
            temperature: 0,
            latencyMs: 356,
          },
        };
      }),
    };
    const { processor } = createProcessor({
      answers: {
        dimensions: ['准确性'],
        annotator_note: '我认为回答 A 更准确。',
      },
      rawData: {
        prompt: '请比较两个回答。',
        response_a: '回答 A 内容。',
        response_b: '回答 B 内容。',
        dimensions: ['准确性', '完整性', '可读性'],
        annotator_note: '演示备注：三个维度都需要关注。',
      },
      schema: createLabelHubSchema({
        schemaVersion: 'r1',
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
      }),
      llmService,
    });

    await processor.processQueuedJobs({ limit: 5 });

    expect(requests).toHaveLength(1);
    expect(llmService.reviewSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: {
          dimensions: ['准确性'],
          annotator_note: '我认为回答 A 更准确。',
        },
        rawData: {
          prompt: '请比较两个回答。',
          response_a: '回答 A 内容。',
          response_b: '回答 B 内容。',
        },
        rawPrompt: expect.not.stringContaining('演示备注：三个维度都需要关注。'),
      }),
    );
    const request = requests[0];
    expect(request?.rawData).not.toHaveProperty('dimensions');
    expect(request?.rawData).not.toHaveProperty('annotator_note');
    expect(request?.rawPrompt).toContain('上传文件中与待标注字段同名或映射到待标注字段的值，仅用于 owner 配置模板参考，不是标准答案');
  });

  it('旧 mock 规则在运行环境配置真实模型时改用 LLM 预审', async () => {
    process.env.NODE_ENV = 'development';
    process.env.LLM_PROVIDER = 'deepseek';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.LLM_MODEL = 'deepseek-chat';
    const llmService = {
      reviewSubmission: vi.fn(async () => ({
        comment: '审核意见需要补充事实依据。',
        decision: 'reject' as const,
        rawOutput: JSON.stringify({
          verdict: 'reject',
          overallScore: 48,
          overallComment: '审核意见需要补充事实依据。',
          fieldReviews: [
            {
              fieldKey: 'comment',
              label: 'comment',
              score: 48,
              decision: 'reject',
              comment: '当前字段评语由真实 LLM 生成。',
              suggestions: ['补充判断依据。'],
            },
          ],
        }),
        scores: {
          overall: 48,
          fieldCount: 1,
          passedFieldCount: 0,
          rejectedFieldCount: 1,
        },
        structuredOutput: {
          verdict: 'reject',
          overallScore: 48,
          overallComment: '审核意见需要补充事实依据。',
          fieldReviews: [
            {
              fieldKey: 'comment',
              label: 'comment',
              score: 48,
              decision: 'reject',
              comment: '当前字段评语由真实 LLM 生成。',
              suggestions: ['补充判断依据。'],
            },
          ],
        },
        modelMetadata: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          temperature: 0,
          latencyMs: 356,
        },
      })),
    };
    const { processor, reviewRecords } = createProcessor({
      answers: {
        comment: '可以通过。',
      },
      rawData: {
        prompt: '如何判断回答质量？',
      },
      llmService,
    });

    await processor.processQueuedJobs({ limit: 5 });

    expect(llmService.reviewSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'deepseek',
        model: 'deepseek-chat',
      }),
    );
    expect(reviewRecords.at(-1)?.modelMetadata).toEqual(
      expect.objectContaining({ provider: 'deepseek', model: 'deepseek-chat' }),
    );
    expect(reviewRecords.at(-1)?.structuredOutput).toEqual(
      expect.objectContaining({
        fieldReviews: [
          expect.objectContaining({
            fieldKey: 'comment',
            comment: '当前字段评语由真实 LLM 生成。',
          }),
        ],
      }),
    );
  });

  it('旧 mock 规则没有真实模型配置时不落回本地假评语', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.AI_REVIEW_PROVIDER;
    delete process.env.LLM_PROVIDER;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_API_BASE_URL;
    const llmService = {
      reviewSubmission: vi.fn(async () => {
        throw new Error('AI 预审模型未配置，请检查 DEEPSEEK_API_KEY、OPENAI_API_KEY、LLM_API_KEY 或 LLM_PROVIDER。');
      }),
    };
    const { processor, jobs, reviewRecords } = createProcessor({
      answers: {
        comment: '可以通过。',
      },
      rawData: {
        prompt: '如何判断回答质量？',
      },
      reviewRule: {
        provider: 'mock',
        model: 'mock-stable-reviewer',
      },
      llmService,
    });

    const result = await processor.processQueuedJobs({ limit: 5 });

    expect(result).toEqual({ processed: 0, passed: 0, rejected: 0, failed: 1 });
    expect(llmService.reviewSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'deepseek',
        model: 'deepseek-chat',
      }),
    );
    expect(jobs[0]).toMatchObject({
      status: 'FAILED_RETRYING',
      attempts: 1,
      lastError: 'AI 预审模型未配置，请检查 DEEPSEEK_API_KEY、OPENAI_API_KEY、LLM_API_KEY 或 LLM_PROVIDER。',
    });
    expect(reviewRecords).toHaveLength(0);
  });

  it('自动重试 FAILED_RETRYING 的 AI 预审任务', async () => {
    const { processor, jobs, submissions, reviewRecords } = createProcessor({
      answers: {
        comment: '可以通过。',
      },
      rawData: {
        prompt: '如何判断回答质量？',
      },
    });
    Object.assign(jobs[0], {
      status: 'FAILED_RETRYING' as const,
      attempts: 1,
      lastError: '上一次模型调用失败。',
    });

    const result = await processor.processQueuedJobs({ limit: 5 });

    expect(result).toEqual({ processed: 1, passed: 1, rejected: 0, failed: 0 });
    expect(jobs[0]).toMatchObject({ status: 'SUCCEEDED', attempts: 2, lastError: null });
    expect(submissions[0].status).toBe('HUMAN_PENDING');
    expect(reviewRecords.at(-1)).toEqual(
      expect.objectContaining({
        decision: 'pass',
        retryCount: 2,
      }),
    );
  });

  it('AI 预审达到最大失败次数后退回标注员并留下可见失败原因', async () => {
    const errorMessage = 'AI 预审模型未配置，请检查 DEEPSEEK_API_KEY、OPENAI_API_KEY、LLM_API_KEY 或 LLM_PROVIDER。';
    const llmService = {
      reviewSubmission: vi.fn(async () => {
        throw new Error(errorMessage);
      }),
    };
    const { processor, assignments, auditLogs, jobs, submissions, reviewRecords } = createProcessor({
      answers: {
        comment: '可以通过。',
      },
      rawData: {
        prompt: '如何判断回答质量？',
      },
      llmService,
    });
    Object.assign(jobs[0], {
      status: 'FAILED_RETRYING' as const,
      attempts: 2,
      lastError: '第二次模型调用失败。',
    });

    const result = await processor.processQueuedJobs({ limit: 5 });

    expect(result).toEqual({ processed: 0, passed: 0, rejected: 0, failed: 1 });
    expect(jobs[0]).toMatchObject({
      status: 'FAILED_FINAL',
      attempts: 3,
      lastError: errorMessage,
    });
    expect(submissions[0].status).toBe('NEEDS_REVISION');
    expect(assignments[0].status).toBe('NEEDS_REVISION');
    expect(reviewRecords.at(-1)).toEqual(
      expect.objectContaining({
        stage: 'AI_PRECHECK',
        reviewerType: 'AI',
        decision: 'reject',
        comment: expect.stringContaining(errorMessage),
        structuredOutput: expect.objectContaining({
          verdict: 'reject',
          overallComment: expect.stringContaining(errorMessage),
        }),
      }),
    );
    expect(auditLogs.slice(-3)).toEqual([
      expect.objectContaining({
        fromStatus: 'AI_QUEUED',
        toStatus: 'AI_REVIEWING',
        metadata: expect.objectContaining({
          action: 'AI_REVIEW_STARTED',
          jobId: 'job_1',
        }),
      }),
      expect.objectContaining({
        fromStatus: 'AI_REVIEWING',
        toStatus: 'AI_REJECTED',
        reason: expect.stringContaining(errorMessage),
        metadata: expect.objectContaining({
          action: 'AI_REVIEW_FAILED',
          jobId: 'job_1',
        }),
      }),
      expect.objectContaining({
        fromStatus: 'AI_REJECTED',
        toStatus: 'NEEDS_REVISION',
        reason: expect.stringContaining(errorMessage),
        metadata: expect.objectContaining({
          action: 'AI_REVIEW_FAILED_TO_REVISION',
          jobId: 'job_1',
        }),
      }),
    ]);
  });

  it('另一个处理器已领取同一 AI 预审任务时跳过且不记失败', async () => {
    const llmService = {
      reviewSubmission: vi.fn(async () => {
        throw new Error('不应该调用 LLM');
      }),
    };
    const { processor, jobs, reviewRecords } = createProcessor({
      answers: {
        comment: '可以通过。',
      },
      rawData: {
        prompt: '如何判断回答质量？',
      },
      claimQueuedJobCount: 0,
      llmService,
    });

    const result = await processor.processQueuedJobs({ limit: 5 });

    expect(result).toEqual({ processed: 0, passed: 0, rejected: 0, failed: 0 });
    expect(llmService.reviewSubmission).not.toHaveBeenCalled();
    expect(jobs[0]).toMatchObject({
      status: 'QUEUED',
      attempts: 0,
      lastError: null,
    });
    expect(reviewRecords).toHaveLength(0);
  });

  it('自动处理低分任务，附带打回理由并让标注员重新修改', async () => {
    const { processor, assignments, submissions, reviewRecords } = createProcessor({
      answers: {
        cleaned_title: '',
        category: '',
        keywords: [],
      },
      rawData: {
        title: '户外便携野营折叠桌椅套装 5 件套',
        category: '家居用品',
        keywords: ['折叠', '户外', '桌椅套装'],
      },
    });

    const result = await processor.processQueuedJobs({ limit: 5 });

    expect(result).toEqual({ processed: 1, passed: 0, rejected: 1, failed: 0 });
    expect(submissions[0].status).toBe('NEEDS_REVISION');
    expect(assignments[0].status).toBe('NEEDS_REVISION');
    expect(reviewRecords.at(-1)).toEqual(
      expect.objectContaining({
        decision: 'reject',
        comment: expect.stringContaining('未通过 AI 预审'),
      }),
    );
    expect(reviewRecords.at(-1)?.structuredOutput).toEqual(
      expect.objectContaining({
        fieldReviews: expect.arrayContaining([
          expect.objectContaining({
            fieldKey: 'cleaned_title',
            decision: 'reject',
            comment: expect.stringContaining('未填写'),
          }),
        ]),
      }),
    );
  });

  it('任一字段未通过时整题直接打回，不再进入第三种状态或通过', async () => {
    const { processor, assignments, submissions, reviewRecords } = createProcessor({
      answers: {
        cleaned_title: '户外便携野营折叠桌椅套装 5 件套',
        category: 'x',
        keywords: ['折叠', '户外', '桌椅套装'],
      },
      rawData: {
        title: '户外便携野营折叠桌椅套装 5 件套',
        category: '家居用品',
        keywords: ['折叠', '户外', '桌椅套装'],
      },
    });

    const result = await processor.processQueuedJobs({ limit: 5 });

    expect(result).toEqual({ processed: 1, passed: 0, rejected: 1, failed: 0 });
    expect(submissions[0].status).toBe('NEEDS_REVISION');
    expect(assignments[0].status).toBe('NEEDS_REVISION');
    expect(reviewRecords.at(-1)).toEqual(
      expect.objectContaining({
        decision: 'reject',
        comment: expect.stringContaining('category 未通过 AI 预审'),
        structuredOutput: expect.objectContaining({
          verdict: 'reject',
          fieldReviews: expect.arrayContaining([
            expect.objectContaining({
              fieldKey: 'category',
              decision: 'reject',
            }),
          ]),
        }),
      }),
    );
  });
});

function createProcessor(input: {
  answers: Record<string, unknown>;
  claimQueuedJobCount?: number;
  llmService?: {
    reviewSubmission: ReturnType<typeof vi.fn>;
  };
  rawData: Record<string, unknown>;
  reviewRule?: Partial<ReviewRuleFixture>;
  schema?: LabelHubSchema;
}) {
  const now = new Date('2026-05-21T08:00:00.000Z');
  const reviewRecords: ReviewRecord[] = [];
  const auditLogs: AuditLogRecord[] = [];
  const assignments: SubmissionAssignmentRecord[] = [
    {
      id: 'assignment_1',
      taskId: 'task_qa',
      taskItemId: 'item_qa_1',
      assigneeId: 'user_labeler_li_lei',
      status: 'SUBMITTED',
      taskItem: {
        id: 'item_qa_1',
        externalId: 'Q-2041-007',
        datasetKind: 'qa_quality',
        rawData: input.rawData,
      },
      task: {
        id: 'task_qa',
        title: '商品清洗质检',
        template: {
          datasetKind: 'qa_quality',
          schema: input.schema ?? null,
        },
      },
    },
  ];
  const submissions: SubmissionReviewRecord[] = [
    {
      id: 'submission_1',
      assignmentId: 'assignment_1',
      status: 'AI_QUEUED',
      round: 1,
      answers: input.answers,
      schemaVersion: 'r12',
      submittedAt: now,
      assignment: assignments[0],
      reviewRecords,
      aiReviewJobs: [],
      updatedAt: now,
    },
  ];
  const jobs: AiReviewJobRecord[] = [
    {
      id: 'job_1',
      submissionId: 'submission_1',
      taskId: 'task_qa',
      round: 1,
      idempotencyKey: 'submission_1:1:ai-review',
      status: 'QUEUED',
      attempts: 0,
      maxAttempts: 3,
      structuredOutputMode: 'json_schema',
      provider: 'deepseek',
      model: 'deepseek-chat',
      lastError: null,
      logs: [{ level: 'queue', message: '提交已进入 AI 自动预审队列。' }],
      queuedAt: now,
      startedAt: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
      task: { title: '商品清洗质检' },
      submission: {
        id: 'submission_1',
        status: 'AI_QUEUED',
        round: 1,
        submittedAt: now,
        assignment: {
          taskItem: assignments[0].taskItem,
        },
      },
    },
  ];
  submissions[0].aiReviewJobs = jobs;
  const reviewRules = [
    {
      id: 'rule_1',
      taskId: 'task_qa',
      stage: 'AI_PRECHECK',
      name: '商品清洗 AI 预审 v1',
      promptTemplate: '你是商品标题质检审核员，请对开启 AI 预审的字段逐项判断标注结果是否合格。',
      promptVersion: 2,
      dimensions: [],
      dimensionVersion: 1,
      passThreshold: 70,
      manualThreshold: 55,
      provider: 'deepseek',
      model: 'deepseek-chat',
      temperature: 0,
      config: { structuredOutputMode: 'json_schema' },
      enabled: true,
      createdById: null,
      createdAt: now,
      updatedAt: now,
      ...input.reviewRule,
    },
  ];
  const prisma = {
    aiReviewJob: {
      findMany: vi.fn(async ({ where, take }: { where?: { status?: string | { in?: string[] } }; take?: number } = {}) =>
        jobs.filter((job) => matchesStatusFilter(job.status, where?.status)).slice(0, take ?? jobs.length),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => jobs.find((job) => job.id === where.id) ?? null),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; status?: string }; data: Partial<AiReviewJobRecord> & { attempts?: { increment: number } } }) => {
        if (input.claimQueuedJobCount === 0) {
          return { count: 0 };
        }
        const job = jobs.find((candidate) =>
          candidate.id === where.id && (!where.status || candidate.status === where.status)
        );
        if (!job) {
          return { count: 0 };
        }

        Object.assign(job, {
          ...data,
          attempts: data.attempts?.increment ? job.attempts + data.attempts.increment : data.attempts ?? job.attempts,
          updatedAt: new Date('2026-05-21T09:00:00.000Z'),
        });
        job.submission.status = submissions[0].status;
        return { count: 1 };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<AiReviewJobRecord> }) => {
        const index = jobs.findIndex((job) => job.id === where.id);
        jobs[index] = { ...jobs[index], ...data, updatedAt: new Date('2026-05-21T09:00:00.000Z') };
        jobs[index].submission.status = submissions[0].status;
        return jobs[index];
      }),
    },
    submission: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        submissions.find((submission) => submission.id === where.id) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<SubmissionReviewRecord> }) => {
        const submission = submissions.find((candidate) => candidate.id === where.id);
        if (!submission) {
          throw new Error('submission missing');
        }

        Object.assign(submission, data, { updatedAt: new Date('2026-05-21T09:00:00.000Z') });
        for (const job of jobs) {
          job.submission.status = submission.status;
        }
        return submission;
      }),
    },
    assignment: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<SubmissionAssignmentRecord> }) => {
        const assignment = assignments.find((candidate) => candidate.id === where.id);
        if (!assignment) {
          throw new Error('assignment missing');
        }

        Object.assign(assignment, data);
        return assignment;
      }),
    },
    reviewRecord: {
      create: vi.fn(async ({ data }: { data: Partial<ReviewRecord> }) => {
        const record = {
          id: `record_${reviewRecords.length + 1}`,
          ruleId: null,
          rawPrompt: null,
          rawOutput: null,
          structuredOutput: null,
          modelMetadata: null,
          retryCount: 0,
          idempotencyKey: null,
          createdAt: new Date('2026-05-21T09:00:00.000Z'),
          ...data,
        } as ReviewRecord;
        reviewRecords.push(record);
        submissions.find((submission) => submission.id === record.submissionId)?.reviewRecords.unshift(record);
        return record;
      }),
    },
    reviewRule: {
      findFirst: vi.fn(async () => reviewRules[0]),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Partial<AuditLogRecord> }) => {
        const auditLog = {
          id: `audit_${auditLogs.length + 1}`,
          taskId: null,
          submissionId: null,
          fromStatus: null,
          toStatus: '',
          actorId: null,
          reason: null,
          metadata: null,
          createdAt: new Date('2026-05-21T09:00:00.000Z'),
          updatedAt: new Date('2026-05-21T09:00:00.000Z'),
          ...data,
        } as AuditLogRecord;
        auditLogs.push(auditLog);
        return auditLog;
      }),
    },
    $transaction: vi.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(prisma)),
  };
  const aiReviewService = new AiReviewService(prisma as unknown as ConstructorParameters<typeof AiReviewService>[0]);
  const llmService = input.llmService ?? createDefaultLlmService();

  return {
    assignments,
    auditLogs,
    jobs,
    processor: new AiReviewProcessorService(
      prisma as unknown as ConstructorParameters<typeof AiReviewProcessorService>[0],
      aiReviewService,
      llmService as never,
    ),
    reviewRecords,
    submissions,
  };
}

function createDefaultLlmService() {
  return {
    reviewSubmission: vi.fn(async (request: {
      answers: Record<string, unknown>;
      fieldRequirements: Array<{ fieldKey: string; label: string }>;
      model: string;
      provider: string;
      temperature: number;
    }) => {
      const fieldReviews = request.fieldRequirements.map((field) => {
        const value = request.answers[field.fieldKey];
        const isEmpty = countNonEmptyLeaves(value) === 0;
        const isReject = isEmpty || value === 'x';

        return {
          fieldKey: field.fieldKey,
          label: field.label,
          score: isReject ? 34 : 92,
          decision: isReject ? 'reject' as const : 'pass' as const,
          comment: isEmpty
            ? `${field.label} 未填写，无法完成字段级 AI 预审。`
            : isReject
              ? `${field.label} 的提交内容与题目材料或审核要求匹配度不足。`
              : `模型结合题目材料和审核标准判断 ${field.label} 已达标。`,
          suggestions: isReject ? [`请核对 ${field.label} 是否符合字段审核要求。`] : [],
        };
      });
      const decision = fieldReviews.some((field) => field.decision === 'reject') ? 'reject' as const : 'pass' as const;
      const failedLabels = fieldReviews
        .filter((field) => field.decision === 'reject')
        .map((field) => field.label)
        .join('、');
      const overallComment = decision === 'pass'
        ? '所有开启 AI 预审的字段均通过，进入人工复审。'
        : `${failedLabels || '存在字段'} 未通过 AI 预审，建议打回给标注员修改。`;
      const overallScore = Math.round(
        fieldReviews.reduce((total, field) => total + field.score, 0) / Math.max(1, fieldReviews.length),
      );
      const structuredOutput = {
        verdict: decision,
        fieldReviews,
        overallScore,
        overallComment,
      };

      return {
        comment: overallComment,
        decision,
        rawOutput: JSON.stringify(structuredOutput),
        scores: {
          overall: overallScore,
          fieldCount: fieldReviews.length,
          passedFieldCount: fieldReviews.filter((field) => field.decision === 'pass').length,
          rejectedFieldCount: fieldReviews.filter((field) => field.decision === 'reject').length,
        },
        structuredOutput,
        modelMetadata: {
          provider: request.provider,
          model: request.model,
          temperature: request.temperature,
          latencyMs: 25,
        },
      };
    }),
  };
}

function countNonEmptyLeaves(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countNonEmptyLeaves(item), 0);
  }

  if (typeof value === 'object') {
    return Object.values(value).reduce((total, item) => total + countNonEmptyLeaves(item), 0);
  }

  return String(value).trim() ? 1 : 0;
}

function matchesStatusFilter(status: string, filter?: string | { in?: string[] }): boolean {
  if (!filter) {
    return true;
  }

  if (typeof filter === 'string') {
    return status === filter;
  }

  return Array.isArray(filter.in) ? filter.in.includes(status) : true;
}

type ReviewRuleFixture = {
  id: string;
  taskId: string;
  stage: string;
  name: string;
  promptTemplate: string;
  promptVersion: number;
  dimensions: unknown[];
  dimensionVersion: number;
  passThreshold: number;
  manualThreshold: number;
  provider: string;
  model: string;
  temperature: number;
  config: { structuredOutputMode: string };
  enabled: boolean;
  createdById: null;
  createdAt: Date;
  updatedAt: Date;
};

type AiReviewJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED_RETRYING' | 'FAILED_FINAL' | 'MANUAL_FALLBACK';

type AiReviewJobRecord = {
  id: string;
  submissionId: string;
  taskId: string;
  round: number;
  idempotencyKey: string;
  status: AiReviewJobStatus;
  attempts: number;
  maxAttempts: number;
  structuredOutputMode: string | null;
  provider: string | null;
  model: string | null;
  lastError: string | null;
  logs: Array<Record<string, unknown>> | null;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  task: { title: string };
  submission: SubmissionSummaryRecord;
};

type SubmissionSummaryRecord = {
  id: string;
  status: string;
  round: number;
  submittedAt: Date;
  assignment: {
    taskItem: {
      id: string;
      externalId: string;
      datasetKind: 'qa_quality';
      rawData: Record<string, unknown>;
    };
  };
};

type SubmissionAssignmentRecord = SubmissionSummaryRecord['assignment'] & {
  id: string;
  taskId: string;
  taskItemId: string;
  assigneeId: string;
  status: 'SUBMITTED' | 'NEEDS_REVISION';
  task: {
    id: string;
    title: string;
    template: {
      datasetKind: 'qa_quality';
      schema?: LabelHubSchema | null;
    };
  };
};

type SubmissionReviewRecord = SubmissionSummaryRecord & {
  assignmentId: string;
  answers: Record<string, unknown>;
  schemaVersion: string;
  assignment: SubmissionAssignmentRecord;
  reviewRecords: ReviewRecord[];
  aiReviewJobs: AiReviewJobRecord[];
  updatedAt: Date;
};

type ReviewRecord = {
  id: string;
  submissionId: string;
  ruleId: string | null;
  stage: 'AI_PRECHECK';
  reviewerType: string;
  scores: Record<string, unknown>;
  decision: string;
  comment: string;
  rawPrompt: string | null;
  rawOutput: string | null;
  structuredOutput: Record<string, unknown> | null;
  modelMetadata: Record<string, unknown> | null;
  retryCount: number;
  idempotencyKey: string | null;
  createdAt: Date;
};

type AiReviewRequestForTest = {
  answers: Record<string, unknown>;
  rawData: Record<string, unknown>;
  rawPrompt: string;
};

type AuditLogRecord = {
  id: string;
  taskId: string | null;
  submissionId: string | null;
  fromStatus: string | null;
  toStatus: string;
  actorId: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

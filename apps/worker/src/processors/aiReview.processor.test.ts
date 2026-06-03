import { describe, expect, it, vi } from 'vitest';

import { processAiReviewJob } from './aiReview.processor.ts';
import type { LlmProvider } from '../llm/LlmProvider.ts';

describe('processAiReviewJob', () => {
  it('Mock pass 写入 AI 评分并进入人工待审', async () => {
    const { client, reviewRecords, submissionUpdates, jobUpdates } = createClient({
      submissionAnswers: { quality: 'pass', internal_note: '这段不需要机审。' },
      templateSchema: {
        fields: [
          {
            key: 'quality_field',
            fieldKey: 'quality',
            type: 'radio',
            label: '质量',
            aiReview: { enabled: true },
          },
          {
            key: 'internal_note_field',
            fieldKey: 'internal_note',
            type: 'textarea',
            label: '内部备注',
            aiReview: { enabled: false },
          },
        ],
      },
    });
    const provider = createProvider({ verdict: 'pass', scores: { overall: 91 } });

    const result = await processAiReviewJob(
      { submissionId: 'submission_1', taskId: 'task_qa', round: 1, idempotencyKey: 'submission_1:1:ai-review' },
      { client, provider },
    );

    expect(result.verdict).toBe('pass');
    expect(reviewRecords).toHaveLength(1);
    expect(reviewRecords[0]).toEqual(
      expect.objectContaining({
        submissionId: 'submission_1',
        decision: 'pass',
        idempotencyKey: 'submission_1:1:ai-review',
      }),
    );
    expect(String(reviewRecords[0].rawPrompt)).toContain('"quality": "pass"');
    expect(String(reviewRecords[0].rawPrompt)).not.toContain('internal_note');
    expect(submissionUpdates.at(-1)).toEqual({ id: 'submission_1', status: 'HUMAN_PENDING' });
    expect(jobUpdates.at(-1)).toEqual(expect.objectContaining({ status: 'SUCCEEDED' }));
  });

  it('Mock reject 进入待修改，重复幂等键不会重复写 review record', async () => {
    const existingRecord = { id: 'record_existing', idempotencyKey: 'submission_1:1:ai-review', decision: 'reject' };
    const { client, reviewRecords } = createClient({ existingRecord });
    const provider = createProvider({ verdict: 'reject', scores: { overall: 48 } });

    const result = await processAiReviewJob(
      { submissionId: 'submission_1', taskId: 'task_qa', round: 1, idempotencyKey: 'submission_1:1:ai-review' },
      { client, provider },
    );

    expect(result.verdict).toBe('reject');
    expect(reviewRecords).toHaveLength(0);
  });

  it('结构化输出异常会记录最终失败，不再进入第三种状态', async () => {
    const { client, jobUpdates, submissionUpdates } = createClient({ jobAttempts: 2 });
    const provider: LlmProvider = {
      capabilities: { supportsFunctionCalling: true, supportsJsonSchemaOutput: true },
      review: vi.fn(async () => {
        throw new Error('结构化输出异常');
      }),
    };

    await expect(
      processAiReviewJob(
        { submissionId: 'submission_1', taskId: 'task_qa', round: 1, idempotencyKey: 'submission_1:1:ai-review' },
        { client, provider },
      ),
    ).rejects.toThrow('结构化输出异常');

    expect(jobUpdates.at(-1)).toEqual(expect.objectContaining({ status: 'FAILED_FINAL' }));
    expect(submissionUpdates).toEqual([]);
  });
});

function createProvider(output: { verdict: 'pass' | 'reject'; scores: Record<string, number> }): LlmProvider {
  return {
    capabilities: { supportsFunctionCalling: true, supportsJsonSchemaOutput: true },
    review: vi.fn(async () => ({
      verdict: output.verdict,
      scores: output.scores,
      reason: '稳定 mock 结果。',
      suggestions: ['保持结构化输出。'],
      rawOutput: JSON.stringify(output),
      structuredOutput: output,
      modelMetadata: { provider: 'mock', model: 'mock-stable-reviewer', latencyMs: 12, totalTokens: 128 },
    })),
  };
}

function createClient(
  input: {
    existingRecord?: Record<string, unknown>;
    jobAttempts?: number;
    submissionAnswers?: Record<string, unknown>;
    templateSchema?: Record<string, unknown>;
  } = {},
) {
  const reviewRecords: Array<Record<string, unknown>> = [];
  const submissionUpdates: Array<{ id: string; status: string }> = [];
  const jobUpdates: Array<Record<string, unknown>> = [];
  const now = new Date('2026-05-21T08:00:00.000Z');
  const job = {
    id: 'job_1',
    submissionId: 'submission_1',
    taskId: 'task_qa',
    round: 1,
    attempts: input.jobAttempts ?? 0,
    maxAttempts: 3,
    logs: [],
  };
  const client = {
    reviewRecord: {
      findUnique: vi.fn(async () => input.existingRecord ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        reviewRecords.push(data);
        return { id: 'record_1', ...data };
      }),
    },
    aiReviewJob: {
      findUnique: vi.fn(async () => job),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        jobUpdates.push(data);
        Object.assign(job, data);
        return { ...job, ...data, updatedAt: now };
      }),
    },
    submission: {
      findUnique: vi.fn(async () => ({
        id: 'submission_1',
        status: 'AI_QUEUED',
        round: 1,
        answers: input.submissionAnswers ?? { quality: 'pass' },
        assignment: {
          task: {
            id: 'task_qa',
            template: { datasetKind: 'qa_quality' as const, schema: input.templateSchema ?? null },
            reviewRules: [
              {
                id: 'rule_1',
                promptTemplate: '请根据 prompt、model_answer、reference、expected_dimensions 和 answers 评分。',
                promptVersion: 1,
                dimensionVersion: 1,
                provider: 'mock',
                model: 'mock-stable-reviewer',
                temperature: 0,
                config: { structuredOutputMode: 'function_calling' },
              },
            ],
          },
          taskItem: {
            rawData: {
              prompt: '如何判断回答质量？',
              model_answer: '检查事实性。',
              reference: '应覆盖核心判断依据。',
              expected_dimensions: ['事实性'],
            },
          },
        },
      })),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        submissionUpdates.push({ id: where.id, status: data.status });
        return {};
      }),
    },
    auditLog: {
      create: vi.fn(async () => ({})),
    },
  };

  return {
    client,
    jobUpdates,
    reviewRecords,
    submissionUpdates,
  };
}

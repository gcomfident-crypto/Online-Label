import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AiReviewService } from './ai-review.service.ts';

describe('AiReviewService', () => {
  it('按状态查询 AI 预审队列并返回提交摘要', async () => {
    const { service, prisma } = createService();

    const jobs = await service.listJobs({ status: 'QUEUED' });

    expect(jobs).toEqual([
      expect.objectContaining({
        id: 'job_1',
        status: 'QUEUED',
        submissionId: 'submission_1',
        taskTitle: '问答质量标注',
        externalId: 'qa_1',
        idempotencyKey: 'submission_1:1:ai-review',
      }),
    ]);
    expect(prisma.aiReviewJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'QUEUED' },
      }),
    );
  });

  it('失败任务可以重试并重新进入队列', async () => {
    const failedJob = createJobRecord({ status: 'FAILED_FINAL', attempts: 3, lastError: '结构化输出异常' });
    const { service, jobs } = createService({ jobs: [failedJob] });

    const retried = await service.retryJob('job_1');

    expect(retried.status).toBe('QUEUED');
    expect(retried.attempts).toBe(0);
    expect(jobs[0]).toMatchObject({
      status: 'QUEUED',
      attempts: 0,
      lastError: null,
    });
    expect(jobs[0]?.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'retry', message: '已手动重试 AI 预审任务。' }),
      ]),
    );
  });

  it('运行中任务不能手动重试，缺失任务返回 NotFoundException', async () => {
    const { service } = createService({ jobs: [createJobRecord({ status: 'RUNNING' })] });

    await expect(service.retryJob('job_1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.retryJob('missing_job')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('查询单条 submission 的 AI 预审详情，包含原始 Prompt、结构化输出和模型元数据', async () => {
    const { service } = createService();

    const detail = await service.getSubmissionReview('submission_1');

    expect(detail.submission.id).toBe('submission_1');
    expect(detail.taskItem.rawData).toEqual(expect.objectContaining({ prompt: '如何判断回答质量？' }));
    expect(detail.reviewRecord).toEqual(
      expect.objectContaining({
        rawPrompt: '请根据 prompt 评分。',
        rawOutput: '{"verdict":"pass"}',
        structuredOutput: { verdict: 'pass', scores: { overall: 88 } },
        modelMetadata: { provider: 'mock', model: 'mock-stable-reviewer', latencyMs: 1420 },
      }),
    );
    expect(detail.jobs).toHaveLength(1);
  });
});

function createService(input: { jobs?: AiReviewJobRecord[]; submission?: SubmissionReviewRecord | null } = {}) {
  const jobs = [...(input.jobs ?? [createJobRecord()])];
  const submission = input.submission === undefined ? createSubmissionReviewRecord() : input.submission;
  const prisma = {
    aiReviewJob: {
      findMany: vi.fn(async ({ where }: { where?: { status?: string } } = {}) =>
        jobs.filter((job) => !where?.status || job.status === where.status),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => jobs.find((job) => job.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<AiReviewJobRecord> }) => {
        const index = jobs.findIndex((job) => job.id === where.id);
        jobs[index] = { ...jobs[index], ...data, updatedAt: new Date('2026-05-21T09:00:00.000Z') };
        return jobs[index];
      }),
    },
    submission: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        submission?.id === where.id ? submission : null,
      ),
    },
  };

  return {
    jobs,
    prisma,
    service: new AiReviewService(prisma),
  };
}

type AiReviewJobRecord = {
  id: string;
  submissionId: string;
  taskId: string;
  round: number;
  idempotencyKey: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED_RETRYING' | 'FAILED_FINAL' | 'MANUAL_FALLBACK';
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
  submission: SubmissionSummaryRecord;
  task: { title: string };
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

type SubmissionReviewRecord = SubmissionSummaryRecord & {
  assignmentId: string;
  answers: Record<string, unknown>;
  schemaVersion: string;
  assignment: SubmissionSummaryRecord['assignment'] & {
    task: {
      id: string;
      title: string;
      template: {
        datasetKind: 'qa_quality';
      };
    };
  };
  reviewRecords: Array<{
    id: string;
    ruleId: string;
    stage: 'AI_PRECHECK';
    reviewerType: string;
    scores: Record<string, unknown>;
    decision: string;
    comment: string;
    rawPrompt: string;
    rawOutput: string;
    structuredOutput: Record<string, unknown>;
    modelMetadata: Record<string, unknown>;
    retryCount: number;
    idempotencyKey: string;
    createdAt: Date;
  }>;
  aiReviewJobs: AiReviewJobRecord[];
};

function createJobRecord(input: Partial<AiReviewJobRecord> = {}): AiReviewJobRecord {
  const now = new Date('2026-05-21T08:00:00.000Z');
  const submission = createSubmissionSummaryRecord();

  return {
    id: input.id ?? 'job_1',
    submissionId: input.submissionId ?? 'submission_1',
    taskId: input.taskId ?? 'task_qa',
    round: input.round ?? 1,
    idempotencyKey: input.idempotencyKey ?? 'submission_1:1:ai-review',
    status: input.status ?? 'QUEUED',
    attempts: input.attempts ?? 0,
    maxAttempts: input.maxAttempts ?? 3,
    structuredOutputMode: input.structuredOutputMode ?? 'function_calling',
    provider: input.provider ?? 'mock',
    model: input.model ?? 'mock-stable-reviewer',
    lastError: input.lastError ?? null,
    logs: input.logs ?? [{ level: 'queue', message: '提交已进入 AI 自动预审队列。' }],
    queuedAt: input.queuedAt ?? now,
    startedAt: input.startedAt ?? null,
    finishedAt: input.finishedAt ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    submission: input.submission ?? submission,
    task: input.task ?? { title: '问答质量标注' },
  };
}

function createSubmissionSummaryRecord(): SubmissionSummaryRecord {
  return {
    id: 'submission_1',
    status: 'AI_QUEUED',
    round: 1,
    submittedAt: new Date('2026-05-21T08:00:00.000Z'),
    assignment: {
      taskItem: {
        id: 'item_qa_1',
        externalId: 'qa_1',
        datasetKind: 'qa_quality',
        rawData: { prompt: '如何判断回答质量？' },
      },
    },
  };
}

function createSubmissionReviewRecord(): SubmissionReviewRecord {
  const summary = createSubmissionSummaryRecord();
  const job = createJobRecord();

  return {
    ...summary,
    assignmentId: 'assignment_1',
    answers: { quality: 'pass' },
    schemaVersion: 'r1',
    assignment: {
      ...summary.assignment,
      task: {
        id: 'task_qa',
        title: '问答质量标注',
        template: { datasetKind: 'qa_quality' },
      },
    },
    reviewRecords: [
      {
        id: 'record_1',
        ruleId: 'rule_1',
        stage: 'AI_PRECHECK',
        reviewerType: 'AI',
        scores: { overall: 88 },
        decision: 'pass',
        comment: '建议通过。',
        rawPrompt: '请根据 prompt 评分。',
        rawOutput: '{"verdict":"pass"}',
        structuredOutput: { verdict: 'pass', scores: { overall: 88 } },
        modelMetadata: { provider: 'mock', model: 'mock-stable-reviewer', latencyMs: 1420 },
        retryCount: 0,
        idempotencyKey: 'submission_1:1:ai-review',
        createdAt: new Date('2026-05-21T08:01:00.000Z'),
      },
    ],
    aiReviewJobs: [job],
  };
}

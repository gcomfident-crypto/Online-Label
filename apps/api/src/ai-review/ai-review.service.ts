import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  assertSubmissionTransition,
  compileAiReviewPrompt,
  type LabelHubSchema,
  type AiReviewStatus,
  type DatasetKind,
  type SubmissionStatus,
} from '@labelhub/shared';

import { PrismaService } from '../prisma/prisma.service.ts';
import { runInTransaction } from '../common/transactions/run-in-transaction.ts';

type AiReviewJobRecord = {
  id: string;
  submissionId: string;
  taskId: string;
  round: number;
  idempotencyKey: string;
  status: AiReviewStatus;
  attempts: number;
  maxAttempts: number;
  structuredOutputMode: string | null;
  provider: string | null;
  model: string | null;
  lastError: string | null;
  logs: unknown;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  task?: {
    title: string;
    createdAt?: Date;
    createdById?: string | null;
    createdBy?: {
      id: string;
      name: string;
    } | null;
    template?: {
      name?: string;
      schemaVersion: string;
      schema?: LabelHubSchema | null;
    } | null;
  };
  submission?: SubmissionSummaryRecord;
};

type SubmissionSummaryRecord = {
  id: string;
  assignmentId?: string;
  answers?: Record<string, unknown>;
  schemaVersion?: string;
  idempotencyKey?: string | null;
  status: SubmissionStatus | string;
  round: number;
  submittedAt: Date;
  assignment: {
    id?: string;
    assigneeId?: string;
    assignee?: {
      id: string;
      name: string;
    } | null;
    taskItem: {
      id: string;
      externalId: string;
      datasetKind: DatasetKind;
      rawData: Record<string, unknown>;
      sortOrder?: number;
    };
  };
  reviewRecords?: ReviewRecord[];
  auditLogs?: AuditLogRecord[];
};

type ReviewRecord = {
  id: string;
  ruleId: string | null;
  submissionId?: string;
  stage: string;
  reviewerType: string;
  scores: Record<string, unknown>;
  decision: string | null;
  comment: string | null;
  rawPrompt: string | null;
  rawOutput: string | null;
  structuredOutput: Record<string, unknown> | null;
  modelMetadata: Record<string, unknown> | null;
  retryCount: number;
  idempotencyKey: string | null;
  createdAt: Date;
};

type AuditLogRecord = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

type SubmissionReviewRecord = SubmissionSummaryRecord & {
  assignmentId: string;
  answers: Record<string, unknown>;
  schemaVersion: string;
  status: SubmissionStatus | string;
  assignment: SubmissionSummaryRecord['assignment'] & {
    id: string;
    taskId: string;
    taskItemId: string;
    status?: string;
    task: {
      id: string;
      title: string;
      template: {
        datasetKind: DatasetKind;
        schema?: LabelHubSchema | null;
      };
    };
  };
  reviewRecords: ReviewRecord[];
  aiReviewJobs: AiReviewJobRecord[];
  auditLogs?: AuditLogRecord[];
};

export type CompleteAiReviewJobInput = {
  actorId?: string;
  decision: 'pass' | 'reject';
  scores?: Record<string, unknown>;
  comment?: string;
  rawPrompt?: string;
  rawOutput?: string;
  structuredOutput?: Record<string, unknown>;
  modelMetadata?: Record<string, unknown>;
};

export type FailAiReviewJobInput = {
  actorId?: string;
  message: string;
};

export type AiReviewJobDto = {
  id: string;
  submissionId: string;
  taskId: string;
  taskTitle: string;
  externalId: string;
  datasetKind: DatasetKind;
  submissionStatus: string;
  round: number;
  status: AiReviewStatus;
  attempts: number;
  maxAttempts: number;
  idempotencyKey: string;
  structuredOutputMode: string | null;
  provider: string | null;
  model: string | null;
  lastError: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type AiReviewBatchStatus = 'PENDING' | 'PASSED' | 'REJECTED' | 'FAILED';
export type AiReviewBatchDecision = 'pending' | 'pass' | 'reject' | 'failed';

export type AiReviewLogDto = {
  id: string;
  type: 'queue' | 'llm' | 'verdict' | 'audit' | 'error' | 'retry' | 'run';
  time: string;
  message: string;
};

export type AiReviewFieldDto = {
  fieldKey: string;
  label: string;
  type: string;
  required: boolean;
  requirement: string;
};

export type AiReviewBatchDto = {
  batchId: string;
  displayId: string;
  taskId: string;
  taskTitle: string;
  taskCreatedAt: string | null;
  templateName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  labelerId: string | null;
  labelerName: string;
  submittedAt: string;
  itemCount: number;
  externalIds: string[];
  status: AiReviewBatchStatus;
  aggregateDecision: AiReviewBatchDecision;
  aggregateScore: number | null;
  failureReason: string | null;
  aiSuggestionLabel: string;
  templateVersion: string | null;
  provider: string | null;
  model: string | null;
  updatedAt: string;
};

export type AiReviewBatchItemSubmissionDto = {
  id: string;
  assignmentId: string;
  status: string;
  round: number;
  answers: Record<string, unknown>;
  schemaVersion: string;
  submittedAt: string;
};

export type AiReviewBatchItemVersionDto = {
  versionId: string;
  batchId: string;
  round: number;
  submittedAt: string;
  isCurrent: boolean;
  job: AiReviewJobDto;
  submission: AiReviewBatchItemSubmissionDto;
  reviewRecord: (Omit<ReviewRecord, 'createdAt'> & { createdAt: string }) | null;
  reviewFields: AiReviewFieldDto[];
  decision: AiReviewBatchDecision;
  overallScore: number | null;
  logs: AiReviewLogDto[];
};

export type AiReviewBatchItemDto = {
  index: number;
  job: AiReviewJobDto;
  submission: AiReviewBatchItemSubmissionDto;
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: DatasetKind;
    rawData: Record<string, unknown>;
  };
  reviewRecord: (Omit<ReviewRecord, 'createdAt'> & { createdAt: string }) | null;
  reviewFields: AiReviewFieldDto[];
  decision: AiReviewBatchDecision;
  overallScore: number | null;
  logs: AiReviewLogDto[];
  versions: AiReviewBatchItemVersionDto[];
};

export type AiReviewBatchDetailDto = AiReviewBatchDto & {
  items: AiReviewBatchItemDto[];
};

export type AiReviewDetailDto = {
  submission: {
    id: string;
    assignmentId: string;
    status: string;
    round: number;
    answers: Record<string, unknown>;
    schemaVersion: string;
    submittedAt: string;
  };
  task: {
    id: string;
    title: string;
    datasetKind: DatasetKind;
    templateSchema: LabelHubSchema | null;
  };
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: DatasetKind;
    rawData: Record<string, unknown>;
  };
  reviewRecord: (Omit<ReviewRecord, 'createdAt'> & { createdAt: string }) | null;
  jobs: AiReviewJobDto[];
};

type AiReviewPrismaClient = {
  aiReviewJob: {
    findMany: (args?: { where?: Record<string, unknown>; include?: unknown; orderBy?: unknown }) => Promise<AiReviewJobRecord[]>;
    findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<AiReviewJobRecord | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown>; include?: unknown }) => Promise<AiReviewJobRecord>;
  };
  submission: {
    findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<SubmissionReviewRecord | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown>; include?: unknown }) => Promise<SubmissionReviewRecord>;
  };
  assignment: {
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  reviewRecord: {
    create: (args: { data: Record<string, unknown> }) => Promise<ReviewRecord>;
  };
  auditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
  $transaction: <TResult>(callback: (client: AiReviewPrismaClient) => Promise<TResult>) => Promise<TResult>;
};

const JOB_INCLUDE = {
  task: {
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
      template: {
        select: {
          name: true,
          schemaVersion: true,
          schema: true,
        },
      },
    },
  },
  submission: {
    include: {
      assignment: {
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
            },
          },
          taskItem: true,
        },
      },
      reviewRecords: {
        orderBy: { createdAt: 'desc' },
      },
      auditLogs: {
        orderBy: { createdAt: 'asc' },
      },
    },
  },
} as const;

const SUBMISSION_REVIEW_INCLUDE = {
  assignment: {
    include: {
      task: {
        include: {
          template: {
            select: {
              datasetKind: true,
              schema: true,
            },
          },
        },
      },
      taskItem: true,
    },
  },
  reviewRecords: {
    orderBy: { createdAt: 'desc' },
  },
  aiReviewJobs: {
    include: JOB_INCLUDE,
    orderBy: { updatedAt: 'desc' },
  },
} as const;

const RETRYABLE_STATUSES = new Set<AiReviewStatus>([
  'FAILED_RETRYING',
  'FAILED_FINAL',
  'MANUAL_FALLBACK',
]);
const COMPLETABLE_JOB_STATUSES = new Set<AiReviewStatus>(['QUEUED', 'RUNNING']);
const FAILABLE_JOB_STATUSES = new Set<AiReviewStatus>(['QUEUED', 'RUNNING', 'FAILED_RETRYING']);

@Injectable()
export class AiReviewService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: AiReviewPrismaClient,
  ) {}

  async listBatches(query: { status?: AiReviewBatchStatus } = {}): Promise<AiReviewBatchDto[]> {
    const jobs = await this.prisma.aiReviewJob.findMany({
      include: JOB_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { queuedAt: 'desc' }],
    });
    const batches = currentTaskBatchGroups(jobs)
      .map((group) => toBatchDto(group.jobs, group.batchId))
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));

    return query.status ? batches.filter((batch) => batch.status === query.status) : batches;
  }

  async getBatchReview(batchId: string): Promise<AiReviewBatchDetailDto> {
    const jobs = await this.prisma.aiReviewJob.findMany({
      include: JOB_INCLUDE,
      orderBy: [{ queuedAt: 'asc' }, { createdAt: 'asc' }],
    });
    const batchJobs = jobs.filter((job) => batchIdForJob(job) === batchId);

    if (batchJobs.length === 0) {
      throw new NotFoundException({
        code: 'AI_REVIEW_BATCH_NOT_FOUND',
        message: 'AI 预审批次不存在或已被删除。',
      });
    }

    const taskJobs = jobs.filter((job) => job.taskId === batchJobs[0].taskId);
    const currentTaskBatch = currentTaskBatchGroup(batchJobs[0].taskId, jobs);

    return currentTaskBatch.batchId === batchId
      ? toBatchDetailDto(currentTaskBatch.jobs, currentTaskBatch.batchId, taskJobs)
      : toBatchDetailDto(batchJobs, batchId, taskJobs);
  }

  async listJobs(query: { status?: AiReviewStatus } = {}): Promise<AiReviewJobDto[]> {
    const jobs = await this.prisma.aiReviewJob.findMany({
      where: query.status ? { status: query.status } : {},
      include: JOB_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { queuedAt: 'desc' }],
    });

    return jobs.map(toJobDto);
  }

  async retryJob(jobId: string): Promise<AiReviewJobDto> {
    const job = await this.prisma.aiReviewJob.findUnique({
      where: { id: jobId },
      include: JOB_INCLUDE,
    });

    if (!job) {
      throw new NotFoundException({
        code: 'AI_REVIEW_JOB_NOT_FOUND',
        message: 'AI 预审任务不存在或已被删除。',
      });
    }

    if (!RETRYABLE_STATUSES.has(job.status)) {
      throw new BadRequestException({
        code: 'AI_REVIEW_JOB_NOT_RETRYABLE',
        message: '只有失败的 AI 预审任务可以手动重试。',
      });
    }

    const retried = await this.prisma.aiReviewJob.update({
      where: { id: jobId },
      data: {
        status: 'QUEUED',
        attempts: 0,
        lastError: null,
        startedAt: null,
        finishedAt: null,
        logs: [
          ...toLogArray(job.logs),
          {
            level: 'retry',
            message: '已手动重试 AI 预审任务。',
            at: new Date().toISOString(),
          },
        ],
      },
      include: JOB_INCLUDE,
    });

    return toJobDto(retried);
  }

  async completeJob(jobId: string, input: CompleteAiReviewJobInput): Promise<AiReviewDetailDto> {
    const inputDecision = normalizeAiDecision(input.decision);
    if (!inputDecision) {
      throw new BadRequestException({
        code: 'AI_REVIEW_DECISION_INVALID',
        message: 'AI 预审结果必须是 pass 或 reject。',
      });
    }
    const decision = fieldReviewDecisionOverride(input.structuredOutput) ?? inputDecision;
    const comment = input.comment?.trim() || structuredOutputComment(input.structuredOutput) || '';
    const structuredOutput = structuredOutputWithDecision(input.structuredOutput, decision);

    if (decision === 'reject' && !comment) {
      throw new BadRequestException({
        code: 'AI_REVIEW_REJECT_REASON_REQUIRED',
        message: 'AI 预审打回必须填写理由。',
      });
    }

    return runInTransaction(this.prisma, async (client) => {
      const job = await this.findCompletableJobOrThrow(client, jobId);
      const submission = await this.findSubmissionOrThrow(client, job.submissionId);
      if (!['AI_QUEUED', 'AI_REVIEWING'].includes(submission.status)) {
        throw new BadRequestException({
          code: 'SUBMISSION_NOT_AI_REVIEWABLE',
          message: '只有 AI 预审排队中或预审中的提交可以写入 AI 预审结果。',
        });
      }

      const startedAt = new Date();
      const currentAttempt = job.status === 'RUNNING' ? Math.max(1, job.attempts) : job.attempts + 1;
      let currentStatus = submission.status as SubmissionStatus;
      if (currentStatus === 'AI_QUEUED') {
        assertSubmissionTransition(currentStatus, 'AI_REVIEWING');
        if (job.status !== 'RUNNING') {
          await client.aiReviewJob.update({
            where: { id: job.id },
            data: {
              status: 'RUNNING',
              attempts: currentAttempt,
              startedAt: job.startedAt ?? startedAt,
              logs: [
                ...toLogArray(job.logs),
                {
                  level: 'run',
                  message: 'AI 预审开始处理提交。',
                  at: startedAt.toISOString(),
                },
              ],
            },
          });
        }
        await client.submission.update({
          where: { id: submission.id },
          data: { status: 'AI_REVIEWING' },
        });
        await writeAiReviewAudit(client, submission, {
          actorId: input.actorId,
          fromStatus: 'AI_QUEUED',
          toStatus: 'AI_REVIEWING',
          metadata: { action: 'AI_REVIEW_STARTED', jobId: job.id },
        });
        currentStatus = 'AI_REVIEWING';
      }

      const aiStatus = aiSubmissionStatusForDecision(decision);
      assertSubmissionTransition(currentStatus, aiStatus);
      await client.reviewRecord.create({
        data: {
          submissionId: submission.id,
          stage: 'AI_PRECHECK',
          reviewerType: 'AI',
          scores: scoresWithReason(input.scores, decision, comment),
          decision,
          comment: comment || defaultAiComment(decision),
          rawPrompt: input.rawPrompt,
          rawOutput: input.rawOutput,
          structuredOutput,
          modelMetadata: input.modelMetadata,
          retryCount: currentAttempt,
          idempotencyKey: job.idempotencyKey,
        },
      });
      await client.submission.update({
        where: { id: submission.id },
        data: { status: aiStatus },
      });
      await writeAiReviewAudit(client, submission, {
        actorId: input.actorId,
        fromStatus: currentStatus,
        toStatus: aiStatus,
        reason: comment || undefined,
        metadata: { action: aiAuditActionForDecision(decision), jobId: job.id },
      });

      await client.aiReviewJob.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          attempts: currentAttempt,
          lastError: null,
          finishedAt: new Date(),
          logs: [
            ...toLogArray(job.logs),
            {
              level: decision,
              message: comment || defaultAiComment(decision),
              at: new Date().toISOString(),
            },
          ],
        },
      });

      if (decision === 'reject') {
        await moveSubmissionToRevision(client, submission, {
          actorId: input.actorId,
          fromStatus: aiStatus,
          jobId: job.id,
          reason: comment || undefined,
        });
      } else {
        await promoteTaskIfAllCurrentAiReviewsPassed(client, job.taskId, {
          actorId: input.actorId,
          jobId: job.id,
          reason: comment || undefined,
        });
      }

      return this.getSubmissionReviewFromClient(client, submission.id);
    });
  }

  async failJob(jobId: string, input: FailAiReviewJobInput): Promise<AiReviewDetailDto> {
    const message = input.message.trim() || 'AI 预审处理失败。';

    return runInTransaction(this.prisma, async (client) => {
      const job = await client.aiReviewJob.findUnique({
        where: { id: jobId },
        include: JOB_INCLUDE,
      });

      if (!job) {
        throw new NotFoundException({
          code: 'AI_REVIEW_JOB_NOT_FOUND',
          message: 'AI 预审任务不存在或已被删除。',
        });
      }

      if (!FAILABLE_JOB_STATUSES.has(job.status)) {
        throw new BadRequestException({
          code: 'AI_REVIEW_JOB_NOT_FAILABLE',
          message: '只有排队中、运行中或等待重试的 AI 预审任务可以记录失败。',
        });
      }

      const submission = await this.findSubmissionOrThrow(client, job.submissionId);
      const currentAttempt = job.status === 'RUNNING' ? Math.max(1, job.attempts) : job.attempts + 1;
      const nextStatus: AiReviewStatus = currentAttempt >= job.maxAttempts ? 'FAILED_FINAL' : 'FAILED_RETRYING';
      const failedAt = new Date();

      await client.aiReviewJob.update({
        where: { id: job.id },
        data: {
          status: nextStatus,
          attempts: currentAttempt,
          lastError: message,
          finishedAt: failedAt,
          logs: [
            ...toLogArray(job.logs),
            {
              level: 'error',
              message,
              at: failedAt.toISOString(),
            },
          ],
        },
      });

      if (nextStatus === 'FAILED_FINAL') {
        await moveFailedAiJobToRevision(client, submission, {
          actorId: input.actorId,
          currentAttempt,
          job,
          reason: aiFailureRevisionReason(message),
        });
      }

      return this.getSubmissionReviewFromClient(client, submission.id);
    });
  }

  async getSubmissionReview(submissionId: string): Promise<AiReviewDetailDto> {
    return this.getSubmissionReviewFromClient(this.prisma, submissionId);
  }

  private async findCompletableJobOrThrow(client: AiReviewPrismaClient, jobId: string): Promise<AiReviewJobRecord> {
    const job = await client.aiReviewJob.findUnique({
      where: { id: jobId },
      include: JOB_INCLUDE,
    });

    if (!job) {
      throw new NotFoundException({
        code: 'AI_REVIEW_JOB_NOT_FOUND',
        message: 'AI 预审任务不存在或已被删除。',
      });
    }
    if (!COMPLETABLE_JOB_STATUSES.has(job.status)) {
      throw new BadRequestException({
        code: 'AI_REVIEW_JOB_NOT_COMPLETABLE',
        message: '只有排队中或运行中的 AI 预审任务可以写入预审结果。',
      });
    }

    return job;
  }

  private async findSubmissionOrThrow(client: AiReviewPrismaClient, submissionId: string): Promise<SubmissionReviewRecord> {
    const submission = await client.submission.findUnique({
      where: { id: submissionId },
      include: SUBMISSION_REVIEW_INCLUDE,
    });

    if (!submission) {
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: '提交记录不存在或已被删除。',
      });
    }

    return submission;
  }

  private async getSubmissionReviewFromClient(
    client: Pick<AiReviewPrismaClient, 'submission'>,
    submissionId: string,
  ): Promise<AiReviewDetailDto> {
    const submission = await client.submission.findUnique({
      where: { id: submissionId },
      include: SUBMISSION_REVIEW_INCLUDE,
    });

    if (!submission) {
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: '提交记录不存在或已被删除。',
      });
    }

    return {
      submission: {
        id: submission.id,
        assignmentId: submission.assignmentId,
        status: submission.status,
        round: submission.round,
        answers: submission.answers,
        schemaVersion: submission.schemaVersion,
        submittedAt: submission.submittedAt.toISOString(),
      },
      task: {
        id: submission.assignment.task.id,
        title: submission.assignment.task.title,
        datasetKind: submission.assignment.task.template.datasetKind,
        templateSchema: submission.assignment.task.template.schema ?? null,
      },
      taskItem: {
        id: submission.assignment.taskItem.id,
        externalId: submission.assignment.taskItem.externalId,
        datasetKind: submission.assignment.taskItem.datasetKind,
        rawData: submission.assignment.taskItem.rawData,
      },
      reviewRecord: submission.reviewRecords[0] ? toReviewRecordDto(submission.reviewRecords[0]) : null,
      jobs: submission.aiReviewJobs.map(toJobDto),
    };
  }
}

async function writeAiReviewAudit(
  client: AiReviewPrismaClient,
  submission: SubmissionReviewRecord,
  input: {
    actorId?: string;
    fromStatus?: string;
    toStatus: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.auditLog.create({
    data: {
      taskId: submission.assignment.task.id,
      submissionId: submission.id,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actorId: input.actorId,
      reason: input.reason,
      metadata: input.metadata,
    },
  });
}

async function moveSubmissionToRevision(
  client: AiReviewPrismaClient,
  submission: SubmissionReviewRecord,
  input: {
    action?: string;
    actorId?: string;
    fromStatus: SubmissionStatus;
    jobId: string;
    reason?: string;
  },
): Promise<void> {
  assertSubmissionTransition(input.fromStatus, 'NEEDS_REVISION');
  await client.submission.update({
    where: { id: submission.id },
    data: { status: 'NEEDS_REVISION' },
  });
  await client.assignment.update({
    where: { id: submission.assignmentId },
    data: { status: 'NEEDS_REVISION' },
  });
  await writeAiReviewAudit(client, submission, {
    actorId: input.actorId,
    fromStatus: input.fromStatus,
    toStatus: 'NEEDS_REVISION',
    reason: input.reason,
    metadata: {
      action: input.action ?? 'AI_REVIEW_TO_REVISION',
      jobId: input.jobId,
    },
  });
}

async function moveFailedAiJobToRevision(
  client: AiReviewPrismaClient,
  submission: SubmissionReviewRecord,
  input: {
    actorId?: string;
    currentAttempt: number;
    job: AiReviewJobRecord;
    reason: string;
  },
): Promise<void> {
  let currentStatus = submission.status as SubmissionStatus;
  if (!['AI_QUEUED', 'AI_REVIEWING'].includes(currentStatus)) {
    return;
  }

  if (currentStatus === 'AI_QUEUED') {
    assertSubmissionTransition('AI_QUEUED', 'AI_REVIEWING');
    await client.submission.update({
      where: { id: submission.id },
      data: { status: 'AI_REVIEWING' },
    });
    await writeAiReviewAudit(client, submission, {
      actorId: input.actorId,
      fromStatus: 'AI_QUEUED',
      toStatus: 'AI_REVIEWING',
      metadata: { action: 'AI_REVIEW_STARTED', jobId: input.job.id },
    });
    currentStatus = 'AI_REVIEWING';
  }

  assertSubmissionTransition(currentStatus, 'AI_REJECTED');
  await client.reviewRecord.create({
    data: {
      submissionId: submission.id,
      stage: 'AI_PRECHECK',
      reviewerType: 'AI',
      scores: scoresWithReason({ overall: 0 }, 'reject', input.reason),
      decision: 'reject',
      comment: input.reason,
      rawPrompt: null,
      rawOutput: null,
      structuredOutput: aiFailureStructuredOutput(input.reason),
      modelMetadata: {
        provider: input.job.provider,
        model: input.job.model,
        error: true,
      },
      retryCount: input.currentAttempt,
      idempotencyKey: null,
    },
  });
  await client.submission.update({
    where: { id: submission.id },
    data: { status: 'AI_REJECTED' },
  });
  await writeAiReviewAudit(client, submission, {
    actorId: input.actorId,
    fromStatus: currentStatus,
    toStatus: 'AI_REJECTED',
    reason: input.reason,
    metadata: { action: 'AI_REVIEW_FAILED', jobId: input.job.id },
  });
  await moveSubmissionToRevision(client, submission, {
    action: 'AI_REVIEW_FAILED_TO_REVISION',
    actorId: input.actorId,
    fromStatus: 'AI_REJECTED',
    jobId: input.job.id,
    reason: input.reason,
  });
}

async function promoteTaskIfAllCurrentAiReviewsPassed(
  client: AiReviewPrismaClient,
  taskId: string,
  input: {
    actorId?: string;
    jobId: string;
    reason?: string;
  },
): Promise<void> {
  const currentJobs = await currentTaskAiReviewJobs(client, taskId);
  if (currentJobs.length === 0 || currentJobs.some((job) => decisionForJob(job) !== 'pass')) {
    return;
  }

  for (const job of currentJobs) {
    await promoteSubmissionToHumanReview(client, job.submission?.id ?? job.submissionId, {
      actorId: input.actorId,
      jobId: job.id,
      reason: job.id === input.jobId ? input.reason : undefined,
    });
  }
}

async function currentTaskAiReviewJobs(
  client: AiReviewPrismaClient,
  taskId: string,
): Promise<AiReviewJobRecord[]> {
  const jobs = await client.aiReviewJob.findMany({
    where: { taskId },
    include: JOB_INCLUDE,
    orderBy: [{ updatedAt: 'desc' }, { queuedAt: 'desc' }],
  });

  return currentTaskBatchGroup(taskId, jobs).jobs;
}

async function promoteSubmissionToHumanReview(
  client: AiReviewPrismaClient,
  submissionId: string,
  input: {
    actorId?: string;
    jobId: string;
    reason?: string;
  },
): Promise<void> {
  const submission = await findSubmissionRecordOrThrow(client, submissionId);
  if (submission.status === 'HUMAN_PENDING') {
    return;
  }
  if (submission.status !== 'AI_PASSED') {
    return;
  }

  assertSubmissionTransition('AI_PASSED', 'HUMAN_PENDING');
  await client.submission.update({
    where: { id: submission.id },
    data: { status: 'HUMAN_PENDING' },
  });
  await writeAiReviewAudit(client, submission, {
    actorId: input.actorId,
    fromStatus: 'AI_PASSED',
    toStatus: 'HUMAN_PENDING',
    reason: input.reason,
    metadata: {
      action: 'AI_REVIEW_TO_HUMAN_PENDING',
      jobId: input.jobId,
    },
  });
}

async function findSubmissionRecordOrThrow(
  client: AiReviewPrismaClient,
  submissionId: string,
): Promise<SubmissionReviewRecord> {
  const submission = await client.submission.findUnique({
    where: { id: submissionId },
    include: SUBMISSION_REVIEW_INCLUDE,
  });

  if (!submission) {
    throw new NotFoundException({
      code: 'SUBMISSION_NOT_FOUND',
      message: '提交记录不存在或已被删除。',
    });
  }

  return submission;
}

function normalizeAiDecision(value: unknown): CompleteAiReviewJobInput['decision'] | null {
  return value === 'pass' || value === 'reject' ? value : null;
}

function aiSubmissionStatusForDecision(decision: CompleteAiReviewJobInput['decision']): SubmissionStatus {
  if (decision === 'pass') {
    return 'AI_PASSED';
  }

  return 'AI_REJECTED';
}

function aiAuditActionForDecision(decision: CompleteAiReviewJobInput['decision']): string {
  if (decision === 'pass') {
    return 'AI_REVIEW_PASSED';
  }

  return 'AI_REVIEW_REJECTED';
}

function defaultAiComment(decision: CompleteAiReviewJobInput['decision']): string {
  if (decision === 'pass') {
    return 'AI 预审通过，进入人工复审。';
  }

  return 'AI 预审打回，标注员需要修改。';
}

function aiFailureRevisionReason(message: string): string {
  return `AI 预审未能完成，已退回标注员重新提交。原因：${message}`;
}

function aiFailureStructuredOutput(comment: string): Record<string, unknown> {
  return {
    verdict: 'reject',
    overallScore: 0,
    overallComment: comment,
    fieldReviews: [],
  };
}

function scoresWithReason(
  scores: Record<string, unknown> | undefined,
  decision: CompleteAiReviewJobInput['decision'],
  comment: string,
): Record<string, unknown> {
  const normalizedScores = isRecord(scores) ? { ...scores } : {};
  if (decision === 'reject' && comment && typeof normalizedScores.reason !== 'string') {
    normalizedScores.reason = comment;
  }

  return normalizedScores;
}

function fieldReviewDecisionOverride(structuredOutput: Record<string, unknown> | undefined): 'reject' | null {
  const fieldReviews = structuredOutput?.fieldReviews;
  if (!Array.isArray(fieldReviews) || fieldReviews.length === 0) {
    return null;
  }

  return fieldReviews.some((fieldReview) => !isRecord(fieldReview) || fieldReview.decision !== 'pass') ? 'reject' : null;
}

function structuredOutputComment(structuredOutput: Record<string, unknown> | undefined): string {
  const overallComment = structuredOutput?.overallComment;
  if (typeof overallComment === 'string' && overallComment.trim()) {
    return overallComment.trim();
  }

  const reason = structuredOutput?.reason;
  return typeof reason === 'string' ? reason.trim() : '';
}

function structuredOutputWithDecision(
  structuredOutput: Record<string, unknown> | undefined,
  decision: CompleteAiReviewJobInput['decision'],
): Record<string, unknown> | undefined {
  return structuredOutput ? { ...structuredOutput, verdict: decision } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type AiReviewTaskBatchGroup = {
  batchId: string;
  jobs: AiReviewJobRecord[];
};

function currentTaskBatchGroups(jobs: AiReviewJobRecord[]): AiReviewTaskBatchGroup[] {
  const groupedJobs = new Map<string, AiReviewJobRecord[]>();
  for (const job of jobs) {
    const taskKey = job.taskId || batchIdForJob(job);
    groupedJobs.set(taskKey, [...(groupedJobs.get(taskKey) ?? []), job]);
  }

  return [...groupedJobs.entries()].map(([taskId, taskJobs]) => currentTaskBatchGroup(taskId, taskJobs));
}

function currentTaskBatchGroup(taskId: string, jobs: AiReviewJobRecord[]): AiReviewTaskBatchGroup {
  const taskJobs = jobs.filter((job) => job.taskId === taskId);
  const latestByAssignment = new Map<string, AiReviewJobRecord>();

  for (const job of taskJobs) {
    const assignmentKey = assignmentKeyForJob(job);
    const current = latestByAssignment.get(assignmentKey);

    if (!current || compareJobRecency(job, current) > 0) {
      latestByAssignment.set(assignmentKey, job);
    }
  }

  const latestJobs = [...latestByAssignment.values()];

  return {
    batchId: latestBatchIdForJobs(latestJobs),
    jobs: latestJobs,
  };
}

function assignmentKeyForJob(job: AiReviewJobRecord): string {
  return job.submission?.assignmentId ?? job.submission?.assignment.id ?? job.submissionId;
}

function latestBatchIdForJobs(jobs: AiReviewJobRecord[]): string {
  const latestJob = jobs.reduce<AiReviewJobRecord | null>(
    (latest, job) => (!latest || compareJobRecency(job, latest) > 0 ? job : latest),
    null,
  );

  return latestJob ? batchIdForJob(latestJob) : 'unknown-batch';
}

function compareJobRecency(first: AiReviewJobRecord, second: AiReviewJobRecord): number {
  if (first.round !== second.round) {
    return first.round - second.round;
  }

  const submittedDiff =
    (first.submission?.submittedAt ?? first.queuedAt).getTime() -
    (second.submission?.submittedAt ?? second.queuedAt).getTime();
  if (submittedDiff !== 0) {
    return submittedDiff;
  }

  const updatedDiff = first.updatedAt.getTime() - second.updatedAt.getTime();
  if (updatedDiff !== 0) {
    return updatedDiff;
  }

  return first.createdAt.getTime() - second.createdAt.getTime();
}

function toBatchDetailDto(
  jobs: AiReviewJobRecord[],
  batchIdOverride?: string,
  allJobs: AiReviewJobRecord[] = jobs,
): AiReviewBatchDetailDto {
  const sortedJobs = sortBatchJobs(jobs);

  return {
    ...toBatchDto(sortedJobs, batchIdOverride),
    items: sortedJobs.map((job, index) => toBatchItemDto(job, index, versionJobsForAssignment(job, allJobs))),
  };
}

function toBatchDto(jobs: AiReviewJobRecord[], batchIdOverride?: string): AiReviewBatchDto {
  const sortedJobs = sortBatchJobs(jobs);
  const firstJob = sortedJobs[0];
  const firstSubmission = firstJob?.submission;
  const firstAssignment = firstSubmission?.assignment;
  const aggregateDecision = aggregateBatchDecision(sortedJobs);
  const aggregateScore = aggregateBatchScore(sortedJobs);
  const updatedAt = maxDate(sortedJobs.map((job) => job.updatedAt));
  const submittedAtJobs = jobsForSubmittedAt(sortedJobs, batchIdOverride);
  const submittedAt = minDate(
    submittedAtJobs.map((job) => job.submission?.submittedAt ?? job.queuedAt),
  );
  const batchId = batchIdOverride ?? (firstJob ? batchIdForJob(firstJob) : 'unknown-batch');

  return {
    batchId,
    displayId: batchDisplayId(batchId),
    taskId: firstJob?.taskId ?? '',
    taskTitle: firstJob?.task?.title ?? '未知任务',
    taskCreatedAt: firstJob?.task?.createdAt?.toISOString() ?? null,
    templateName: firstJob?.task?.template?.name ?? null,
    ownerId: firstJob?.task?.createdBy?.id ?? firstJob?.task?.createdById ?? null,
    ownerName: firstJob?.task?.createdBy?.name ?? readableUserName(firstJob?.task?.createdById),
    labelerId: firstAssignment?.assignee?.id ?? firstAssignment?.assigneeId ?? null,
    labelerName: firstAssignment?.assignee?.name ?? readableUserName(firstAssignment?.assigneeId),
    submittedAt: submittedAt.toISOString(),
    itemCount: sortedJobs.length,
    externalIds: sortedJobs.map((job) => job.submission?.assignment.taskItem.externalId ?? job.submissionId),
    status: batchStatusFromDecision(aggregateDecision),
    aggregateDecision,
    aggregateScore,
    failureReason: firstFailureReason(sortedJobs),
    aiSuggestionLabel: aiSuggestionLabel(aggregateDecision),
    templateVersion: firstJob?.task?.template?.schemaVersion ?? null,
    provider: firstJob?.provider ?? null,
    model: firstJob?.model ?? null,
    updatedAt: updatedAt.toISOString(),
  };
}

function jobsForSubmittedAt(
  jobs: AiReviewJobRecord[],
  batchIdOverride: string | undefined,
): AiReviewJobRecord[] {
  if (!batchIdOverride) {
    return jobs;
  }

  const batchJobs = jobs.filter((job) => batchIdForJob(job) === batchIdOverride);

  return batchJobs.length > 0 ? batchJobs : jobs;
}

function versionJobsForAssignment(job: AiReviewJobRecord, allJobs: AiReviewJobRecord[]): AiReviewJobRecord[] {
  const assignmentKey = assignmentKeyForJob(job);
  const latestByVersion = new Map<string, AiReviewJobRecord>();

  for (const candidate of allJobs) {
    if (candidate.taskId !== job.taskId || assignmentKeyForJob(candidate) !== assignmentKey) {
      continue;
    }

    const versionKey = versionKeyForJob(candidate);
    const current = latestByVersion.get(versionKey);
    if (!current || compareJobRecency(candidate, current) > 0) {
      latestByVersion.set(versionKey, candidate);
    }
  }

  return [...latestByVersion.values()].sort((first, second) => compareJobRecency(second, first));
}

function versionKeyForJob(job: AiReviewJobRecord): string {
  return job.submission?.id ?? `${assignmentKeyForJob(job)}:${job.submission?.round ?? job.round}`;
}

function toBatchItemDto(
  job: AiReviewJobRecord,
  index: number,
  versionJobs: AiReviewJobRecord[] = [job],
): AiReviewBatchItemDto {
  const submission = job.submission;
  const assignment = submission?.assignment;
  const taskItem = assignment?.taskItem;
  const reviewRecord = latestAiReviewRecord(job);
  const submissionDto = toBatchItemSubmissionDto(job);

  return {
    index: index + 1,
    job: toJobDto(job),
    submission: submissionDto,
    taskItem: {
      id: taskItem?.id ?? '',
      externalId: taskItem?.externalId ?? job.submissionId,
      datasetKind: taskItem?.datasetKind ?? 'generic_json',
      rawData: taskItem?.rawData ?? {},
    },
    reviewRecord: reviewRecord ? toReviewRecordDto(reviewRecord) : null,
    reviewFields: reviewFieldsFromTemplateSchema(
      job.task?.template?.schema ?? null,
      submissionDto.answers,
    ),
    decision: decisionForJob(job),
    overallScore: scoreFromRecord(reviewRecord),
    logs: toBatchItemLogs(job, reviewRecord),
    versions: versionJobs.map((versionJob) => toBatchItemVersionDto(versionJob, job)),
  };
}

function toBatchItemVersionDto(
  job: AiReviewJobRecord,
  currentJob: AiReviewJobRecord,
): AiReviewBatchItemVersionDto {
  const submission = toBatchItemSubmissionDto(job);
  const reviewRecord = latestAiReviewRecord(job);

  return {
    versionId: versionKeyForJob(job),
    batchId: batchIdForJob(job),
    round: submission.round,
    submittedAt: submission.submittedAt,
    isCurrent: versionKeyForJob(job) === versionKeyForJob(currentJob),
    job: toJobDto(job),
    submission,
    reviewRecord: reviewRecord ? toReviewRecordDto(reviewRecord) : null,
    reviewFields: reviewFieldsFromTemplateSchema(
      job.task?.template?.schema ?? null,
      submission.answers,
    ),
    decision: decisionForJob(job),
    overallScore: scoreFromRecord(reviewRecord),
    logs: toBatchItemLogs(job, reviewRecord),
  };
}

function toBatchItemSubmissionDto(job: AiReviewJobRecord): AiReviewBatchItemSubmissionDto {
  const submission = job.submission;
  const assignment = submission?.assignment;

  return {
    id: submission?.id ?? job.submissionId,
    assignmentId: submission?.assignmentId ?? assignment?.id ?? '',
    status: submission?.status ?? 'AI_QUEUED',
    round: submission?.round ?? job.round,
    answers: submission?.answers ?? {},
    schemaVersion: submission?.schemaVersion ?? job.task?.template?.schemaVersion ?? '',
    submittedAt: (submission?.submittedAt ?? job.queuedAt).toISOString(),
  };
}

function batchIdForJob(job: AiReviewJobRecord): string {
  const submissionKey = job.submission?.idempotencyKey?.trim();
  const assignmentId = job.submission?.assignmentId ?? job.submission?.assignment.id;
  if (submissionKey && assignmentId) {
    const suffix = `:${assignmentId}:${job.round}`;
    if (submissionKey.endsWith(suffix)) {
      return submissionKey.slice(0, -suffix.length);
    }

    return submissionKey;
  }

  return job.idempotencyKey || job.submissionId || job.id;
}

function sortBatchJobs(jobs: AiReviewJobRecord[]): AiReviewJobRecord[] {
  return [...jobs].sort((first, second) => {
    const firstOrder = first.submission?.assignment.taskItem.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const secondOrder = second.submission?.assignment.taskItem.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (firstOrder !== secondOrder) {
      return firstOrder - secondOrder;
    }

    return (first.submission?.assignment.taskItem.externalId ?? first.submissionId)
      .localeCompare(second.submission?.assignment.taskItem.externalId ?? second.submissionId);
  });
}

function aggregateBatchDecision(jobs: AiReviewJobRecord[]): AiReviewBatchDecision {
  const decisions = jobs.map(decisionForJob);
  if (decisions.includes('failed')) {
    return 'failed';
  }
  if (decisions.includes('reject')) {
    return 'reject';
  }
  if (decisions.length > 0 && decisions.every((decision) => decision === 'pass')) {
    return 'pass';
  }

  return 'pending';
}

function decisionForJob(job: AiReviewJobRecord): AiReviewBatchDecision {
  if (job.status === 'FAILED_FINAL' || job.status === 'FAILED_RETRYING') {
    return 'failed';
  }

  const reviewRecord = latestAiReviewRecord(job);
  const fieldReviewOverride = fieldReviewDecisionOverride(reviewRecord?.structuredOutput ?? undefined);
  if (fieldReviewOverride) {
    return fieldReviewOverride;
  }

  const reviewDecision = reviewRecord?.decision;
  if (reviewDecision === 'manual') {
    return 'reject';
  }
  if (reviewDecision === 'reject' || reviewDecision === 'pass') {
    return reviewDecision;
  }
  if (job.status === 'MANUAL_FALLBACK') {
    return 'failed';
  }
  if (job.status === 'SUCCEEDED') {
    return 'pass';
  }

  return 'pending';
}

function batchStatusFromDecision(decision: AiReviewBatchDecision): AiReviewBatchStatus {
  if (decision === 'failed') {
    return 'FAILED';
  }
  if (decision === 'reject') {
    return 'REJECTED';
  }
  if (decision === 'pass') {
    return 'PASSED';
  }

  return 'PENDING';
}

function latestAiReviewRecord(job: AiReviewJobRecord): ReviewRecord | null {
  return job.submission?.reviewRecords?.find((record) => record.stage === 'AI_PRECHECK') ?? null;
}

function aggregateBatchScore(jobs: AiReviewJobRecord[]): number | null {
  const scores = jobs
    .map((job) => scoreFromRecord(latestAiReviewRecord(job)))
    .filter((score): score is number => typeof score === 'number');

  if (scores.length === 0) {
    return null;
  }

  return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
}

function scoreFromRecord(record: ReviewRecord | null): number | null {
  if (!record) {
    return null;
  }

  return numericScore(record.structuredOutput?.overallScore)
    ?? numericScore(record.scores.overall)
    ?? numericScore(record.scores.score)
    ?? numericScore(record.scores.total)
    ?? averageNumericScores(record.scores);
}

function reviewFieldsFromTemplateSchema(
  schema: LabelHubSchema | null,
  answers: Record<string, unknown>,
): AiReviewFieldDto[] {
  if (!schema) {
    return [];
  }

  return compileAiReviewPrompt({
    schema,
    answers,
    reviewFieldKeys: Object.keys(answers),
  }).fieldRequirements.map((field) => ({
    fieldKey: field.fieldKey,
    label: field.label,
    type: field.type,
    required: field.required,
    requirement: field.requirement,
  }));
}

function averageNumericScores(scores: Record<string, unknown>): number | null {
  const values = Object.entries(scores)
    .filter(([key]) => key !== 'reason')
    .map(([, value]) => numericScore(value))
    .filter((value): value is number => typeof value === 'number');

  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function numericScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Math.max(0, Math.min(100, Math.round(Number(value))));
  }

  return null;
}

function firstFailureReason(jobs: AiReviewJobRecord[]): string | null {
  return jobs.find((job) => job.lastError)?.lastError ?? null;
}

function aiSuggestionLabel(decision: AiReviewBatchDecision): string {
  if (decision === 'failed') {
    return '失败';
  }
  if (decision === 'reject') {
    return '建议打回';
  }
  if (decision === 'pass') {
    return '建议通过';
  }

  return '等待预审';
}

function toBatchItemLogs(job: AiReviewJobRecord, reviewRecord: ReviewRecord | null): AiReviewLogDto[] {
  const logs: AiReviewLogDto[] = toLogArray(job.logs).map((entry, index) => ({
    id: `${job.id}:log:${index}`,
    type: logType(entry.level),
    time: stringValue(entry.at) ?? job.queuedAt.toISOString(),
    message: stringValue(entry.message) ?? 'AI 预审日志。',
  }));

  if (job.startedAt) {
    logs.push({
      id: `${job.id}:llm`,
      type: 'llm',
      time: job.startedAt.toISOString(),
      message: `${job.model ?? job.provider ?? '模型'} 开始处理。`,
    });
  }

  if (reviewRecord) {
    logs.push({
      id: `${job.id}:verdict:${reviewRecord.id}`,
      type: 'verdict',
      time: reviewRecord.createdAt.toISOString(),
      message: `${aiSuggestionLabel(decisionForJob(job))}${reviewRecord.comment ? `：${reviewRecord.comment}` : ''}`,
    });
  }

  for (const auditLog of job.submission?.auditLogs ?? []) {
    logs.push({
      id: `${job.id}:audit:${auditLog.id}`,
      type: 'audit',
      time: auditLog.createdAt.toISOString(),
      message: `${auditLog.fromStatus ?? '开始'} -> ${auditLog.toStatus}${auditLog.reason ? `：${auditLog.reason}` : ''}`,
    });
  }

  return logs.sort((first, second) => first.time.localeCompare(second.time));
}

function logType(value: unknown): AiReviewLogDto['type'] {
  if (value === 'queue' || value === 'llm' || value === 'verdict' || value === 'audit' || value === 'error' || value === 'retry' || value === 'run') {
    return value;
  }
  if (value === 'pass' || value === 'reject') {
    return 'verdict';
  }

  return 'run';
}

function minDate(values: Date[]): Date {
  return values.reduce((earliest, value) => (value.getTime() < earliest.getTime() ? value : earliest), values[0] ?? new Date(0));
}

function maxDate(values: Date[]): Date {
  return values.reduce((latest, value) => (value.getTime() > latest.getTime() ? value : latest), values[0] ?? new Date(0));
}

function readableUserName(userId?: string | null): string {
  if (!userId) {
    return '未记录';
  }

  return userId.replace(/^user_/, '').replaceAll('_', ' ');
}

function batchDisplayId(batchId: string): string {
  const hash = stableNumberHash(batchId);
  const group = String(hash % 10000).padStart(4, '0');
  const serial = String(Math.floor(hash / 10000) % 100000).padStart(5, '0');

  return `SUB-${group}-${serial}`;
}

function stableNumberHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toJobDto(job: AiReviewJobRecord): AiReviewJobDto {
  const taskItem = job.submission?.assignment.taskItem;

  return {
    id: job.id,
    submissionId: job.submissionId,
    taskId: job.taskId,
    taskTitle: job.task?.title ?? '未知任务',
    externalId: taskItem?.externalId ?? job.submissionId,
    datasetKind: taskItem?.datasetKind ?? 'generic_json',
    submissionStatus: job.submission?.status ?? 'AI_QUEUED',
    round: job.round,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    idempotencyKey: job.idempotencyKey,
    structuredOutputMode: job.structuredOutputMode,
    provider: job.provider,
    model: job.model,
    lastError: job.lastError,
    queuedAt: job.queuedAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    updatedAt: job.updatedAt.toISOString(),
  };
}

function toReviewRecordDto(record: ReviewRecord): AiReviewDetailDto['reviewRecord'] {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
  };
}

function toLogArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    : [];
}

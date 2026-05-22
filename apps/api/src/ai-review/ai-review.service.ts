import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AiReviewStatus, DatasetKind } from '@labelhub/shared';

import { PrismaService } from '../prisma/prisma.service.ts';

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
  };
  submission?: SubmissionSummaryRecord;
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
      datasetKind: DatasetKind;
      rawData: Record<string, unknown>;
    };
  };
};

type ReviewRecord = {
  id: string;
  ruleId: string | null;
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

type SubmissionReviewRecord = SubmissionSummaryRecord & {
  assignmentId: string;
  answers: Record<string, unknown>;
  schemaVersion: string;
  assignment: SubmissionSummaryRecord['assignment'] & {
    task: {
      id: string;
      title: string;
      template: {
        datasetKind: DatasetKind;
      };
    };
  };
  reviewRecords: ReviewRecord[];
  aiReviewJobs: AiReviewJobRecord[];
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
  };
};

const JOB_INCLUDE = {
  task: {
    select: {
      title: true,
    },
  },
  submission: {
    include: {
      assignment: {
        include: {
          taskItem: true,
        },
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

@Injectable()
export class AiReviewService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: AiReviewPrismaClient,
  ) {}

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
        message: '只有失败或转人工兜底的 AI 预审任务可以手动重试。',
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

  async getSubmissionReview(submissionId: string): Promise<AiReviewDetailDto> {
    const submission = await this.prisma.submission.findUnique({
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

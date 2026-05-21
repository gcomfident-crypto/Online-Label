import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DatasetKind } from '@labelhub/shared';

import { PrismaService } from '../prisma/prisma.service.ts';
import { runInTransaction } from '../common/transactions/run-in-transaction.ts';
import type { ReviewDetailDto, ReviewQueueItemDto, ReviewRecordDto, ReviewTimelineItemDto } from './reviews.service.ts';

type ReviewStage = 'AI_PRECHECK' | 'RECHECK' | 'FINAL';
type ReviewerType = 'AI' | 'HUMAN';
type SubmissionStatus = 'FINAL_PENDING' | 'FINAL_APPROVED' | 'NEEDS_REVISION' | string;
type AssignmentStatus = 'FINAL_PENDING' | 'NEEDS_REVISION' | string;

type ReviewRecordRecord = {
  id: string;
  submissionId: string;
  ruleId: string | null;
  stage: ReviewStage;
  reviewerId: string | null;
  assignedReviewerId: string | null;
  reviewerType: ReviewerType | string;
  scores: Record<string, unknown>;
  decision: string | null;
  comment: string | null;
  revisedAnswers: Record<string, unknown> | null;
  rawPrompt: string | null;
  rawOutput: string | null;
  structuredOutput: Record<string, unknown> | null;
  modelMetadata: Record<string, unknown> | null;
  retryCount: number;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
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

type FinalReviewSubmissionRecord = {
  id: string;
  assignmentId: string;
  status: SubmissionStatus;
  round: number;
  answers: Record<string, unknown>;
  schemaVersion: string;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  assignment: {
    id: string;
    taskId: string;
    taskItemId: string;
    assigneeId: string;
    status: AssignmentStatus;
    task: {
      id: string;
      title: string;
      template: {
        id: string;
        name: string;
        datasetKind: DatasetKind;
        schemaVersion: string;
      };
    };
    taskItem: {
      id: string;
      externalId: string;
      datasetKind: DatasetKind;
      rawData: Record<string, unknown>;
    };
  };
  reviewRecords: ReviewRecordRecord[];
  auditLogs: AuditLogRecord[];
};

export type FinalReviewActionInput = {
  actorId?: string;
  comment?: string;
};

export type FinalRejectInput = {
  actorId?: string;
  reason: string;
};

type FinalReviewPrismaClient = {
  submission: {
    findMany: (args?: { where?: Record<string, unknown>; include?: unknown; orderBy?: unknown }) => Promise<FinalReviewSubmissionRecord[]>;
    findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<FinalReviewSubmissionRecord | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown>; include?: unknown }) => Promise<FinalReviewSubmissionRecord>;
  };
  assignment: {
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  reviewRecord: {
    create: (args: { data: Record<string, unknown> }) => Promise<ReviewRecordRecord>;
  };
  auditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
  $transaction: <TResult>(callback: (client: FinalReviewPrismaClient) => Promise<TResult>) => Promise<TResult>;
};

const FINAL_REVIEW_SUBMISSION_INCLUDE = {
  assignment: {
    include: {
      task: {
        include: {
          template: {
            select: {
              id: true,
              name: true,
              datasetKind: true,
              schemaVersion: true,
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
  auditLogs: {
    orderBy: { createdAt: 'desc' },
  },
} as const;

@Injectable()
export class FinalReviewService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: FinalReviewPrismaClient,
  ) {}

  async listFinalPending(): Promise<ReviewQueueItemDto[]> {
    const submissions = await this.prisma.submission.findMany({
      where: { status: 'FINAL_PENDING' },
      include: FINAL_REVIEW_SUBMISSION_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { submittedAt: 'desc' }],
    });

    return submissions.map(toQueueItemDto);
  }

  async finalPass(submissionId: string, input: FinalReviewActionInput = {}): Promise<ReviewDetailDto> {
    return runInTransaction(this.prisma, async (client) => {
      const submission = await this.findFinalReviewableSubmission(client, submissionId);
      await createFinalReviewRecord(client, submission, {
        actorId: input.actorId,
        decision: 'final_pass',
        comment: input.comment?.trim() || '终审通过，可进入导出。',
      });
      await client.submission.update({
        where: { id: submission.id },
        data: { status: 'FINAL_APPROVED' },
      });
      await writeFinalReviewAudit(client, submission, {
        actorId: input.actorId,
        fromStatus: submission.status,
        toStatus: 'FINAL_APPROVED',
        reason: input.comment,
        metadata: { action: 'FINAL_REVIEW_APPROVED' },
      });

      return toReviewDetailDto(await this.findSubmissionOrThrow(client, submission.id));
    });
  }

  async finalReject(submissionId: string, input: FinalRejectInput): Promise<ReviewDetailDto> {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: 'FINAL_REVIEW_REJECT_REASON_REQUIRED',
        message: '终审打回必须填写理由。',
      });
    }

    return runInTransaction(this.prisma, async (client) => {
      const submission = await this.findFinalReviewableSubmission(client, submissionId);
      await createFinalReviewRecord(client, submission, {
        actorId: input.actorId,
        decision: 'final_reject',
        comment: reason,
      });
      await client.submission.update({
        where: { id: submission.id },
        data: { status: 'NEEDS_REVISION' },
      });
      await client.assignment.update({
        where: { id: submission.assignmentId },
        data: { status: 'NEEDS_REVISION' },
      });
      await writeFinalReviewAudit(client, submission, {
        actorId: input.actorId,
        fromStatus: submission.status,
        toStatus: 'NEEDS_REVISION',
        reason,
        metadata: { action: 'FINAL_REVIEW_REJECTED' },
      });

      return toReviewDetailDto(await this.findSubmissionOrThrow(client, submission.id));
    });
  }

  private async findFinalReviewableSubmission(
    client: FinalReviewPrismaClient,
    submissionId: string,
  ): Promise<FinalReviewSubmissionRecord> {
    const submission = await this.findSubmissionOrThrow(client, submissionId);
    if (submission.status !== 'FINAL_PENDING') {
      throw new BadRequestException({
        code: 'SUBMISSION_NOT_FINAL_REVIEWABLE',
        message: '只有待终审的提交可以执行终审。',
      });
    }

    return submission;
  }

  private async findSubmissionOrThrow(
    client: FinalReviewPrismaClient,
    submissionId: string,
  ): Promise<FinalReviewSubmissionRecord> {
    const submission = await client.submission.findUnique({
      where: { id: submissionId },
      include: FINAL_REVIEW_SUBMISSION_INCLUDE,
    });

    if (!submission) {
      throw new NotFoundException({
        code: 'FINAL_REVIEW_SUBMISSION_NOT_FOUND',
        message: '终审提交不存在或已被删除。',
      });
    }

    return submission;
  }
}

async function createFinalReviewRecord(
  client: FinalReviewPrismaClient,
  submission: FinalReviewSubmissionRecord,
  input: {
    actorId?: string;
    decision: string;
    comment: string;
  },
): Promise<ReviewRecordRecord> {
  return client.reviewRecord.create({
    data: {
      submissionId: submission.id,
      stage: 'FINAL',
      reviewerType: 'HUMAN',
      reviewerId: input.actorId,
      assignedReviewerId: latestAssignedReviewerId(submission.reviewRecords),
      scores: {},
      decision: input.decision,
      comment: input.comment,
    },
  });
}

async function writeFinalReviewAudit(
  client: FinalReviewPrismaClient,
  submission: FinalReviewSubmissionRecord,
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
      taskId: submission.assignment.taskId,
      submissionId: submission.id,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actorId: input.actorId,
      reason: input.reason,
      metadata: input.metadata,
    },
  });
}

function toQueueItemDto(submission: FinalReviewSubmissionRecord): ReviewQueueItemDto {
  const aiReview = latestRecord(submission.reviewRecords, 'AI_PRECHECK', 'AI');

  return {
    submissionId: submission.id,
    assignmentId: submission.assignmentId,
    taskId: submission.assignment.task.id,
    taskTitle: submission.assignment.task.title,
    taskItemId: submission.assignment.taskItem.id,
    externalId: submission.assignment.taskItem.externalId,
    datasetKind: submission.assignment.task.template.datasetKind,
    status: submission.status,
    round: submission.round,
    aiDecision: aiReview?.decision ?? null,
    aiComment: aiReview?.comment ?? null,
    aiScores: aiReview?.scores ?? {},
    assignedReviewerId: latestAssignedReviewerId(submission.reviewRecords),
    submittedAt: submission.submittedAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
  };
}

function toReviewDetailDto(submission: FinalReviewSubmissionRecord): ReviewDetailDto {
  const aiReview = latestRecord(submission.reviewRecords, 'AI_PRECHECK', 'AI');
  const humanReview = latestRecord(submission.reviewRecords, 'RECHECK', 'HUMAN');

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
    assignment: {
      id: submission.assignment.id,
      assigneeId: submission.assignment.assigneeId,
      status: submission.assignment.status,
    },
    task: {
      id: submission.assignment.task.id,
      title: submission.assignment.task.title,
      datasetKind: submission.assignment.task.template.datasetKind,
      templateName: submission.assignment.task.template.name,
    },
    taskItem: {
      id: submission.assignment.taskItem.id,
      externalId: submission.assignment.taskItem.externalId,
      datasetKind: submission.assignment.taskItem.datasetKind,
      rawData: submission.assignment.taskItem.rawData,
    },
    aiReview: aiReview ? toReviewRecordDto(aiReview) : null,
    humanReview: humanReview ? toReviewRecordDto(humanReview) : null,
    reviewRecords: submission.reviewRecords.map(toReviewRecordDto),
    timeline: buildTimeline(submission),
  };
}

function toReviewRecordDto(record: ReviewRecordRecord): ReviewRecordDto {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function buildTimeline(submission: FinalReviewSubmissionRecord): ReviewTimelineItemDto[] {
  const auditItems = submission.auditLogs.map((log) => ({
    id: log.id,
    kind: 'audit' as const,
    label: auditLabel(log),
    actorId: log.actorId,
    fromStatus: log.fromStatus,
    toStatus: log.toStatus,
    reason: log.reason,
    metadata: log.metadata,
    createdAt: log.createdAt.toISOString(),
  }));
  const reviewItems = submission.reviewRecords.map((record) => ({
    id: record.id,
    kind: 'review' as const,
    label: reviewLabel(record),
    actorId: record.reviewerId,
    fromStatus: null,
    toStatus: record.decision,
    reason: record.comment,
    metadata: {
      stage: record.stage,
      reviewerType: record.reviewerType,
      assignedReviewerId: record.assignedReviewerId,
    },
    createdAt: record.createdAt.toISOString(),
  }));

  return [...auditItems, ...reviewItems].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function latestRecord(
  records: ReviewRecordRecord[],
  stage: ReviewStage,
  reviewerType: ReviewerType,
): ReviewRecordRecord | null {
  return records.find((record) => record.stage === stage && record.reviewerType === reviewerType) ?? null;
}

function latestAssignedReviewerId(records: ReviewRecordRecord[]): string | null {
  return records.find((record) => record.stage === 'RECHECK' && record.assignedReviewerId)?.assignedReviewerId ?? null;
}

function auditLabel(log: AuditLogRecord): string {
  const action = log.metadata?.action;
  if (action === 'FINAL_REVIEW_APPROVED') {
    return '终审通过';
  }
  if (action === 'FINAL_REVIEW_REJECTED') {
    return '终审打回';
  }

  return '终审状态更新';
}

function reviewLabel(record: ReviewRecordRecord): string {
  if (record.decision === 'final_pass') {
    return '终审通过';
  }
  if (record.decision === 'final_reject') {
    return '终审打回';
  }
  if (record.reviewerType === 'AI') {
    return 'AI 自动预审';
  }
  if (record.stage === 'RECHECK') {
    return '人工复审记录';
  }

  return '终审记录';
}

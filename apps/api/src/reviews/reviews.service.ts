import { BadRequestException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DatasetKind } from '@labelhub/shared';

import { PrismaService } from '../prisma/prisma.service.ts';
import { resolveErrorEnvelope } from '../common/filters/http-error-envelope.filter.ts';
import { runInTransaction } from '../common/transactions/run-in-transaction.ts';

type ReviewStage = 'AI_PRECHECK' | 'RECHECK' | 'FINAL';
type ReviewerType = 'AI' | 'HUMAN';
type SubmissionStatus =
  | 'HUMAN_PENDING'
  | 'RECHECK_REVIEWING'
  | 'FINAL_APPROVED'
  | 'NEEDS_REVISION'
  | string;
type AssignmentStatus =
  | 'SUBMITTED'
  | 'UNDER_RECHECK'
  | 'FINAL_APPROVED'
  | 'NEEDS_REVISION'
  | string;

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

type ReviewSubmissionRecord = {
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

export type ReviewQueueItemDto = {
  submissionId: string;
  assignmentId: string;
  taskId: string;
  taskTitle: string;
  taskItemId: string;
  externalId: string;
  datasetKind: DatasetKind;
  status: SubmissionStatus;
  round: number;
  aiDecision: string | null;
  aiComment: string | null;
  aiScores: Record<string, unknown>;
  assignedReviewerId: string | null;
  submittedAt: string;
  updatedAt: string;
};

export type ReviewRecordDto = Omit<ReviewRecordRecord, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

export type ReviewTimelineItemDto = {
  id: string;
  kind: 'audit' | 'review';
  label: string;
  actorId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type ReviewDetailDto = {
  submission: {
    id: string;
    assignmentId: string;
    status: SubmissionStatus;
    round: number;
    answers: Record<string, unknown>;
    schemaVersion: string;
    submittedAt: string;
  };
  assignment: {
    id: string;
    assigneeId: string;
    status: AssignmentStatus;
  };
  task: {
    id: string;
    title: string;
    datasetKind: DatasetKind;
    templateName: string;
  };
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: DatasetKind;
    rawData: Record<string, unknown>;
  };
  aiReview: ReviewRecordDto | null;
  humanReview: ReviewRecordDto | null;
  reviewRecords: ReviewRecordDto[];
  timeline: ReviewTimelineItemDto[];
};

export type ReviewActionInput = {
  actorId?: string;
  comment?: string;
};

export type RejectReviewInput = {
  actorId?: string;
  reason: string;
};

export type ReviseAndPassInput = {
  actorId?: string;
  comment?: string;
  revisedAnswers: Record<string, unknown>;
};

export type BatchReviewInput = {
  actorId?: string;
  submissionIds: string[];
  comment?: string;
  reason?: string;
};

export type AssignReviewsInput = {
  actorId?: string;
  reviewerId: string;
  submissionIds: string[];
};

export type BatchReviewItemResultDto =
  | {
      submissionId: string;
      status: 'SUCCEEDED';
      detail: ReviewDetailDto;
    }
  | {
      submissionId: string;
      status: 'FAILED';
      error: {
        code: string;
        message: string;
      };
    };

export type BatchReviewResultDto = {
  processedCount: number;
  failedCount: number;
  submissions: ReviewDetailDto[];
  results: BatchReviewItemResultDto[];
};

type ReviewsPrismaClient = {
  submission: {
    findMany: (args?: { where?: Record<string, unknown>; include?: unknown; orderBy?: unknown }) => Promise<ReviewSubmissionRecord[]>;
    findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<ReviewSubmissionRecord | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown>; include?: unknown }) => Promise<ReviewSubmissionRecord>;
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
  $transaction: <TResult>(callback: (client: ReviewsPrismaClient) => Promise<TResult>) => Promise<TResult>;
};

const REVIEW_SUBMISSION_INCLUDE = {
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

const PENDING_STATUSES = ['HUMAN_PENDING', 'RECHECK_REVIEWING'];
const RESULT_DECISIONS = new Set(['recheck_pass', 'reject', 'revise_pass']);

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ReviewsPrismaClient,
  ) {}

  async listPending(query: { reviewerId?: string; aiDecision?: string } = {}): Promise<ReviewQueueItemDto[]> {
    const submissions = await this.prisma.submission.findMany({
      where: {
        status: { in: PENDING_STATUSES },
      },
      include: REVIEW_SUBMISSION_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { submittedAt: 'desc' }],
    });

    return submissions
      .filter((submission) => {
        const assignedReviewerId = latestAssignedReviewerId(submission.reviewRecords);
        const aiDecision = latestRecord(submission.reviewRecords, 'AI_PRECHECK', 'AI')?.decision ?? null;

        return (
          (!query.reviewerId || assignedReviewerId === query.reviewerId) &&
          (!query.aiDecision || aiDecision === query.aiDecision)
        );
      })
      .map(toQueueItemDto);
  }

  async listResults(query: { verdict?: string } = {}): Promise<ReviewQueueItemDto[]> {
    const submissions = await this.prisma.submission.findMany({
      include: REVIEW_SUBMISSION_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { submittedAt: 'desc' }],
    });

    return submissions
      .filter((submission) => {
        const humanReview = latestRecord(submission.reviewRecords, 'RECHECK', 'HUMAN');
        return humanReview && RESULT_DECISIONS.has(humanReview.decision ?? '') && (!query.verdict || humanReview.decision === query.verdict);
      })
      .map(toQueueItemDto);
  }

  async getReview(submissionId: string): Promise<ReviewDetailDto> {
    return toReviewDetailDto(await this.findSubmissionOrThrow(this.prisma, submissionId));
  }

  async getTimeline(submissionId: string): Promise<ReviewTimelineItemDto[]> {
    return (await this.getReview(submissionId)).timeline;
  }

  async startReview(submissionId: string, input: { actorId?: string } = {}): Promise<ReviewDetailDto> {
    return runInTransaction(this.prisma, async (client) => {
      const submission = await this.findReviewableSubmission(client, submissionId);
      if (submission.status === 'RECHECK_REVIEWING') {
        return toReviewDetailDto(submission);
      }

      await client.submission.update({
        where: { id: submission.id },
        data: { status: 'RECHECK_REVIEWING' },
      });
      await client.assignment.update({
        where: { id: submission.assignmentId },
        data: { status: 'UNDER_RECHECK' },
      });
      await writeReviewAudit(client, submission, {
        actorId: input.actorId,
        fromStatus: submission.status,
        toStatus: 'RECHECK_REVIEWING',
        metadata: { action: 'HUMAN_REVIEW_STARTED' },
      });

      return toReviewDetailDto(await this.findSubmissionOrThrow(client, submission.id));
    });
  }

  async passReview(submissionId: string, input: ReviewActionInput = {}): Promise<ReviewDetailDto> {
    return runInTransaction(this.prisma, async (client) => {
      const submission = await this.ensureReviewing(client, submissionId, input.actorId);
      await createHumanReviewRecord(client, submission, {
        actorId: input.actorId,
        decision: 'recheck_pass',
        comment: input.comment?.trim() || '复审通过，标注结果已完成。',
      });
      await client.submission.update({
        where: { id: submission.id },
        data: { status: 'FINAL_APPROVED' },
      });
      await client.assignment.update({
        where: { id: submission.assignmentId },
        data: { status: 'FINAL_APPROVED' },
      });
      await writeReviewAudit(client, submission, {
        actorId: input.actorId,
        fromStatus: submission.status,
        toStatus: 'FINAL_APPROVED',
        reason: input.comment,
        metadata: { action: 'HUMAN_REVIEW_APPROVED' },
      });

      return toReviewDetailDto(await this.findSubmissionOrThrow(client, submission.id));
    });
  }

  async rejectReview(submissionId: string, input: RejectReviewInput): Promise<ReviewDetailDto> {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: 'REVIEW_REJECT_REASON_REQUIRED',
        message: '打回必须填写理由。',
      });
    }

    return runInTransaction(this.prisma, async (client) => {
      const submission = await this.ensureReviewing(client, submissionId, input.actorId);
      await createHumanReviewRecord(client, submission, {
        actorId: input.actorId,
        decision: 'reject',
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
      await writeReviewAudit(client, submission, {
        actorId: input.actorId,
        fromStatus: submission.status,
        toStatus: 'NEEDS_REVISION',
        reason,
        metadata: { action: 'HUMAN_REVIEW_REJECTED' },
      });

      return toReviewDetailDto(await this.findSubmissionOrThrow(client, submission.id));
    });
  }

  async reviseAndPass(submissionId: string, input: ReviseAndPassInput): Promise<ReviewDetailDto> {
    if (!isRecord(input.revisedAnswers)) {
      throw new BadRequestException({
        code: 'REVIEW_REVISED_ANSWERS_INVALID',
        message: '直接修订必须提供修订后的答案对象。',
      });
    }

    return runInTransaction(this.prisma, async (client) => {
      const submission = await this.ensureReviewing(client, submissionId, input.actorId);
      await createHumanReviewRecord(client, submission, {
        actorId: input.actorId,
        decision: 'revise_pass',
        comment: input.comment?.trim() || '已直接修订并完成入库。',
        revisedAnswers: input.revisedAnswers,
      });
      await client.submission.update({
        where: { id: submission.id },
        data: {
          status: 'FINAL_APPROVED',
          answers: input.revisedAnswers,
        },
      });
      await client.assignment.update({
        where: { id: submission.assignmentId },
        data: { status: 'FINAL_APPROVED' },
      });
      await writeReviewAudit(client, submission, {
        actorId: input.actorId,
        fromStatus: submission.status,
        toStatus: 'FINAL_APPROVED',
        reason: input.comment,
        metadata: {
          action: 'HUMAN_REVIEW_REVISED_APPROVED',
          originalAnswers: submission.answers,
          revisedAnswers: input.revisedAnswers,
        },
      });

      return toReviewDetailDto(await this.findSubmissionOrThrow(client, submission.id));
    });
  }

  async batchPass(input: BatchReviewInput): Promise<BatchReviewResultDto> {
    const submissionIds = normalizeSubmissionIds(input.submissionIds);
    const result = await executeBatchReviewAction(submissionIds, (submissionId) =>
      this.passReview(submissionId, { actorId: input.actorId, comment: input.comment }),
    );
    if (result.processedCount > 0) {
      await writeBatchAudit(
        this.prisma,
        result.submissions.map((submission) => submission.submission.id),
        input.actorId,
        'FINAL_APPROVED',
        'HUMAN_REVIEW_BULK_APPROVED',
        input.comment,
      );
    }

    return result;
  }

  async batchReject(input: BatchReviewInput): Promise<BatchReviewResultDto> {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: 'REVIEW_BULK_REJECT_REASON_REQUIRED',
        message: '批量打回必须填写统一理由。',
      });
    }

    const submissionIds = normalizeSubmissionIds(input.submissionIds);
    const result = await executeBatchReviewAction(submissionIds, (submissionId) =>
      this.rejectReview(submissionId, { actorId: input.actorId, reason }),
    );
    if (result.processedCount > 0) {
      await writeBatchAudit(
        this.prisma,
        result.submissions.map((submission) => submission.submission.id),
        input.actorId,
        'NEEDS_REVISION',
        'HUMAN_REVIEW_BULK_REJECTED',
        reason,
      );
    }

    return result;
  }

  async assignReviews(input: AssignReviewsInput): Promise<BatchReviewResultDto> {
    if (!input.reviewerId?.trim()) {
      throw new BadRequestException({
        code: 'REVIEW_ASSIGN_REVIEWER_REQUIRED',
        message: '指派审核员不能为空。',
      });
    }

    const submissionIds = normalizeSubmissionIds(input.submissionIds);
    const result = await executeBatchReviewAction(submissionIds, (submissionId) =>
      this.assignOneReview(submissionId, input.reviewerId, input.actorId),
    );
    if (result.processedCount > 0) {
      await writeBatchAudit(
        this.prisma,
        result.submissions.map((submission) => submission.submission.id),
        input.actorId,
        'HUMAN_PENDING',
        'HUMAN_REVIEW_ASSIGNED',
        `指派给 ${input.reviewerId}`,
      );
    }

    return result;
  }

  private async assignOneReview(submissionId: string, reviewerId: string, actorId?: string): Promise<ReviewDetailDto> {
    return runInTransaction(this.prisma, async (client) => {
      const submission = await this.findReviewableSubmission(client, submissionId);
      await createHumanReviewRecord(client, submission, {
        actorId,
        assignedReviewerId: reviewerId,
        decision: 'assigned',
        comment: '已指派审核员。',
      });
      await writeReviewAudit(client, submission, {
        actorId,
        fromStatus: submission.status,
        toStatus: submission.status,
        reason: `指派给 ${reviewerId}`,
        metadata: {
          action: 'HUMAN_REVIEW_ASSIGNED',
          reviewerId,
        },
      });

      return toReviewDetailDto(await this.findSubmissionOrThrow(client, submission.id));
    });
  }

  private async ensureReviewing(
    client: ReviewsPrismaClient,
    submissionId: string,
    actorId?: string,
  ): Promise<ReviewSubmissionRecord> {
    const submission = await this.findReviewableSubmission(client, submissionId);
    if (submission.status === 'RECHECK_REVIEWING') {
      return submission;
    }

    await client.submission.update({
      where: { id: submission.id },
      data: { status: 'RECHECK_REVIEWING' },
    });
    await client.assignment.update({
      where: { id: submission.assignmentId },
      data: { status: 'UNDER_RECHECK' },
    });
    await writeReviewAudit(client, submission, {
      actorId,
      fromStatus: submission.status,
      toStatus: 'RECHECK_REVIEWING',
      metadata: { action: 'HUMAN_REVIEW_STARTED' },
    });

    return this.findSubmissionOrThrow(client, submission.id);
  }

  private async findReviewableSubmission(client: ReviewsPrismaClient, submissionId: string): Promise<ReviewSubmissionRecord> {
    const submission = await this.findSubmissionOrThrow(client, submissionId);
    if (!PENDING_STATUSES.includes(submission.status)) {
      throw new BadRequestException({
        code: 'SUBMISSION_NOT_REVIEWABLE',
        message: '只有待人工复审或复审中的提交可以执行人工复审。',
      });
    }

    return submission;
  }

  private async findSubmissionOrThrow(
    client: ReviewsPrismaClient,
    submissionId: string,
  ): Promise<ReviewSubmissionRecord> {
    const submission = await client.submission.findUnique({
      where: { id: submissionId },
      include: REVIEW_SUBMISSION_INCLUDE,
    });

    if (!submission) {
      throw new NotFoundException({
        code: 'REVIEW_SUBMISSION_NOT_FOUND',
        message: '审核提交不存在或已被删除。',
      });
    }

    return submission;
  }
}

async function executeBatchReviewAction(
  submissionIds: string[],
  action: (submissionId: string) => Promise<ReviewDetailDto>,
): Promise<BatchReviewResultDto> {
  const submissions: ReviewDetailDto[] = [];
  const results: BatchReviewItemResultDto[] = [];

  for (const submissionId of submissionIds) {
    try {
      const detail = await action(submissionId);
      submissions.push(detail);
      results.push({ submissionId, status: 'SUCCEEDED', detail });
    } catch (error) {
      results.push({
        submissionId,
        status: 'FAILED',
        error: toBatchReviewError(error),
      });
    }
  }

  return {
    processedCount: submissions.length,
    failedCount: results.length - submissions.length,
    submissions,
    results,
  };
}

function toBatchReviewError(error: unknown): { code: string; message: string } {
  if (error instanceof HttpException) {
    return resolveErrorEnvelope(error.getResponse(), error.getStatus());
  }

  return {
    code: 'BATCH_REVIEW_ITEM_FAILED',
    message: '单条审核处理失败，请稍后重试。',
  };
}

async function createHumanReviewRecord(
  client: ReviewsPrismaClient,
  submission: ReviewSubmissionRecord,
  input: {
    actorId?: string;
    assignedReviewerId?: string;
    decision: string;
    comment?: string;
    revisedAnswers?: Record<string, unknown>;
  },
): Promise<ReviewRecordRecord> {
  return client.reviewRecord.create({
    data: {
      submissionId: submission.id,
      stage: 'RECHECK',
      reviewerType: 'HUMAN',
      reviewerId: input.actorId,
      assignedReviewerId: input.assignedReviewerId ?? latestAssignedReviewerId(submission.reviewRecords),
      scores: {},
      decision: input.decision,
      comment: input.comment,
      revisedAnswers: input.revisedAnswers,
    },
  });
}

async function writeReviewAudit(
  client: ReviewsPrismaClient,
  submission: ReviewSubmissionRecord,
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

async function writeBatchAudit(
  client: ReviewsPrismaClient,
  submissionIds: string[],
  actorId: string | undefined,
  toStatus: string,
  action: string,
  reason?: string,
): Promise<void> {
  await client.auditLog.create({
    data: {
      submissionId: submissionIds[0],
      toStatus,
      actorId,
      reason,
      metadata: {
        action,
        submissionIds,
        count: submissionIds.length,
      },
    },
  });
}

function toQueueItemDto(submission: ReviewSubmissionRecord): ReviewQueueItemDto {
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

function toReviewDetailDto(submission: ReviewSubmissionRecord): ReviewDetailDto {
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

function buildTimeline(submission: ReviewSubmissionRecord): ReviewTimelineItemDto[] {
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

function normalizeSubmissionIds(submissionIds: string[]): string[] {
  const normalized = Array.from(new Set(submissionIds.map((id) => id.trim()).filter(Boolean)));
  if (normalized.length === 0) {
    throw new BadRequestException({
      code: 'REVIEW_SUBMISSIONS_REQUIRED',
      message: '请选择需要处理的审核提交。',
    });
  }

  return normalized;
}

function auditLabel(log: AuditLogRecord): string {
  const action = log.metadata?.action;
  if (action === 'HUMAN_REVIEW_STARTED') {
    return '开始人工复审';
  }
  if (action === 'HUMAN_REVIEW_APPROVED' || action === 'HUMAN_REVIEW_BULK_APPROVED') {
    return '人工复审通过';
  }
  if (action === 'HUMAN_REVIEW_REJECTED' || action === 'HUMAN_REVIEW_BULK_REJECTED') {
    return '人工复审打回';
  }
  if (action === 'HUMAN_REVIEW_REVISED_APPROVED') {
    return '人工直接修订通过';
  }
  if (action === 'HUMAN_REVIEW_ASSIGNED') {
    return '指派审核员';
  }

  return '审核状态更新';
}

function reviewLabel(record: ReviewRecordRecord): string {
  if (record.reviewerType === 'AI') {
    return 'AI 自动预审';
  }
  if (record.decision === 'assigned') {
    return '人工审核指派';
  }
  if (record.decision === 'recheck_pass') {
    return '人工复审通过';
  }
  if (record.decision === 'reject') {
    return '人工复审打回';
  }
  if (record.decision === 'revise_pass') {
    return '人工修订通过';
  }

  return '人工审核记录';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

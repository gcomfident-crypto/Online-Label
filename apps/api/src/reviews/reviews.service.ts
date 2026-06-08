import { BadRequestException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DatasetKind, LabelHubSchema } from '@labelhub/shared';

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
      deadline: Date | null;
      template: {
        id: string;
        name: string;
        datasetKind: DatasetKind;
        schemaVersion: string;
        schema: LabelHubSchema | null;
      } | null;
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

type TaskDisplayRecord = {
  id: string;
  createdAt: Date;
};

export type ReviewQueueItemDto = {
  submissionId: string;
  assignmentId: string;
  taskId: string;
  taskDisplayId: string;
  taskTitle: string;
  taskItemId: string;
  externalId: string;
  datasetKind: DatasetKind;
  status: SubmissionStatus;
  round: number;
  aiDecision: string | null;
  aiComment: string | null;
  aiScores: Record<string, unknown>;
  humanDecision: string | null;
  assignedReviewerId: string | null;
  deadline: string | null;
  submittedAt: string;
  updatedAt: string;
  roundStatus: string;
  totalInRound: number;
  decidedCount: number;
  needsRevisionCount: number;
  pendingCount: number;
};

type ReviewQueueRoundProgress = {
  roundStatus: string;
  totalInRound: number;
  decidedCount: number;
  needsRevisionCount: number;
  pendingCount: number;
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
    schema: LabelHubSchema | null;
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
  fieldReviews?: ReviewFieldReviewInput[];
};

export type ReviewFieldReviewInput = {
  fieldKey: string;
  label?: string;
  comment: string;
  value?: unknown;
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
  task: {
    findMany: (args: { select: { id: true; createdAt: true }; orderBy: Array<{ createdAt: 'asc' } | { id: 'asc' }> }) => Promise<TaskDisplayRecord[]>;
  };
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
  auditLogs: {
    orderBy: { createdAt: 'desc' },
  },
} as const;

const PENDING_STATUSES = ['HUMAN_PENDING', 'RECHECK_REVIEWING'];
const REVIEW_QUEUE_SCOPE_STATUSES = [...PENDING_STATUSES, 'NEEDS_REVISION', 'FINAL_APPROVED'];
const RESULT_DECISIONS = new Set(['recheck_pass', 'reject', 'revise_pass']);
const ROUND_STATUS_IN_PROGRESS = 'in_progress';
const ROUND_STATUS_PARTIAL_DECIDED = 'partial_decided';
const ROUND_STATUS_NEEDS_REVISION = 'needs_revision';
const ROUND_STATUS_COMPLETED = 'completed';

const EMPTY_ROUND_PROGRESS: ReviewQueueRoundProgress = {
  roundStatus: ROUND_STATUS_IN_PROGRESS,
  totalInRound: 0,
  decidedCount: 0,
  needsRevisionCount: 0,
  pendingCount: 0,
};

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ReviewsPrismaClient,
  ) {}

  async listPending(query: { reviewerId?: string; aiDecision?: string } = {}): Promise<ReviewQueueItemDto[]> {
    const submissions = await this.prisma.submission.findMany({
      where: {
        status: { in: REVIEW_QUEUE_SCOPE_STATUSES },
      },
      include: REVIEW_SUBMISSION_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { submittedAt: 'desc' }],
    });

    const latestRoundSubmissions = pickLatestRoundSubmissionPerAssignment(submissions);

    const submissionsByScope = new Map<string, ReviewSubmissionRecord[]>();
    for (const submission of latestRoundSubmissions) {
      const key = roundScopeKey(submission.assignment.task.id, submission.round);
      const list = submissionsByScope.get(key) ?? [];
      list.push(submission);
      submissionsByScope.set(key, list);
    }

    const visibleScopes = new Set<string>(
      [...submissionsByScope.entries()]
        .filter(([, list]) => {
          const matchesReviewer = !query.reviewerId || list.some(
            (submission) => latestAssignedReviewerId(submission.reviewRecords) === query.reviewerId,
          );
          const matchesAiDecision = !query.aiDecision || list.some(
            (submission) => latestRecord(submission.reviewRecords, 'AI_PRECHECK', 'AI')?.decision === query.aiDecision,
          );
          const hasPendingSubmission = list.some((submission) => PENDING_STATUSES.includes(submission.status));
          const hasReviewDecision = list.some(
            (submission) => RESULT_DECISIONS.has(latestHumanDecision(submission) ?? ''),
          );
          const hasNeedsRevision = list.some((submission) => submission.status === 'NEEDS_REVISION');
          const hasFinalSubmission = list.some((submission) => submission.status === 'FINAL_APPROVED');

          if (!matchesReviewer || !matchesAiDecision) {
            return false;
          }

          if (!hasPendingSubmission && !hasReviewDecision && !hasFinalSubmission) {
            return false;
          }

          if (hasNeedsRevision && !hasReviewDecision && !hasFinalSubmission) {
            return false;
          }

          return true;
        })
        .map(([key]) => key),
    );

    const taskDisplayIdByTaskId = await this.createTaskDisplayIdMap();
    const queueItems = latestRoundSubmissions
      .filter((submission) => visibleScopes.has(roundScopeKey(submission.assignment.task.id, submission.round)))
      .map((submission) => toQueueItemDto(
        submission,
        taskDisplayIdByTaskId.get(submission.assignment.task.id) ?? submission.assignment.task.id,
      ));

    const roundProgressByScope = buildRoundProgress(queueItems);

    return queueItems.map((item) => ({
      ...item,
      ...(roundProgressByScope.get(roundScopeKey(item.taskId, item.round)) ?? EMPTY_ROUND_PROGRESS),
    }));
  }

  async listResults(query: { verdict?: string } = {}): Promise<ReviewQueueItemDto[]> {
    const submissions = await this.prisma.submission.findMany({
      include: REVIEW_SUBMISSION_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { submittedAt: 'desc' }],
    });
    const taskDisplayIdByTaskId = await this.createTaskDisplayIdMap();

    return submissions
      .filter((submission) => {
        const humanReview = latestRecord(submission.reviewRecords, 'RECHECK', 'HUMAN');
        return humanReview && RESULT_DECISIONS.has(humanReview.decision ?? '') && (!query.verdict || humanReview.decision === query.verdict);
      })
      .map((submission) => ({
        ...toQueueItemDto(
          submission,
          taskDisplayIdByTaskId.get(submission.assignment.task.id) ?? submission.assignment.task.id,
        ),
        ...EMPTY_ROUND_PROGRESS,
      }));
  }

  private async createTaskDisplayIdMap(): Promise<Map<string, string>> {
    const tasks = await this.prisma.task.findMany({
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return new Map(
      tasks.map((task, index) => [
        task.id,
        isBusinessTaskId(task.id) ? task.id : formatTaskDisplayId(index + 1),
      ]),
    );
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
      await this.finalizeReviewRound(client, submission, input.actorId);

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
        structuredOutput: humanRejectStructuredOutput(reason, input.fieldReviews),
      });
      await this.finalizeReviewRound(client, submission, input.actorId);

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
        comment: input.comment?.trim() || '已直接修订，等待本轮决策收口后完成入库。',
        revisedAnswers: input.revisedAnswers,
      });
      await client.submission.update({
        where: { id: submission.id },
        data: { answers: input.revisedAnswers },
      });
      await this.finalizeReviewRound(client, submission, input.actorId);

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
        'RECHECK_REVIEWING',
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
        'RECHECK_REVIEWING',
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

  private async finalizeReviewRound(
    client: ReviewsPrismaClient,
    submission: ReviewSubmissionRecord,
    actorId?: string,
  ): Promise<void> {
    const submissions = await client.submission.findMany({
      where: {
        assignment: {
          taskId: submission.assignment.taskId,
        },
        round: submission.round,
      },
      include: REVIEW_SUBMISSION_INCLUDE,
    });

    const pendingSubmissions = submissions.filter((item) => PENDING_STATUSES.includes(item.status));
    const unresolvedSubmissions = pendingSubmissions.filter((item) => {
      const decision = latestHumanDecision(item);

      return !RESULT_DECISIONS.has(decision ?? '');
    });

    if (unresolvedSubmissions.length > 0) {
      return;
    }

    for (const roundSubmission of pendingSubmissions) {
      const decision = latestHumanDecision(roundSubmission);
      if (!RESULT_DECISIONS.has(decision ?? '')) {
        continue;
      }

      if (decision === 'reject') {
        await client.submission.update({
          where: { id: roundSubmission.id },
          data: { status: 'NEEDS_REVISION' },
        });
        await client.assignment.update({
          where: { id: roundSubmission.assignmentId },
          data: { status: 'NEEDS_REVISION' },
        });
        await writeReviewAudit(client, roundSubmission, {
          actorId,
          fromStatus: roundSubmission.status,
          toStatus: 'NEEDS_REVISION',
          metadata: { action: 'HUMAN_REVIEW_REJECTED', decision },
        });
      } else {
        await client.submission.update({
          where: { id: roundSubmission.id },
          data: { status: 'FINAL_APPROVED' },
        });
        await client.assignment.update({
          where: { id: roundSubmission.assignmentId },
          data: { status: 'FINAL_APPROVED' },
        });
        await writeReviewAudit(client, roundSubmission, {
          actorId,
          fromStatus: roundSubmission.status,
          toStatus: 'FINAL_APPROVED',
          metadata: {
            action: decision === 'revise_pass' ? 'HUMAN_REVIEW_REVISED_APPROVED' : 'HUMAN_REVIEW_APPROVED',
            decision,
          },
        });
      }
    }
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
    structuredOutput?: Record<string, unknown>;
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
      ...(input.structuredOutput ? { structuredOutput: input.structuredOutput } : {}),
    },
  });
}

function humanRejectStructuredOutput(
  reason: string,
  fieldReviews: ReviewFieldReviewInput[] | undefined,
): Record<string, unknown> | undefined {
  const normalizedFieldReviews = normalizeHumanFieldReviews(fieldReviews);
  if (normalizedFieldReviews.length === 0) {
    return undefined;
  }

  return {
    verdict: 'reject',
    overallComment: reason,
    fieldReviews: normalizedFieldReviews,
  };
}

function normalizeHumanFieldReviews(fieldReviews: ReviewFieldReviewInput[] | undefined): Record<string, unknown>[] {
  if (!Array.isArray(fieldReviews)) {
    return [];
  }

  return fieldReviews.flatMap((fieldReview) => {
    const fieldKey = fieldReview.fieldKey?.trim();
    const comment = fieldReview.comment?.trim();
    if (!fieldKey || !comment) {
      return [];
    }

    const label = fieldReview.label?.trim() || fieldKey;

    return [
      {
        fieldKey,
        label,
        decision: 'reject',
        comment,
        suggestions: [comment],
        ...(Object.prototype.hasOwnProperty.call(fieldReview, 'value') ? { value: fieldReview.value } : {}),
      },
    ];
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

function toQueueItemDto(submission: ReviewSubmissionRecord, taskDisplayId: string): ReviewQueueItemDto {
  const aiReview = latestRecord(submission.reviewRecords, 'AI_PRECHECK', 'AI');
  const humanReview = latestRecord(submission.reviewRecords, 'RECHECK', 'HUMAN');
  const datasetKind = resolveReviewDatasetKind(submission);

  return {
    submissionId: submission.id,
    assignmentId: submission.assignmentId,
    taskId: submission.assignment.task.id,
    taskDisplayId,
    taskTitle: submission.assignment.task.title,
    taskItemId: submission.assignment.taskItem.id,
    externalId: submission.assignment.taskItem.externalId,
    datasetKind,
    status: submission.status,
    round: submission.round,
    aiDecision: aiReview?.decision ?? null,
    aiComment: aiReview?.comment ?? null,
    aiScores: aiReview?.scores ?? {},
    humanDecision: humanReview?.decision ?? null,
    assignedReviewerId: latestAssignedReviewerId(submission.reviewRecords),
    deadline: submission.assignment.task.deadline?.toISOString() ?? null,
    submittedAt: submission.submittedAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
    ...EMPTY_ROUND_PROGRESS,
  };
}

function isBusinessTaskId(taskId: string): boolean {
  return /^T-\d+$/i.test(taskId);
}

function formatTaskDisplayId(sequence: number): string {
  return `T-${sequence.toString().padStart(3, '0')}`;
}

function buildRoundProgress(
  queueItems: Array<{
    taskId: string;
    round: number;
    status: SubmissionStatus;
    humanDecision: string | null;
    totalInRound?: number;
  }>,
): Map<string, ReviewQueueRoundProgress> {
  const statsByScope = new Map<string, ReviewQueueRoundProgress>();

  for (const item of queueItems) {
    if (typeof item.totalInRound === 'number' && item.totalInRound > 0) {
      continue;
    }

    const key = roundScopeKey(item.taskId, item.round);
    const current = statsByScope.get(key) ?? { ...EMPTY_ROUND_PROGRESS };
    const isDecisionMade = isReviewDecisionMade(item);
    const next = {
      ...current,
      totalInRound: current.totalInRound + 1,
      decidedCount: current.decidedCount + (isDecisionMade ? 1 : 0),
      needsRevisionCount: current.needsRevisionCount + (isReviewRejected(item) ? 1 : 0),
      pendingCount: current.pendingCount + (isDecisionMade ? 0 : 1),
    };
    if (next.pendingCount > 0 && next.decidedCount > 0) {
      next.roundStatus = ROUND_STATUS_PARTIAL_DECIDED;
    } else if (next.pendingCount > 0) {
      next.roundStatus = ROUND_STATUS_IN_PROGRESS;
    } else if (next.needsRevisionCount > 0) {
      next.roundStatus = ROUND_STATUS_NEEDS_REVISION;
    } else if (next.decidedCount > 0) {
      next.roundStatus = ROUND_STATUS_COMPLETED;
    } else {
      next.roundStatus = ROUND_STATUS_IN_PROGRESS;
    }

    statsByScope.set(key, next);
  }

  return statsByScope;
}

function isReviewDecisionMade(item: { status: SubmissionStatus; humanDecision: string | null }): boolean {
  return RESULT_DECISIONS.has(item.humanDecision ?? '') || item.status === 'FINAL_APPROVED' || item.status === 'NEEDS_REVISION';
}

function isReviewRejected(item: { status: SubmissionStatus; humanDecision: string | null }): boolean {
  return item.humanDecision === 'reject' || item.status === 'NEEDS_REVISION';
}

function roundScopeKey(taskId: string, round: number): string {
  return `${taskId}::${round}`;
}

function toReviewDetailDto(submission: ReviewSubmissionRecord): ReviewDetailDto {
  const aiReview = latestRecord(submission.reviewRecords, 'AI_PRECHECK', 'AI');
  const humanReview = latestRecord(submission.reviewRecords, 'RECHECK', 'HUMAN');
  const datasetKind = resolveReviewDatasetKind(submission);
  const templateName = submission.assignment.task.template?.name ?? '未关联模板';

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
      datasetKind,
      templateName,
      schema: (submission.assignment.task.template?.schema ?? null) as LabelHubSchema | null,
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

function resolveReviewDatasetKind(submission: ReviewSubmissionRecord): DatasetKind {
  return submission.assignment.task.template?.datasetKind ?? submission.assignment.taskItem.datasetKind;
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
  return records.reduce<ReviewRecordRecord | null>((latest, record) => {
    if (record.stage !== stage || record.reviewerType !== reviewerType) {
      return latest;
    }

    if (!latest || latest.createdAt < record.createdAt) {
      return record;
    }

    return latest;
  }, null);
}

function latestAssignedReviewerId(records: ReviewRecordRecord[]): string | null {
  return records.reduce<ReviewRecordRecord | null>((latest, record) => {
    if (record.stage !== 'RECHECK' || !record.assignedReviewerId) {
      return latest;
    }

    if (!latest || latest.createdAt < record.createdAt) {
      return record;
    }

    return latest;
  }, null)?.assignedReviewerId ?? null;
}

function latestHumanDecision(submission: ReviewSubmissionRecord): string | null {
  return latestRecord(submission.reviewRecords, 'RECHECK', 'HUMAN')?.decision ?? null;
}

function pickLatestRoundSubmissionPerAssignment(
  submissions: ReviewSubmissionRecord[],
): ReviewSubmissionRecord[] {
  const latestByAssignment = new Map<string, ReviewSubmissionRecord>();

  for (const submission of submissions) {
    const latest = latestByAssignment.get(submission.assignmentId);
    if (!latest || submission.round > latest.round) {
      latestByAssignment.set(submission.assignmentId, submission);
    }
  }

  return [...latestByAssignment.values()];
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

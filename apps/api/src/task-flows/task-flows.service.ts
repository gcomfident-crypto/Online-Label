import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DatasetKind, LabelHubSchema } from '@labelhub/shared';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.ts';

export type TaskFlowStage =
  | 'LABELING'
  | 'AI_PRECHECK'
  | 'HUMAN_REVIEW'
  | 'LABELER_REVISION'
  | 'HUMAN_RE_REVIEW'
  | 'FINAL_COMPLETED';

export type TaskFlowAiStatus =
  | 'NOT_STARTED'
  | 'QUEUED'
  | 'RUNNING'
  | 'PASSED'
  | 'REJECTED'
  | 'SUCCEEDED'
  | 'FAILED';

export type TaskFlowReviewerStatus = 'NOT_STARTED' | 'PENDING' | 'PASSED' | 'REJECTED';
export type TaskFlowLabelerStatus = 'NOT_STARTED' | 'LOCKED' | 'NEEDS_REVISION' | 'REVISED' | 'NOT_REQUIRED';
export type TaskFlowFinalStatus = 'NOT_FINAL' | 'FINAL_APPROVED';
export type TaskFlowActorRole = 'OWNER' | 'LABELER' | 'AI_AGENT' | 'REVIEWER';
export type TaskFlowLifecycleStepKey =
  | 'OWNER_PUBLISHED'
  | 'LABELER_SUBMITTED'
  | 'AI_PRECHECK'
  | 'REVIEWER_CHECK'
  | 'TASK_COMPLETED';
export type TaskFlowLifecycleStepStatus = 'COMPLETED' | 'CURRENT' | 'PENDING' | 'ACTION_REQUIRED' | 'SKIPPED';
export type TaskFlowLogEventType =
  | 'OWNER_PUBLISHED'
  | 'LABELER_CLAIMED'
  | 'LABELER_SUBMITTED'
  | 'LABELER_RESUBMITTED'
  | 'AI_PRECHECK_STARTED'
  | 'AI_PRECHECK_COMPLETED'
  | 'AI_RECHECK_STARTED'
  | 'AI_RECHECK_COMPLETED'
  | 'REVIEWER_RECEIVED'
  | 'REVIEWER_CHECK_COMPLETED'
  | 'REVIEWER_REJECTED'
  | 'TASK_COMPLETED';

export type TaskFlowItemRefDto = {
  itemId: string;
  externalId: string;
  index: number;
};

export type TaskFlowRejectedItemRefDto = TaskFlowItemRefDto;

export type TaskFlowLifecycleStepDto = {
  key: TaskFlowLifecycleStepKey;
  label: string;
  status: TaskFlowLifecycleStepStatus;
  actorRole: TaskFlowActorRole | null;
  actorName: string | null;
  occurredAt: string | null;
};

export type TaskFlowLogDto = {
  id: string;
  taskId: string;
  round: number;
  eventType: TaskFlowLogEventType;
  actorRole: TaskFlowActorRole | null;
  actorName: string | null;
  occurredAt: string;
  message: string;
  itemRefs: TaskFlowItemRefDto[];
  rejectedItemRefs: TaskFlowRejectedItemRefDto[];
};

export type TaskFlowSummaryDto = {
  taskId: string;
  taskTitle: string;
  taskCreatedAt: string;
  templateName: string | null;
  templateVersion: string | null;
  ownerId: string | null;
  ownerName: string | null;
  round: number;
  currentStage: TaskFlowStage;
  totalItems: number;
  submittedItems: number;
  lifecycleSteps: TaskFlowLifecycleStepDto[];
  aiSummary: {
    pending: number;
    queued: number;
    running: number;
    passed: number;
    rejected: number;
    failed: number;
    completed: number;
  };
  reviewerSummary: {
    notStarted: number;
    pending: number;
    decided: number;
    passed: number;
    rejected: number;
  };
  labelerRevisionSummary: {
    notStarted: number;
    editable: number;
    locked: number;
    revised: number;
    notRequired: number;
  };
  finalSummary: {
    completed: number;
    notCompleted: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type TaskFlowReviewRecordDto = {
  id: string;
  stage: string;
  reviewerType: string;
  reviewerId: string | null;
  reviewerName: string | null;
  assignedReviewerId: string | null;
  assignedReviewerName: string | null;
  decision: string | null;
  comment: string | null;
  scores: Record<string, unknown>;
  createdAt: string;
};

export type TaskFlowAiJobDto = {
  id: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  provider: string | null;
  model: string | null;
  lastError: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type TaskFlowItemDto = {
  index: number;
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: DatasetKind;
    rawData: Record<string, unknown>;
  };
  assignment: {
    id: string;
    assigneeId: string;
    assigneeName: string;
    status: string;
  } | null;
  submission: {
    id: string;
    status: string;
    round: number;
    answers: Record<string, unknown>;
    schemaVersion: string;
    submittedAt: string;
  } | null;
  aiStatus: TaskFlowAiStatus;
  aiDecision: 'pass' | 'reject' | null;
  reviewerStatus: TaskFlowReviewerStatus;
  reviewerDecision: 'pass' | 'reject' | null;
  labelerStatus: TaskFlowLabelerStatus;
  finalStatus: TaskFlowFinalStatus;
  aiReview: TaskFlowReviewRecordDto | null;
  humanReview: TaskFlowReviewRecordDto | null;
  latestAiJob: TaskFlowAiJobDto | null;
};

export type TaskFlowDetailDto = TaskFlowSummaryDto & {
  items: TaskFlowItemDto[];
};

type UserSummaryRecord = {
  id: string;
  name: string;
};

type AuditLogRecord = {
  id: string;
  taskId: string | null;
  submissionId: string | null;
  fromStatus: string | null;
  toStatus: string;
  actorId: string | null;
  actor: UserSummaryRecord | null;
  reason: string | null;
  metadata: unknown;
  createdAt: Date;
};

type TaskFlowEventRecord = {
  id: string;
  taskId: string;
  round: number;
  eventType: string;
  actorRole: string | null;
  actorId: string | null;
  actorName: string | null;
  occurredAt: Date;
  message: string;
  rejectedItemRefs: unknown;
  createdAt: Date;
};

type ReviewRecordRecord = {
  id: string;
  stage: string;
  reviewerType: string;
  reviewerId: string | null;
  assignedReviewerId: string | null;
  reviewer?: UserSummaryRecord | null;
  assignedReviewer?: UserSummaryRecord | null;
  decision: string | null;
  comment: string | null;
  scores: unknown;
  createdAt: Date;
};

type AiReviewJobRecord = {
  id: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  provider: string | null;
  model: string | null;
  lastError: string | null;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  updatedAt: Date;
};

type SubmissionRecord = {
  id: string;
  status: string;
  round: number;
  answers: unknown;
  schemaVersion: string;
  submittedAt: Date;
  reviewRecords: ReviewRecordRecord[];
  aiReviewJobs: AiReviewJobRecord[];
  auditLogs: AuditLogRecord[];
};

type AssignmentRecord = {
  id: string;
  assigneeId: string;
  status: string;
  assignee: UserSummaryRecord;
  submissions: SubmissionRecord[];
  claimedAt?: Date;
  updatedAt: Date;
};

type TaskItemRecord = {
  id: string;
  externalId: string;
  datasetKind: DatasetKind;
  rawData: unknown;
  status: string;
  sortOrder: number;
  assignments: AssignmentRecord[];
};

type TaskFlowTaskRecord = {
  id: string;
  title: string;
  status: string;
  aiPreReviewEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
  createdBy: UserSummaryRecord | null;
  template: {
    name: string;
    schemaVersion: string;
    schema: LabelHubSchema | null;
  } | null;
  auditLogs: AuditLogRecord[];
  flowEvents: TaskFlowEventRecord[];
  items: TaskItemRecord[];
};

type RoundSubmissionContext = {
  index: number;
  item: TaskItemRecord;
  assignment: AssignmentRecord;
  submission: SubmissionRecord;
};

const TASK_FLOW_INCLUDE = {
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
  auditLogs: {
    include: {
      actor: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
  flowEvents: {
    orderBy: { occurredAt: 'asc' },
  },
  items: {
    include: {
      assignments: {
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
            },
          },
          submissions: {
            include: {
              reviewRecords: {
                include: {
                  reviewer: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                  assignedReviewer: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
                orderBy: { createdAt: 'desc' },
              },
              aiReviewJobs: {
                orderBy: [{ updatedAt: 'desc' }, { queuedAt: 'desc' }],
              },
              auditLogs: {
                include: {
                  actor: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
                orderBy: { createdAt: 'asc' },
              },
            },
            orderBy: [{ round: 'asc' }, { submittedAt: 'asc' }],
          },
        },
        orderBy: { updatedAt: 'desc' },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { externalId: 'asc' }],
  },
} satisfies Prisma.TaskInclude;

@Injectable()
export class TaskFlowsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async listTaskFlows(): Promise<TaskFlowSummaryDto[]> {
    const tasks = await this.prisma.task.findMany({
      include: TASK_FLOW_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    }) as unknown as TaskFlowTaskRecord[];

    return tasks
      .filter((task) => shouldExposeTaskFlow(task))
      .map((task) => toTaskFlowDetail(task))
      .map(({ items: _items, ...summary }) => summary)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getTaskFlow(taskId: string, query: { round?: number } = {}): Promise<TaskFlowDetailDto> {
    const task = await this.findTaskFlowTaskOrThrow(taskId);

    return toTaskFlowDetail(task, query.round);
  }

  async getTaskFlowLogs(taskId: string): Promise<TaskFlowLogDto[]> {
    const task = await this.findTaskFlowTaskOrThrow(taskId);

    return toTaskFlowLogs(task);
  }

  private async findTaskFlowTaskOrThrow(taskId: string): Promise<TaskFlowTaskRecord> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: TASK_FLOW_INCLUDE,
    }) as unknown as TaskFlowTaskRecord | null;

    if (!task) {
      throw new NotFoundException({
        code: 'TASK_FLOW_NOT_FOUND',
        message: '任务质检流转记录不存在或已被删除。',
      });
    }

    if (!shouldExposeTaskFlow(task)) {
      throw new NotFoundException({
        code: 'TASK_FLOW_NOT_AVAILABLE',
        message: '该任务尚未进入质检流转台。',
      });
    }

    return task;
  }
}

function shouldExposeTaskFlow(task: TaskFlowTaskRecord): boolean {
  return task.status !== 'DRAFT';
}

function toTaskFlowDetail(task: TaskFlowTaskRecord, requestedRound?: number): TaskFlowDetailDto {
  const round = requestedRound ?? currentRoundForTask(task);
  const baseItems: TaskFlowItemDto[] = task.items.map((item, index) => toTaskFlowItem(item, index, round));
  const stage = currentStageForItems(baseItems, task.items.length, round, task.aiPreReviewEnabled);
  const items: TaskFlowItemDto[] = stage === 'LABELER_REVISION'
    ? baseItems.map((item): TaskFlowItemDto => item.labelerStatus === 'NOT_REQUIRED' ? { ...item, labelerStatus: 'LOCKED' } : item)
    : baseItems;
  const submittedItems = items.filter((item) => item.submission !== null).length;
  const aiSummary = summarizeAi(items);
  const reviewerSummary = summarizeReviewer(items);
  const labelerRevisionSummary = summarizeLabeler(items);
  const finalSummary = summarizeFinal(items, task.items.length);

  return {
    taskId: task.id,
    taskTitle: task.title,
    taskCreatedAt: task.createdAt.toISOString(),
    templateName: task.template?.name ?? null,
    templateVersion: task.template?.schemaVersion ?? null,
    ownerId: task.createdBy?.id ?? task.createdById,
    ownerName: task.createdBy?.name ?? null,
    round,
    currentStage: stage,
    totalItems: task.items.length,
    submittedItems,
    lifecycleSteps: buildLifecycleSteps(task, items, {
      aiSummary,
      finalSummary,
      reviewerSummary,
      round,
      stage,
      submittedItems,
      totalItems: task.items.length,
    }),
    aiSummary,
    reviewerSummary,
    labelerRevisionSummary,
    finalSummary,
    createdAt: task.createdAt.toISOString(),
    updatedAt: latestTaskFlowUpdatedAt(task, items).toISOString(),
    items,
  };
}

function currentRoundForTask(task: TaskFlowTaskRecord): number {
  const latestRound = Math.max(
    0,
    ...task.items.flatMap((item) =>
      item.assignments.flatMap((assignment) => assignment.submissions.map((submission) => submission.round)),
    ),
  );

  return latestRound > 0 ? latestRound : 1;
}

function toTaskFlowItem(item: TaskItemRecord, index: number, round: number): TaskFlowItemDto {
  const assignment = latestAssignment(item.assignments);
  const submission = assignment ? submissionForRound(assignment.submissions, round) : null;
  const latestAiJob = submission ? latestJob(submission.aiReviewJobs) : null;
  const aiReview = submission ? latestReview(submission.reviewRecords, 'AI_PRECHECK', 'AI') : null;
  const humanReview = submission ? latestHumanReview(submission.reviewRecords) : null;
  const aiDecision = reviewDecision(aiReview?.decision ?? null);
  const reviewerDecision = reviewDecision(humanReview?.decision ?? null);
  const aiStatus = aiStatusForSubmission(submission, latestAiJob, aiDecision);
  const reviewerStatus = reviewerStatusForSubmission(submission, humanReview, reviewerDecision, aiStatus);
  const finalStatus = finalStatusFor(assignment, submission);
  const labelerStatus = labelerStatusFor(assignment, submission);

  return {
    index: index + 1,
    taskItem: {
      id: item.id,
      externalId: item.externalId,
      datasetKind: item.datasetKind,
      rawData: recordValue(item.rawData),
    },
    assignment: assignment ? {
      id: assignment.id,
      assigneeId: assignment.assigneeId,
      assigneeName: assignment.assignee.name,
      status: assignment.status,
    } : null,
    submission: submission ? {
      id: submission.id,
      status: submission.status,
      round: submission.round,
      answers: recordValue(submission.answers),
      schemaVersion: submission.schemaVersion,
      submittedAt: submission.submittedAt.toISOString(),
    } : null,
    aiStatus,
    aiDecision,
    reviewerStatus,
    reviewerDecision,
    labelerStatus,
    finalStatus,
    aiReview: aiReview ? toReviewRecordDto(aiReview) : null,
    humanReview: humanReview ? toReviewRecordDto(humanReview) : null,
    latestAiJob: latestAiJob ? toAiJobDto(latestAiJob) : null,
  };
}

function latestAssignment(assignments: AssignmentRecord[]): AssignmentRecord | null {
  return assignments[0] ?? null;
}

function submissionForRound(submissions: SubmissionRecord[], round: number): SubmissionRecord | null {
  if (submissions.length === 0) {
    return null;
  }

  if (round > 0) {
    const sameRound = submissions.find((submission) => submission.round === round);
    if (sameRound) {
      return sameRound;
    }
  }

  return submissions[submissions.length - 1] ?? null;
}

function latestJob(jobs: AiReviewJobRecord[]): AiReviewJobRecord | null {
  return jobs[0] ?? null;
}

function latestReview(
  records: ReviewRecordRecord[],
  stage: string,
  reviewerType?: string,
): ReviewRecordRecord | null {
  return records.find((record) =>
    record.stage === stage && (!reviewerType || record.reviewerType === reviewerType),
  ) ?? null;
}

function latestHumanReview(records: ReviewRecordRecord[]): ReviewRecordRecord | null {
  return records.find((record) => record.reviewerType === 'HUMAN' && (record.stage === 'RECHECK' || record.stage === 'FINAL')) ?? null;
}

function reviewDecision(value: string | null): 'pass' | 'reject' | null {
  if (value === 'pass' || value === 'recheck_pass' || value === 'revise_pass' || value === 'final_pass') {
    return 'pass';
  }

  if (value === 'reject') {
    return 'reject';
  }

  return null;
}

function aiStatusForSubmission(
  submission: SubmissionRecord | null,
  job: AiReviewJobRecord | null,
  decision: 'pass' | 'reject' | null,
): TaskFlowAiStatus {
  if (!submission) {
    return 'NOT_STARTED';
  }

  if (decision === 'pass') {
    return 'PASSED';
  }

  if (decision === 'reject') {
    return 'REJECTED';
  }

  if (!job) {
    return submission.status === 'AI_QUEUED' || submission.status === 'AI_REVIEWING' ? 'QUEUED' : 'NOT_STARTED';
  }

  if (job.status === 'QUEUED') {
    return 'QUEUED';
  }

  if (job.status === 'RUNNING') {
    return 'RUNNING';
  }

  if (job.status === 'SUCCEEDED') {
    return 'SUCCEEDED';
  }

  return 'FAILED';
}

function reviewerStatusForSubmission(
  submission: SubmissionRecord | null,
  humanReview: ReviewRecordRecord | null,
  decision: 'pass' | 'reject' | null,
  aiStatus: TaskFlowAiStatus,
): TaskFlowReviewerStatus {
  if (!submission) {
    return 'NOT_STARTED';
  }

  if (decision === 'pass' || submission.status === 'FINAL_APPROVED' || submission.status === 'RECHECK_APPROVED' || submission.status === 'RECHECK_REVISED_APPROVED') {
    return 'PASSED';
  }

  if (decision === 'reject' || submission.status === 'NEEDS_REVISION' || submission.status === 'RECHECK_REJECTED' || submission.status === 'FINAL_REJECTED') {
    return 'REJECTED';
  }

  if (humanReview) {
    return 'PENDING';
  }

  if (aiStatus === 'PASSED' || aiStatus === 'REJECTED' || aiStatus === 'SUCCEEDED' || submission.status === 'HUMAN_PENDING' || submission.status === 'RECHECK_REVIEWING') {
    return 'PENDING';
  }

  return 'NOT_STARTED';
}

function labelerStatusFor(
  assignment: AssignmentRecord | null,
  submission: SubmissionRecord | null,
): TaskFlowLabelerStatus {
  if (!assignment || !submission) {
    return 'NOT_STARTED';
  }

  if (submission.status === 'NEEDS_REVISION' || assignment.status === 'NEEDS_REVISION') {
    return 'NEEDS_REVISION';
  }

  if (submission.round > 1 && previousRoundWasRejected(assignment.submissions, submission.round)) {
    return 'REVISED';
  }

  return 'NOT_REQUIRED';
}

function previousRoundWasRejected(submissions: SubmissionRecord[], currentRound: number): boolean {
  const previousSubmission = [...submissions]
    .filter((submission) => submission.round < currentRound)
    .sort((left, right) => right.round - left.round)[0];

  if (!previousSubmission) {
    return false;
  }

  const previousHumanReview = latestHumanReview(previousSubmission.reviewRecords);

  return previousHumanReview?.decision === 'reject' || previousSubmission.status === 'NEEDS_REVISION';
}

function finalStatusFor(
  assignment: AssignmentRecord | null,
  submission: SubmissionRecord | null,
): TaskFlowFinalStatus {
  if (assignment?.status === 'FINAL_APPROVED' || submission?.status === 'FINAL_APPROVED') {
    return 'FINAL_APPROVED';
  }

  return 'NOT_FINAL';
}

function currentStageForItems(
  items: TaskFlowItemDto[],
  totalItems: number,
  round: number,
  aiPreReviewEnabled: boolean,
): TaskFlowStage {
  const finalSummary = summarizeFinal(items, totalItems);
  if (totalItems > 0 && finalSummary.completed >= totalItems) {
    return 'FINAL_COMPLETED';
  }

  if (items.some((item) => item.labelerStatus === 'NEEDS_REVISION')) {
    return 'LABELER_REVISION';
  }

  const aiSummary = summarizeAi(items);
  if (
    aiPreReviewEnabled &&
    (aiSummary.queued > 0 ||
      aiSummary.running > 0 ||
      (items.some((item) => item.submission) && aiSummary.completed === 0 && aiSummary.failed === 0))
  ) {
    return 'AI_PRECHECK';
  }

  const reviewerSummary = summarizeReviewer(items);
  if (reviewerSummary.pending > 0 || (reviewerSummary.decided < items.filter((item) => item.submission).length && aiSummary.completed > 0)) {
    return round > 1 ? 'HUMAN_RE_REVIEW' : 'HUMAN_REVIEW';
  }

  if (items.some((item) => item.submission)) {
    return round > 1 ? 'HUMAN_RE_REVIEW' : 'HUMAN_REVIEW';
  }

  return 'LABELING';
}

function summarizeAi(items: TaskFlowItemDto[]): TaskFlowSummaryDto['aiSummary'] {
  const summary = { pending: 0, queued: 0, running: 0, passed: 0, rejected: 0, failed: 0, completed: 0 };

  for (const item of items) {
    if (item.aiStatus === 'NOT_STARTED') summary.pending += 1;
    if (item.aiStatus === 'QUEUED') summary.queued += 1;
    if (item.aiStatus === 'RUNNING') summary.running += 1;
    if (item.aiStatus === 'PASSED') summary.passed += 1;
    if (item.aiStatus === 'REJECTED') summary.rejected += 1;
    if (item.aiStatus === 'FAILED') summary.failed += 1;
    if (item.aiStatus === 'PASSED' || item.aiStatus === 'REJECTED' || item.aiStatus === 'SUCCEEDED') summary.completed += 1;
  }

  return summary;
}

function summarizeReviewer(items: TaskFlowItemDto[]): TaskFlowSummaryDto['reviewerSummary'] {
  const summary = { notStarted: 0, pending: 0, decided: 0, passed: 0, rejected: 0 };

  for (const item of items) {
    if (item.reviewerStatus === 'NOT_STARTED') summary.notStarted += 1;
    if (item.reviewerStatus === 'PENDING') summary.pending += 1;
    if (item.reviewerStatus === 'PASSED') {
      summary.decided += 1;
      summary.passed += 1;
    }
    if (item.reviewerStatus === 'REJECTED') {
      summary.decided += 1;
      summary.rejected += 1;
    }
  }

  return summary;
}

function summarizeLabeler(items: TaskFlowItemDto[]): TaskFlowSummaryDto['labelerRevisionSummary'] {
  const summary = { notStarted: 0, editable: 0, locked: 0, revised: 0, notRequired: 0 };

  for (const item of items) {
    if (item.labelerStatus === 'NOT_STARTED') summary.notStarted += 1;
    if (item.labelerStatus === 'NEEDS_REVISION') summary.editable += 1;
    if (item.labelerStatus === 'LOCKED') summary.locked += 1;
    if (item.labelerStatus === 'REVISED') summary.revised += 1;
    if (item.labelerStatus === 'NOT_REQUIRED') summary.notRequired += 1;
  }

  return summary;
}

function summarizeFinal(items: TaskFlowItemDto[], totalItems: number): TaskFlowSummaryDto['finalSummary'] {
  const completed = items.filter((item) => item.finalStatus === 'FINAL_APPROVED').length;

  return {
    completed,
    notCompleted: Math.max(0, totalItems - completed),
  };
}

function buildLifecycleSteps(
  task: TaskFlowTaskRecord,
  items: TaskFlowItemDto[],
  context: {
    aiSummary: TaskFlowSummaryDto['aiSummary'];
    finalSummary: TaskFlowSummaryDto['finalSummary'];
    reviewerSummary: TaskFlowSummaryDto['reviewerSummary'];
    round: number;
    stage: TaskFlowStage;
    submittedItems: number;
    totalItems: number;
  },
): TaskFlowLifecycleStepDto[] {
  const publish = publishAudit(task);
  const labelerSubmission = latestSubmittedItem(items);
  const aiStepTime = aiLifecycleTime(items, context.aiSummary, context.submittedItems);
  const reviewer = latestReviewerDecision(items);
  const taskCompleted = context.totalItems > 0 && context.finalSummary.completed >= context.totalItems;

  return [
    {
      key: 'OWNER_PUBLISHED',
      label: 'Owner 发布',
      status: publish ? 'COMPLETED' : 'PENDING',
      actorRole: 'OWNER',
      actorName: publish?.actor?.name ?? task.createdBy?.name ?? null,
      occurredAt: publish?.createdAt.toISOString() ?? null,
    },
    {
      key: 'LABELER_SUBMITTED',
      label: 'Labeler 标注',
      status: labelerStepStatus(context.submittedItems, context.totalItems),
      actorRole: 'LABELER',
      actorName: labelerSubmission?.assignment?.assigneeName ?? null,
      occurredAt: context.submittedItems >= context.totalItems && context.totalItems > 0 ? labelerSubmission?.submission?.submittedAt ?? null : null,
    },
    {
      key: 'AI_PRECHECK',
      label: 'AI Agent 预审',
      status: aiLifecycleStatus(task.aiPreReviewEnabled, context.aiSummary, context.submittedItems),
      actorRole: 'AI_AGENT',
      actorName: task.aiPreReviewEnabled ? 'AI Agent' : null,
      occurredAt: aiStepTime,
    },
    {
      key: 'REVIEWER_CHECK',
      label: 'Reviewer 检查',
      status: reviewerLifecycleStatus(context.reviewerSummary, context.submittedItems, context.stage),
      actorRole: 'REVIEWER',
      actorName: reviewer?.actorName ?? null,
      occurredAt: reviewer?.createdAt ?? null,
    },
    {
      key: 'TASK_COMPLETED',
      label: '任务完成',
      status: taskCompleted ? 'COMPLETED' : 'PENDING',
      actorRole: taskCompleted ? 'REVIEWER' : null,
      actorName: taskCompleted ? reviewer?.actorName ?? null : null,
      occurredAt: taskCompleted ? reviewer?.createdAt ?? null : null,
    },
  ];
}

function labelerStepStatus(submittedItems: number, totalItems: number): TaskFlowLifecycleStepStatus {
  if (totalItems > 0 && submittedItems >= totalItems) {
    return 'COMPLETED';
  }

  if (submittedItems > 0) {
    return 'CURRENT';
  }

  return 'PENDING';
}

function aiLifecycleStatus(
  enabled: boolean,
  summary: TaskFlowSummaryDto['aiSummary'],
  submittedItems: number,
): TaskFlowLifecycleStepStatus {
  if (!enabled) {
    return 'SKIPPED';
  }

  if (submittedItems === 0) {
    return 'PENDING';
  }

  if (summary.failed > 0) {
    return 'ACTION_REQUIRED';
  }

  if (summary.queued > 0 || summary.running > 0 || summary.completed < submittedItems) {
    return 'CURRENT';
  }

  return 'COMPLETED';
}

function reviewerLifecycleStatus(
  summary: TaskFlowSummaryDto['reviewerSummary'],
  submittedItems: number,
  stage: TaskFlowStage,
): TaskFlowLifecycleStepStatus {
  if (submittedItems === 0 || summary.notStarted >= submittedItems) {
    return 'PENDING';
  }

  if (stage === 'LABELER_REVISION' && summary.rejected > 0) {
    return 'ACTION_REQUIRED';
  }

  if (summary.pending > 0 || summary.decided < submittedItems) {
    return 'CURRENT';
  }

  return 'COMPLETED';
}

function publishAudit(task: TaskFlowTaskRecord): AuditLogRecord | null {
  return task.auditLogs.find((log) => {
    const metadata = recordValue(log.metadata);

    return log.toStatus === 'PUBLISHED' && metadata.action === 'TASK_PUBLISHED';
  }) ?? null;
}

function latestSubmittedItem(items: TaskFlowItemDto[]): TaskFlowItemDto | null {
  return items
    .filter((item) => item.submission)
    .sort((left, right) => parseTimestamp(right.submission?.submittedAt) - parseTimestamp(left.submission?.submittedAt))[0] ?? null;
}

function aiLifecycleTime(
  items: TaskFlowItemDto[],
  summary: TaskFlowSummaryDto['aiSummary'],
  submittedItems: number,
): string | null {
  const times = items.flatMap((item) => [item.aiReview?.createdAt, item.latestAiJob?.finishedAt, item.latestAiJob?.startedAt].filter(isString));
  if (times.length === 0) {
    return null;
  }

  const sortedTimes = times.sort((left, right) => parseTimestamp(left) - parseTimestamp(right));
  if (submittedItems > 0 && summary.completed >= submittedItems) {
    return sortedTimes.at(-1) ?? null;
  }

  return sortedTimes[0] ?? null;
}

function latestReviewerDecision(items: TaskFlowItemDto[]): { actorName: string | null; createdAt: string } | null {
  const records = items
    .flatMap((item) => item.humanReview ? [{ item, record: item.humanReview }] : [])
    .sort((left, right) => parseTimestamp(right.record.createdAt) - parseTimestamp(left.record.createdAt));
  const latest = records[0];

  if (!latest) {
    return null;
  }

  return {
    actorName: reviewerNameFromItem(latest.item),
    createdAt: latest.record.createdAt,
  };
}

function reviewerNameFromItem(item: TaskFlowItemDto): string | null {
  return item.humanReview?.reviewerName ??
    item.humanReview?.assignedReviewerName ??
    item.humanReview?.reviewerId ??
    item.humanReview?.assignedReviewerId ??
    null;
}

function toTaskFlowLogs(task: TaskFlowTaskRecord): TaskFlowLogDto[] {
  const derivedLogs = buildDerivedTaskFlowLogs(task);
  const persistedLogs = task.flowEvents
    .map((event) => toPersistedTaskFlowLogDto(event))
    .filter((event): event is TaskFlowLogDto => event !== null);
  const logs = [...persistedLogs, ...derivedLogs];
  const uniqueLogs = new Map<string, TaskFlowLogDto>();

  for (const log of logs) {
    uniqueLogs.set(`${log.eventType}:${log.round}:${log.occurredAt}:${log.message}`, log);
  }

  return [...uniqueLogs.values()].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

function toPersistedTaskFlowLogDto(event: TaskFlowEventRecord): TaskFlowLogDto | null {
  if (!isTaskFlowLogEventType(event.eventType)) {
    return null;
  }

  return {
    id: event.id,
    taskId: event.taskId,
    round: event.round,
    eventType: event.eventType,
    actorRole: isTaskFlowActorRole(event.actorRole) ? event.actorRole : null,
    actorName: event.actorName,
    occurredAt: event.occurredAt.toISOString(),
    message: event.message,
    itemRefs: rejectedItemRefsValue(event.rejectedItemRefs),
    rejectedItemRefs: rejectedItemRefsValue(event.rejectedItemRefs),
  };
}

function buildDerivedTaskFlowLogs(task: TaskFlowTaskRecord): TaskFlowLogDto[] {
  const contexts = submissionContexts(task);
  const events: TaskFlowLogDto[] = [];
  const publish = publishAudit(task);

  if (publish) {
    events.push({
      id: `${task.id}:owner-published`,
      taskId: task.id,
      round: 1,
      eventType: 'OWNER_PUBLISHED',
      actorRole: 'OWNER',
      actorName: publish.actor?.name ?? task.createdBy?.name ?? null,
      occurredAt: publish.createdAt.toISOString(),
      message: 'Owner 发布了任务。',
      itemRefs: task.items.map((item, index) => ({
        itemId: item.id,
        externalId: item.externalId,
        index: index + 1,
      })),
      rejectedItemRefs: [],
    });
  }

  events.push(...buildClaimLogs(task));
  events.push(...buildSubmissionLogs(task.id, contexts));
  events.push(...buildAiLogs(task.id, contexts));
  events.push(...buildReviewerLogs(task.id, contexts));
  const completed = buildTaskCompletedLog(task.id, contexts, task.items.length);
  if (completed) {
    events.push(completed);
  }

  return events.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

function buildClaimLogs(task: TaskFlowTaskRecord): TaskFlowLogDto[] {
  const groups = new Map<string, { actorName: string; claimedAt: Date; itemRefs: TaskFlowItemRefDto[] }>();

  for (const [itemIndex, item] of task.items.entries()) {
    for (const assignment of item.assignments) {
      if (!assignment.claimedAt) {
        continue;
      }
      const current = groups.get(assignment.assigneeId);
      const itemRef = {
        itemId: item.id,
        externalId: item.externalId,
        index: itemIndex + 1,
      };
      if (!current || assignment.claimedAt.getTime() < current.claimedAt.getTime()) {
        groups.set(assignment.assigneeId, {
          actorName: assignment.assignee.name,
          claimedAt: assignment.claimedAt,
          itemRefs: current ? [...current.itemRefs, itemRef] : [itemRef],
        });
      } else {
        current.itemRefs.push(itemRef);
      }
    }
  }

  return [...groups.entries()].map(([actorId, group]) => ({
    id: `${task.id}:labeler-claimed:${actorId}`,
    taskId: task.id,
    round: 1,
    eventType: 'LABELER_CLAIMED',
    actorRole: 'LABELER',
    actorName: group.actorName,
    occurredAt: group.claimedAt.toISOString(),
    message: `${group.actorName} 领取了任务。`,
    itemRefs: group.itemRefs,
    rejectedItemRefs: [],
  }));
}

function buildSubmissionLogs(taskId: string, contexts: RoundSubmissionContext[]): TaskFlowLogDto[] {
  const groups = new Map<string, { actorName: string; occurredAt: Date; round: number; itemRefs: TaskFlowItemRefDto[] }>();

  for (const context of contexts) {
    const key = `${context.assignment.assigneeId}:${context.submission.round}`;
    const current = groups.get(key);
    const itemRef = toTaskFlowItemRef(context);
    if (!current || context.submission.submittedAt.getTime() > current.occurredAt.getTime()) {
      groups.set(key, {
        actorName: context.assignment.assignee.name,
        occurredAt: context.submission.submittedAt,
        round: context.submission.round,
        itemRefs: current ? [...current.itemRefs, itemRef] : [itemRef],
      });
    } else {
      current.itemRefs.push(itemRef);
    }
  }

  return [...groups.entries()].map(([key, group]) => ({
    id: `${taskId}:labeler-submitted:${key}`,
    taskId,
    round: group.round,
    eventType: group.round > 1 ? 'LABELER_RESUBMITTED' : 'LABELER_SUBMITTED',
    actorRole: 'LABELER',
    actorName: group.actorName,
    occurredAt: group.occurredAt.toISOString(),
    message: group.round > 1
      ? `${group.actorName} 重新提交修复后的标注结果。`
      : `${group.actorName} 提交了整个任务的标注结果。`,
    itemRefs: group.itemRefs,
    rejectedItemRefs: [],
  }));
}

function buildAiLogs(taskId: string, contexts: RoundSubmissionContext[]): TaskFlowLogDto[] {
  const logs: TaskFlowLogDto[] = [];

  for (const [round, roundContexts] of contextsByRound(contexts)) {
    const startTime = earliestDate(roundContexts.flatMap((context) => [
      latestJob(context.submission.aiReviewJobs)?.startedAt,
      aiStartAudit(context.submission)?.createdAt,
    ]));
    if (startTime) {
      logs.push({
        id: `${taskId}:ai-started:${round}`,
        taskId,
        round,
        eventType: round > 1 ? 'AI_RECHECK_STARTED' : 'AI_PRECHECK_STARTED',
        actorRole: 'AI_AGENT',
        actorName: 'AI Agent',
        occurredAt: startTime.toISOString(),
        message: round > 1 ? 'AI Agent 开始复审 Labeler 重新提交的内容。' : 'AI Agent 开始本轮预审。',
        itemRefs: roundContexts.map(toTaskFlowItemRef),
        rejectedItemRefs: [],
      });
    }

    if (!roundContexts.every((context) => latestReview(context.submission.reviewRecords, 'AI_PRECHECK', 'AI'))) {
      continue;
    }

    const completedAt = latestDate(roundContexts.map((context) => latestReview(context.submission.reviewRecords, 'AI_PRECHECK', 'AI')?.createdAt ?? null));
    if (!completedAt) {
      continue;
    }

    const rejectedItemRefs = roundContexts
      .filter((context) => latestReview(context.submission.reviewRecords, 'AI_PRECHECK', 'AI')?.decision === 'reject')
      .map(toRejectedItemRef);

    logs.push({
      id: `${taskId}:ai-completed:${round}`,
      taskId,
      round,
      eventType: round > 1 ? 'AI_RECHECK_COMPLETED' : 'AI_PRECHECK_COMPLETED',
      actorRole: 'AI_AGENT',
      actorName: 'AI Agent',
      occurredAt: completedAt.toISOString(),
      message: rejectedItemRefs.length > 0
        ? 'AI Agent 完成本轮预审，存在建议打回题目。'
        : 'AI Agent 完成本轮预审，未发现需要打回的题目。',
      itemRefs: roundContexts.map(toTaskFlowItemRef),
      rejectedItemRefs,
    });
  }

  return logs;
}

function buildReviewerLogs(taskId: string, contexts: RoundSubmissionContext[]): TaskFlowLogDto[] {
  const logs: TaskFlowLogDto[] = [];

  for (const [round, roundContexts] of contextsByRound(contexts)) {
    const receivedAt = earliestDate(roundContexts.flatMap((context) => [
      reviewerReceivedAudit(context.submission)?.createdAt,
      humanReviewStartAudit(context.submission)?.createdAt,
    ]));
    if (receivedAt) {
      logs.push({
        id: `${taskId}:reviewer-received:${round}`,
        taskId,
        round,
        eventType: 'REVIEWER_RECEIVED',
        actorRole: 'REVIEWER',
        actorName: null,
        occurredAt: receivedAt.toISOString(),
        message: round > 1 ? '任务再次流转到 Reviewer 复审。' : '任务流转到 Reviewer 检查。',
        itemRefs: roundContexts.map(toTaskFlowItemRef),
        rejectedItemRefs: [],
      });
    }

    const humanReviews = roundContexts.map((context) => latestHumanReview(context.submission.reviewRecords));
    if (!humanReviews.every((review) => review && reviewDecision(review.decision) !== null)) {
      continue;
    }

    const completedAt = latestDate(humanReviews.map((review) => review?.createdAt ?? null));
    if (!completedAt) {
      continue;
    }

    const rejectedItemRefs = roundContexts
      .filter((context) => reviewDecision(latestHumanReview(context.submission.reviewRecords)?.decision ?? null) === 'reject')
      .map(toRejectedItemRef);
    const latestReviewRecord = humanReviews
      .filter((review): review is ReviewRecordRecord => review !== null)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;

    logs.push({
      id: `${taskId}:reviewer-completed:${round}`,
      taskId,
      round,
      eventType: rejectedItemRefs.length > 0 ? 'REVIEWER_REJECTED' : 'REVIEWER_CHECK_COMPLETED',
      actorRole: 'REVIEWER',
      actorName: latestReviewRecord ? reviewerNameFromRecord(latestReviewRecord) : null,
      occurredAt: completedAt.toISOString(),
      message: rejectedItemRefs.length > 0
        ? 'Reviewer 完成本轮检查，任务打回 Labeler 修改。'
        : 'Reviewer 完成本轮检查，本轮检查通过。',
      itemRefs: roundContexts.map(toTaskFlowItemRef),
      rejectedItemRefs,
    });
  }

  return logs;
}

function buildTaskCompletedLog(taskId: string, contexts: RoundSubmissionContext[], totalItems: number): TaskFlowLogDto | null {
  const latestByItem = latestContextByItem(contexts);
  if (totalItems === 0 || latestByItem.length < totalItems || !latestByItem.every((context) => context.submission.status === 'FINAL_APPROVED')) {
    return null;
  }

  const humanReviews = latestByItem
    .map((context) => latestHumanReview(context.submission.reviewRecords))
    .filter((review): review is ReviewRecordRecord => review !== null);
  const completedAt = latestDate(humanReviews.map((review) => review.createdAt));
  if (!completedAt) {
    return null;
  }
  const latestReviewRecord = humanReviews.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;

  return {
    id: `${taskId}:completed`,
    taskId,
    round: Math.max(1, ...latestByItem.map((context) => context.submission.round)),
    eventType: 'TASK_COMPLETED',
    actorRole: 'REVIEWER',
    actorName: latestReviewRecord ? reviewerNameFromRecord(latestReviewRecord) : null,
    occurredAt: completedAt.toISOString(),
    message: '整个任务通过最终 Reviewer 检查，任务完成。',
    itemRefs: latestByItem.map(toTaskFlowItemRef),
    rejectedItemRefs: [],
  };
}

function submissionContexts(task: TaskFlowTaskRecord): RoundSubmissionContext[] {
  return task.items.flatMap((item, itemIndex) =>
    item.assignments.flatMap((assignment) =>
      assignment.submissions.map((submission) => ({
        index: itemIndex + 1,
        item,
        assignment,
        submission,
      })),
    ),
  );
}

function contextsByRound(contexts: RoundSubmissionContext[]): Map<number, RoundSubmissionContext[]> {
  const map = new Map<number, RoundSubmissionContext[]>();
  for (const context of contexts) {
    const list = map.get(context.submission.round) ?? [];
    list.push(context);
    map.set(context.submission.round, list);
  }

  return new Map([...map.entries()].sort(([left], [right]) => left - right));
}

function latestContextByItem(contexts: RoundSubmissionContext[]): RoundSubmissionContext[] {
  const latestByItem = new Map<string, RoundSubmissionContext>();
  for (const context of contexts) {
    const current = latestByItem.get(context.item.id);
    if (!current || context.submission.round > current.submission.round) {
      latestByItem.set(context.item.id, context);
    }
  }

  return [...latestByItem.values()];
}

function toTaskFlowItemRef(context: RoundSubmissionContext): TaskFlowItemRefDto {
  return {
    itemId: context.item.id,
    externalId: context.item.externalId,
    index: context.index,
  };
}

function toRejectedItemRef(context: RoundSubmissionContext): TaskFlowRejectedItemRefDto {
  return toTaskFlowItemRef(context);
}

function aiStartAudit(submission: SubmissionRecord): AuditLogRecord | null {
  return submission.auditLogs.find((log) => recordValue(log.metadata).action === 'AI_REVIEW_STARTED') ?? null;
}

function reviewerReceivedAudit(submission: SubmissionRecord): AuditLogRecord | null {
  return submission.auditLogs.find((log) => recordValue(log.metadata).action === 'AI_REVIEW_TO_HUMAN_PENDING') ?? null;
}

function humanReviewStartAudit(submission: SubmissionRecord): AuditLogRecord | null {
  return submission.auditLogs.find((log) => recordValue(log.metadata).action === 'HUMAN_REVIEW_STARTED') ?? null;
}

function reviewerNameFromRecord(record: ReviewRecordRecord): string | null {
  return record.reviewer?.name ?? record.assignedReviewer?.name ?? record.reviewerId ?? record.assignedReviewerId ?? null;
}

function latestTaskFlowUpdatedAt(task: TaskFlowTaskRecord, items: TaskFlowItemDto[]): Date {
  const times = [task.updatedAt.getTime()];
  for (const item of items) {
    if (item.submission) {
      times.push(Date.parse(item.submission.submittedAt));
    }
    if (item.latestAiJob) {
      times.push(Date.parse(item.latestAiJob.updatedAt));
    }
    if (item.aiReview) {
      times.push(Date.parse(item.aiReview.createdAt));
    }
    if (item.humanReview) {
      times.push(Date.parse(item.humanReview.createdAt));
    }
  }

  return new Date(Math.max(...times.filter((time) => !Number.isNaN(time))));
}

function toReviewRecordDto(record: ReviewRecordRecord): TaskFlowReviewRecordDto {
  return {
    id: record.id,
    stage: record.stage,
    reviewerType: record.reviewerType,
    reviewerId: record.reviewerId,
    reviewerName: record.reviewer?.name ?? null,
    assignedReviewerId: record.assignedReviewerId,
    assignedReviewerName: record.assignedReviewer?.name ?? null,
    decision: record.decision,
    comment: record.comment,
    scores: recordValue(record.scores),
    createdAt: record.createdAt.toISOString(),
  };
}

function toAiJobDto(job: AiReviewJobRecord): TaskFlowAiJobDto {
  return {
    id: job.id,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    provider: job.provider,
    model: job.model,
    lastError: job.lastError,
    queuedAt: job.queuedAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    updatedAt: job.updatedAt.toISOString(),
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function rejectedItemRefsValue(value: unknown): TaskFlowRejectedItemRefDto[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const record = item as Record<string, unknown>;
    if (typeof record.itemId !== 'string' || typeof record.externalId !== 'string' || typeof record.index !== 'number') {
      return [];
    }

    return [{ itemId: record.itemId, externalId: record.externalId, index: record.index }];
  });
}

function isTaskFlowActorRole(value: unknown): value is TaskFlowActorRole {
  return value === 'OWNER' || value === 'LABELER' || value === 'AI_AGENT' || value === 'REVIEWER';
}

function isTaskFlowLogEventType(value: unknown): value is TaskFlowLogEventType {
  return typeof value === 'string' && [
    'OWNER_PUBLISHED',
    'LABELER_CLAIMED',
    'LABELER_SUBMITTED',
    'LABELER_RESUBMITTED',
    'AI_PRECHECK_STARTED',
    'AI_PRECHECK_COMPLETED',
    'AI_RECHECK_STARTED',
    'AI_RECHECK_COMPLETED',
    'REVIEWER_RECEIVED',
    'REVIEWER_CHECK_COMPLETED',
    'REVIEWER_REJECTED',
    'TASK_COMPLETED',
  ].includes(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function earliestDate(values: Array<Date | null | undefined>): Date | null {
  const dates = values.filter((value): value is Date => value instanceof Date);
  if (dates.length === 0) {
    return null;
  }

  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function latestDate(values: Array<Date | null | undefined>): Date | null {
  const dates = values.filter((value): value is Date => value instanceof Date);
  if (dates.length === 0) {
    return null;
  }

  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function parseTimestamp(value?: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

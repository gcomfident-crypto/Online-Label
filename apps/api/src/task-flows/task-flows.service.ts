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
  assignedReviewerId: string | null;
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

type ReviewRecordRecord = {
  id: string;
  stage: string;
  reviewerType: string;
  reviewerId: string | null;
  assignedReviewerId: string | null;
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
};

type AssignmentRecord = {
  id: string;
  assigneeId: string;
  status: string;
  assignee: UserSummaryRecord;
  submissions: SubmissionRecord[];
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
  items: TaskItemRecord[];
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
                orderBy: { createdAt: 'desc' },
              },
              aiReviewJobs: {
                orderBy: [{ updatedAt: 'desc' }, { queuedAt: 'desc' }],
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

    return toTaskFlowDetail(task, query.round);
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
  if (value === 'pass' || value === 'reject') {
    return value;
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
    assignedReviewerId: record.assignedReviewerId,
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

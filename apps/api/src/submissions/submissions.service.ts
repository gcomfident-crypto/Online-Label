import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DatasetKind, LabelHubSchema } from '@labelhub/shared';

import { resolveConfiguredAiReviewRuntimeConfig } from '../common/ai-review-runtime.ts';
import { aiReviewIdempotencyKey, normalizeIdempotencyKey } from '../common/idempotency/idempotency-key.ts';
import { runInTransaction } from '../common/transactions/run-in-transaction.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { SchemaService } from '../schema/schema.service.ts';

type AssignmentStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_RECHECK'
  | 'FINAL_PENDING'
  | 'FINAL_APPROVED'
  | 'NEEDS_REVISION'
  | 'CANCELLED';
type SubmissionStatus = string;

type ReviewRecordSummary = {
  stage?: string | null;
  reviewerType?: string | null;
  decision: string | null;
  createdAt: Date;
};

type SubmissionRecord = {
  id: string;
  assignmentId: string;
  status: SubmissionStatus;
  round: number;
  answers: Record<string, unknown>;
  schemaVersion: string;
  idempotencyKey: string | null;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  reviewRecords?: ReviewRecordSummary[];
};

type DraftRecord = {
  id: string;
  assignmentId: string;
  answers: Record<string, unknown>;
  schemaVersion: string;
  createdAt: Date;
  updatedAt: Date;
};

type AssignmentRecord = {
  id: string;
  taskId: string;
  taskItemId: string;
  assigneeId: string;
  status: AssignmentStatus;
  claimedAt: Date;
  task: {
    id: string;
    title: string;
    aiPreReviewEnabled: boolean;
    template: {
      id: string;
      name: string;
      datasetKind: DatasetKind;
      schemaVersion: string;
      schema: Record<string, unknown>;
    };
  };
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: DatasetKind;
    rawData: Record<string, unknown>;
    sortOrder: number;
  };
  submissions: SubmissionRecord[];
  drafts: DraftRecord[];
};

export type SubmitInput = {
  assignmentId: string;
  actorId?: string;
  answers: Record<string, unknown>;
  idempotencyKey?: string;
};

export type SubmitTaskInput = {
  taskId: string;
  labelerId: string;
  actorId?: string;
  currentAssignmentId?: string;
  currentAnswers?: Record<string, unknown>;
  idempotencyKey?: string;
};

export type SubmissionDto = {
  id: string;
  assignmentId: string;
  status: SubmissionStatus;
  round: number;
  answers: Record<string, unknown>;
  schemaVersion: string;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskSubmissionDto = {
  taskId: string;
  labelerId: string;
  submittedCount: number;
  submissions: SubmissionDto[];
};

export type LabelerSubmissionQuery = {
  labelerId: string;
  taskId?: string;
  status?: string;
  datasetKind?: DatasetKind;
  itemId?: string;
};

export type LabelerSubmissionDto = {
  submissionId: string;
  assignmentId: string;
  taskId: string;
  taskTitle: string;
  taskItemId: string;
  externalId: string;
  datasetKind: DatasetKind;
  status: SubmissionStatus;
  round: number;
  answers: Record<string, unknown>;
  submittedAt: string;
};

export type LabelerAssignmentDto = {
  assignmentId: string;
  taskId: string;
  taskTitle: string;
  taskItemId: string;
  taskItemSortOrder: number;
  externalId: string;
  datasetKind: DatasetKind;
  status: AssignmentStatus;
  claimedAt: string;
  templateName: string;
  schemaVersion: string;
  latestSubmissionStatus: SubmissionStatus | null;
  latestSubmittedAt: string | null;
  latestReviewStage: string | null;
  latestReviewerType: string | null;
  latestReviewDecision: string | null;
  draftAnswers: Record<string, unknown> | null;
  draftUpdatedAt: string | null;
  round: number;
};

export type LabelerStatsDto = {
  labelerId: string;
  taskId?: string;
  totalAssignments: number;
  submittedCount: number;
  aiQueuedCount: number;
  approvedCount: number;
  rejectedCount: number;
  needsRevisionCount: number;
};

type SubmissionsPrismaClient = {
  assignment: {
    findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<AssignmentRecord | null>;
    findMany: (args?: { where?: Record<string, unknown>; include?: unknown }) => Promise<AssignmentRecord[]>;
    update: (args: { where: { id: string }; data: { status: 'SUBMITTED' } }) => Promise<AssignmentRecord>;
  };
  taskItem: {
    update: (args: { where: { id: string }; data: { status: 'COMPLETED' } }) => Promise<unknown>;
  };
  submission: {
    findFirst: (args: { where: { idempotencyKey: string } }) => Promise<SubmissionRecord | null>;
    create: (args: {
      data: {
        assignmentId: string;
        status: 'AI_QUEUED' | 'HUMAN_PENDING';
        round: number;
        answers: Record<string, unknown>;
        schemaVersion: string;
        idempotencyKey?: string;
      };
    }) => Promise<SubmissionRecord>;
  };
  auditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  aiReviewJob: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  $transaction: <TResult>(callback: (client: SubmissionsPrismaClient) => Promise<TResult>) => Promise<TResult>;
};

const ASSIGNMENT_INCLUDE = {
  task: {
    include: {
      template: true,
    },
  },
  taskItem: true,
  submissions: {
    orderBy: { round: 'desc' },
    include: {
      reviewRecords: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  },
  drafts: {
    orderBy: { updatedAt: 'desc' },
    take: 1,
  },
} as const;

const APPROVED_STATUSES = new Set(['AI_PASSED', 'FINAL_APPROVED', 'RECHECK_APPROVED']);
const REJECTED_STATUSES = new Set(['NEEDS_REVISION', 'AI_REJECTED', 'RECHECK_REJECTED', 'FINAL_REJECTED']);
const TASK_SUBMITTABLE_ASSIGNMENT_STATUSES = new Set<AssignmentStatus>([
  'ASSIGNED',
  'IN_PROGRESS',
  'NEEDS_REVISION',
]);
const AI_REVIEW_MODEL_NOT_CONFIGURED_MESSAGE =
  '当前无法提交：AI 预审模型未配置，请检查 DEEPSEEK_API_KEY、OPENAI_API_KEY、LLM_API_KEY 或 LLM_PROVIDER。';

@Injectable()
export class SubmissionsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: SubmissionsPrismaClient,
    @Inject(SchemaService)
    private readonly schemaService: Pick<SchemaService, 'validate'>,
  ) {}

  async submit(input: SubmitInput): Promise<SubmissionDto> {
    if (!input.assignmentId || !isRecord(input.answers)) {
      throw new BadRequestException({
        code: 'SUBMISSION_INPUT_INVALID',
        message: '提交请求缺少领取记录或答案对象。',
      });
    }

    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);

    return runInTransaction(this.prisma, async (client) => {
      if (idempotencyKey) {
        const existingSubmission = await client.submission.findFirst({
          where: { idempotencyKey },
        });
        if (existingSubmission) {
          return toSubmissionDto(existingSubmission);
        }
      }

      const assignment = await this.findAssignmentOrThrow(client, input.assignmentId);

      if (assignment.status === 'CANCELLED') {
        throw new BadRequestException({
          code: 'ASSIGNMENT_CANCELLED',
          message: '已取消的领取记录不能提交。',
        });
      }

      const schema = assignment.task.template.schema as LabelHubSchema;
      const validation = this.schemaService.validate(schema, input.answers);
      if (!validation.valid) {
        throw new BadRequestException({
          code: 'SUBMISSION_SCHEMA_INVALID',
          message: '提交答案未通过 Schema 校验。',
          errors: validation.errors,
        });
      }

      const round = nextRound(assignment.submissions);
      const submission = await this.createSubmittedSubmission(client, {
        assignment,
        answers: validation.answers,
        actorId: input.actorId,
        round,
        idempotencyKey,
      });

      return toSubmissionDto(submission);
    });
  }

  async submitTask(input: SubmitTaskInput): Promise<TaskSubmissionDto> {
    if (!input.taskId || !input.labelerId) {
      throw new BadRequestException({
        code: 'TASK_SUBMISSION_INPUT_INVALID',
        message: '提交任务请求缺少任务或标注员。',
      });
    }

    const taskIdempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);

    return runInTransaction(this.prisma, async (client) => {
      const assignments = (await client.assignment.findMany({
        where: {
          taskId: input.taskId,
          assigneeId: input.labelerId,
        },
        include: ASSIGNMENT_INCLUDE,
      }))
        .filter((assignment) => TASK_SUBMITTABLE_ASSIGNMENT_STATUSES.has(assignment.status))
        .sort(compareAssignmentsByTaskItem);

      if (assignments.length === 0) {
        throw new NotFoundException({
          code: 'TASK_ASSIGNMENTS_NOT_FOUND',
          message: '当前任务没有可提交的领取题目。',
        });
      }

      const preparedSubmissions = assignments.map((assignment) => {
        const answers = resolveTaskSubmissionAnswers(assignment, input);
        const schema = assignment.task.template.schema as LabelHubSchema;
        const validation = this.schemaService.validate(schema, answers);
        if (!validation.valid) {
          throw new BadRequestException({
            code: 'SUBMISSION_SCHEMA_INVALID',
            message: `题目 ${assignment.taskItem.externalId} 的答案未通过 Schema 校验。`,
            assignmentId: assignment.id,
            externalId: assignment.taskItem.externalId,
            errors: validation.errors,
          });
        }

        const round = nextRound(assignment.submissions);

        return {
          assignment,
          answers: validation.answers,
          round,
          idempotencyKey: taskIdempotencyKey
            ? taskSubmissionIdempotencyKey(taskIdempotencyKey, assignment.id, round)
            : undefined,
        };
      });

      const submissions: SubmissionRecord[] = [];
      for (const preparedSubmission of preparedSubmissions) {
        if (preparedSubmission.idempotencyKey) {
          const existingSubmission = await client.submission.findFirst({
            where: { idempotencyKey: preparedSubmission.idempotencyKey },
          });
          if (existingSubmission) {
            submissions.push(existingSubmission);
            continue;
          }
        }

        const submission = await this.createSubmittedSubmission(client, {
          assignment: preparedSubmission.assignment,
          answers: preparedSubmission.answers,
          actorId: input.actorId,
          round: preparedSubmission.round,
          idempotencyKey: preparedSubmission.idempotencyKey,
        });
        submissions.push(submission);
      }

      return {
        taskId: input.taskId,
        labelerId: input.labelerId,
        submittedCount: submissions.length,
        submissions: submissions.map(toSubmissionDto),
      };
    });
  }

  async listLabelerSubmissions(query: LabelerSubmissionQuery): Promise<LabelerSubmissionDto[]> {
    const assignments = await this.findLabelerAssignments(query);

    return assignments
      .flatMap(toLabelerSubmissionDtos)
      .filter((submission) => matchesLabelerSubmissionQuery(submission, query));
  }

  async listLabelerAssignments(
    query: Pick<LabelerSubmissionQuery, 'labelerId' | 'taskId'>,
  ): Promise<LabelerAssignmentDto[]> {
    const assignments = await this.findLabelerAssignments(query);

    return assignments.map(toLabelerAssignmentDto);
  }

  async getLabelerStats(query: Pick<LabelerSubmissionQuery, 'labelerId' | 'taskId'>): Promise<LabelerStatsDto> {
    const assignments = await this.findLabelerAssignments(query);
    const submissions = assignments.flatMap(toLabelerSubmissionDtos);

    return {
      labelerId: query.labelerId,
      ...(query.taskId ? { taskId: query.taskId } : {}),
      totalAssignments: assignments.length,
      submittedCount: submissions.length,
      aiQueuedCount: submissions.filter((submission) => submission.status === 'AI_QUEUED').length,
      approvedCount: submissions.filter((submission) => APPROVED_STATUSES.has(submission.status)).length,
      rejectedCount: submissions.filter((submission) => REJECTED_STATUSES.has(submission.status)).length,
      needsRevisionCount: submissions.filter((submission) => submission.status === 'NEEDS_REVISION').length,
    };
  }

  private async findAssignmentOrThrow(
    client: SubmissionsPrismaClient,
    assignmentId: string,
  ): Promise<AssignmentRecord> {
    const assignment = await client.assignment.findUnique({
      where: { id: assignmentId },
      include: ASSIGNMENT_INCLUDE,
    });

    if (!assignment) {
      throw new NotFoundException({
        code: 'ASSIGNMENT_NOT_FOUND',
        message: '领取记录不存在或已被删除。',
      });
    }

    return assignment;
  }

  private findLabelerAssignments(
    query: Pick<LabelerSubmissionQuery, 'labelerId' | 'taskId'>,
  ): Promise<AssignmentRecord[]> {
    return this.prisma.assignment.findMany({
      where: {
        assigneeId: query.labelerId,
        ...(query.taskId ? { taskId: query.taskId } : {}),
      },
      include: ASSIGNMENT_INCLUDE,
    });
  }

  private async createSubmittedSubmission(
    client: SubmissionsPrismaClient,
    input: {
      assignment: AssignmentRecord;
      answers: Record<string, unknown>;
      actorId?: string;
      round: number;
      idempotencyKey?: string;
    },
  ): Promise<SubmissionRecord> {
    const submissionStatus = input.assignment.task.aiPreReviewEnabled ? 'AI_QUEUED' : 'HUMAN_PENDING';
    const aiReviewRuntimeConfig =
      submissionStatus === 'AI_QUEUED'
        ? resolveConfiguredAiReviewRuntimeConfig(process.env)
        : null;

    if (submissionStatus === 'AI_QUEUED' && !aiReviewRuntimeConfig) {
      throw new BadRequestException({
        code: 'AI_REVIEW_MODEL_NOT_CONFIGURED',
        message: AI_REVIEW_MODEL_NOT_CONFIGURED_MESSAGE,
      });
    }

    const submission = await client.submission.create({
      data: {
        assignmentId: input.assignment.id,
        status: submissionStatus,
        round: input.round,
        answers: input.answers,
        schemaVersion: input.assignment.task.template.schemaVersion,
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      },
    });

    await client.assignment.update({
      where: { id: input.assignment.id },
      data: { status: 'SUBMITTED' },
    });
    await client.taskItem.update({
      where: { id: input.assignment.taskItemId },
      data: { status: 'COMPLETED' },
    });
    await client.auditLog.create({
      data: {
        taskId: input.assignment.taskId,
        submissionId: submission.id,
        toStatus: submissionStatus,
        actorId: input.actorId,
        metadata: {
          action: 'SUBMISSION_CREATED',
          assignmentId: input.assignment.id,
          round: input.round,
        },
      },
    });

    if (aiReviewRuntimeConfig) {
      await client.aiReviewJob.create({
        data: {
          submissionId: submission.id,
          taskId: input.assignment.taskId,
          round: input.round,
          idempotencyKey: aiReviewIdempotencyKey(submission.id, input.round),
          status: 'QUEUED',
          attempts: 0,
          maxAttempts: 3,
          structuredOutputMode: aiReviewRuntimeConfig.structuredOutputMode,
          provider: aiReviewRuntimeConfig.provider,
          model: aiReviewRuntimeConfig.model,
          logs: [
            {
              level: 'queue',
              message: '提交已进入 AI 自动预审队列。',
              at: submission.createdAt.toISOString(),
            },
          ],
        },
      });
    }

    return submission;
  }
}

function toSubmissionDto(submission: SubmissionRecord): SubmissionDto {
  return {
    id: submission.id,
    assignmentId: submission.assignmentId,
    status: submission.status,
    round: submission.round,
    answers: submission.answers,
    schemaVersion: submission.schemaVersion,
    submittedAt: submission.submittedAt.toISOString(),
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
  };
}

function toLabelerSubmissionDtos(assignment: AssignmentRecord): LabelerSubmissionDto[] {
  return assignment.submissions.map((submission) => ({
    submissionId: submission.id,
    assignmentId: assignment.id,
    taskId: assignment.taskId,
    taskTitle: assignment.task.title,
    taskItemId: assignment.taskItemId,
    externalId: assignment.taskItem.externalId,
    datasetKind: assignment.task.template.datasetKind,
    status: submission.status,
    round: submission.round,
    answers: submission.answers,
    submittedAt: submission.submittedAt.toISOString(),
  }));
}

function toLabelerAssignmentDto(assignment: AssignmentRecord): LabelerAssignmentDto {
  const latestSubmission = latestSubmissionByRound(assignment.submissions);
  const latestReviewRecord = latestSubmission?.reviewRecords?.[0] ?? null;
  const latestDraft = assignment.drafts[0] ?? null;

  return {
    assignmentId: assignment.id,
    taskId: assignment.taskId,
    taskTitle: assignment.task.title,
    taskItemId: assignment.taskItemId,
    taskItemSortOrder: assignment.taskItem.sortOrder,
    externalId: assignment.taskItem.externalId,
    datasetKind: assignment.task.template.datasetKind,
    status: assignment.status,
    claimedAt: assignment.claimedAt.toISOString(),
    templateName: assignment.task.template.name,
    schemaVersion: assignment.task.template.schemaVersion,
    latestSubmissionStatus: latestSubmission?.status ?? null,
    latestSubmittedAt: latestSubmission?.submittedAt.toISOString() ?? null,
    latestReviewStage: latestReviewRecord?.stage ?? null,
    latestReviewerType: latestReviewRecord?.reviewerType ?? null,
    latestReviewDecision: latestReviewRecord?.decision ?? null,
    draftAnswers: latestDraft?.answers ?? null,
    draftUpdatedAt: latestDraft?.updatedAt.toISOString() ?? null,
    round: latestSubmission?.round ?? 0,
  };
}

function latestSubmissionByRound(submissions: SubmissionRecord[]): SubmissionRecord | null {
  return submissions.reduce<SubmissionRecord | null>(
    (latest, submission) => (!latest || submission.round > latest.round ? submission : latest),
    null,
  );
}

function matchesLabelerSubmissionQuery(
  submission: LabelerSubmissionDto,
  query: LabelerSubmissionQuery,
): boolean {
  if (query.status && submission.status !== query.status) {
    return false;
  }

  if (query.datasetKind && submission.datasetKind !== query.datasetKind) {
    return false;
  }

  if (query.itemId && submission.taskItemId !== query.itemId && submission.externalId !== query.itemId) {
    return false;
  }

  return true;
}

function resolveTaskSubmissionAnswers(
  assignment: AssignmentRecord,
  input: SubmitTaskInput,
): Record<string, unknown> {
  if (assignment.id === input.currentAssignmentId) {
    return isRecord(input.currentAnswers) ? input.currentAnswers : {};
  }

  const draftAnswers = assignment.drafts[0]?.answers;
  if (isRecord(draftAnswers)) {
    return draftAnswers;
  }

  throw new BadRequestException({
    code: 'TASK_SUBMISSION_DRAFT_MISSING',
    message: `题目 ${assignment.taskItem.externalId} 尚未保存草稿，不能提交整个任务。`,
    assignmentId: assignment.id,
    externalId: assignment.taskItem.externalId,
  });
}

function compareAssignmentsByTaskItem(first: AssignmentRecord, second: AssignmentRecord): number {
  if (first.taskItem.sortOrder !== second.taskItem.sortOrder) {
    return first.taskItem.sortOrder - second.taskItem.sortOrder;
  }

  return first.id.localeCompare(second.id);
}

function nextRound(submissions: SubmissionRecord[]): number {
  return Math.max(0, ...submissions.map((submission) => submission.round)) + 1;
}

function taskSubmissionIdempotencyKey(baseKey: string, assignmentId: string, round: number): string {
  return `${baseKey}:${assignmentId}:${round}`.slice(0, 128);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

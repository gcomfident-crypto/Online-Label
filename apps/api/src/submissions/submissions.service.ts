import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DatasetKind, LabelHubSchema } from '@labelhub/shared';

import { PrismaService } from '../prisma/prisma.service.ts';
import { SchemaService } from '../schema/schema.service.ts';

type AssignmentStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'CANCELLED';
type SubmissionStatus = string;

type SubmissionRecord = {
  id: string;
  assignmentId: string;
  status: SubmissionStatus;
  round: number;
  answers: Record<string, unknown>;
  schemaVersion: string;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type AssignmentRecord = {
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
      schema: Record<string, unknown>;
    };
  };
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: DatasetKind;
    rawData: Record<string, unknown>;
  };
  submissions: SubmissionRecord[];
};

export type SubmitInput = {
  assignmentId: string;
  actorId?: string;
  answers: Record<string, unknown>;
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
    create: (args: {
      data: {
        assignmentId: string;
        status: 'AI_QUEUED';
        round: number;
        answers: Record<string, unknown>;
        schemaVersion: string;
      };
    }) => Promise<SubmissionRecord>;
  };
  auditLog: {
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
  },
} as const;

const APPROVED_STATUSES = new Set(['AI_PASSED', 'FINAL_APPROVED', 'RECHECK_APPROVED']);
const REJECTED_STATUSES = new Set(['NEEDS_REVISION', 'AI_REJECTED', 'RECHECK_REJECTED', 'FINAL_REJECTED']);

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

    return this.prisma.$transaction(async (client) => {
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
      const submission = await client.submission.create({
        data: {
          assignmentId: assignment.id,
          status: 'AI_QUEUED',
          round,
          answers: validation.answers,
          schemaVersion: assignment.task.template.schemaVersion,
        },
      });

      await client.assignment.update({
        where: { id: assignment.id },
        data: { status: 'SUBMITTED' },
      });
      await client.taskItem.update({
        where: { id: assignment.taskItemId },
        data: { status: 'COMPLETED' },
      });
      await client.auditLog.create({
        data: {
          taskId: assignment.taskId,
          submissionId: submission.id,
          toStatus: 'AI_QUEUED',
          actorId: input.actorId,
          metadata: {
            action: 'SUBMISSION_CREATED',
            assignmentId: assignment.id,
            round,
          },
        },
      });

      return toSubmissionDto(submission);
    });
  }

  async listLabelerSubmissions(query: LabelerSubmissionQuery): Promise<LabelerSubmissionDto[]> {
    const assignments = await this.findLabelerAssignments(query);

    return assignments
      .flatMap(toLabelerSubmissionDtos)
      .filter((submission) => matchesLabelerSubmissionQuery(submission, query));
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

function nextRound(submissions: SubmissionRecord[]): number {
  return Math.max(0, ...submissions.map((submission) => submission.round)) + 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

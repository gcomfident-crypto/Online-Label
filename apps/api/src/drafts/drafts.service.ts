import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DatasetKind, LabelHubSchema } from '@labelhub/shared';

import { PrismaService } from '../prisma/prisma.service.ts';

type AssignmentStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_RECHECK'
  | 'FINAL_PENDING'
  | 'FINAL_APPROVED'
  | 'NEEDS_REVISION'
  | 'CANCELLED';
type TaskItemStatus = 'UNASSIGNED' | 'ASSIGNED' | 'COMPLETED';
type SubmissionStatus = string;

type DraftRecord = {
  id: string;
  assignmentId: string;
  answers: Record<string, unknown>;
  schemaVersion: string;
  createdAt: Date;
  updatedAt: Date;
};

type ReviewRecordSummary = {
  stage?: string;
  reviewerType?: string;
  assignedReviewerId?: string | null;
  decision: string | null;
  comment?: string | null;
  scores: Record<string, unknown>;
  structuredOutput?: Record<string, unknown> | null;
  createdAt: Date;
};

type SubmissionSummary = {
  id: string;
  status: SubmissionStatus;
  round: number;
  answers: Record<string, unknown>;
  schemaVersion: string;
  submittedAt: Date;
  reviewRecords: ReviewRecordSummary[];
};

type AssignmentWorkbenchRecord = {
  id: string;
  taskId: string;
  taskItemId: string;
  assigneeId: string;
  status: AssignmentStatus;
  claimedAt: Date;
  task: {
    id: string;
    title: string;
    description: string | null;
    richTextInstruction: string | null;
    tags: string[];
    rewardRule: string | null;
    quota: number | null;
    deadline: Date | null;
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
    status: TaskItemStatus;
    sortOrder: number;
  };
  drafts: DraftRecord[];
  submissions: SubmissionSummary[];
};

export type DraftDto = {
  id: string;
  assignmentId: string;
  answers: Record<string, unknown>;
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type RejectionNoticeDto = {
  submissionId: string;
  round: number;
  reason: string;
  createdAt: string;
} | null;

export type WorkbenchDto = {
  assignment: {
    id: string;
    taskId: string;
    taskItemId: string;
    assigneeId: string;
    status: AssignmentStatus;
    claimedAt: string;
  };
  task: {
    id: string;
    title: string;
    description: string | null;
    richTextInstruction: string | null;
    tags: string[];
    rewardRule: string | null;
    quota: number | null;
    deadline: string | null;
    templateId: string;
    templateName: string;
    datasetKind: DatasetKind;
    schemaVersion: string;
    schema: LabelHubSchema;
  };
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: DatasetKind;
    rawData: Record<string, unknown>;
    status: TaskItemStatus;
    sortOrder: number;
  };
  draft: DraftDto | null;
  rejectionNotice: RejectionNoticeDto;
  submissionHistory: Array<{
    id: string;
    status: SubmissionStatus;
    round: number;
    answers: Record<string, unknown>;
    schemaVersion: string;
    submittedAt: string;
    reviewRecords: Array<{
      stage?: string;
      reviewerType?: string;
      assignedReviewerId?: string | null;
      decision: string | null;
      comment?: string | null;
      scores: Record<string, unknown>;
      structuredOutput?: Record<string, unknown> | null;
      createdAt: string;
    }>;
  }>;
};

export type SaveDraftInput = {
  actorId?: string;
  answers: Record<string, unknown>;
};

type DraftsPrismaClient = {
  assignment: {
    findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<AssignmentWorkbenchRecord | null>;
    update: (args: {
      where: { id: string };
      data: { status: 'IN_PROGRESS' };
    }) => Promise<AssignmentWorkbenchRecord>;
  };
  draft: {
    findUnique: (args: { where: { assignmentId: string } }) => Promise<DraftRecord | null>;
    upsert: (args: {
      where: { assignmentId: string };
      update: { answers: Record<string, unknown>; schemaVersion: string };
      create: { assignmentId: string; answers: Record<string, unknown>; schemaVersion: string };
    }) => Promise<DraftRecord>;
  };
  auditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
};

const WORKBENCH_INCLUDE = {
  task: {
    include: {
      template: true,
    },
  },
  taskItem: true,
  drafts: {
    orderBy: { updatedAt: 'desc' },
    take: 1,
  },
  submissions: {
    orderBy: { round: 'desc' },
    include: {
      reviewRecords: {
        orderBy: { createdAt: 'desc' },
      },
    },
  },
} as const;

const EDITABLE_ASSIGNMENT_STATUSES = new Set<AssignmentStatus>(['ASSIGNED', 'IN_PROGRESS', 'NEEDS_REVISION']);

@Injectable()
export class DraftsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: DraftsPrismaClient,
  ) {}

  async getWorkbench(assignmentId: string): Promise<WorkbenchDto> {
    const assignment = await this.findAssignmentOrThrow(assignmentId);

    return toWorkbenchDto(assignment);
  }

  async getDraft(assignmentId: string): Promise<DraftDto | null> {
    const draft = await this.prisma.draft.findUnique({
      where: { assignmentId },
    });

    return draft ? toDraftDto(draft) : null;
  }

  async saveDraft(assignmentId: string, input: SaveDraftInput): Promise<DraftDto> {
    if (!isRecord(input.answers)) {
      throw new BadRequestException({
        code: 'DRAFT_ANSWERS_INVALID',
        message: '草稿答案必须是对象。',
      });
    }

    const assignment = await this.findAssignmentOrThrow(assignmentId);

    if (assignment.status === 'CANCELLED') {
      throw new BadRequestException({
        code: 'ASSIGNMENT_CANCELLED',
        message: '已取消的领取记录不能保存草稿。',
      });
    }

    if (!EDITABLE_ASSIGNMENT_STATUSES.has(assignment.status)) {
      throw new BadRequestException({
        code: 'ASSIGNMENT_NOT_EDITABLE',
        message: `当前领取记录状态为 ${assignment.status}，不能保存草稿。`,
      });
    }

    const draft = await this.prisma.draft.upsert({
      where: { assignmentId },
      update: {
        answers: input.answers,
        schemaVersion: assignment.task.template.schemaVersion,
      },
      create: {
        assignmentId,
        answers: input.answers,
        schemaVersion: assignment.task.template.schemaVersion,
      },
    });

    if (assignment.status !== 'IN_PROGRESS') {
      await this.prisma.assignment.update({
        where: { id: assignmentId },
        data: { status: 'IN_PROGRESS' },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        taskId: assignment.taskId,
        toStatus: 'IN_PROGRESS',
        actorId: input.actorId,
        metadata: {
          action: 'DRAFT_SAVED',
          assignmentId,
        },
      },
    });

    return toDraftDto(draft);
  }

  private async findAssignmentOrThrow(assignmentId: string): Promise<AssignmentWorkbenchRecord> {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: WORKBENCH_INCLUDE,
    });

    if (!assignment) {
      throw new NotFoundException({
        code: 'ASSIGNMENT_NOT_FOUND',
        message: '领取记录不存在或已被删除。',
      });
    }

    return assignment;
  }
}

function toDraftDto(draft: DraftRecord): DraftDto {
  return {
    id: draft.id,
    assignmentId: draft.assignmentId,
    answers: draft.answers,
    schemaVersion: draft.schemaVersion,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

function toWorkbenchDto(assignment: AssignmentWorkbenchRecord): WorkbenchDto {
  const template = assignment.task.template;

  return {
    assignment: {
      id: assignment.id,
      taskId: assignment.taskId,
      taskItemId: assignment.taskItemId,
      assigneeId: assignment.assigneeId,
      status: assignment.status,
      claimedAt: assignment.claimedAt.toISOString(),
    },
    task: {
      id: assignment.task.id,
      title: assignment.task.title,
      description: assignment.task.description,
      richTextInstruction: assignment.task.richTextInstruction,
      tags: assignment.task.tags,
      rewardRule: assignment.task.rewardRule,
      quota: assignment.task.quota,
      deadline: assignment.task.deadline?.toISOString() ?? null,
      templateId: template.id,
      templateName: template.name,
      datasetKind: template.datasetKind,
      schemaVersion: template.schemaVersion,
      schema: template.schema as LabelHubSchema,
    },
    taskItem: {
      id: assignment.taskItem.id,
      externalId: assignment.taskItem.externalId,
      datasetKind: assignment.taskItem.datasetKind,
      rawData: assignment.taskItem.rawData,
      status: assignment.taskItem.status,
      sortOrder: assignment.taskItem.sortOrder,
    },
    draft: assignment.drafts[0] ? toDraftDto(assignment.drafts[0]) : null,
    rejectionNotice: resolveRejectionNotice(assignment.submissions),
    submissionHistory: assignment.submissions.map((submission) => ({
      id: submission.id,
      status: submission.status,
      round: submission.round,
      answers: submission.answers,
      schemaVersion: submission.schemaVersion,
      submittedAt: submission.submittedAt.toISOString(),
      reviewRecords: submission.reviewRecords.map((reviewRecord) => ({
        stage: reviewRecord.stage,
        reviewerType: reviewRecord.reviewerType,
        assignedReviewerId: reviewRecord.assignedReviewerId ?? null,
        decision: reviewRecord.decision,
        comment: reviewRecord.comment,
        scores: reviewRecord.scores,
        structuredOutput: reviewRecord.structuredOutput ?? null,
        createdAt: reviewRecord.createdAt.toISOString(),
      })),
    })),
  };
}

function resolveRejectionNotice(submissions: SubmissionSummary[]): RejectionNoticeDto {
  const latestSubmission = latestSubmissionSummary(submissions);
  if (!latestSubmission || !['NEEDS_REVISION', 'RECHECK_REJECTED', 'FINAL_REJECTED'].includes(latestSubmission.status)) {
    return null;
  }

  const reviewRecord = latestSubmission.reviewRecords[0];
  const reason =
    (typeof reviewRecord?.scores.reason === 'string' ? reviewRecord.scores.reason : undefined) ??
    reviewRecord?.comment ??
    reviewRecord?.decision ??
    '上一轮提交需要修改。';

  return {
    submissionId: latestSubmission.id,
    round: latestSubmission.round,
    reason,
    createdAt: (reviewRecord?.createdAt ?? latestSubmission.submittedAt).toISOString(),
  };
}

function latestSubmissionSummary(submissions: SubmissionSummary[]): SubmissionSummary | null {
  return submissions.reduce<SubmissionSummary | null>((latest, submission) => {
    if (!latest) {
      return submission;
    }

    if (submission.round !== latest.round) {
      return submission.round > latest.round ? submission : latest;
    }

    return submission.submittedAt > latest.submittedAt ? submission : latest;
  }, null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

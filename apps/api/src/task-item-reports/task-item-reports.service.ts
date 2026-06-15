import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { runInTransaction } from '../common/transactions/run-in-transaction.ts';
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
export type TaskItemReportStatus = 'PENDING' | 'INVALIDATED' | 'REOPENED' | 'REJECTED';
export type ResolveTaskItemReportAction = 'invalidate' | 'reopen' | 'reject';

type UserSummary = {
  id: string;
  name: string;
} | null;

type TaskItemSummary = {
  id: string;
  taskId?: string;
  externalId: string;
  rawData: Record<string, unknown>;
  status: TaskItemStatus;
};

type AssignmentRecord = {
  id: string;
  taskId: string;
  taskItemId: string;
  assigneeId: string;
  status: AssignmentStatus;
  taskItem: TaskItemSummary;
};

type TaskItemReportRecord = {
  id: string;
  taskId: string;
  taskItemId: string;
  assignmentId: string | null;
  reporterId: string | null;
  status: TaskItemReportStatus;
  reason: string;
  ownerComment: string | null;
  resolution: string | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  taskItem?: TaskItemSummary | null;
  reporter?: UserSummary;
  resolvedBy?: UserSummary;
  assignment?: AssignmentRecord | null;
};

type TaskItemReportsPrismaClient = {
  assignment: {
    findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<AssignmentRecord | null>;
    update: (args: { where: { id: string }; data: { status: AssignmentStatus } }) => Promise<AssignmentRecord>;
  };
  taskItem: {
    update: (args: { where: { id: string }; data: { status?: TaskItemStatus; rawData?: Record<string, unknown> } }) => Promise<unknown>;
  };
  taskItemReport: {
    findFirst: (args: { where: Record<string, unknown>; include?: unknown }) => Promise<TaskItemReportRecord | null>;
    findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<TaskItemReportRecord | null>;
    findMany: (args: { where: Record<string, unknown>; include?: unknown; orderBy?: unknown }) => Promise<TaskItemReportRecord[]>;
    create: (args: { data: Record<string, unknown>; include?: unknown }) => Promise<TaskItemReportRecord>;
    update: (args: { where: { id: string }; data: Record<string, unknown>; include?: unknown }) => Promise<TaskItemReportRecord>;
  };
  auditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  $transaction: <TResult>(callback: (client: TaskItemReportsPrismaClient) => Promise<TResult>) => Promise<TResult>;
};

export type ReportTaskItemInput = {
  assignmentId: string;
  reporterId?: string;
  reason: string;
};

export type ResolveTaskItemReportInput = {
  action: ResolveTaskItemReportAction;
  ownerId?: string;
  ownerComment?: string;
  rawDataPatch?: unknown;
};

export type TaskItemReportDto = Omit<
  TaskItemReportRecord,
  'createdAt' | 'updatedAt' | 'resolvedAt' | 'taskItem' | 'reporter' | 'resolvedBy' | 'assignment'
> & {
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  taskItem: TaskItemReportRecord['taskItem'] | null;
  reporter: UserSummary;
  resolvedBy: UserSummary;
};

const REPORT_INCLUDE = {
  taskItem: true,
  reporter: {
    select: {
      id: true,
      name: true,
    },
  },
  resolvedBy: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

const REPORTABLE_ASSIGNMENT_STATUSES = new Set<AssignmentStatus>(['ASSIGNED', 'IN_PROGRESS', 'NEEDS_REVISION']);
const RESOLVE_ACTIONS = new Set<ResolveTaskItemReportAction>(['invalidate', 'reopen', 'reject']);

@Injectable()
export class TaskItemReportsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: TaskItemReportsPrismaClient,
  ) {}

  async reportAssignment(input: ReportTaskItemInput): Promise<TaskItemReportDto> {
    const reason = input.reason.trim();
    if (!input.assignmentId || !input.reporterId || !reason) {
      throw new BadRequestException({
        code: 'TASK_ITEM_REPORT_INPUT_INVALID',
        message: '上报请求缺少领取记录、上报人或问题说明。',
      });
    }

    return runInTransaction(this.prisma, async (client) => {
      const assignment = await client.assignment.findUnique({
        where: { id: input.assignmentId },
        include: { taskItem: true },
      });
      if (!assignment) {
        throw new NotFoundException({
          code: 'ASSIGNMENT_NOT_FOUND',
          message: '领取记录不存在或已被删除。',
        });
      }

      if (assignment.assigneeId !== input.reporterId) {
        throw new ForbiddenException({
          code: 'ASSIGNMENT_LABELER_MISMATCH',
          message: '只能上报自己领取的题目。',
        });
      }

      if (!REPORTABLE_ASSIGNMENT_STATUSES.has(assignment.status)) {
        throw new BadRequestException({
          code: 'ASSIGNMENT_NOT_REPORTABLE',
          message: `当前领取记录状态为 ${assignment.status}，不能上报题目问题。`,
        });
      }

      const existingPendingReport = await client.taskItemReport.findFirst({
        where: {
          assignmentId: assignment.id,
          status: 'PENDING',
        },
      });
      if (existingPendingReport) {
        throw new ConflictException({
          code: 'TASK_ITEM_REPORT_PENDING_EXISTS',
          message: '当前题目已有待 Owner 处理的问题上报，不能重复上报。',
        });
      }

      const report = await client.taskItemReport.create({
        data: {
          taskId: assignment.taskId,
          taskItemId: assignment.taskItemId,
          assignmentId: assignment.id,
          reporterId: input.reporterId,
          status: 'PENDING',
          reason,
        },
        include: REPORT_INCLUDE,
      });

      await client.auditLog.create({
        data: {
          taskId: assignment.taskId,
          toStatus: 'ITEM_REPORT_PENDING',
          actorId: input.reporterId,
          reason,
          metadata: {
            action: 'TASK_ITEM_REPORTED',
            assignmentId: assignment.id,
            taskItemId: assignment.taskItemId,
            reportId: report.id,
          },
        },
      });

      return toTaskItemReportDto(report);
    });
  }

  async listTaskReports(query: { taskId: string; status?: string }): Promise<TaskItemReportDto[]> {
    if (!query.taskId) {
      throw new BadRequestException({
        code: 'TASK_ID_REQUIRED',
        message: '查询题目上报记录时缺少任务 ID。',
      });
    }
    if (query.status !== undefined && !isTaskItemReportStatus(query.status)) {
      throw new BadRequestException({
        code: 'TASK_ITEM_REPORT_STATUS_INVALID',
        message: `不支持的题目上报状态：${query.status}。`,
      });
    }

    const where: Record<string, unknown> = {
      taskId: query.taskId,
    };
    if (query.status !== undefined) {
      where.status = query.status;
    }

    const reports = await this.prisma.taskItemReport.findMany({
      where,
      include: REPORT_INCLUDE,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return reports.map(toTaskItemReportDto);
  }

  async resolveReport(reportId: string, input: ResolveTaskItemReportInput): Promise<TaskItemReportDto> {
    if (!reportId || !input.ownerId) {
      throw new BadRequestException({
        code: 'TASK_ITEM_REPORT_RESOLVE_INPUT_INVALID',
        message: '处理题目上报时缺少报告 ID 或 Owner ID。',
      });
    }
    if (!RESOLVE_ACTIONS.has(input.action)) {
      throw new BadRequestException({
        code: 'TASK_ITEM_REPORT_ACTION_INVALID',
        message: `不支持的题目上报处理动作：${String(input.action)}。`,
      });
    }

    return runInTransaction(this.prisma, async (client) => {
      const report = await client.taskItemReport.findUnique({
        where: { id: reportId },
        include: {
          ...REPORT_INCLUDE,
          assignment: {
            include: {
              taskItem: true,
            },
          },
        },
      });
      if (!report) {
        throw new NotFoundException({
          code: 'TASK_ITEM_REPORT_NOT_FOUND',
          message: '题目上报记录不存在或已被删除。',
        });
      }
      if (report.status !== 'PENDING') {
        throw new BadRequestException({
          code: 'TASK_ITEM_REPORT_ALREADY_RESOLVED',
          message: `当前上报记录状态为 ${report.status}，不能重复处理。`,
        });
      }

      const ownerComment = input.ownerComment?.trim() || null;
      const resolvedAt = new Date();
      const resolution = resolveResolution(input.action);
      const nextReportStatus = resolveReportStatus(input.action);
      const assignment =
        report.assignment ??
        (report.assignmentId
          ? await client.assignment.findUnique({
              where: { id: report.assignmentId },
              include: { taskItem: true },
            })
          : null);

      if (input.action === 'invalidate') {
        if (assignment) {
          await client.assignment.update({
            where: { id: assignment.id },
            data: { status: 'CANCELLED' },
          });
        }
        await client.taskItem.update({
          where: { id: report.taskItemId },
          data: { status: 'COMPLETED' },
        });
      }

      if (input.action === 'reopen') {
        const rawDataPatch = normalizeRawDataPatch(input.rawDataPatch);
        const currentRawData = assignment?.taskItem?.rawData ?? report.taskItem?.rawData ?? {};
        if (assignment) {
          await client.assignment.update({
            where: { id: assignment.id },
            data: { status: 'IN_PROGRESS' },
          });
        }
        await client.taskItem.update({
          where: { id: report.taskItemId },
          data: {
            status: 'ASSIGNED',
            ...(rawDataPatch ? { rawData: { ...currentRawData, ...rawDataPatch } } : {}),
          },
        });
      }

      if (input.action === 'reject') {
        if (assignment) {
          await client.assignment.update({
            where: { id: assignment.id },
            data: { status: 'IN_PROGRESS' },
          });
        }
        await client.taskItem.update({
          where: { id: report.taskItemId },
          data: { status: 'ASSIGNED' },
        });
      }

      const resolvedReport = await client.taskItemReport.update({
        where: { id: reportId },
        data: {
          status: nextReportStatus,
          resolution,
          ownerComment,
          resolvedById: input.ownerId,
          resolvedAt,
        },
        include: REPORT_INCLUDE,
      });

      await client.auditLog.create({
        data: {
          taskId: report.taskId,
          toStatus: resolveAuditStatus(input.action),
          actorId: input.ownerId,
          reason: ownerComment,
          metadata: {
            action: resolveAuditAction(input.action),
            assignmentId: report.assignmentId,
            taskItemId: report.taskItemId,
            reportId,
          },
        },
      });

      return toTaskItemReportDto(resolvedReport);
    });
  }
}

function resolveReportStatus(action: ResolveTaskItemReportAction): TaskItemReportStatus {
  if (action === 'invalidate') {
    return 'INVALIDATED';
  }
  if (action === 'reopen') {
    return 'REOPENED';
  }
  return 'REJECTED';
}

function resolveResolution(action: ResolveTaskItemReportAction): string {
  if (action === 'invalidate') {
    return 'INVALIDATE';
  }
  if (action === 'reopen') {
    return 'REOPEN';
  }
  return 'REJECT';
}

function resolveAuditStatus(action: ResolveTaskItemReportAction): string {
  if (action === 'invalidate') {
    return 'ITEM_REPORT_INVALIDATED';
  }
  if (action === 'reopen') {
    return 'ITEM_REPORT_REOPENED';
  }
  return 'ITEM_REPORT_REJECTED';
}

function resolveAuditAction(action: ResolveTaskItemReportAction): string {
  if (action === 'invalidate') {
    return 'TASK_ITEM_REPORT_INVALIDATED';
  }
  if (action === 'reopen') {
    return 'TASK_ITEM_REPORT_REOPENED';
  }
  return 'TASK_ITEM_REPORT_REJECTED';
}

function normalizeRawDataPatch(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new BadRequestException({
      code: 'TASK_ITEM_RAW_DATA_PATCH_INVALID',
      message: '修复题目时传入的原始数据补丁必须是对象。',
    });
  }

  return value;
}

function isTaskItemReportStatus(value: unknown): value is TaskItemReportStatus {
  return value === 'PENDING' || value === 'INVALIDATED' || value === 'REOPENED' || value === 'REJECTED';
}

function toTaskItemReportDto(report: TaskItemReportRecord): TaskItemReportDto {
  return {
    id: report.id,
    taskId: report.taskId,
    taskItemId: report.taskItemId,
    assignmentId: report.assignmentId,
    reporterId: report.reporterId,
    status: report.status,
    reason: report.reason,
    ownerComment: report.ownerComment,
    resolution: report.resolution,
    resolvedById: report.resolvedById,
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    taskItem: report.taskItem ?? null,
    reporter: report.reporter ?? null,
    resolvedBy: report.resolvedBy ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

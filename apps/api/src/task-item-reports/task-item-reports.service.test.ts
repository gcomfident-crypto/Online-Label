import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { TaskItemReportsService } from './task-item-reports.service.ts';

type AssignmentStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'NEEDS_REVISION' | 'CANCELLED';
type TaskItemStatus = 'UNASSIGNED' | 'ASSIGNED' | 'COMPLETED';
type ReportStatus = 'PENDING' | 'INVALIDATED' | 'REOPENED' | 'REJECTED';

type AssignmentRecord = {
  id: string;
  taskId: string;
  taskItemId: string;
  assigneeId: string;
  status: AssignmentStatus;
  taskItem: {
    id: string;
    taskId: string;
    externalId: string;
    rawData: Record<string, unknown>;
    status: TaskItemStatus;
  };
};

type ReportRecord = {
  id: string;
  taskId: string;
  taskItemId: string;
  assignmentId: string | null;
  reporterId: string | null;
  status: ReportStatus;
  reason: string;
  ownerComment: string | null;
  resolution: string | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  taskItem?: AssignmentRecord['taskItem'];
};

describe('TaskItemReportsService', () => {
  it('Labeler 上报当前题后创建待处理报告并写入审计日志', async () => {
    const { service, reports, auditLogs } = createService();

    const report = await service.reportAssignment({
      assignmentId: 'assignment_1',
      reporterId: 'user_labeler_1',
      reason: '题目缺少回答 B，无法判断偏好。',
    });

    expect(report).toEqual(
      expect.objectContaining({
        taskId: 'task_1',
        taskItemId: 'item_1',
        assignmentId: 'assignment_1',
        reporterId: 'user_labeler_1',
        status: 'PENDING',
        reason: '题目缺少回答 B，无法判断偏好。',
      }),
    );
    expect(reports).toHaveLength(1);
    expect(auditLogs).toEqual([
      expect.objectContaining({
        taskId: 'task_1',
        toStatus: 'ITEM_REPORT_PENDING',
        actorId: 'user_labeler_1',
        reason: '题目缺少回答 B，无法判断偏好。',
        metadata: expect.objectContaining({
          action: 'TASK_ITEM_REPORTED',
          assignmentId: 'assignment_1',
          taskItemId: 'item_1',
        }),
      }),
    ]);
  });

  it('同一领取记录存在待处理上报时拒绝重复上报', async () => {
    const { service } = createService({
      reports: [createReport({ assignmentId: 'assignment_1', status: 'PENDING' })],
    });

    await expect(
      service.reportAssignment({
        assignmentId: 'assignment_1',
        reporterId: 'user_labeler_1',
        reason: '重复上报。',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('非当前 Labeler 不能上报别人的领取题目', async () => {
    const { service } = createService();

    await expect(
      service.reportAssignment({
        assignmentId: 'assignment_1',
        reporterId: 'user_labeler_2',
        reason: '不是我的题。',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Owner 确认无效后作废题目、取消领取记录并保留处理意见', async () => {
    const pendingReport = createReport({ id: 'report_1', assignmentId: 'assignment_1', status: 'PENDING' });
    const { service, assignments, taskItems, auditLogs } = createService({ reports: [pendingReport] });

    const resolved = await service.resolveReport('report_1', {
      action: 'invalidate',
      ownerId: 'user_owner_1',
      ownerComment: '原始数据缺少必要字段，确认作废。',
    });

    expect(resolved).toEqual(
      expect.objectContaining({
        id: 'report_1',
        status: 'INVALIDATED',
        resolution: 'INVALIDATE',
        ownerComment: '原始数据缺少必要字段，确认作废。',
        resolvedById: 'user_owner_1',
        resolvedAt: expect.any(String),
      }),
    );
    expect(assignments[0].status).toBe('CANCELLED');
    expect(taskItems[0].status).toBe('COMPLETED');
    expect(auditLogs.at(-1)).toEqual(
      expect.objectContaining({
        toStatus: 'ITEM_REPORT_INVALIDATED',
        actorId: 'user_owner_1',
      }),
    );
  });

  it('Owner 修复题目后重新开放给原 Labeler 标注', async () => {
    const pendingReport = createReport({ id: 'report_1', assignmentId: 'assignment_1', status: 'PENDING' });
    const { service, assignments, taskItems } = createService({ reports: [pendingReport] });

    const resolved = await service.resolveReport('report_1', {
      action: 'reopen',
      ownerId: 'user_owner_1',
      ownerComment: '已补充回答 B。',
      rawDataPatch: { response_b: '补充后的回答 B。' },
    });

    expect(resolved.status).toBe('REOPENED');
    expect(assignments[0].status).toBe('IN_PROGRESS');
    expect(taskItems[0]).toEqual(
      expect.objectContaining({
        status: 'ASSIGNED',
        rawData: expect.objectContaining({ response_b: '补充后的回答 B。' }),
      }),
    );
  });

  it('Owner 驳回上报后题目回到待标注状态', async () => {
    const pendingReport = createReport({ id: 'report_1', assignmentId: 'assignment_1', status: 'PENDING' });
    const { service, assignments, taskItems } = createService({ reports: [pendingReport] });

    const resolved = await service.resolveReport('report_1', {
      action: 'reject',
      ownerId: 'user_owner_1',
      ownerComment: '题目数据完整，请继续标注。',
    });

    expect(resolved.status).toBe('REJECTED');
    expect(resolved.resolution).toBe('REJECT');
    expect(assignments[0].status).toBe('IN_PROGRESS');
    expect(taskItems[0].status).toBe('ASSIGNED');
  });

  it('查询上报记录时拒绝非法状态参数', async () => {
    const { service } = createService();

    await expect(service.listTaskReports({ taskId: 'task_1', status: 'WAITING' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('非待处理报告不能再次处理，缺失报告返回 NotFound', async () => {
    const { service } = createService({
      reports: [createReport({ id: 'report_done', status: 'INVALIDATED' })],
    });

    await expect(service.resolveReport('report_done', { action: 'reject', ownerId: 'owner' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.resolveReport('missing', { action: 'reject', ownerId: 'owner' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

function createService(input: {
  assignments?: AssignmentRecord[];
  reports?: ReportRecord[];
} = {}) {
  const taskItems = [
    {
      id: 'item_1',
      taskId: 'task_1',
      externalId: 'P0001',
      rawData: { prompt: '比较两个回答', response_a: '回答 A' },
      status: 'ASSIGNED' as TaskItemStatus,
    },
  ];
  const assignments = input.assignments ?? [
    {
      id: 'assignment_1',
      taskId: 'task_1',
      taskItemId: 'item_1',
      assigneeId: 'user_labeler_1',
      status: 'IN_PROGRESS' as AssignmentStatus,
      taskItem: taskItems[0],
    },
  ];
  const reports = input.reports ?? [];
  const auditLogs: Array<Record<string, unknown>> = [];

  const prisma = {
    assignment: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        assignments.find((assignment) => assignment.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { status: AssignmentStatus } }) => {
        const assignment = assignments.find((candidate) => candidate.id === where.id);
        if (!assignment) {
          throw new Error('assignment missing');
        }
        assignment.status = data.status;
        return assignment;
      },
    },
    taskItem: {
      update: async ({ where, data }: { where: { id: string }; data: Partial<AssignmentRecord['taskItem']> }) => {
        const item = taskItems.find((candidate) => candidate.id === where.id);
        if (!item) {
          throw new Error('task item missing');
        }
        Object.assign(item, data);
        return item;
      },
    },
    taskItemReport: {
      findFirst: async ({ where }: { where: Partial<ReportRecord> }) =>
        reports.find((report) =>
          (where.assignmentId === undefined || report.assignmentId === where.assignmentId) &&
          (where.taskId === undefined || report.taskId === where.taskId) &&
          (where.status === undefined || report.status === where.status)
        ) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) =>
        reports.find((report) => report.id === where.id) ?? null,
      findMany: async ({ where }: { where: Partial<ReportRecord> }) =>
        reports.filter((report) =>
          (where.taskId === undefined || report.taskId === where.taskId) &&
          (where.status === undefined || report.status === where.status)
        ),
      create: async ({ data }: { data: Partial<ReportRecord> }) => {
        const report = createReport({
          id: `report_${reports.length + 1}`,
          taskId: String(data.taskId),
          taskItemId: String(data.taskItemId),
          assignmentId: data.assignmentId ?? null,
          reporterId: data.reporterId ?? null,
          status: (data.status as ReportStatus | undefined) ?? 'PENDING',
          reason: String(data.reason),
        });
        reports.push(report);
        return report;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<ReportRecord> }) => {
        const report = reports.find((candidate) => candidate.id === where.id);
        if (!report) {
          throw new Error('report missing');
        }
        Object.assign(report, data);
        return report;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditLogs.push(data);
        return data;
      },
    },
    $transaction: async <TResult>(callback: (client: unknown) => Promise<TResult>) =>
      callback(prisma),
  };

  return {
    assignments,
    auditLogs,
    reports,
    service: new TaskItemReportsService(prisma as never),
    taskItems,
  };
}

function createReport(input: Partial<ReportRecord> = {}): ReportRecord {
  const now = new Date('2026-05-21T08:00:00.000Z');

  return {
    id: input.id ?? 'report_1',
    taskId: input.taskId ?? 'task_1',
    taskItemId: input.taskItemId ?? 'item_1',
    assignmentId: input.assignmentId ?? 'assignment_1',
    reporterId: input.reporterId ?? 'user_labeler_1',
    status: input.status ?? 'PENDING',
    reason: input.reason ?? '题目数据缺失。',
    ownerComment: input.ownerComment ?? null,
    resolution: input.resolution ?? null,
    resolvedById: input.resolvedById ?? null,
    resolvedAt: input.resolvedAt ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    taskItem: input.taskItem,
  };
}

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DatasetImportFormat, DatasetKind } from '@labelhub/shared';

import { PrismaService } from '../prisma/prisma.service.ts';
import { runInTransaction } from '../common/transactions/run-in-transaction.ts';

export type AssignmentStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_RECHECK'
  | 'FINAL_PENDING'
  | 'FINAL_APPROVED'
  | 'NEEDS_REVISION'
  | 'CANCELLED';
export type TaskItemStatus = 'UNASSIGNED' | 'ASSIGNED' | 'COMPLETED';
export type MarketClaimStatus = 'available' | 'claimed' | 'limited' | 'full' | 'expired';

type TaskTemplateSummary = {
  id: string;
  name: string;
  datasetKind: DatasetKind;
};

type TaskCreatorSummary = {
  id: string;
  name: string;
};

type MarketTaskRecord = {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  rewardRule: string | null;
  perUserLimit: number | null;
  quota: number | null;
  deadline: Date | null;
  status: 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ENDED';
  template: TaskTemplateSummary;
  createdById: string | null;
  createdBy: TaskCreatorSummary | null;
  datasetImportSummary?: MarketDatasetImportSummary | null;
  items: MarketTaskItemRecord[];
  assignments: Array<{ id: string; assigneeId: string; status: AssignmentStatus }>;
  createdAt: Date;
  updatedAt: Date;
};

type ClaimTaskRecord = {
  id: string;
  perUserLimit: number | null;
  quota: number | null;
  deadline: Date | null;
  status: 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ENDED';
};

type TaskItemRecord = {
  id: string;
  taskId: string;
  externalId: string;
  datasetKind: DatasetKind;
  rawData: Record<string, unknown>;
  status: TaskItemStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

type MarketTaskItemRecord = Pick<TaskItemRecord, 'id' | 'externalId' | 'status'>;

type MarketDatasetImportFileSummary = {
  datasetKind: DatasetKind;
  format: DatasetImportFormat;
  fileName: string;
  fields: string[];
  importedCount: number;
  errorCount: number;
};

type MarketDatasetImportSummary = {
  taskId: string;
  datasetKind: DatasetKind;
  importedCount: number;
  errorCount: number;
  skippedFiles: string[];
  fields: string[];
  files: MarketDatasetImportFileSummary[];
};

type AssignmentRecord = {
  id: string;
  taskId: string;
  taskItemId: string;
  assigneeId: string;
  status: AssignmentStatus;
  claimedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  taskItem: TaskItemRecord;
};

export type MarketTaskDto = {
  id: string;
  title: string;
  description: string | null;
  ownerId: string | null;
  ownerName: string | null;
  tags: string[];
  rewardRule: string | null;
  perUserLimit: number | null;
  quota: number | null;
  deadline: string | null;
  datasetKind: DatasetKind;
  templateId: string;
  templateName: string;
  datasetImportSummary: MarketDatasetImportSummary | null;
  itemCount: number;
  assignedCount: number;
  claimedByMeCount: number;
  remainingCount: number;
  claimedByMe: boolean;
  claimStatus: MarketClaimStatus;
  previewItems: Array<{
    id: string;
    externalId: string;
    rawData: Record<string, unknown>;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type MarketTaskQuery = {
  keyword?: string;
  tag?: string;
  claimStatus?: MarketClaimStatus;
  labelerId?: string;
};

export type ClaimAssignmentInput = {
  taskId: string;
  labelerId: string;
};

export type ClaimAssignmentDto = {
  assignmentId: string;
  taskId: string;
  taskItemId: string;
  labelerId: string;
  status: AssignmentStatus;
  claimedAt: string;
  claimedItemCount: number;
  claimedCount: number;
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: DatasetKind;
    rawData: Record<string, unknown>;
  };
};

type AssignmentsPrismaClient = {
  task: {
    findMany: (args: {
      where: { status: 'PUBLISHED' };
      orderBy: { updatedAt: 'desc' };
      include: typeof MARKET_TASK_INCLUDE;
    }) => Promise<MarketTaskRecord[]>;
    findUnique: (args: {
      where: { id: string };
      select: { id: true; status: true; perUserLimit: true; quota: true; deadline: true };
    }) => Promise<ClaimTaskRecord | null>;
  };
  taskItem: {
    findMany: (args: {
      where: { taskId: string; status: 'UNASSIGNED' };
      orderBy: { sortOrder: 'asc' };
      take?: number;
    }) => Promise<TaskItemRecord[]>;
    updateMany: (args: {
      where: { id: string; status: 'UNASSIGNED' };
      data: { status: 'ASSIGNED' };
    }) => Promise<{ count: number }>;
  };
  assignment: {
    count: (args: {
      where: {
        taskId?: string;
        assigneeId?: string;
        status?: { not: 'CANCELLED' };
      };
    }) => Promise<number>;
    create: (args: {
      data: {
        taskId: string;
        taskItemId: string;
        assigneeId: string;
        status: 'ASSIGNED';
      };
      include: { taskItem: true };
    }) => Promise<AssignmentRecord>;
  };
  $transaction: <TResult>(callback: (client: AssignmentsPrismaClient) => Promise<TResult>) => Promise<TResult>;
};

const MARKET_TASK_INCLUDE = {
  template: {
    select: {
      id: true,
      name: true,
      datasetKind: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
    },
  },
  items: {
    orderBy: {
      sortOrder: 'asc',
    },
    select: {
      id: true,
      externalId: true,
      status: true,
    },
  },
  assignments: {
    select: {
      id: true,
      assigneeId: true,
      status: true,
    },
  },
} as const;

@Injectable()
export class AssignmentsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: AssignmentsPrismaClient,
  ) {}

  async listMarketTasks(query: MarketTaskQuery = {}): Promise<MarketTaskDto[]> {
    const tasks = await this.prisma.task.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { updatedAt: 'desc' },
      include: MARKET_TASK_INCLUDE,
    });

    return tasks
      .filter((task) => task.status === 'PUBLISHED')
      .map((task) => toMarketTaskDto(task, query.labelerId))
      .filter((task) => matchesMarketQuery(task, query));
  }

  async claim(input: ClaimAssignmentInput): Promise<ClaimAssignmentDto> {
    if (!input.taskId || !input.labelerId) {
      throw new BadRequestException({
        code: 'CLAIM_INPUT_INVALID',
        message: '领取任务参数不完整。',
      });
    }

    return runInTransaction(this.prisma, async (client) => {
      const task = await client.task.findUnique({
        where: { id: input.taskId },
        select: {
          id: true,
          status: true,
          perUserLimit: true,
          quota: true,
          deadline: true,
        },
      });

      if (!task) {
        throw new NotFoundException({
          code: 'TASK_NOT_FOUND',
          message: '任务不存在或已被删除。',
        });
      }

      assertTaskCanBeClaimed(task);

      const claimedCount = await client.assignment.count({
        where: {
          taskId: task.id,
          status: { not: 'CANCELLED' },
        },
      });
      if (task.quota !== null && claimedCount >= task.quota) {
        throw new BadRequestException({
          code: 'TASK_QUOTA_EXHAUSTED',
          message: '任务配额已用尽，不能继续领取。',
        });
      }

      const quotaRemaining = task.quota === null ? Number.POSITIVE_INFINITY : task.quota - claimedCount;
      const claimLimit = Number.isFinite(quotaRemaining)
        ? Math.floor(Math.max(0, quotaRemaining))
        : undefined;
      const taskItems = await client.taskItem.findMany({
        where: {
          taskId: task.id,
          status: 'UNASSIGNED',
        },
        orderBy: { sortOrder: 'asc' },
        ...(typeof claimLimit === 'number' ? { take: claimLimit } : {}),
      });
      if (taskItems.length === 0) {
        throw new BadRequestException({
          code: 'TASK_ITEM_NOT_AVAILABLE',
          message: '当前任务暂无可领取题目。',
        });
      }

      const assignments: AssignmentRecord[] = [];
      for (const taskItem of taskItems) {
        const lockedItem = await client.taskItem.updateMany({
          where: {
            id: taskItem.id,
            status: 'UNASSIGNED',
          },
          data: { status: 'ASSIGNED' },
        });
        if (lockedItem.count !== 1) {
          continue;
        }

        const assignment = await client.assignment.create({
          data: {
            taskId: task.id,
            taskItemId: taskItem.id,
            assigneeId: input.labelerId,
            status: 'ASSIGNED',
          },
          include: { taskItem: true },
        });
        assignments.push(assignment);
      }

      if (!assignments[0]) {
        throw new BadRequestException({
          code: 'TASK_ITEM_ALREADY_CLAIMED',
          message: '当前题目已被领取，请重试。',
        });
      }

      return toClaimAssignmentDto(assignments[0], {
        claimedItemCount: assignments.length,
        claimedCount: claimedCount + assignments.length,
      });
    });
  }
}

function toMarketTaskDto(task: MarketTaskRecord, labelerId?: string): MarketTaskDto {
  const activeAssignments = task.assignments.filter((assignment) => assignment.status !== 'CANCELLED');
  const assignedCount = activeAssignments.length;
  const claimedByMeCount =
    typeof labelerId === 'string' && labelerId.length > 0
      ? activeAssignments.filter((assignment) => assignment.assigneeId === labelerId).length
      : 0;
  const unassignedCount = task.items.filter((item) => item.status === 'UNASSIGNED').length;
  const quotaRemaining = task.quota === null ? unassignedCount : Math.max(0, task.quota - assignedCount);
  const remainingCount = Math.max(0, Math.min(unassignedCount, quotaRemaining));
  const claimedByMe = claimedByMeCount > 0;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    ownerId: task.createdBy?.id ?? task.createdById,
    ownerName: task.createdBy?.name ?? null,
    tags: task.tags,
    rewardRule: task.rewardRule,
    perUserLimit: task.perUserLimit,
    quota: task.quota,
    deadline: task.deadline?.toISOString() ?? null,
    datasetKind: task.template.datasetKind,
    templateId: task.template.id,
    templateName: task.template.name,
    datasetImportSummary: task.datasetImportSummary ?? null,
    itemCount: task.items.length,
    assignedCount,
    claimedByMeCount,
    remainingCount,
    claimedByMe,
    claimStatus: resolveClaimStatus({
      claimedByMe,
      remainingCount,
      deadline: task.deadline,
    }),
    previewItems: [],
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function toClaimAssignmentDto(
  assignment: AssignmentRecord,
  counts: { claimedItemCount: number; claimedCount: number },
): ClaimAssignmentDto {
  return {
    assignmentId: assignment.id,
    taskId: assignment.taskId,
    taskItemId: assignment.taskItemId,
    labelerId: assignment.assigneeId,
    status: assignment.status,
    claimedAt: assignment.claimedAt.toISOString(),
    claimedItemCount: counts.claimedItemCount,
    claimedCount: counts.claimedCount,
    taskItem: {
      id: assignment.taskItem.id,
      externalId: assignment.taskItem.externalId,
      datasetKind: assignment.taskItem.datasetKind,
      rawData: assignment.taskItem.rawData,
    },
  };
}

function matchesMarketQuery(task: MarketTaskDto, query: MarketTaskQuery): boolean {
  if (query.keyword && !matchesKeyword(task, query.keyword)) {
    return false;
  }

  if (query.tag && !task.tags.some((tag) => tag.includes(query.tag ?? ''))) {
    return false;
  }

  return !query.claimStatus || task.claimStatus === query.claimStatus;
}

function matchesKeyword(task: MarketTaskDto, keyword: string): boolean {
  return [task.title, task.description, task.templateName, ...task.tags]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.includes(keyword));
}

function resolveClaimStatus(input: {
  claimedByMe: boolean;
  remainingCount: number;
  deadline: Date | null;
}): MarketClaimStatus {
  if (isDeadlineExpired(input.deadline)) {
    return 'expired';
  }

  if (input.claimedByMe) {
    return 'claimed';
  }

  if (input.remainingCount <= 0) {
    return 'full';
  }

  return 'available';
}

function assertTaskCanBeClaimed(task: ClaimTaskRecord): void {
  if (task.status !== 'PUBLISHED') {
    throw new BadRequestException({
      code: 'TASK_NOT_CLAIMABLE',
      message: '任务未发布，暂时不能领取。',
    });
  }

  if (isDeadlineExpired(task.deadline)) {
    throw new BadRequestException({
      code: 'TASK_DEADLINE_EXPIRED',
      message: '任务已截止，不能继续领取。',
    });
  }
}

function isDeadlineExpired(deadline: Date | null): boolean {
  return deadline !== null && deadline.getTime() <= Date.now();
}

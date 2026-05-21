import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TASK_STATUS_LABELS, type TaskStatus } from '@labelhub/shared';

import type { CreateTaskInput, DistributionStrategy } from './dto/create-task.dto.ts';
import type { UpdateTaskStatusInput } from './dto/update-task-status.dto.ts';
import type { UpdateTaskInput } from './dto/update-task.dto.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { StateMachineService } from '../state-machine/state-machine.service.ts';

type TemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

type TaskTemplateSummary = {
  id: string;
  name: string;
  schemaVersion: string;
  status: TemplateStatus;
};

type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  richTextInstruction: string | null;
  tags: string[];
  rewardRule: string | null;
  quota: number | null;
  deadline: Date | null;
  distributionStrategy: DistributionStrategy;
  aiPreReviewEnabled: boolean;
  aiRuleName: string | null;
  status: TaskStatus;
  templateId: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  template: TaskTemplateSummary;
  _count: { items: number };
};

export type TaskDto = Omit<TaskRecord, 'deadline' | 'createdAt' | 'updatedAt' | '_count'> & {
  deadline: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskAuditLogDto = {
  taskId: string;
  fromStatus?: string;
  toStatus: string;
  actorId?: string;
  reason?: string;
  metadata?: unknown;
};

type TaskQueryInput = {
  ownerId?: string;
  status?: TaskStatus;
};

type TasksPrismaClient = {
  task: {
    create: (args: { data: Record<string, unknown>; include?: unknown }) => Promise<TaskRecord>;
    findMany: (args?: { where?: Record<string, unknown>; orderBy?: { updatedAt: 'desc' | 'asc' }; include?: unknown }) => Promise<TaskRecord[]>;
    findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<TaskRecord | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown>; include?: unknown }) => Promise<TaskRecord>;
  };
  auditLog: {
    create: (args: { data: TaskAuditLogDto }) => Promise<unknown>;
    findMany: (args: { where: { taskId: string }; orderBy?: { createdAt: 'asc' | 'desc' } }) => Promise<TaskAuditLogDto[]>;
  };
  $transaction: <TResult>(callback: (client: TasksPrismaClient) => Promise<TResult>) => Promise<TResult>;
};

const TASK_INCLUDE = {
  template: {
    select: {
      id: true,
      name: true,
      schemaVersion: true,
      status: true,
    },
  },
  _count: { select: { items: true } },
} as const;

@Injectable()
export class TasksService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: TasksPrismaClient,
    @Inject(StateMachineService)
    private readonly stateMachine: Pick<StateMachineService, 'assertTaskTransition'>,
  ) {}

  async create(input: CreateTaskInput): Promise<TaskDto> {
    const task = await this.prisma.task.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        richTextInstruction: input.richTextInstruction ?? null,
        tags: input.tags ?? [],
        rewardRule: input.rewardRule ?? null,
        quota: input.quota ?? null,
        deadline: input.deadline ? new Date(input.deadline) : null,
        distributionStrategy: input.distributionStrategy ?? 'FIRST_COME_FIRST_SERVE',
        aiPreReviewEnabled: input.aiPreReviewEnabled ?? false,
        aiRuleName: input.aiRuleName ?? null,
        status: input.status ?? 'DRAFT',
        templateId: input.templateId,
        createdById: input.actorId ?? null,
      },
      include: TASK_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        taskId: task.id,
        toStatus: task.status,
        actorId: input.actorId,
        metadata: { action: 'TASK_CREATED' },
      },
    });

    return toTaskDto(task);
  }

  async list(query: TaskQueryInput = {}): Promise<TaskDto[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        ...(query.ownerId ? { createdById: query.ownerId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: TASK_INCLUDE,
    });

    return tasks.map(toTaskDto);
  }

  async get(taskId: string): Promise<TaskDto> {
    return toTaskDto(await this.findTaskOrThrow(taskId));
  }

  async update(taskId: string, input: UpdateTaskInput): Promise<TaskDto> {
    await this.findTaskOrThrow(taskId);
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.richTextInstruction !== undefined
          ? { richTextInstruction: input.richTextInstruction }
          : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.rewardRule !== undefined ? { rewardRule: input.rewardRule } : {}),
        ...(input.quota !== undefined ? { quota: input.quota } : {}),
        ...(input.deadline !== undefined
          ? { deadline: input.deadline ? new Date(input.deadline) : null }
          : {}),
        ...(input.distributionStrategy !== undefined
          ? { distributionStrategy: input.distributionStrategy }
          : {}),
        ...(input.aiPreReviewEnabled !== undefined
          ? { aiPreReviewEnabled: input.aiPreReviewEnabled }
          : {}),
        ...(input.aiRuleName !== undefined ? { aiRuleName: input.aiRuleName } : {}),
        ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
      },
      include: TASK_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        taskId,
        toStatus: task.status,
        metadata: { action: 'TASK_UPDATED' },
      },
    });

    return toTaskDto(task);
  }

  async updateStatus(taskId: string, input: UpdateTaskStatusInput): Promise<TaskDto> {
    const current = await this.findTaskOrThrow(taskId);
    assertTaskTransition(this.stateMachine, current.status, input.status);

    if (current.status === 'DRAFT' && input.status === 'PUBLISHED') {
      assertPublishChecklist(current, input);
    }

    return this.prisma.$transaction(async (client) => {
      const task = await client.task.update({
        where: { id: taskId },
        data: { status: input.status },
        include: TASK_INCLUDE,
      });
      await client.auditLog.create({
        data: {
          taskId,
          fromStatus: current.status,
          toStatus: input.status,
          actorId: input.actorId,
          reason: input.reason,
          metadata: { action: actionForStatus(input.status) },
        },
      });

      return toTaskDto(task);
    });
  }

  listAuditLogs(taskId: string): Promise<TaskAuditLogDto[]> {
    return this.prisma.auditLog.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async findTaskOrThrow(taskId: string): Promise<TaskRecord> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: TASK_INCLUDE,
    });

    if (!task) {
      throw new NotFoundException({
        code: 'TASK_NOT_FOUND',
        message: '任务不存在或已被删除。',
      });
    }

    return task;
  }
}

const assertTaskTransition = (
  stateMachine: Pick<StateMachineService, 'assertTaskTransition'>,
  from: TaskStatus,
  to: TaskStatus,
) => {
  try {
    stateMachine.assertTaskTransition(from, to);
  } catch (error) {
    throw new ConflictException({
      code: 'TASK_STATUS_TRANSITION_INVALID',
      message: error instanceof Error ? error.message : '任务状态流转不合法。',
    });
  }
};

const assertPublishChecklist = (task: TaskRecord, input: UpdateTaskStatusInput) => {
  const missingItems: string[] = [];

  if (!input.confirm) {
    missingItems.push('需要确认发布');
  }

  if (!task.title.trim()) {
    missingItems.push('任务标题');
  }

  if (!task.quota || task.quota <= 0) {
    missingItems.push('配额');
  }

  if (!task.deadline) {
    missingItems.push('截止时间');
  }

  if (!task.distributionStrategy) {
    missingItems.push('分发策略');
  }

  if (task.template.status !== 'PUBLISHED') {
    missingItems.push('已发布模板');
  }

  if (task._count.items <= 0) {
    missingItems.push('题目数据');
  }

  if (missingItems.length > 0) {
    throw new BadRequestException({
      code: 'TASK_PUBLISH_CHECK_FAILED',
      message: `发布前校验未通过：${missingItems.join('、')}。`,
    });
  }
};

const actionForStatus = (status: TaskStatus): string => {
  const actions: Record<TaskStatus, string> = {
    DRAFT: 'TASK_UPDATED',
    PUBLISHED: 'TASK_PUBLISHED',
    PAUSED: 'TASK_PAUSED',
    ENDED: 'TASK_ENDED',
  };

  return actions[status];
};

const toTaskDto = (task: TaskRecord): TaskDto => ({
  id: task.id,
  title: task.title,
  description: task.description,
  richTextInstruction: task.richTextInstruction,
  tags: task.tags,
  rewardRule: task.rewardRule,
  quota: task.quota,
  deadline: task.deadline ? task.deadline.toISOString() : null,
  distributionStrategy: task.distributionStrategy,
  aiPreReviewEnabled: task.aiPreReviewEnabled,
  aiRuleName: task.aiRuleName,
  status: task.status,
  templateId: task.templateId,
  template: task.template,
  createdById: task.createdById,
  itemCount: task._count.items,
  createdAt: task.createdAt.toISOString(),
  updatedAt: task.updatedAt.toISOString(),
});

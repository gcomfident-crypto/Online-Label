import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { StateMachineService } from '../state-machine/state-machine.service.ts';
import { TasksService } from './tasks.service.ts';

type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  richTextInstruction: string | null;
  tags: string[];
  rewardRule: string | null;
  quota: number | null;
  deadline: Date | null;
  distributionStrategy: 'FIRST_COME_FIRST_SERVE' | 'ASSIGNMENT' | 'QUOTA_RACE';
  aiPreReviewEnabled: boolean;
  aiRuleName: string | null;
  reviewStageConfig: ('INITIAL' | 'RECHECK' | 'FINAL')[];
  status: 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ENDED';
  templateId: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  template: {
    id: string;
    name: string;
    schemaVersion: string;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  };
  _count: { items: number };
};

type AuditRecord = {
  taskId: string;
  fromStatus?: string;
  toStatus: string;
  actorId?: string;
  reason?: string;
  metadata?: unknown;
};

type MockTasksPrisma = {
  task: {
    create: (args: { data: Partial<TaskRecord> }) => Promise<TaskRecord>;
    findMany: () => Promise<TaskRecord[]>;
    findUnique: (args: { where: { id: string } }) => Promise<TaskRecord | null>;
    update: (args: { where: { id: string }; data: Partial<TaskRecord> }) => Promise<TaskRecord>;
  };
  auditLog: {
    create: (args: { data: AuditRecord }) => Promise<AuditRecord>;
    findMany: (args: { where: { taskId: string } }) => Promise<AuditRecord[]>;
  };
  $transaction: <TResult>(callback: (client: MockTasksPrisma) => Promise<TResult>) => Promise<TResult>;
};

describe('TasksService', () => {
  it('创建任务后状态为草稿并写入审计日志', async () => {
    const { service, auditLogs } = createService();

    const task = await service.create({
      title: '问答质量任务',
      description: '请评估问答质量',
      templateId: 'template_qa',
      actorId: 'user_owner_001',
      quota: 30,
      deadline: '2026-06-01T15:59:00.000Z',
      distributionStrategy: 'FIRST_COME_FIRST_SERVE',
    });

    expect(task.status).toBe('DRAFT');
    expect(task.title).toBe('问答质量任务');
    expect(auditLogs).toEqual([
      expect.objectContaining({
        taskId: task.id,
        toStatus: 'DRAFT',
        actorId: 'user_owner_001',
        metadata: { action: 'TASK_CREATED' },
      }),
    ]);
  });

  it('草稿发布、暂停、恢复和结束均通过状态机并写入审计日志', async () => {
    const { service, auditLogs } = createService();
    const task = await service.create({
      title: '可发布任务',
      templateId: 'template_qa',
      actorId: 'user_owner_001',
      quota: 30,
      deadline: '2026-06-01T15:59:00.000Z',
      distributionStrategy: 'FIRST_COME_FIRST_SERVE',
    });

    await expect(
      service.updateStatus(task.id, {
        status: 'PUBLISHED',
        actorId: 'user_owner_001',
        confirm: true,
      }),
    ).resolves.toMatchObject({ status: 'PUBLISHED' });
    await expect(
      service.updateStatus(task.id, { status: 'PAUSED', actorId: 'user_owner_001' }),
    ).resolves.toMatchObject({ status: 'PAUSED' });
    await expect(
      service.updateStatus(task.id, { status: 'PUBLISHED', actorId: 'user_owner_001' }),
    ).resolves.toMatchObject({ status: 'PUBLISHED' });
    await expect(
      service.updateStatus(task.id, { status: 'ENDED', actorId: 'user_owner_001' }),
    ).resolves.toMatchObject({ status: 'ENDED' });

    expect(auditLogs.map((auditLog) => auditLog.toStatus)).toEqual([
      'DRAFT',
      'PUBLISHED',
      'PAUSED',
      'PUBLISHED',
      'ENDED',
    ]);
    expect(auditLogs.map((auditLog) => auditLog.metadata)).toEqual([
      { action: 'TASK_CREATED' },
      { action: 'TASK_PUBLISHED' },
      { action: 'TASK_PAUSED' },
      { action: 'TASK_RESUMED' },
      { action: 'TASK_ENDED' },
    ]);
  });

  it('已结束任务不能恢复发布', async () => {
    const { service } = createService({
      status: 'ENDED',
    });

    await expect(
      service.updateStatus('task_1', { status: 'PUBLISHED', actorId: 'user_owner_001' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('发布前拒绝未满足校验项的任务', async () => {
    const { service } = createService({
      quota: null,
      deadline: null,
      _count: { items: 0 },
    });

    await expect(
      service.updateStatus('task_1', {
        status: 'PUBLISHED',
        actorId: 'user_owner_001',
        confirm: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('查询不存在任务返回 NotFoundException', async () => {
    const { service } = createService();

    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('保存审核阶段配置时规范化为默认链路或完整链路并写入审计日志', async () => {
    const { service, auditLogs } = createService();

    await expect(
      service.updateReviewStageConfig('task_1', {
        reviewStageConfig: ['FINAL'],
        actorId: 'user_owner_001',
      }),
    ).resolves.toMatchObject({
      id: 'task_1',
      reviewStageConfig: ['RECHECK', 'FINAL'],
    });

    await expect(
      service.updateReviewStageConfig('task_1', {
        reviewStageConfig: ['INITIAL'],
        actorId: 'user_owner_001',
      }),
    ).resolves.toMatchObject({
      id: 'task_1',
      reviewStageConfig: ['INITIAL', 'RECHECK', 'FINAL'],
    });

    expect(auditLogs.at(-1)).toEqual(
      expect.objectContaining({
        taskId: 'task_1',
        toStatus: 'DRAFT',
        actorId: 'user_owner_001',
        metadata: {
          action: 'TASK_REVIEW_STAGE_CONFIG_UPDATED',
          reviewStageConfig: ['INITIAL', 'RECHECK', 'FINAL'],
        },
      }),
    );
  });
});

function createService(overrides: Partial<TaskRecord> = {}) {
  const now = new Date('2026-05-21T00:00:00.000Z');
  const auditLogs: AuditRecord[] = [];
  const tasks: TaskRecord[] = [
    {
      id: 'task_1',
      title: '示例任务',
      description: '示例任务描述',
      richTextInstruction: null,
      tags: ['问答质量'],
      rewardRule: '0.30 元 / 条',
      quota: 30,
      deadline: new Date('2026-06-01T15:59:00.000Z'),
      distributionStrategy: 'FIRST_COME_FIRST_SERVE',
      aiPreReviewEnabled: true,
      aiRuleName: '问答质量 v1',
      reviewStageConfig: ['RECHECK', 'FINAL'],
      status: 'DRAFT',
      templateId: 'template_qa',
      createdById: 'user_owner_001',
      createdAt: now,
      updatedAt: now,
      template: {
        id: 'template_qa',
        name: '问答质量官方模板',
        schemaVersion: 'r1',
        status: 'PUBLISHED',
      },
      _count: { items: 1 },
      ...overrides,
    },
  ];
  let sequence = 2;
  const prisma: MockTasksPrisma = {
    task: {
      create: async ({ data }: { data: Partial<TaskRecord> }) => {
        const task: TaskRecord = {
          ...tasks[0],
          ...data,
          id: data.id ?? `task_${sequence++}`,
          status: data.status ?? 'DRAFT',
          createdAt: now,
          updatedAt: now,
        };
        tasks.push(task);
        return task;
      },
      findMany: async () => tasks,
      findUnique: async ({ where }: { where: { id: string } }) =>
        tasks.find((task) => task.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<TaskRecord> }) => {
        const index = tasks.findIndex((task) => task.id === where.id);
        const next = { ...tasks[index], ...data, updatedAt: now };
        tasks[index] = next;
        return next;
      },
    },
    auditLog: {
      create: async ({ data }: { data: AuditRecord }) => {
        auditLogs.push(data);
        return data;
      },
      findMany: async ({ where }: { where: { taskId: string } }) =>
        auditLogs.filter((auditLog) => auditLog.taskId === where.taskId),
    },
    $transaction: async <TResult>(callback: (client: typeof prisma) => Promise<TResult>) =>
      callback(prisma),
  };

  return {
    auditLogs,
    service: new TasksService(prisma, new StateMachineService()),
  };
}

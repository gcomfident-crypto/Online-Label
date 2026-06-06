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
  rewardPerItem: number | null;
  monthlyRewardCap: number | null;
  perUserLimit: number | null;
  quota: number | null;
  deadline: Date | null;
  distributionStrategy: 'FIRST_COME_FIRST_SERVE' | 'ASSIGNMENT' | 'QUOTA_RACE';
  aiPreReviewEnabled: boolean;
  aiRuleName: string | null;
  reviewStageConfig: ('INITIAL' | 'RECHECK')[];
  status: 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ENDED';
  templateId: string | null;
  createdById: string | null;
  datasetImportSummary: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  template: {
    id: string;
    name: string;
    datasetKind: 'qa_quality' | 'preference_compare' | 'generic_json';
    schemaVersion: string;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  } | null;
  items: Array<{ status: 'UNASSIGNED' | 'ASSIGNED' | 'COMPLETED' }>;
  assignments: Array<{
    id: string;
    status: string;
    claimedAt: Date;
    assignee: { id: string; name: string };
    submissions: Array<{
      id: string;
      status: string;
      round: number;
      submittedAt: Date;
      reviewRecords: Array<{
        id: string;
        stage: string;
        reviewerType: string;
        decision: string | null;
        reviewer: { id: string; name: string } | null;
        assignedReviewer: { id: string; name: string } | null;
        createdAt: Date;
      }>;
    }>;
  }>;
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
    delete: (args: { where: { id: string } }) => Promise<TaskRecord>;
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
      rewardPerItem: 0.3,
      perUserLimit: 12,
      quota: 30,
      deadline: '2026-06-01T15:59:00.000Z',
      distributionStrategy: 'FIRST_COME_FIRST_SERVE',
    });

    expect(task.status).toBe('DRAFT');
    expect(task.title).toBe('问答质量任务');
    expect(task.rewardPerItem).toBe(0.3);
    expect(task.rewardRule).toBe('0.30 元 / 条');
    expect(task.perUserLimit).toBe(12);
    expect(auditLogs).toEqual([
      expect.objectContaining({
        taskId: task.id,
        toStatus: 'DRAFT',
        actorId: 'user_owner_001',
        metadata: { action: 'TASK_CREATED' },
      }),
    ]);
  });

  it('允许草稿任务不选择关联模板', async () => {
    const { service, auditLogs } = createService();

    const task = await service.create({
      title: '未选择模板草稿',
      actorId: 'user_owner_001',
    });

    expect(task).toMatchObject({
      title: '未选择模板草稿',
      status: 'DRAFT',
      templateId: '',
      template: {
        id: '',
        name: '',
        datasetKind: 'generic_json',
        schemaVersion: '',
        status: 'DRAFT',
      },
    });
    expect(auditLogs.at(-1)).toEqual(
      expect.objectContaining({
        taskId: task.id,
        toStatus: 'DRAFT',
        actorId: 'user_owner_001',
        metadata: { action: 'TASK_CREATED' },
      }),
    );
  });

  it('拒绝创建缺少创建人的任务，避免产生不可见模板引用', async () => {
    const { service } = createService();

    await expect(
      service.create({
        title: '缺少创建人的任务',
        actorId: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
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

  it('任务 DTO 区分已导入题目数、已提交题目数和可导出题目数', async () => {
    const now = new Date('2026-05-21T00:00:00.000Z');
    const { service } = createService({
      _count: { items: 3 },
      items: [{ status: 'UNASSIGNED' }, { status: 'ASSIGNED' }, { status: 'COMPLETED' }],
      assignments: [
        createAssignmentFixture('assignment_1', {
          submissions: [
            createSubmissionFixture('submission_1', { status: 'FINAL_APPROVED', submittedAt: now }),
            createSubmissionFixture('submission_2', { status: 'NEEDS_REVISION', submittedAt: now }),
          ],
        }),
        createAssignmentFixture('assignment_2', {
          submissions: [
            createSubmissionFixture('submission_3', { status: 'HUMAN_PENDING', submittedAt: now }),
          ],
        }),
      ],
    });

    await expect(service.list()).resolves.toEqual([
      expect.objectContaining({
        itemCount: 3,
        assignedItemCount: 2,
        submittedItemCount: 3,
        completedItemCount: 1,
        exportableItemCount: 1,
      }),
    ]);
  });

  it('已发布任务全部题目最终通过后对外展示为已完成', async () => {
    const now = new Date('2026-05-21T00:00:00.000Z');
    const { service } = createService({
      status: 'PUBLISHED',
      _count: { items: 2 },
      items: [{ status: 'COMPLETED' }, { status: 'COMPLETED' }],
      assignments: [
        createAssignmentFixture('assignment_1', {
          submissions: [
            createSubmissionFixture('submission_1', { status: 'FINAL_APPROVED', submittedAt: now }),
          ],
        }),
        createAssignmentFixture('assignment_2', {
          submissions: [
            createSubmissionFixture('submission_2', { status: 'FINAL_APPROVED', submittedAt: now }),
          ],
        }),
      ],
    });

    await expect(service.list()).resolves.toEqual([
      expect.objectContaining({
        status: 'ENDED',
        itemCount: 2,
        completedItemCount: 2,
        exportableItemCount: 2,
      }),
    ]);
  });

  it('任务 DTO 生成包含真实人名的进度事件', async () => {
    const { service } = createService({
      status: 'PUBLISHED',
      assignments: [
        createAssignmentFixture('assignment_1', {
          assignee: { id: 'labeler_zhang', name: '张三' },
          submissions: [
            createSubmissionFixture('submission_1', {
              round: 1,
              status: 'FINAL_APPROVED',
              reviewRecords: [
                createReviewRecordFixture('review_ai', {
                  stage: 'AI_PRECHECK',
                  reviewerType: 'AI',
                  decision: 'pass',
                }),
                createReviewRecordFixture('review_final', {
                  stage: 'FINAL',
                  reviewerType: 'HUMAN',
                  decision: 'final_pass',
                  reviewer: { id: 'reviewer_wang', name: '王五' },
                }),
              ],
            }),
          ],
        }),
        createAssignmentFixture('assignment_2', {
          assignee: { id: 'labeler_zhang', name: '张三' },
          submissions: [],
        }),
      ],
    });

    await expect(service.get('task_1')).resolves.toEqual(
      expect.objectContaining({
        workflowProgress: expect.arrayContaining([
          expect.objectContaining({ type: 'published' }),
          expect.objectContaining({ type: 'claimed', actorName: '张三', itemCount: 2 }),
          expect.objectContaining({ type: 'ai_review_submitted', actorName: '张三' }),
          expect.objectContaining({ type: 'ai_review_passed' }),
          expect.objectContaining({ type: 'reviewer_final', actorName: '王五' }),
        ]),
      }),
    );
  });

  it('未启用 AI 预审的任务进度不生成 AI 预审节点', async () => {
    const { service } = createService({
      status: 'PUBLISHED',
      aiPreReviewEnabled: false,
      assignments: [
        createAssignmentFixture('assignment_1', {
          assignee: { id: 'labeler_zhang', name: '张三' },
          submissions: [
            createSubmissionFixture('submission_1', {
              round: 1,
              status: 'HUMAN_PENDING',
            }),
          ],
        }),
      ],
    });

    const task = await service.get('task_1');

    expect(task.workflowProgress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'published' }),
        expect.objectContaining({ type: 'claimed', actorName: '张三', itemCount: 1 }),
        expect.objectContaining({ type: 'submitted', actorName: '张三' }),
        expect.objectContaining({ type: 'reviewer_final', status: 'pending' }),
      ]),
    );
    expect(task.workflowProgress.some((event) => event.type.startsWith('ai_review'))).toBe(false);
  });

  it('任务 DTO 返回已持久化的题目数据导入摘要', async () => {
    const datasetImportSummary = {
      taskId: 'task_1',
      datasetKind: 'qa_quality',
      importedCount: 1,
      errorCount: 0,
      skippedFiles: [],
      fields: ['id', 'prompt'],
      errors: [],
      preview: [],
      files: [
        {
          datasetKind: 'qa_quality',
          format: 'json',
          fileName: 'qa_refresh.json',
          fields: ['id', 'prompt'],
          importedCount: 1,
          errorCount: 0,
        },
      ],
    } satisfies Record<string, unknown>;
    const { service } = createService({ datasetImportSummary });

    await expect(service.list()).resolves.toEqual([
      expect.objectContaining({
        datasetImportSummary,
      }),
    ]);
  });

  it('查询不存在任务返回 NotFoundException', async () => {
    const { service } = createService();

    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('删除任务后列表不再返回该任务', async () => {
    const { service } = createService();

    await expect(service.deleteTask('task_1')).resolves.toEqual({ id: 'task_1' });
    await expect(service.list()).resolves.toEqual([]);
    await expect(service.deleteTask('task_1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('保存审核阶段配置时规范化为复审链路并写入审计日志', async () => {
    const { service, auditLogs } = createService();

    await expect(
      service.updateReviewStageConfig('task_1', {
        reviewStageConfig: ['FINAL'],
        actorId: 'user_owner_001',
      }),
    ).resolves.toMatchObject({
      id: 'task_1',
      reviewStageConfig: ['RECHECK'],
    });

    await expect(
      service.updateReviewStageConfig('task_1', {
        reviewStageConfig: ['INITIAL'],
        actorId: 'user_owner_001',
      }),
    ).resolves.toMatchObject({
      id: 'task_1',
      reviewStageConfig: ['INITIAL', 'RECHECK'],
    });

    expect(auditLogs.at(-1)).toEqual(
      expect.objectContaining({
        taskId: 'task_1',
        toStatus: 'DRAFT',
        actorId: 'user_owner_001',
        metadata: {
          action: 'TASK_REVIEW_STAGE_CONFIG_UPDATED',
          reviewStageConfig: ['INITIAL', 'RECHECK'],
        },
      }),
    );
  });
});

function normalizeTaskTemplateRelation(task: TaskRecord): TaskRecord {
  if (task.templateId) {
    return task;
  }

  return {
    ...task,
    templateId: null,
    template: null,
  };
}

function createAssignmentFixture(
  id: string,
  overrides: Partial<TaskRecord['assignments'][number]> = {},
): TaskRecord['assignments'][number] {
  const now = new Date('2026-05-21T10:00:00.000Z');

  return {
    id,
    status: 'ASSIGNED',
    claimedAt: now,
    assignee: { id: 'labeler_1', name: '李雷' },
    submissions: [],
    ...overrides,
  };
}

function createSubmissionFixture(
  id: string,
  overrides: Partial<TaskRecord['assignments'][number]['submissions'][number]> = {},
): TaskRecord['assignments'][number]['submissions'][number] {
  const now = new Date('2026-05-21T10:05:00.000Z');

  return {
    id,
    status: 'HUMAN_PENDING',
    round: 1,
    submittedAt: now,
    reviewRecords: [],
    ...overrides,
  };
}

function createReviewRecordFixture(
  id: string,
  overrides: Partial<TaskRecord['assignments'][number]['submissions'][number]['reviewRecords'][number]> = {},
): TaskRecord['assignments'][number]['submissions'][number]['reviewRecords'][number] {
  const now = new Date('2026-05-21T10:10:00.000Z');

  return {
    id,
    stage: 'AI_PRECHECK',
    reviewerType: 'AI',
    decision: 'pass',
    reviewer: null,
    assignedReviewer: null,
    createdAt: now,
    ...overrides,
  };
}

function createService(overrides: Partial<TaskRecord> = {}) {
  const now = new Date('2026-05-21T00:00:00.000Z');
  const auditLogs: AuditRecord[] = [];
  const tasks: TaskRecord[] = [
    normalizeTaskTemplateRelation({
      id: 'task_1',
      title: '示例任务',
      description: '示例任务描述',
      richTextInstruction: null,
      tags: ['问答质量'],
      rewardRule: '0.30 元 / 条',
      rewardPerItem: 0.3,
      monthlyRewardCap: 1500,
      perUserLimit: 10,
      quota: 30,
      deadline: new Date('2026-06-01T15:59:00.000Z'),
      distributionStrategy: 'FIRST_COME_FIRST_SERVE',
      aiPreReviewEnabled: true,
      aiRuleName: '问答质量 v1',
      reviewStageConfig: ['RECHECK'],
      status: 'DRAFT',
      templateId: 'template_qa',
      createdById: 'user_owner_001',
      datasetImportSummary: null,
      createdAt: now,
      updatedAt: now,
      template: {
        id: 'template_qa',
        name: '问答质量官方模板',
        datasetKind: 'qa_quality',
        schemaVersion: 'r1',
        status: 'PUBLISHED',
      },
      items: [{ status: 'UNASSIGNED' }],
      assignments: [],
      _count: { items: 1 },
      ...overrides,
    }),
  ];
  let sequence = 2;
  const prisma: MockTasksPrisma = {
    task: {
      create: async ({ data }: { data: Partial<TaskRecord> }) => {
        const task = normalizeTaskTemplateRelation({
          ...tasks[0],
          ...data,
          id: data.id ?? `task_${sequence++}`,
          status: data.status ?? 'DRAFT',
          createdAt: now,
          updatedAt: now,
        });
        tasks.push(task);
        return task;
      },
      findMany: async () => tasks,
      findUnique: async ({ where }: { where: { id: string } }) =>
        tasks.find((task) => task.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<TaskRecord> }) => {
        const index = tasks.findIndex((task) => task.id === where.id);
        const next = normalizeTaskTemplateRelation({ ...tasks[index], ...data, updatedAt: now });
        tasks[index] = next;
        return next;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = tasks.findIndex((task) => task.id === where.id);
        const [deletedTask] = tasks.splice(index, 1);

        return deletedTask;
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

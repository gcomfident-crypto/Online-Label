import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { AssignmentsService } from './assignments.service.ts';

type AssignmentStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'CANCELLED';
type TaskItemStatus = 'UNASSIGNED' | 'ASSIGNED' | 'COMPLETED';

type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  rewardRule: string | null;
  quota: number | null;
  deadline: Date | null;
  status: 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ENDED';
  template: {
    id: string;
    name: string;
    datasetKind: 'qa_quality' | 'preference_compare' | 'generic_json';
  };
  items: Array<{ id: string; status: TaskItemStatus }>;
  assignments: Array<{ id: string; assigneeId: string; status: AssignmentStatus }>;
  createdAt: Date;
  updatedAt: Date;
};

type TaskItemRecord = {
  id: string;
  taskId: string;
  externalId: string;
  datasetKind: 'qa_quality' | 'preference_compare' | 'generic_json';
  rawData: Record<string, unknown>;
  status: TaskItemStatus;
  sortOrder: number;
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
  createdAt: Date;
  updatedAt: Date;
  taskItem: TaskItemRecord;
};

type MockAssignmentsPrisma = {
  task: {
    findMany: () => Promise<TaskRecord[]>;
    findUnique: (args: { where: { id: string } }) => Promise<TaskRecord | null>;
  };
  taskItem: {
    findFirst: (args: { where: { taskId: string; status: TaskItemStatus } }) => Promise<TaskItemRecord | null>;
    updateMany: (args: {
      where: { id: string; status: TaskItemStatus };
      data: { status: TaskItemStatus };
    }) => Promise<{ count: number }>;
  };
  assignment: {
    count: (args: { where: { taskId: string; status?: { not: AssignmentStatus } } }) => Promise<number>;
    create: (args: { data: Partial<AssignmentRecord>; include?: unknown }) => Promise<AssignmentRecord>;
  };
  $transaction: <TResult>(callback: (client: MockAssignmentsPrisma) => Promise<TResult>) => Promise<TResult>;
};

describe('AssignmentsService', () => {
  it('只把发布中任务展示到任务广场并支持关键词、标签和已领取筛选', async () => {
    const { service } = createService();

    await expect(service.listMarketTasks({ keyword: '问答', labelerId: 'user_labeler_1' })).resolves.toEqual([
      expect.objectContaining({
        id: 'task_qa',
        title: '问答质量标注',
        datasetKind: 'qa_quality',
        itemCount: 2,
        assignedCount: 1,
        remainingCount: 1,
        claimStatus: 'available',
        claimedByMe: false,
      }),
    ]);
    await expect(service.listMarketTasks({ tag: '偏好', claimStatus: 'claimed', labelerId: 'user_labeler_1' })).resolves.toEqual([
      expect.objectContaining({
        id: 'task_preference',
        claimStatus: 'claimed',
        claimedByMe: true,
      }),
    ]);
  });

  it('领取任务时在事务中锁定一条未领取题目并创建 assignment', async () => {
    const { service, assignments, items } = createService({
      assignments: [
        {
          id: 'assignment_1',
          taskId: 'task_qa',
          taskItemId: 'item_qa_2',
          assigneeId: 'user_labeler_other',
        },
      ],
    });

    const result = await service.claim({
      taskId: 'task_qa',
      labelerId: 'user_labeler_1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        assignmentId: 'assignment_2',
        taskId: 'task_qa',
        taskItemId: 'item_qa_1',
        labelerId: 'user_labeler_1',
        status: 'ASSIGNED',
        claimedCount: 2,
      }),
    );
    expect(items.find((item) => item.id === 'item_qa_1')?.status).toBe('ASSIGNED');
    expect(assignments).toHaveLength(2);
  });

  it('并发领取同一题时只创建一个有效 assignment', async () => {
    const { service, assignments } = createService({
      tasks: [{ id: 'task_qa', quota: 2 }],
      assignments: [],
      items: [{ id: 'item_qa_2', status: 'ASSIGNED' }],
    });

    const results = await Promise.allSettled([
      service.claim({ taskId: 'task_qa', labelerId: 'user_labeler_1' }),
      service.claim({ taskId: 'task_qa', labelerId: 'user_labeler_2' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      taskId: 'task_qa',
      taskItemId: 'item_qa_1',
      status: 'ASSIGNED',
    });
  });

  it('配额用尽、已截止或未发布任务不能领取', async () => {
    const { service } = createService({
      tasks: [
        { id: 'task_qa', quota: 1 },
        { id: 'task_preference', deadline: new Date('2026-05-20T00:00:00.000Z') },
        { id: 'task_draft', status: 'DRAFT' },
      ],
    });

    await expect(
      service.claim({ taskId: 'task_qa', labelerId: 'user_labeler_1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.claim({ taskId: 'task_preference', labelerId: 'user_labeler_1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.claim({ taskId: 'task_draft', labelerId: 'user_labeler_1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('不存在的任务领取返回 NotFoundException', async () => {
    const { service } = createService();

    await expect(
      service.claim({ taskId: 'missing', labelerId: 'user_labeler_1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

function createService(
  overrides: {
    tasks?: Array<Partial<TaskRecord> & { id: string }>;
    items?: Array<Partial<TaskItemRecord> & { id: string }>;
    assignments?: Partial<AssignmentRecord>[];
  } = {},
) {
  const now = new Date('2026-05-21T00:00:00.000Z');
  const taskDefaults = createTaskDefaults(now);
  const itemDefaults = createItemDefaults(now);
  const tasks = taskDefaults.map((task) => ({
    ...task,
    ...overrides.tasks?.find((override) => override.id === task.id),
  }));
  const items = itemDefaults.map((item) => ({
    ...item,
    ...overrides.items?.find((override) => override.id === item.id),
  }));
  const assignments: AssignmentRecord[] =
    overrides.assignments === undefined
      ? [
          createAssignment(now, {
            id: 'assignment_1',
            taskId: 'task_qa',
            taskItemId: 'item_qa_2',
            assigneeId: 'user_labeler_other',
            taskItem: items[1],
          }),
          createAssignment(now, {
            id: 'assignment_preference_1',
            taskId: 'task_preference',
            taskItemId: 'item_preference_1',
            assigneeId: 'user_labeler_1',
            taskItem: items[2],
          }),
        ]
      : overrides.assignments.map((assignment, index) =>
          createAssignment(now, {
            id: assignment.id ?? `assignment_${index + 1}`,
            taskId: assignment.taskId ?? 'task_qa',
            taskItemId: assignment.taskItemId ?? 'item_qa_1',
            assigneeId: assignment.assigneeId ?? `user_labeler_${index + 1}`,
            status: assignment.status ?? 'ASSIGNED',
            taskItem: items.find((item) => item.id === assignment.taskItemId) ?? items[0],
          }),
        );

  const prisma: MockAssignmentsPrisma = {
    task: {
      findMany: async () => {
        return tasks.map((task) => ({
          ...task,
          items: items
            .filter((item) => item.taskId === task.id)
            .map((item) => ({ id: item.id, status: item.status })),
          assignments: assignments
            .filter((assignment) => assignment.taskId === task.id)
            .map((assignment) => ({
              id: assignment.id,
              assigneeId: assignment.assigneeId,
              status: assignment.status,
            })),
        }));
      },
      findUnique: async ({ where }) => tasks.find((task) => task.id === where.id) ?? null,
    },
    taskItem: {
      findFirst: async ({ where }) => {
        return (
          items
            .filter((item) => item.taskId === where.taskId && item.status === where.status)
            .sort((first, second) => first.sortOrder - second.sortOrder)[0] ?? null
        );
      },
      updateMany: async ({ where, data }) => {
        const item = items.find((candidate) => candidate.id === where.id);
        if (!item || item.status !== where.status) {
          return { count: 0 };
        }

        item.status = data.status;
        return { count: 1 };
      },
    },
    assignment: {
      count: async ({ where }) =>
        assignments.filter(
          (assignment) =>
            assignment.taskId === where.taskId &&
            (where.status?.not === undefined || assignment.status !== where.status.not),
        ).length,
      create: async ({ data }) => {
        const taskItem = items.find((item) => item.id === data.taskItemId);
        if (!taskItem) {
          throw new Error('题目不存在');
        }

        const assignment = createAssignment(now, {
          id: `assignment_${assignments.length + 1}`,
          taskId: String(data.taskId),
          taskItemId: String(data.taskItemId),
          assigneeId: String(data.assigneeId),
          status: (data.status as AssignmentStatus | undefined) ?? 'ASSIGNED',
          taskItem,
        });
        assignments.push(assignment);
        return assignment;
      },
    },
    $transaction: async <TResult>(callback: (client: MockAssignmentsPrisma) => Promise<TResult>) =>
      callback(prisma),
  };

  return {
    assignments,
    items,
    service: new AssignmentsService(prisma),
  };
}

function createTaskDefaults(now: Date): TaskRecord[] {
  return [
    {
      id: 'task_qa',
      title: '问答质量标注',
      description: '检查回答是否解决核心诉求。',
      tags: ['问答', '质量'],
      rewardRule: '0.30 元 / 条',
      quota: 10,
      deadline: new Date('2026-06-01T15:59:00.000Z'),
      status: 'PUBLISHED',
      template: {
        id: 'template_qa',
        name: '问答质量官方模板',
        datasetKind: 'qa_quality',
      },
      items: [],
      assignments: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'task_preference',
      title: '偏好对比任务',
      description: '比较两个候选回答。',
      tags: ['偏好', 'A/B'],
      rewardRule: '0.45 元 / 条',
      quota: 5,
      deadline: new Date('2026-06-05T15:59:00.000Z'),
      status: 'PUBLISHED',
      template: {
        id: 'template_preference',
        name: '偏好对比官方模板',
        datasetKind: 'preference_compare',
      },
      items: [],
      assignments: [
        {
          id: 'assignment_preference_1',
          assigneeId: 'user_labeler_1',
          status: 'ASSIGNED',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'task_draft',
      title: '草稿任务',
      description: '草稿不进入市场。',
      tags: ['草稿'],
      rewardRule: null,
      quota: 3,
      deadline: new Date('2026-06-10T15:59:00.000Z'),
      status: 'DRAFT',
      template: {
        id: 'template_qa',
        name: '问答质量官方模板',
        datasetKind: 'qa_quality',
      },
      items: [],
      assignments: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function createItemDefaults(now: Date): TaskItemRecord[] {
  return [
    {
      id: 'item_qa_1',
      taskId: 'task_qa',
      externalId: 'qa_1',
      datasetKind: 'qa_quality',
      rawData: { prompt: '如何判断回答质量？' },
      status: 'UNASSIGNED',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'item_qa_2',
      taskId: 'task_qa',
      externalId: 'qa_2',
      datasetKind: 'qa_quality',
      rawData: { prompt: '如何检查事实性？' },
      status: 'ASSIGNED',
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'item_preference_1',
      taskId: 'task_preference',
      externalId: 'pref_1',
      datasetKind: 'preference_compare',
      rawData: { prompt: '比较 A/B 回答' },
      status: 'UNASSIGNED',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function createAssignment(
  now: Date,
  input: {
    id: string;
    taskId: string;
    taskItemId: string;
    assigneeId: string;
    status?: AssignmentStatus;
    taskItem: TaskItemRecord;
  },
): AssignmentRecord {
  return {
    id: input.id,
    taskId: input.taskId,
    taskItemId: input.taskItemId,
    assigneeId: input.assigneeId,
    status: input.status ?? 'ASSIGNED',
    claimedAt: now,
    createdAt: now,
    updatedAt: now,
    taskItem: input.taskItem,
  };
}

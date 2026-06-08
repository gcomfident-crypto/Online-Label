import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  normalizeReviewStageConfig,
  type ConfigurableReviewStage,
  type DatasetKind,
  type TaskStatus,
} from '@labelhub/shared';

import type { CreateTaskInput, DistributionStrategy } from './dto/create-task.dto.ts';
import type { UpdateTaskStatusInput } from './dto/update-task-status.dto.ts';
import type { UpdateTaskInput } from './dto/update-task.dto.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { StateMachineService } from '../state-machine/state-machine.service.ts';

type TemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
type TaskItemStatus = 'UNASSIGNED' | 'ASSIGNED' | 'COMPLETED';

type TaskTemplateSummary = {
  id: string;
  name: string;
  datasetKind: DatasetKind;
  schemaVersion: string;
  status: TemplateStatus;
};

type PersistedDatasetImportSummary = Record<string, unknown>;

type UserSummary = {
  id: string;
  name: string;
};

type TaskAssignmentReviewRecord = {
  id: string;
  stage: string;
  reviewerType: string;
  decision: string | null;
  reviewer: UserSummary | null;
  assignedReviewer: UserSummary | null;
  createdAt: Date;
};

type TaskAssignmentSubmissionRecord = {
  id: string;
  status: string;
  round: number;
  submittedAt: Date;
  reviewRecords: TaskAssignmentReviewRecord[];
};

type TaskAssignmentRecord = {
  id: string;
  status: string;
  claimedAt: Date;
  assignee: UserSummary;
  submissions: TaskAssignmentSubmissionRecord[];
};

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
  distributionStrategy: DistributionStrategy;
  aiPreReviewEnabled: boolean;
  aiRuleName: string | null;
  reviewStageConfig: ConfigurableReviewStage[];
  datasetImportSummary: PersistedDatasetImportSummary | null;
  status: TaskStatus;
  templateId: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  template: TaskTemplateSummary | null;
  items: Array<{ status: TaskItemStatus }>;
  assignments: TaskAssignmentRecord[];
  _count: { items: number };
};

type TaskSummarySubmissionRecord = {
  id: string;
  status: string;
  round: number;
  submittedAt: Date;
};

type TaskSummaryAssignmentRecord = {
  id: string;
  status: string;
  claimedAt: Date;
  submissions: TaskSummarySubmissionRecord[];
};

type TaskSummaryRecord = {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  rewardRule: string | null;
  rewardPerItem: number | null;
  perUserLimit: number | null;
  quota: number | null;
  deadline: Date | null;
  distributionStrategy: DistributionStrategy;
  aiPreReviewEnabled: boolean;
  aiRuleName: string | null;
  status: TaskStatus;
  templateId: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  template: TaskTemplateSummary | null;
  items: Array<{ status: TaskItemStatus }>;
  assignments: TaskSummaryAssignmentRecord[];
  _count: { items: number };
};

export type TaskWorkflowProgressEventType =
  | 'published'
  | 'claimed'
  | 'submitted'
  | 'ai_review_submitted'
  | 'ai_review_rejected'
  | 'ai_review_passed'
  | 'reviewer_final';

export type TaskWorkflowProgressEvent = {
  id: string;
  type: TaskWorkflowProgressEventType;
  actorName?: string | null;
  itemCount?: number | null;
  createdAt?: string | null;
  status?: 'completed' | 'current' | 'pending' | 'warning';
};

export type TaskDto = Omit<
  TaskRecord,
  | 'deadline'
  | 'createdAt'
  | 'updatedAt'
  | 'items'
  | 'assignments'
  | '_count'
  | 'monthlyRewardCap'
  | 'templateId'
  | 'template'
> & {
  templateId: string;
  template: TaskTemplateSummary;
  deadline: string | null;
  itemCount: number;
  assignedItemCount: number;
  submittedItemCount: number;
  completedItemCount: number;
  exportableItemCount: number;
  workflowProgress: TaskWorkflowProgressEvent[];
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

export type DeleteTaskResult = {
  id: string;
};

type TaskQueryInput = {
  ownerId?: string;
  status?: TaskStatus;
};

export type UpdateReviewStageConfigInput = {
  reviewStageConfig: unknown;
  actorId?: string;
};

type TasksPrismaClient = {
  task: {
    create: (args: { data: Record<string, unknown>; include?: unknown }) => Promise<TaskRecord>;
    findMany: (args?: { where?: Record<string, unknown>; orderBy?: { updatedAt: 'desc' | 'asc' }; include?: unknown; select?: unknown }) => Promise<TaskRecord[]>;
    findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<TaskRecord | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown>; include?: unknown }) => Promise<TaskRecord>;
    delete: (args: { where: { id: string } }) => Promise<TaskRecord>;
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
      datasetKind: true,
      schemaVersion: true,
      status: true,
    },
  },
  items: {
    select: {
      status: true,
    },
  },
  assignments: {
    select: {
      id: true,
      status: true,
      claimedAt: true,
      assignee: {
        select: {
          id: true,
          name: true,
        },
      },
      submissions: {
        orderBy: {
          submittedAt: 'asc',
        },
        select: {
          id: true,
          status: true,
          round: true,
          submittedAt: true,
          reviewRecords: {
            orderBy: {
              createdAt: 'asc',
            },
            select: {
              id: true,
              stage: true,
              reviewerType: true,
              decision: true,
              reviewer: {
                select: {
                  id: true,
                  name: true,
                },
              },
              assignedReviewer: {
                select: {
                  id: true,
                  name: true,
                },
              },
              createdAt: true,
            },
          },
        },
      },
    },
  },
  _count: { select: { items: true } },
} as const;

const TASK_SUMMARY_SELECT = {
  id: true,
  title: true,
  description: true,
  tags: true,
  rewardRule: true,
  rewardPerItem: true,
  perUserLimit: true,
  quota: true,
  deadline: true,
  distributionStrategy: true,
  aiPreReviewEnabled: true,
  aiRuleName: true,
  status: true,
  templateId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  template: {
    select: {
      id: true,
      name: true,
      datasetKind: true,
      schemaVersion: true,
      status: true,
    },
  },
  items: {
    select: {
      status: true,
    },
  },
  assignments: {
    select: {
      id: true,
      status: true,
      claimedAt: true,
      submissions: {
        select: {
          id: true,
          status: true,
          round: true,
          submittedAt: true,
        },
      },
    },
  },
  _count: { select: { items: true } },
} as const;

const UNCONFIGURED_TASK_TEMPLATE: TaskTemplateSummary = {
  id: '',
  name: '',
  datasetKind: 'generic_json',
  schemaVersion: '',
  status: 'DRAFT',
};

@Injectable()
export class TasksService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: TasksPrismaClient,
    @Inject(StateMachineService)
    private readonly stateMachine: Pick<StateMachineService, 'assertTaskTransition'>,
  ) {}

  async create(input: CreateTaskInput): Promise<TaskDto> {
    const actorId = input.actorId.trim();

    if (!actorId) {
      throw new BadRequestException('创建任务必须提供创建人 actorId。');
    }

    const task = await this.prisma.task.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        richTextInstruction: input.richTextInstruction ?? null,
        tags: input.tags ?? [],
        rewardRule: formatRewardRule(input.rewardPerItem ?? null, input.rewardRule ?? null),
        rewardPerItem: input.rewardPerItem ?? null,
        monthlyRewardCap: null,
        perUserLimit: input.perUserLimit ?? null,
        quota: input.quota ?? null,
        deadline: input.deadline ? new Date(input.deadline) : null,
        distributionStrategy: input.distributionStrategy ?? 'FIRST_COME_FIRST_SERVE',
        aiPreReviewEnabled: input.aiPreReviewEnabled ?? false,
        aiRuleName: input.aiRuleName ?? null,
        status: input.status ?? 'DRAFT',
        templateId: input.templateId || null,
        createdById: actorId,
      },
      include: TASK_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        taskId: task.id,
        toStatus: task.status,
        actorId,
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

  async listSummaries(query: TaskQueryInput = {}): Promise<TaskDto[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        ...(query.ownerId ? { createdById: query.ownerId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: TASK_SUMMARY_SELECT,
    }) as unknown as TaskSummaryRecord[];

    return tasks.map(toTaskSummaryDto);
  }

  async get(taskId: string): Promise<TaskDto> {
    return toTaskDto(await this.findTaskOrThrow(taskId));
  }

  async update(taskId: string, input: UpdateTaskInput): Promise<TaskDto> {
    const current = await this.findTaskOrThrow(taskId);
    const rewardFieldsChanged = input.rewardPerItem !== undefined;
    const rewardPerItem = input.rewardPerItem !== undefined ? input.rewardPerItem : current.rewardPerItem;
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
        ...(input.rewardPerItem !== undefined ? { rewardPerItem: input.rewardPerItem } : {}),
        ...(input.perUserLimit !== undefined ? { perUserLimit: input.perUserLimit } : {}),
        ...(rewardFieldsChanged
          ? {
              rewardRule: formatRewardRule(rewardPerItem, input.rewardRule ?? current.rewardRule),
              monthlyRewardCap: null,
            }
          : {}),
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
        ...(input.templateId !== undefined ? { templateId: input.templateId || null } : {}),
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
          metadata: { action: actionForTransition(current.status, input.status) },
        },
      });

      return toTaskDto(task);
    });
  }

  async deleteTask(taskId: string): Promise<DeleteTaskResult> {
    await this.findTaskOrThrow(taskId);
    const task = await this.prisma.task.delete({ where: { id: taskId } });

    return { id: task.id };
  }

  async updateReviewStageConfig(taskId: string, input: UpdateReviewStageConfigInput): Promise<TaskDto> {
    const current = await this.findTaskOrThrow(taskId);
    const reviewStageConfig = normalizeReviewStageConfig(input.reviewStageConfig);

    return this.prisma.$transaction(async (client) => {
      const task = await client.task.update({
        where: { id: taskId },
        data: { reviewStageConfig },
        include: TASK_INCLUDE,
      });
      await client.auditLog.create({
        data: {
          taskId,
          toStatus: current.status,
          actorId: input.actorId,
          metadata: {
            action: 'TASK_REVIEW_STAGE_CONFIG_UPDATED',
            reviewStageConfig,
          },
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

  if (!task.template || task.template.status !== 'PUBLISHED') {
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

const actionForTransition = (from: TaskStatus, to: TaskStatus): string => {
  if (from === 'PAUSED' && to === 'PUBLISHED') {
    return 'TASK_RESUMED';
  }

  const actions: Record<TaskStatus, string> = {
    DRAFT: 'TASK_UPDATED',
    PUBLISHED: 'TASK_PUBLISHED',
    PAUSED: 'TASK_PAUSED',
    ENDED: 'TASK_ENDED',
  };

  return actions[to];
};

const toTaskDto = (task: TaskRecord): TaskDto => {
  const activeAssignments = activeTaskAssignments(task);
  const submissions = activeAssignments.flatMap((assignment) => assignment.submissions);
  const itemCount = task._count.items;
  const completedItemCount = task.items.filter((item) => item.status === 'COMPLETED').length;
  const exportableItemCount = submissions.filter((submission) => submission.status === 'FINAL_APPROVED').length;
  const status = resolveTaskDtoStatus(task.status, itemCount, completedItemCount, exportableItemCount);

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    richTextInstruction: task.richTextInstruction,
    tags: task.tags,
    rewardRule: formatRewardRule(task.rewardPerItem, task.rewardRule),
    rewardPerItem: task.rewardPerItem,
    perUserLimit: task.perUserLimit,
    quota: task.quota,
    deadline: task.deadline ? task.deadline.toISOString() : null,
    distributionStrategy: task.distributionStrategy,
    aiPreReviewEnabled: task.aiPreReviewEnabled,
    aiRuleName: task.aiRuleName,
    reviewStageConfig: task.reviewStageConfig,
    datasetImportSummary: task.datasetImportSummary,
    status,
    templateId: task.templateId ?? '',
    template: task.template ?? UNCONFIGURED_TASK_TEMPLATE,
    createdById: task.createdById,
    itemCount,
    assignedItemCount: activeAssignments.length,
    submittedItemCount: submissions.length,
    completedItemCount,
    exportableItemCount,
    workflowProgress: buildTaskWorkflowProgress(task),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
};

const toTaskSummaryDto = (task: TaskSummaryRecord): TaskDto => {
  const activeAssignments = task.assignments.filter((assignment) => assignment.status !== 'CANCELLED');
  const submissions = activeAssignments.flatMap((assignment) => assignment.submissions);
  const itemCount = task._count.items;
  const completedItemCount = task.items.filter((item) => item.status === 'COMPLETED').length;
  const exportableItemCount = submissions.filter((submission) => submission.status === 'FINAL_APPROVED').length;
  const status = resolveTaskDtoStatus(task.status, itemCount, completedItemCount, exportableItemCount);

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    richTextInstruction: null,
    tags: task.tags,
    rewardRule: formatRewardRule(task.rewardPerItem, task.rewardRule),
    rewardPerItem: task.rewardPerItem,
    perUserLimit: task.perUserLimit,
    quota: task.quota,
    deadline: task.deadline ? task.deadline.toISOString() : null,
    distributionStrategy: task.distributionStrategy,
    aiPreReviewEnabled: task.aiPreReviewEnabled,
    aiRuleName: task.aiRuleName,
    reviewStageConfig: [],
    datasetImportSummary: null,
    status,
    templateId: task.templateId ?? '',
    template: task.template ?? UNCONFIGURED_TASK_TEMPLATE,
    createdById: task.createdById,
    itemCount,
    assignedItemCount: activeAssignments.length,
    submittedItemCount: submissions.length,
    completedItemCount,
    exportableItemCount,
    workflowProgress: [],
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
};

const resolveTaskDtoStatus = (
  status: TaskStatus,
  itemCount: number,
  completedItemCount: number,
  exportableItemCount: number,
): TaskStatus => {
  if (
    status === 'PUBLISHED' &&
    itemCount > 0 &&
    completedItemCount >= itemCount &&
    exportableItemCount >= itemCount
  ) {
    return 'ENDED';
  }

  return status;
};

const activeTaskAssignments = (task: TaskRecord): TaskAssignmentRecord[] =>
  task.assignments.filter((assignment) => assignment.status !== 'CANCELLED');

const buildTaskWorkflowProgress = (task: TaskRecord): TaskWorkflowProgressEvent[] => {
  if (task.status === 'DRAFT') {
    return [];
  }

  const events: TaskWorkflowProgressEvent[] = [
    {
      id: `${task.id}:published`,
      type: 'published',
      createdAt: task.createdAt.toISOString(),
      status: 'completed',
    },
  ];
  const assignments = activeTaskAssignments(task);

  events.push(...buildClaimedProgressEvents(task.id, assignments));
  events.push(...buildSubmissionProgressEvents(task.id, assignments, task.aiPreReviewEnabled));
  if (task.aiPreReviewEnabled) {
    events.push(...buildAiReviewProgressEvents(task.id, assignments));
  }
  events.push(...buildFinalReviewProgressEvents(task.id, assignments));
  appendPendingProgressEvents(task.id, events, task.aiPreReviewEnabled);

  return events.sort(compareProgressEvents);
};

const buildClaimedProgressEvents = (
  taskId: string,
  assignments: TaskAssignmentRecord[],
): TaskWorkflowProgressEvent[] => {
  const groups = groupAssignmentsByActor(assignments);

  return [...groups.entries()].map(([actorId, group]) => ({
    id: `${taskId}:claimed:${actorId}`,
    type: 'claimed',
    actorName: group.actorName,
    itemCount: group.count,
    createdAt: group.createdAt.toISOString(),
    status: 'completed',
  }));
};

const buildSubmissionProgressEvents = (
  taskId: string,
  assignments: TaskAssignmentRecord[],
  hasAiPreReview: boolean,
): TaskWorkflowProgressEvent[] => {
  const groups = new Map<string, { actorName: string; round: number; createdAt: Date }>();

  for (const assignment of assignments) {
    for (const submission of assignment.submissions) {
      const actorId = assignment.assignee.id;
      const key = `${actorId}:${submission.round}`;
      const current = groups.get(key);
      if (!current || submission.submittedAt.getTime() < current.createdAt.getTime()) {
        groups.set(key, {
          actorName: assignment.assignee.name,
          round: submission.round,
          createdAt: submission.submittedAt,
        });
      }
    }
  }

  return [...groups.entries()].map(([key, group]) => ({
    id: `${taskId}:submitted:${key}`,
    type: hasAiPreReview ? 'ai_review_submitted' : 'submitted',
    actorName: group.actorName,
    createdAt: group.createdAt.toISOString(),
    status: 'completed',
  }));
};

const buildAiReviewProgressEvents = (
  taskId: string,
  assignments: TaskAssignmentRecord[],
): TaskWorkflowProgressEvent[] => {
  const groups = new Map<string, { type: 'ai_review_passed' | 'ai_review_rejected'; createdAt: Date }>();

  for (const assignment of assignments) {
    for (const submission of assignment.submissions) {
      for (const reviewRecord of submission.reviewRecords) {
        const type = aiReviewEventType(reviewRecord, submission);
        if (!type) {
          continue;
        }

        const key = `${type}:${submission.round}`;
        const current = groups.get(key);
        if (!current || reviewRecord.createdAt.getTime() < current.createdAt.getTime()) {
          groups.set(key, { type, createdAt: reviewRecord.createdAt });
        }
      }
    }
  }

  return [...groups.entries()].map(([key, group]) => ({
    id: `${taskId}:ai:${key}`,
    type: group.type,
    createdAt: group.createdAt.toISOString(),
    status: group.type === 'ai_review_rejected' ? 'warning' : 'completed',
  }));
};

const buildFinalReviewProgressEvents = (
  taskId: string,
  assignments: TaskAssignmentRecord[],
): TaskWorkflowProgressEvent[] => {
  const groups = new Map<string, { actorName: string; createdAt: Date }>();

  for (const assignment of assignments) {
    for (const submission of assignment.submissions) {
      for (const reviewRecord of finalReviewRecords(submission)) {
        const actor = reviewRecord.reviewer ?? reviewRecord.assignedReviewer;
        if (!actor) {
          continue;
        }

        const key = `${actor.id}:${submission.round}`;
        const current = groups.get(key);
        if (!current || reviewRecord.createdAt.getTime() < current.createdAt.getTime()) {
          groups.set(key, { actorName: actor.name, createdAt: reviewRecord.createdAt });
        }
      }
    }
  }

  return [...groups.entries()].map(([key, group]) => ({
    id: `${taskId}:final:${key}`,
    type: 'reviewer_final',
    actorName: group.actorName,
    createdAt: group.createdAt.toISOString(),
    status: 'completed',
  }));
};

const groupAssignmentsByActor = (
  assignments: TaskAssignmentRecord[],
): Map<string, { actorName: string; count: number; createdAt: Date }> => {
  const groups = new Map<string, { actorName: string; count: number; createdAt: Date }>();

  for (const assignment of assignments) {
    const actorId = assignment.assignee.id;
    const current = groups.get(actorId);
    if (!current) {
      groups.set(actorId, {
        actorName: assignment.assignee.name,
        count: 1,
        createdAt: assignment.claimedAt,
      });
      continue;
    }

    current.count += 1;
    if (assignment.claimedAt.getTime() < current.createdAt.getTime()) {
      current.createdAt = assignment.claimedAt;
    }
  }

  return groups;
};

const aiReviewEventType = (
  reviewRecord: TaskAssignmentReviewRecord,
  submission: TaskAssignmentSubmissionRecord,
): 'ai_review_passed' | 'ai_review_rejected' | null => {
  if (reviewRecord.stage !== 'AI_PRECHECK' || reviewRecord.reviewerType !== 'AI') {
    return null;
  }

  if (reviewRecord.decision === 'pass') {
    return 'ai_review_passed';
  }

  if (reviewRecord.decision === 'reject' || submission.status === 'AI_REJECTED') {
    return 'ai_review_rejected';
  }

  return null;
};

const finalReviewRecords = (
  submission: TaskAssignmentSubmissionRecord,
): TaskAssignmentReviewRecord[] => {
  const humanRecords = submission.reviewRecords.filter((record) => record.reviewerType === 'HUMAN');
  const explicitFinalRecords = humanRecords.filter((record) => record.stage === 'FINAL');

  if (explicitFinalRecords.length > 0) {
    return explicitFinalRecords;
  }

  if (submission.status !== 'FINAL_APPROVED') {
    return [];
  }

  return humanRecords.filter((record) =>
    ['final_pass', 'recheck_pass', 'revise_pass'].includes(record.decision ?? ''),
  );
};

const appendPendingProgressEvents = (
  taskId: string,
  events: TaskWorkflowProgressEvent[],
  hasAiPreReview: boolean,
): void => {
  const completedTypes = new Set(
    events
      .filter((event) => event.status !== 'pending')
      .map((event) => event.type),
  );
  const latestCompletedEvent = events
    .filter((event) => event.status !== 'pending')
    .sort(compareProgressEvents)
    .at(-1);
  const pendingCreatedAt = latestCompletedEvent?.createdAt ?? null;

  if (!completedTypes.has('claimed')) {
    events.push(pendingProgressEvent(taskId, 'claimed', pendingCreatedAt));
  }

  if (hasAiPreReview) {
    if (!completedTypes.has('ai_review_submitted')) {
      events.push(pendingProgressEvent(taskId, 'ai_review_submitted', pendingCreatedAt));
    }

    if (!completedTypes.has('ai_review_passed') && !completedTypes.has('ai_review_rejected')) {
      events.push(pendingProgressEvent(taskId, 'ai_review_passed', pendingCreatedAt));
    }
  } else if (!completedTypes.has('submitted')) {
    events.push(pendingProgressEvent(taskId, 'submitted', pendingCreatedAt));
  }

  if (!completedTypes.has('reviewer_final')) {
    events.push(pendingProgressEvent(taskId, 'reviewer_final', pendingCreatedAt));
  }
};

const pendingProgressEvent = (
  taskId: string,
  type: TaskWorkflowProgressEventType,
  createdAt: string | null,
): TaskWorkflowProgressEvent => ({
  id: `${taskId}:pending:${type}`,
  type,
  createdAt,
  status: 'pending',
});

const compareProgressEvents = (
  first: TaskWorkflowProgressEvent,
  second: TaskWorkflowProgressEvent,
): number => progressEventTime(first) - progressEventTime(second);

const progressEventTime = (event: TaskWorkflowProgressEvent): number => {
  if (!event.createdAt) {
    return Number.POSITIVE_INFINITY;
  }

  const time = new Date(event.createdAt).getTime();

  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
};

const formatRewardRule = (
  rewardPerItem: number | null | undefined,
  fallback: string | null = null,
): string | null => {
  if (rewardPerItem !== null && rewardPerItem !== undefined) {
    return `${formatUnitReward(rewardPerItem)} 元 / 条`;
  }

  return fallback;
};

const formatUnitReward = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '0.00';
  }

  return value.toFixed(2);
};

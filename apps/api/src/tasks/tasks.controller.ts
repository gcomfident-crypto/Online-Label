import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { TASK_STATUS, normalizeReviewStageConfig, type TaskStatus } from '@labelhub/shared';

import type {
  CreateTaskDto,
  CreateTaskInput,
  DistributionStrategy,
} from './dto/create-task.dto.ts';
import type { UpdateTaskStatusDto, UpdateTaskStatusInput } from './dto/update-task-status.dto.ts';
import type { UpdateTaskDto, UpdateTaskInput } from './dto/update-task.dto.ts';
import {
  TasksService,
  type DeleteTaskResult,
  type TaskAuditLogDto,
  type TaskDto,
  type UpdateReviewStageConfigInput,
} from './tasks.service.ts';

const DISTRIBUTION_STRATEGIES: readonly DistributionStrategy[] = [
  'FIRST_COME_FIRST_SERVE',
  'ASSIGNMENT',
  'QUOTA_RACE',
];

@Controller('tasks')
export class TasksController {
  constructor(
    @Inject(TasksService)
    private readonly tasksService: Pick<
      TasksService,
      | 'create'
      | 'list'
      | 'listSummaries'
      | 'get'
      | 'update'
      | 'updateStatus'
      | 'deleteTask'
      | 'updateReviewStageConfig'
      | 'listAuditLogs'
    >,
  ) {}

  @Post()
  create(@Body() body: CreateTaskDto): Promise<TaskDto> {
    return this.tasksService.create(normalizeCreateTaskBody(body));
  }

  @Get()
  list(@Query('ownerId') ownerId?: string, @Query('status') status?: string): Promise<TaskDto[]> {
    return this.tasksService.list({
      ...(typeof ownerId === 'string' && ownerId.trim() ? { ownerId: ownerId.trim() } : {}),
      ...(isTaskStatus(status) ? { status } : {}),
    });
  }

  @Get('summaries')
  listSummaries(@Query('ownerId') ownerId?: string, @Query('status') status?: string): Promise<TaskDto[]> {
    return this.tasksService.listSummaries({
      ...(typeof ownerId === 'string' && ownerId.trim() ? { ownerId: ownerId.trim() } : {}),
      ...(isTaskStatus(status) ? { status } : {}),
    });
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<TaskDto> {
    return this.tasksService.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateTaskDto): Promise<TaskDto> {
    return this.tasksService.update(id, normalizeUpdateTaskBody(body));
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateTaskStatusDto,
  ): Promise<TaskDto> {
    return this.tasksService.updateStatus(id, normalizeUpdateTaskStatusBody(body));
  }

  @Delete(':id')
  deleteTask(@Param('id') id: string): Promise<DeleteTaskResult> {
    return this.tasksService.deleteTask(id);
  }

  @Patch(':id/review-stage-config')
  updateReviewStageConfig(
    @Param('id') id: string,
    @Body() body: UpdateReviewStageConfigDto = {},
  ): Promise<TaskDto> {
    return this.tasksService.updateReviewStageConfig(id, normalizeUpdateReviewStageConfigBody(body));
  }

  @Get(':id/audit-logs')
  listAuditLogs(@Param('id') id: string): Promise<TaskAuditLogDto[]> {
    return this.tasksService.listAuditLogs(id);
  }
}

type UpdateReviewStageConfigDto = {
  reviewStageConfig?: unknown;
  stages?: unknown;
  actorId?: unknown;
};

const normalizeCreateTaskBody = (body: CreateTaskDto): CreateTaskInput => {
  return {
    title: stringValue(body.title) || '未命名任务',
    description: nullableStringValue(body.description),
    richTextInstruction: nullableStringValue(body.richTextInstruction),
    tags: stringArrayValue(body.tags),
    ...(body.rewardRule !== undefined ? { rewardRule: nullableStringValue(body.rewardRule) } : {}),
    rewardPerItem: nullableNumberValue(body.rewardPerItem),
    perUserLimit: nullableIntegerValue(body.perUserLimit),
    quota: numberValue(body.quota),
    deadline: stringValue(body.deadline),
    distributionStrategy: distributionStrategyValue(body.distributionStrategy),
    aiPreReviewEnabled: booleanValue(body.aiPreReviewEnabled),
    aiRuleName: nullableStringValue(body.aiRuleName),
    templateId: stringValue(body.templateId) || null,
    actorId: stringValue(body.actorId) ?? '',
  };
};

const normalizeUpdateTaskBody = (body: UpdateTaskDto): UpdateTaskInput => {
  return {
    ...(body.title !== undefined ? { title: stringValue(body.title) || '未命名任务' } : {}),
    ...(body.description !== undefined ? { description: nullableStringValue(body.description) } : {}),
    ...(body.richTextInstruction !== undefined
      ? { richTextInstruction: nullableStringValue(body.richTextInstruction) }
      : {}),
    ...(body.tags !== undefined ? { tags: stringArrayValue(body.tags) } : {}),
    ...(body.rewardRule !== undefined ? { rewardRule: nullableStringValue(body.rewardRule) } : {}),
    ...(body.rewardPerItem !== undefined ? { rewardPerItem: nullableNumberValue(body.rewardPerItem) } : {}),
    ...(body.perUserLimit !== undefined ? { perUserLimit: nullableIntegerValue(body.perUserLimit) } : {}),
    ...(body.quota !== undefined ? { quota: numberValue(body.quota) } : {}),
    ...(body.deadline !== undefined ? { deadline: stringValue(body.deadline) || null } : {}),
    ...(body.distributionStrategy !== undefined
      ? { distributionStrategy: distributionStrategyValue(body.distributionStrategy) }
      : {}),
    ...(body.aiPreReviewEnabled !== undefined
      ? { aiPreReviewEnabled: booleanValue(body.aiPreReviewEnabled) }
      : {}),
    ...(body.aiRuleName !== undefined ? { aiRuleName: nullableStringValue(body.aiRuleName) } : {}),
    ...(body.templateId !== undefined ? { templateId: stringValue(body.templateId) || null } : {}),
  };
};

const normalizeUpdateTaskStatusBody = (body: UpdateTaskStatusDto): UpdateTaskStatusInput => {
  return {
    status: isTaskStatus(body.status) ? body.status : 'DRAFT',
    actorId: stringValue(body.actorId),
    reason: stringValue(body.reason),
    confirm: booleanValue(body.confirm),
  };
};

const normalizeUpdateReviewStageConfigBody = (
  body: UpdateReviewStageConfigDto,
): UpdateReviewStageConfigInput => {
  return {
    reviewStageConfig: normalizeReviewStageConfig(body.reviewStageConfig ?? body.stages),
    actorId: stringValue(body.actorId),
  };
};

const stringValue = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const nullableStringValue = (value: unknown): string | null | undefined => {
  if (value === null) {
    return null;
  }

  return stringValue(value);
};

const stringArrayValue = (value: unknown): string[] => {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    : [];
};

const numberValue = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;

  return Number.isFinite(number) ? number : null;
};

const nullableNumberValue = (value: unknown): number | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return numberValue(value);
};

const nullableIntegerValue = (value: unknown): number | null | undefined => {
  const number = nullableNumberValue(value);

  if (number === undefined || number === null) {
    return number;
  }

  return Number.isInteger(number) ? number : null;
};

const booleanValue = (value: unknown): boolean => value === true;

const distributionStrategyValue = (value: unknown): DistributionStrategy => {
  return DISTRIBUTION_STRATEGIES.includes(value as DistributionStrategy)
    ? (value as DistributionStrategy)
    : 'FIRST_COME_FIRST_SERVE';
};

const isTaskStatus = (value: unknown): value is TaskStatus => {
  return typeof value === 'string' && Object.values(TASK_STATUS).includes(value as TaskStatus);
};

import { Body, Controller, Get, Headers, Inject, Post, Query } from '@nestjs/common';
import { DATASET_KINDS, type DatasetKind } from '@labelhub/shared';

import { resolveIdempotencyKey } from '../common/idempotency/idempotency-key.ts';
import {
  SubmissionsService,
  type LabelerAssignmentDto,
  type LabelerStatsDto,
  type LabelerSubmissionDto,
  type LabelerSubmissionQuery,
  type SubmissionDto,
  type SubmitInput,
  type SubmitTaskInput,
  type TaskSubmissionDto,
} from './submissions.service.ts';

type SubmitBody = {
  assignmentId?: unknown;
  actorId?: unknown;
  answers?: unknown;
  idempotencyKey?: unknown;
};

type SubmitTaskBody = {
  taskId?: unknown;
  labelerId?: unknown;
  actorId?: unknown;
  currentAssignmentId?: unknown;
  currentAnswers?: unknown;
  idempotencyKey?: unknown;
};

const DEFAULT_LABELER_ID = 'user_labeler_li_lei';

@Controller()
export class SubmissionsController {
  constructor(
    @Inject(SubmissionsService)
    private readonly submissionsService: Pick<
      SubmissionsService,
      'submit' | 'submitTask' | 'listLabelerAssignments' | 'listLabelerSubmissions' | 'getLabelerStats'
    >,
  ) {}

  @Post('submissions')
  submit(
    @Body() body: SubmitBody,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SubmissionDto> {
    return this.submissionsService.submit(normalizeSubmitBody(body, idempotencyKey));
  }

  @Post('submissions/task')
  submitTask(
    @Body() body: SubmitTaskBody,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<TaskSubmissionDto> {
    return this.submissionsService.submitTask(normalizeSubmitTaskBody(body, idempotencyKey));
  }

  @Get('labeler/submissions')
  listLabelerSubmissions(
    @Query('labelerId') labelerId?: string,
    @Query('taskId') taskId?: string,
    @Query('status') status?: string,
    @Query('datasetKind') datasetKind?: string,
    @Query('itemId') itemId?: string,
  ): Promise<LabelerSubmissionDto[]> {
    return this.submissionsService.listLabelerSubmissions(
      normalizeLabelerSubmissionQuery(labelerId, taskId, status, datasetKind, itemId),
    );
  }

  @Get('labeler/assignments')
  listLabelerAssignments(
    @Query('labelerId') labelerId?: string,
    @Query('taskId') taskId?: string,
  ): Promise<LabelerAssignmentDto[]> {
    return this.submissionsService.listLabelerAssignments({
      labelerId: stringValue(labelerId) ?? DEFAULT_LABELER_ID,
      ...(stringValue(taskId) ? { taskId: stringValue(taskId) } : {}),
    });
  }

  @Get('labeler/stats')
  getLabelerStats(
    @Query('labelerId') labelerId?: string,
    @Query('taskId') taskId?: string,
  ): Promise<LabelerStatsDto> {
    return this.submissionsService.getLabelerStats({
      labelerId: stringValue(labelerId) ?? DEFAULT_LABELER_ID,
      ...(stringValue(taskId) ? { taskId: stringValue(taskId) } : {}),
    });
  }
}

function normalizeSubmitBody(body: SubmitBody, headerIdempotencyKey?: string): SubmitInput {
  return {
    assignmentId: stringValue(body.assignmentId) ?? '',
    actorId: stringValue(body.actorId),
    answers: recordValue(body.answers),
    idempotencyKey: resolveIdempotencyKey({
      headerValue: headerIdempotencyKey,
      bodyValue: body.idempotencyKey,
    }),
  };
}

function normalizeSubmitTaskBody(body: SubmitTaskBody, headerIdempotencyKey?: string): SubmitTaskInput {
  return {
    taskId: stringValue(body.taskId) ?? '',
    labelerId: stringValue(body.labelerId) ?? DEFAULT_LABELER_ID,
    actorId: stringValue(body.actorId),
    currentAssignmentId: stringValue(body.currentAssignmentId),
    currentAnswers: recordValue(body.currentAnswers),
    idempotencyKey: resolveIdempotencyKey({
      headerValue: headerIdempotencyKey,
      bodyValue: body.idempotencyKey,
    }),
  };
}

function normalizeLabelerSubmissionQuery(
  labelerId?: string,
  taskId?: string,
  status?: string,
  datasetKind?: string,
  itemId?: string,
): LabelerSubmissionQuery {
  return {
    labelerId: stringValue(labelerId) ?? DEFAULT_LABELER_ID,
    ...(stringValue(taskId) ? { taskId: stringValue(taskId) } : {}),
    ...(stringValue(status) ? { status: stringValue(status) } : {}),
    ...(datasetKindValue(datasetKind) ? { datasetKind: datasetKindValue(datasetKind) } : {}),
    ...(stringValue(itemId) ? { itemId: stringValue(itemId) } : {}),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function datasetKindValue(value: unknown): DatasetKind | undefined {
  return DATASET_KINDS.includes(value as DatasetKind) ? (value as DatasetKind) : undefined;
}

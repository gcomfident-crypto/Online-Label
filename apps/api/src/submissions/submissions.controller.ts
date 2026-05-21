import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { DATASET_KINDS, type DatasetKind } from '@labelhub/shared';

import {
  SubmissionsService,
  type LabelerStatsDto,
  type LabelerSubmissionDto,
  type LabelerSubmissionQuery,
  type SubmissionDto,
  type SubmitInput,
} from './submissions.service.ts';

type SubmitBody = {
  assignmentId?: unknown;
  actorId?: unknown;
  answers?: unknown;
};

const DEFAULT_LABELER_ID = 'user_labeler_li_lei';

@Controller()
export class SubmissionsController {
  constructor(
    @Inject(SubmissionsService)
    private readonly submissionsService: Pick<
      SubmissionsService,
      'submit' | 'listLabelerSubmissions' | 'getLabelerStats'
    >,
  ) {}

  @Post('submissions')
  submit(@Body() body: SubmitBody): Promise<SubmissionDto> {
    return this.submissionsService.submit(normalizeSubmitBody(body));
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

function normalizeSubmitBody(body: SubmitBody): SubmitInput {
  return {
    assignmentId: stringValue(body.assignmentId) ?? '',
    actorId: stringValue(body.actorId),
    answers: recordValue(body.answers),
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

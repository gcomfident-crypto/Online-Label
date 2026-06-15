import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';

import {
  TaskItemReportsService,
  type ReportTaskItemInput,
  type ResolveTaskItemReportAction,
  type ResolveTaskItemReportInput,
  type TaskItemReportDto,
} from './task-item-reports.service.ts';

type ReportTaskItemBody = {
  reporterId?: unknown;
  reason?: unknown;
};

type ResolveTaskItemReportBody = {
  action?: unknown;
  ownerId?: unknown;
  ownerComment?: unknown;
  rawDataPatch?: unknown;
};

@Controller()
export class TaskItemReportsController {
  constructor(
    @Inject(TaskItemReportsService)
    private readonly taskItemReportsService: Pick<
      TaskItemReportsService,
      'reportAssignment' | 'listTaskReports' | 'resolveReport'
    >,
  ) {}

  @Post('assignments/:assignmentId/report')
  reportAssignment(
    @Param('assignmentId') assignmentId: string,
    @Body() body: ReportTaskItemBody = {},
  ): Promise<TaskItemReportDto> {
    return this.taskItemReportsService.reportAssignment(normalizeReportTaskItemBody(assignmentId, body));
  }

  @Get('tasks/:taskId/item-reports')
  listTaskReports(
    @Param('taskId') taskId: string,
    @Query('status') status?: string,
  ): Promise<TaskItemReportDto[]> {
    return this.taskItemReportsService.listTaskReports({
      taskId,
      ...(status === undefined ? {} : { status: status.trim() }),
    });
  }

  @Post('task-item-reports/:reportId/resolve')
  resolveReport(
    @Param('reportId') reportId: string,
    @Body() body: ResolveTaskItemReportBody = {},
  ): Promise<TaskItemReportDto> {
    return this.taskItemReportsService.resolveReport(reportId, normalizeResolveTaskItemReportBody(body));
  }
}

function normalizeReportTaskItemBody(assignmentId: string, body: ReportTaskItemBody): ReportTaskItemInput {
  return {
    assignmentId,
    reporterId: stringValue(body.reporterId),
    reason: stringValue(body.reason) ?? '',
  };
}

function normalizeResolveTaskItemReportBody(body: ResolveTaskItemReportBody): ResolveTaskItemReportInput {
  return {
    action: stringValue(body.action) as ResolveTaskItemReportAction,
    ownerId: stringValue(body.ownerId),
    ownerComment: stringValue(body.ownerComment),
    rawDataPatch: body.rawDataPatch,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

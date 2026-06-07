import { Controller, Get, Inject, Param, Query } from '@nestjs/common';

import {
  TaskFlowsService,
  type TaskFlowDetailDto,
  type TaskFlowSummaryDto,
} from './task-flows.service.ts';

@Controller('agent/task-flows')
export class TaskFlowsController {
  constructor(
    @Inject(TaskFlowsService)
    private readonly taskFlowsService: TaskFlowsService,
  ) {}

  @Get()
  listTaskFlows(): Promise<TaskFlowSummaryDto[]> {
    return this.taskFlowsService.listTaskFlows();
  }

  @Get(':taskId')
  getTaskFlow(@Param('taskId') taskId: string, @Query('round') round?: string): Promise<TaskFlowDetailDto> {
    const parsedRound = roundValue(round);

    return this.taskFlowsService.getTaskFlow(taskId, {
      ...(parsedRound ? { round: parsedRound } : {}),
    });
  }
}

function roundValue(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

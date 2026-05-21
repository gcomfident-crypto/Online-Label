import { Body, Controller, Get, Inject, Param, Put } from '@nestjs/common';

import {
  DraftsService,
  type DraftDto,
  type SaveDraftInput,
  type WorkbenchDto,
} from './drafts.service.ts';

type SaveDraftBody = {
  actorId?: unknown;
  answers?: unknown;
};

@Controller()
export class DraftsController {
  constructor(
    @Inject(DraftsService)
    private readonly draftsService: Pick<DraftsService, 'getWorkbench' | 'getDraft' | 'saveDraft'>,
  ) {}

  @Get('assignments/:assignmentId/workbench')
  getWorkbench(@Param('assignmentId') assignmentId: string): Promise<WorkbenchDto> {
    return this.draftsService.getWorkbench(assignmentId);
  }

  @Get('drafts/:assignmentId')
  getDraft(@Param('assignmentId') assignmentId: string): Promise<DraftDto | null> {
    return this.draftsService.getDraft(assignmentId);
  }

  @Put('drafts/:assignmentId')
  saveDraft(@Param('assignmentId') assignmentId: string, @Body() body: SaveDraftBody): Promise<DraftDto> {
    return this.draftsService.saveDraft(assignmentId, normalizeSaveDraftBody(body));
  }
}

function normalizeSaveDraftBody(body: SaveDraftBody): SaveDraftInput {
  return {
    actorId: stringValue(body.actorId),
    answers: recordValue(body.answers),
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

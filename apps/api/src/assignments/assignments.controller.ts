import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';

import {
  AssignmentsService,
  type ClaimAssignmentDto,
  type MarketClaimStatus,
  type MarketTaskDto,
} from './assignments.service.ts';

type ClaimAssignmentBody = {
  taskId?: unknown;
  labelerId?: unknown;
};

const MARKET_CLAIM_STATUSES: readonly MarketClaimStatus[] = [
  'available',
  'claimed',
  'full',
  'expired',
];

const DEFAULT_LABELER_ID = 'user_labeler_li_lei';

@Controller()
export class AssignmentsController {
  constructor(
    @Inject(AssignmentsService)
    private readonly assignmentsService: Pick<AssignmentsService, 'listMarketTasks' | 'claim'>,
  ) {}

  @Get('labeler/tasks')
  listMarketTasks(
    @Query('keyword') keyword?: string,
    @Query('tag') tag?: string,
    @Query('claimStatus') claimStatus?: string,
    @Query('labelerId') labelerId?: string,
  ): Promise<MarketTaskDto[]> {
    return this.assignmentsService.listMarketTasks({
      ...(stringValue(keyword) ? { keyword: stringValue(keyword) } : {}),
      ...(stringValue(tag) ? { tag: stringValue(tag) } : {}),
      ...(marketClaimStatusValue(claimStatus)
        ? { claimStatus: marketClaimStatusValue(claimStatus) }
        : {}),
      ...(stringValue(labelerId) ? { labelerId: stringValue(labelerId) } : {}),
    });
  }

  @Post('assignments/claim')
  claim(@Body() body: ClaimAssignmentBody): Promise<ClaimAssignmentDto> {
    return this.assignmentsService.claim({
      taskId: stringValue(body.taskId) ?? '',
      labelerId: stringValue(body.labelerId) ?? DEFAULT_LABELER_ID,
    });
  }
}

const stringValue = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const marketClaimStatusValue = (value: unknown): MarketClaimStatus | undefined => {
  return MARKET_CLAIM_STATUSES.includes(value as MarketClaimStatus)
    ? (value as MarketClaimStatus)
    : undefined;
};

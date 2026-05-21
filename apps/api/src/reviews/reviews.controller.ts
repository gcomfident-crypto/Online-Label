import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';

import {
  ReviewsService,
  type BatchReviewResultDto,
  type ReviewDetailDto,
  type ReviewQueueItemDto,
  type ReviewTimelineItemDto,
} from './reviews.service.ts';
import {
  type AssignReviewsDto,
  type BatchReviewDto,
  type RejectReviewDto,
  type ReviseAndPassDto,
  type ReviewActionDto,
} from './dto/review-actions.dto.ts';

@Controller()
export class ReviewsController {
  constructor(
    @Inject(ReviewsService)
    private readonly reviewsService: Pick<
      ReviewsService,
      | 'listPending'
      | 'listResults'
      | 'getReview'
      | 'getTimeline'
      | 'startReview'
      | 'passReview'
      | 'rejectReview'
      | 'reviseAndPass'
      | 'batchPass'
      | 'batchReject'
      | 'assignReviews'
    >,
  ) {}

  @Get('reviews/pending')
  listPending(
    @Query('reviewerId') reviewerId?: string,
    @Query('aiDecision') aiDecision?: string,
  ): Promise<ReviewQueueItemDto[]> {
    return this.reviewsService.listPending(normalizePendingQuery(reviewerId, aiDecision));
  }

  @Get('reviews/results')
  listResults(@Query('verdict') verdict?: string): Promise<ReviewQueueItemDto[]> {
    return this.reviewsService.listResults(normalizeResultsQuery(verdict));
  }

  @Post('reviews/batch-pass')
  batchPass(@Body() body: BatchReviewDto = {}): Promise<BatchReviewResultDto> {
    return this.reviewsService.batchPass(normalizeBatchBody(body));
  }

  @Post('reviews/batch-reject')
  batchReject(@Body() body: BatchReviewDto = {}): Promise<BatchReviewResultDto> {
    return this.reviewsService.batchReject(normalizeBatchBody(body));
  }

  @Post('reviews/assign')
  assign(@Body() body: AssignReviewsDto = {}): Promise<BatchReviewResultDto> {
    return this.reviewsService.assignReviews(normalizeAssignBody(body));
  }

  @Get('reviews/:submissionId')
  getReview(@Param('submissionId') submissionId: string): Promise<ReviewDetailDto> {
    return this.reviewsService.getReview(submissionId);
  }

  @Get('reviews/:submissionId/timeline')
  getTimeline(@Param('submissionId') submissionId: string): Promise<ReviewTimelineItemDto[]> {
    return this.reviewsService.getTimeline(submissionId);
  }

  @Post('reviews/:submissionId/start')
  start(@Param('submissionId') submissionId: string, @Body() body: ReviewActionDto = {}): Promise<ReviewDetailDto> {
    return this.reviewsService.startReview(submissionId, {
      actorId: stringValue(body.actorId),
    });
  }

  @Post('reviews/:submissionId/pass')
  pass(@Param('submissionId') submissionId: string, @Body() body: ReviewActionDto = {}): Promise<ReviewDetailDto> {
    return this.reviewsService.passReview(submissionId, {
      actorId: stringValue(body.actorId),
      comment: stringValue(body.comment),
    });
  }

  @Post('reviews/:submissionId/reject')
  reject(@Param('submissionId') submissionId: string, @Body() body: RejectReviewDto = {}): Promise<ReviewDetailDto> {
    return this.reviewsService.rejectReview(submissionId, {
      actorId: stringValue(body.actorId),
      reason: stringValue(body.reason) ?? '',
    });
  }

  @Post('reviews/:submissionId/revise-and-pass')
  reviseAndPass(
    @Param('submissionId') submissionId: string,
    @Body() body: ReviseAndPassDto = {},
  ): Promise<ReviewDetailDto> {
    return this.reviewsService.reviseAndPass(submissionId, {
      actorId: stringValue(body.actorId),
      comment: stringValue(body.comment),
      revisedAnswers: recordValue(body.revisedAnswers),
    });
  }
}

function normalizePendingQuery(
  reviewerId?: unknown,
  aiDecision?: unknown,
): { reviewerId?: string; aiDecision?: string } {
  return {
    ...(stringValue(reviewerId) ? { reviewerId: stringValue(reviewerId) } : {}),
    ...(stringValue(aiDecision) ? { aiDecision: stringValue(aiDecision) } : {}),
  };
}

function normalizeResultsQuery(verdict?: unknown): { verdict?: string } {
  return {
    ...(stringValue(verdict) ? { verdict: stringValue(verdict) } : {}),
  };
}

function normalizeBatchBody(body: BatchReviewDto): {
  actorId?: string;
  submissionIds: string[];
  comment?: string;
  reason?: string;
} {
  return {
    actorId: stringValue(body.actorId),
    submissionIds: stringArrayValue(body.submissionIds),
    comment: stringValue(body.comment),
    reason: stringValue(body.reason),
  };
}

function normalizeAssignBody(body: AssignReviewsDto): { actorId?: string; reviewerId: string; submissionIds: string[] } {
  return {
    actorId: stringValue(body.actorId),
    reviewerId: stringValue(body.reviewerId) ?? '',
    submissionIds: stringArrayValue(body.submissionIds),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map(stringValue).filter((item): item is string => Boolean(item))));
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

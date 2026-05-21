import { Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { AI_REVIEW_STATUS, type AiReviewStatus } from '@labelhub/shared';

import { AiReviewService, type AiReviewDetailDto, type AiReviewJobDto } from './ai-review.service.ts';

@Controller()
export class AiReviewController {
  constructor(
    @Inject(AiReviewService)
    private readonly aiReviewService: Pick<AiReviewService, 'listJobs' | 'retryJob' | 'getSubmissionReview'>,
  ) {}

  @Get('ai-review/jobs')
  listJobs(@Query('status') status?: string): Promise<AiReviewJobDto[]> {
    return this.aiReviewService.listJobs({
      ...(isAiReviewStatus(status) ? { status } : {}),
    });
  }

  @Post('ai-review/jobs/:id/retry')
  retryJob(@Param('id') id: string): Promise<AiReviewJobDto> {
    return this.aiReviewService.retryJob(id);
  }

  @Get('submissions/:submissionId/ai-review')
  getSubmissionReview(@Param('submissionId') submissionId: string): Promise<AiReviewDetailDto> {
    return this.aiReviewService.getSubmissionReview(submissionId);
  }
}

function isAiReviewStatus(value: unknown): value is AiReviewStatus {
  return typeof value === 'string' && Object.values(AI_REVIEW_STATUS).includes(value as AiReviewStatus);
}

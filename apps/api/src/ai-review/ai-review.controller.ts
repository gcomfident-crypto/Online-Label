import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { AI_REVIEW_STATUS, type AiReviewStatus } from '@labelhub/shared';

import {
  AiReviewService,
  type AiReviewBatchDetailDto,
  type AiReviewBatchDto,
  type AiReviewBatchStatus,
  type AiReviewDetailDto,
  type AiReviewJobDto,
  type CompleteAiReviewJobInput,
} from './ai-review.service.ts';

@Controller()
export class AiReviewController {
  constructor(
    @Inject(AiReviewService)
    private readonly aiReviewService: Pick<
      AiReviewService,
      'listBatches' | 'getBatchReview' | 'listJobs' | 'retryJob' | 'completeJob' | 'getSubmissionReview'
    >,
  ) {}

  @Get('ai-review/batches')
  listBatches(@Query('status') status?: string): Promise<AiReviewBatchDto[]> {
    return this.aiReviewService.listBatches({
      ...(isAiReviewBatchStatus(status) ? { status } : {}),
    });
  }

  @Get('ai-review/batches/:batchId')
  getBatchReview(@Param('batchId') batchId: string): Promise<AiReviewBatchDetailDto> {
    return this.aiReviewService.getBatchReview(batchId);
  }

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

  @Post('ai-review/jobs/:id/complete')
  completeJob(@Param('id') id: string, @Body() body: CompleteAiReviewJobDto = {}): Promise<AiReviewDetailDto> {
    return this.aiReviewService.completeJob(id, normalizeCompleteBody(body));
  }

  @Get('submissions/:submissionId/ai-review')
  getSubmissionReview(@Param('submissionId') submissionId: string): Promise<AiReviewDetailDto> {
    return this.aiReviewService.getSubmissionReview(submissionId);
  }
}

type CompleteAiReviewJobDto = {
  actorId?: unknown;
  decision?: unknown;
  scores?: unknown;
  comment?: unknown;
  rawPrompt?: unknown;
  rawOutput?: unknown;
  structuredOutput?: unknown;
  modelMetadata?: unknown;
};

function isAiReviewStatus(value: unknown): value is AiReviewStatus {
  return typeof value === 'string' && Object.values(AI_REVIEW_STATUS).includes(value as AiReviewStatus);
}

function isAiReviewBatchStatus(value: unknown): value is AiReviewBatchStatus {
  return value === 'PENDING' || value === 'PASSED' || value === 'REJECTED' || value === 'MANUAL' || value === 'FAILED';
}

function normalizeCompleteBody(body: CompleteAiReviewJobDto): CompleteAiReviewJobInput {
  return {
    actorId: stringValue(body.actorId),
    decision: (decisionValue(body.decision) ?? '') as CompleteAiReviewJobInput['decision'],
    scores: recordValue(body.scores),
    comment: stringValue(body.comment),
    rawPrompt: stringValue(body.rawPrompt),
    rawOutput: stringValue(body.rawOutput),
    structuredOutput: recordValue(body.structuredOutput),
    modelMetadata: recordValue(body.modelMetadata),
  };
}

function decisionValue(value: unknown): CompleteAiReviewJobInput['decision'] | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized === 'pass' || normalized === 'reject' || normalized === 'manual' ? normalized : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';
import { LlmService } from '../llm/llm.service.ts';
import { AiReviewController } from './ai-review.controller.ts';
import { AiReviewProcessorService } from './ai-review-processor.service.ts';
import { AiReviewService } from './ai-review.service.ts';

@Module({
  controllers: [AiReviewController],
  providers: [PrismaService, LlmService, AiReviewService, AiReviewProcessorService],
  exports: [AiReviewService, AiReviewProcessorService],
})
export class AiReviewModule {}

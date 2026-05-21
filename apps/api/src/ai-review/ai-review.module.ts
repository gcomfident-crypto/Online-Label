import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';
import { AiReviewController } from './ai-review.controller.ts';
import { AiReviewService } from './ai-review.service.ts';

@Module({
  controllers: [AiReviewController],
  providers: [PrismaService, AiReviewService],
  exports: [AiReviewService],
})
export class AiReviewModule {}

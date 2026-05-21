import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';
import { ReviewDiffService } from './diff.service.ts';
import { FinalReviewService } from './final-review.service.ts';
import { ReviewsController } from './reviews.controller.ts';
import { ReviewsService } from './reviews.service.ts';

@Module({
  controllers: [ReviewsController],
  providers: [PrismaService, ReviewsService, ReviewDiffService, FinalReviewService],
  exports: [ReviewsService, ReviewDiffService, FinalReviewService],
})
export class ReviewsModule {}

import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';
import { ReviewDiffService } from './diff.service.ts';
import { ReviewsController } from './reviews.controller.ts';
import { ReviewsService } from './reviews.service.ts';

@Module({
  controllers: [ReviewsController],
  providers: [PrismaService, ReviewsService, ReviewDiffService],
  exports: [ReviewsService, ReviewDiffService],
})
export class ReviewsModule {}

import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';
import { ReviewsController } from './reviews.controller.ts';
import { ReviewsService } from './reviews.service.ts';

@Module({
  controllers: [ReviewsController],
  providers: [PrismaService, ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}

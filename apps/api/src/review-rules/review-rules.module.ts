import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';
import { ReviewRulesController } from './review-rules.controller.ts';
import { ReviewRulesService } from './review-rules.service.ts';

@Module({
  controllers: [ReviewRulesController],
  providers: [PrismaService, ReviewRulesService],
  exports: [ReviewRulesService],
})
export class ReviewRulesModule {}

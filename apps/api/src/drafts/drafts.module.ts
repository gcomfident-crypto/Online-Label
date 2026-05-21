import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';
import { DraftsController } from './drafts.controller.ts';
import { DraftsService } from './drafts.service.ts';

@Module({
  controllers: [DraftsController],
  providers: [PrismaService, DraftsService],
})
export class DraftsModule {}

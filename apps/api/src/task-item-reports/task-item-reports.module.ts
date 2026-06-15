import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';
import { TaskItemReportsController } from './task-item-reports.controller.ts';
import { TaskItemReportsService } from './task-item-reports.service.ts';

@Module({
  controllers: [TaskItemReportsController],
  providers: [PrismaService, TaskItemReportsService],
  exports: [TaskItemReportsService],
})
export class TaskItemReportsModule {}

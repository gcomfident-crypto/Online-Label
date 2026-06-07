import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';
import { TaskFlowsController } from './task-flows.controller.ts';
import { TaskFlowsService } from './task-flows.service.ts';

@Module({
  controllers: [TaskFlowsController],
  providers: [PrismaService, TaskFlowsService],
  exports: [TaskFlowsService],
})
export class TaskFlowsModule {}

import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';
import { StateMachineService } from '../state-machine/state-machine.service.ts';
import { TasksController } from './tasks.controller.ts';
import { TasksService } from './tasks.service.ts';

@Module({
  controllers: [TasksController],
  providers: [PrismaService, StateMachineService, TasksService],
  exports: [TasksService],
})
export class TasksModule {}

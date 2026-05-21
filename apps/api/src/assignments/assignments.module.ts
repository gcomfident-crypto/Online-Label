import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';
import { AssignmentsController } from './assignments.controller.ts';
import { AssignmentsService } from './assignments.service.ts';

@Module({
  controllers: [AssignmentsController],
  providers: [PrismaService, AssignmentsService],
})
export class AssignmentsModule {}

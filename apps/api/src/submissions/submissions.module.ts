import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';
import { SchemaService } from '../schema/schema.service.ts';
import { SubmissionsController } from './submissions.controller.ts';
import { SubmissionsService } from './submissions.service.ts';

@Module({
  controllers: [SubmissionsController],
  providers: [PrismaService, SchemaService, SubmissionsService],
})
export class SubmissionsModule {}

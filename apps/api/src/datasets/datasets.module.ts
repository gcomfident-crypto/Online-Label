import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';
import { DatasetsController } from './datasets.controller.ts';
import { DatasetsService } from './datasets.service.ts';

@Module({
  controllers: [DatasetsController],
  providers: [PrismaService, DatasetsService],
})
export class DatasetsModule {}

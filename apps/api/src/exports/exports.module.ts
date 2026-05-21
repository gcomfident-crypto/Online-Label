import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';
import { ExportMappingService } from './export-mapping.service.ts';
import { ExportsController } from './exports.controller.ts';
import { ExportsService } from './exports.service.ts';

@Module({
  controllers: [ExportsController],
  providers: [PrismaService, ExportMappingService, ExportsService],
  exports: [ExportMappingService, ExportsService],
})
export class ExportsModule {}

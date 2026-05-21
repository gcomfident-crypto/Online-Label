import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';
import { TemplatesController } from './templates.controller.ts';
import { TemplatesService } from './templates.service.ts';

@Module({
  controllers: [TemplatesController],
  providers: [PrismaService, TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}

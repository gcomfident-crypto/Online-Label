import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';

import {
  ExportsService,
  type CreateExportInput,
  type ExportDownloadDto,
  type ExportJobDto,
  type ExportPreviewDto,
  type ExportPreviewInput,
} from './exports.service.ts';

type CreateExportDto = {
  taskId?: unknown;
  requestedById?: unknown;
  format?: unknown;
  includeReviews?: unknown;
  fieldMapping?: unknown;
};

type ExportPreviewDtoInput = {
  includeReviews?: unknown;
  fieldMapping?: unknown;
};

@Controller()
export class ExportsController {
  constructor(
    @Inject(ExportsService)
    private readonly exportsService: Pick<
      ExportsService,
      'createExport' | 'listExports' | 'getExport' | 'downloadExport' | 'retryExport' | 'previewTaskExport'
    >,
  ) {}

  @Post('exports')
  create(@Body() body: CreateExportDto = {}): Promise<ExportJobDto> {
    return this.exportsService.createExport(normalizeCreateBody(body));
  }

  @Get('exports')
  list(@Query('taskId') taskId?: string): Promise<ExportJobDto[]> {
    return this.exportsService.listExports({
      ...(stringValue(taskId) ? { taskId: stringValue(taskId) } : {}),
    });
  }

  @Get('exports/:id')
  get(@Param('id') id: string): Promise<ExportJobDto> {
    return this.exportsService.getExport(id);
  }

  @Get('exports/:id/download')
  download(@Param('id') id: string): Promise<ExportDownloadDto> {
    return this.exportsService.downloadExport(id);
  }

  @Post('exports/:id/retry')
  retry(@Param('id') id: string): Promise<ExportJobDto> {
    return this.exportsService.retryExport(id);
  }

  @Get('tasks/:taskId/export-preview')
  preview(@Param('taskId') taskId: string, @Body() body: ExportPreviewDtoInput = {}): Promise<ExportPreviewDto> {
    return this.exportsService.previewTaskExport(taskId, normalizePreviewBody(body));
  }
}

function normalizeCreateBody(body: CreateExportDto): CreateExportInput {
  return {
    taskId: stringValue(body.taskId) ?? '',
    requestedById: stringValue(body.requestedById),
    format: stringValue(body.format) ?? 'json',
    includeReviews: body.includeReviews === true,
    fieldMapping: body.fieldMapping,
  };
}

function normalizePreviewBody(body: ExportPreviewDtoInput): ExportPreviewInput {
  return {
    includeReviews: body.includeReviews === true,
    fieldMapping: body.fieldMapping,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

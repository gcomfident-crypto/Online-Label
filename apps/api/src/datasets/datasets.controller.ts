import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import {
  DATASET_IMPORT_FORMATS,
  DATASET_KINDS,
  type DatasetImportFormat,
  type DatasetKind,
  type DatasetRecord,
} from '@labelhub/shared';

import { DatasetsService, type TaskItemDto } from './datasets.service.ts';

type ImportItemsBody = {
  datasetKind?: unknown;
  format?: unknown;
  fileName?: unknown;
  content?: unknown;
  contentBase64?: unknown;
};

type ImportZipBody = {
  fileName?: unknown;
  contentBase64?: unknown;
};

type UpdateItemBody = {
  rawDataPatch?: unknown;
};

@Controller()
export class DatasetsController {
  constructor(
    @Inject(DatasetsService)
    private readonly datasetsService: Pick<
      DatasetsService,
      'importItems' | 'importZipItems' | 'listItems' | 'updateItem'
    >,
  ) {}

  @Post('tasks/:taskId/items/import')
  importItems(@Param('taskId') taskId: string, @Body() body: ImportItemsBody) {
    const format = datasetImportFormatValue(body.format);

    return this.datasetsService.importItems(taskId, {
      datasetKind: datasetKindValue(body.datasetKind),
      format,
      fileName: stringValue(body.fileName) ?? `dataset.${format}`,
      content: contentValue(body),
    });
  }

  @Post('tasks/:taskId/items/import-zip')
  importZipItems(@Param('taskId') taskId: string, @Body() body: ImportZipBody) {
    return this.datasetsService.importZipItems(taskId, {
      fileName: stringValue(body.fileName) ?? 'datasets.zip',
      content: base64ContentValue(body.contentBase64),
    });
  }

  @Get('tasks/:taskId/items')
  listItems(@Param('taskId') taskId: string): Promise<TaskItemDto[]> {
    return this.datasetsService.listItems(taskId);
  }

  @Patch('task-items/:id')
  updateItem(@Param('id') id: string, @Body() body: UpdateItemBody) {
    return this.datasetsService.updateItem(id, {
      rawDataPatch: datasetRecordValue(body.rawDataPatch),
    });
  }
}

const stringValue = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const datasetKindValue = (value: unknown): DatasetKind => {
  return DATASET_KINDS.includes(value as DatasetKind) ? (value as DatasetKind) : 'generic_json';
};

const datasetImportFormatValue = (value: unknown): Exclude<DatasetImportFormat, 'zip'> => {
  return DATASET_IMPORT_FORMATS.includes(value as DatasetImportFormat) && value !== 'zip'
    ? (value as Exclude<DatasetImportFormat, 'zip'>)
    : 'json';
};

const contentValue = (body: ImportItemsBody): string | Buffer => {
  if (typeof body.contentBase64 === 'string' && body.contentBase64.trim()) {
    return Buffer.from(body.contentBase64, 'base64');
  }

  return typeof body.content === 'string' ? body.content : '';
};

const base64ContentValue = (value: unknown): Buffer => {
  return typeof value === 'string' && value.trim() ? Buffer.from(value, 'base64') : Buffer.from('');
};

const datasetRecordValue = (value: unknown): DatasetRecord => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as DatasetRecord)
    : {};
};

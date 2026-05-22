import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DatasetImportFormat, DatasetKind, DatasetRecord } from '@labelhub/shared';

import { PrismaService } from '../prisma/prisma.service.ts';
import {
  parseDatasetImport,
  parseDatasetZipImport,
  type DatasetImportError,
  type DatasetImportResult,
  type ImportedDatasetRecord,
} from './importers/dataset-importer.ts';

export type TaskItemStatus = 'UNASSIGNED' | 'ASSIGNED' | 'COMPLETED';

export type TaskItemRecord = {
  id: string;
  taskId: string;
  externalId: string;
  datasetKind: DatasetKind;
  rawData: DatasetRecord;
  status: TaskItemStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TaskItemDto = Omit<TaskItemRecord, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

type TaskDatasetSummary = {
  id: string;
  template: {
    datasetKind: DatasetKind;
  };
};

type ImportItemsInput = {
  datasetKind: DatasetKind;
  format: Exclude<DatasetImportFormat, 'zip'>;
  fileName: string;
  content: Buffer | Uint8Array | string;
};

type ImportZipItemsInput = {
  fileName: string;
  content: Buffer | Uint8Array;
};

type UpdateItemInput = {
  rawDataPatch: DatasetRecord;
};

type DatasetImportSummary = {
  taskId: string;
  datasetKind: DatasetKind;
  importedCount: number;
  errorCount: number;
  skippedFiles: string[];
  fields: string[];
  errors: DatasetImportError[];
  preview: TaskItemDto[];
  files: Array<Pick<DatasetImportResult, 'datasetKind' | 'format' | 'fileName' | 'fields'> & {
    importedCount: number;
    errorCount: number;
  }>;
};

type DatasetsPrismaClient = {
  task: {
    findUnique: (args: {
      where: { id: string };
      include?: { template: { select: { datasetKind: true } } };
    }) => Promise<TaskDatasetSummary | null>;
  };
  taskItem: {
    count: (args: { where: { taskId: string } }) => Promise<number>;
    upsert: (args: {
      where: { taskId_externalId: { taskId: string; externalId: string } };
      update: Partial<TaskItemRecord>;
      create: Partial<TaskItemRecord>;
    }) => Promise<TaskItemRecord>;
    findMany: (args: { where: { taskId: string }; orderBy?: { sortOrder: 'asc' } }) => Promise<TaskItemRecord[]>;
    findUnique: (args: { where: { id: string } }) => Promise<TaskItemRecord | null>;
    update: (args: { where: { id: string }; data: Partial<TaskItemRecord> }) => Promise<TaskItemRecord>;
  };
};

@Injectable()
export class DatasetsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: DatasetsPrismaClient,
  ) {}

  async importItems(taskId: string, input: ImportItemsInput): Promise<DatasetImportSummary> {
    const task = await this.findTaskOrThrow(taskId);
    assertDatasetKindMatchesTask(task, input.datasetKind);

    const result = await parseDatasetImport(input);
    const savedItems = await this.saveImportedRecords(taskId, result.records);

    return toImportSummary(taskId, task.template.datasetKind, result, savedItems);
  }

  async importZipItems(taskId: string, input: ImportZipItemsInput): Promise<DatasetImportSummary> {
    const task = await this.findTaskOrThrow(taskId);
    const result = await parseDatasetZipImport(input.content);
    const matchingRecords = result.records.filter(
      (record) => record.datasetKind === task.template.datasetKind,
    );
    const savedItems = await this.saveImportedRecords(taskId, matchingRecords);

    return {
      taskId,
      datasetKind: task.template.datasetKind,
      importedCount: savedItems.length,
      errorCount: result.errors.length,
      skippedFiles: result.skippedFiles,
      fields: collectFields(matchingRecords),
      errors: result.errors,
      preview: savedItems.slice(0, 5).map(toTaskItemDto),
      files: result.files.map((file) => ({
        datasetKind: file.datasetKind,
        format: file.format,
        fileName: file.fileName,
        fields: file.fields,
        importedCount: file.records.length,
        errorCount: file.errors.length,
      })),
    };
  }

  async listItems(taskId: string): Promise<TaskItemDto[]> {
    const items = await this.prisma.taskItem.findMany({
      where: { taskId },
      orderBy: { sortOrder: 'asc' },
    });

    return items.map(toTaskItemDto);
  }

  async updateItem(itemId: string, input: UpdateItemInput): Promise<TaskItemDto> {
    const item = await this.prisma.taskItem.findUnique({ where: { id: itemId } });

    if (!item) {
      throw new NotFoundException({
        code: 'TASK_ITEM_NOT_FOUND',
        message: '题目不存在或已被删除。',
      });
    }

    if (item.status !== 'UNASSIGNED') {
      throw new BadRequestException({
        code: 'TASK_ITEM_ALREADY_ASSIGNED',
        message: '已领取或已完成的题目不能直接修改。',
      });
    }

    const updatedItem = await this.prisma.taskItem.update({
      where: { id: itemId },
      data: {
        rawData: {
          ...item.rawData,
          ...input.rawDataPatch,
        },
      },
    });

    return toTaskItemDto(updatedItem);
  }

  private async saveImportedRecords(
    taskId: string,
    records: ImportedDatasetRecord[],
  ): Promise<TaskItemRecord[]> {
    const existingCount = await this.prisma.taskItem.count({ where: { taskId } });

    return Promise.all(
      records.map((record, index) =>
        this.prisma.taskItem.upsert({
          where: {
            taskId_externalId: {
              taskId,
              externalId: record.externalId,
            },
          },
          update: {
            datasetKind: record.datasetKind,
            rawData: record.rawData,
            sortOrder: existingCount + index + 1,
          },
          create: {
            taskId,
            externalId: record.externalId,
            datasetKind: record.datasetKind,
            rawData: record.rawData,
            status: 'UNASSIGNED',
            sortOrder: existingCount + index + 1,
          },
        }),
      ),
    );
  }

  private async findTaskOrThrow(taskId: string): Promise<TaskDatasetSummary> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { template: { select: { datasetKind: true } } },
    });

    if (!task) {
      throw new NotFoundException({
        code: 'TASK_NOT_FOUND',
        message: '任务不存在或已被删除。',
      });
    }

    return task;
  }
}

function assertDatasetKindMatchesTask(task: TaskDatasetSummary, datasetKind: DatasetKind): void {
  if (task.template.datasetKind === datasetKind) {
    return;
  }

  throw new BadRequestException({
    code: 'TASK_DATASET_KIND_MISMATCH',
    message: '导入数据集类型与任务模板类型不一致。',
  });
}

function toImportSummary(
  taskId: string,
  datasetKind: DatasetKind,
  result: DatasetImportResult,
  savedItems: TaskItemRecord[],
): DatasetImportSummary {
  return {
    taskId,
    datasetKind,
    importedCount: savedItems.length,
    errorCount: result.errors.length,
    skippedFiles: result.skippedFiles,
    fields: result.fields,
    errors: result.errors,
    preview: savedItems.slice(0, 5).map(toTaskItemDto),
    files: [
      {
        datasetKind: result.datasetKind,
        format: result.format,
        fileName: result.fileName,
        fields: result.fields,
        importedCount: result.records.length,
        errorCount: result.errors.length,
      },
    ],
  };
}

function toTaskItemDto(item: TaskItemRecord): TaskItemDto {
  return {
    id: item.id,
    taskId: item.taskId,
    externalId: item.externalId,
    datasetKind: item.datasetKind,
    rawData: item.rawData,
    status: item.status,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function collectFields(records: ImportedDatasetRecord[]): string[] {
  return [...new Set(records.flatMap((record) => Object.keys(record.rawData)))];
}

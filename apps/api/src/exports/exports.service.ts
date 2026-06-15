import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  EXPORT_FORMATS,
  type DatasetKind,
  type ExportFormat,
  type LabelHubSchema,
  type SchemaField,
} from '@labelhub/shared';
import ExcelJS from 'exceljs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { PrismaService } from '../prisma/prisma.service.ts';
import { normalizeIdempotencyKey } from '../common/idempotency/idempotency-key.ts';
import { runInTransaction } from '../common/transactions/run-in-transaction.ts';
import {
  ExportMappingService,
  type ExportFieldMapping,
  type ExportSourceRow,
} from './export-mapping.service.ts';

type ExportStatus = 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';

type ExportJobRecord = {
  id: string;
  taskId: string;
  requestedById: string | null;
  status: ExportStatus;
  format: ExportFormat;
  idempotencyKey: string | null;
  fieldMapping: unknown;
  includeReviews: boolean;
  filters: unknown;
  filePath: string | null;
  resultUrl: string | null;
  errorMessage: string | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ExportSubmissionRecord = {
  id: string;
  status: string;
  round: number;
  answers: Record<string, unknown>;
  reviewRecords: Array<{
    id: string;
    stage: string;
    reviewerType: string;
    scores: Record<string, unknown>;
    decision: string | null;
    comment: string | null;
    createdAt: Date;
  }>;
  auditLogs: Array<{
    id: string;
    reason: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  }>;
};

type ExportTaskRecord = {
  id: string;
  title: string;
  datasetImportSummary: Record<string, unknown> | null;
  template: {
    datasetKind: DatasetKind;
    schema: unknown;
  };
  assignments: Array<{
    id: string;
    itemReports?: Array<{
      id: string;
      status: 'PENDING' | 'INVALIDATED' | 'REOPENED' | 'REJECTED';
    }>;
    taskItem: {
      id: string;
      externalId: string;
      rawData: Record<string, unknown>;
      sortOrder: number;
    };
    submissions: ExportSubmissionRecord[];
  }>;
};

export type CreateExportInput = {
  taskId: string;
  requestedById?: string;
  format: string;
  includeReviews: boolean;
  fieldMapping?: unknown;
  idempotencyKey?: string;
};

export type ExportPreviewInput = {
  includeReviews?: boolean;
  fieldMapping?: unknown;
};

export type ExportJobDto = Omit<ExportJobRecord, 'createdAt' | 'updatedAt' | 'finishedAt'> & {
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export type ExportPreviewDto = {
  taskId: string;
  datasetKind: DatasetKind;
  fieldMapping: ExportFieldMapping[];
  rows: Array<Record<string, unknown>>;
  totalFinalApproved: number;
};

export type ExportDownloadDto = {
  filePath: string;
  fileName: string;
};

type ExportsPrismaClient = {
  task: {
    findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<ExportTaskRecord | null>;
  };
  exportJob: {
    findFirst: (args: { where: { idempotencyKey: string } }) => Promise<ExportJobRecord | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<ExportJobRecord>;
    findMany: (args?: { where?: Record<string, unknown>; orderBy?: unknown }) => Promise<ExportJobRecord[]>;
    findUnique: (args: { where: { id: string } }) => Promise<ExportJobRecord | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<ExportJobRecord>;
  };
  $transaction: <TResult>(callback: (client: ExportsPrismaClient) => Promise<TResult>) => Promise<TResult>;
};

const EXPORT_TASK_INCLUDE = {
  template: { select: { datasetKind: true, schema: true } },
  assignments: {
    include: {
      itemReports: {
        select: {
          id: true,
          status: true,
        },
      },
      taskItem: true,
      submissions: {
        include: {
          reviewRecords: { orderBy: { createdAt: 'desc' } },
          auditLogs: { orderBy: { createdAt: 'desc' } },
        },
      },
    },
  },
} as const;

const CSV_UTF8_BOM = '\uFEFF';

@Injectable()
export class ExportsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ExportsPrismaClient,
    @Inject(ExportMappingService)
    private readonly mappingService: ExportMappingService,
    private readonly outputDir = 'storage/exports',
  ) {}

  async createExport(input: CreateExportInput): Promise<ExportJobDto> {
    const format = normalizeFormat(input.format);
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);

    return runInTransaction(this.prisma, async (client) => {
      if (idempotencyKey) {
        const existingJob = await client.exportJob.findFirst({
          where: { idempotencyKey },
        });
        if (existingJob) {
          return toExportJobDto(await this.completeExportJob(client, existingJob));
        }
      }

      const task = await this.findTaskOrThrow(input.taskId, client);
      const sources = collectFinalApprovedSources(task);
      const fieldMapping = this.resolveFieldMapping(input.fieldMapping, task, sources);
      const job = await client.exportJob.create({
        data: {
          taskId: task.id,
          requestedById: input.requestedById,
          status: 'QUEUED',
          format,
          ...(idempotencyKey ? { idempotencyKey } : {}),
          fieldMapping,
          includeReviews: input.includeReviews,
          filters: null,
          filePath: null,
          resultUrl: null,
          errorMessage: null,
          finishedAt: null,
        },
      });

      return toExportJobDto(await this.completeExportJob(client, job));
    });
  }

  async listExports(query: { taskId?: string } = {}): Promise<ExportJobDto[]> {
    const jobs = await this.prisma.exportJob.findMany({
      where: {
        ...(query.taskId ? { taskId: query.taskId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return jobs.map(toExportJobDto);
  }

  async getExport(exportJobId: string): Promise<ExportJobDto> {
    return toExportJobDto(await this.findExportOrThrow(exportJobId));
  }

  async downloadExport(exportJobId: string): Promise<ExportDownloadDto> {
    const job = await this.findExportOrThrow(exportJobId);
    if (job.status !== 'SUCCEEDED' || !job.filePath) {
      throw new NotFoundException({
        code: 'EXPORT_FILE_NOT_READY',
        message: '导出文件尚未生成，暂时无法下载。',
      });
    }

    const task = await this.findTaskOrThrow(job.taskId).catch((error: unknown) => {
      if (error instanceof NotFoundException) {
        return null;
      }

      throw error;
    });

    return {
      filePath: job.filePath,
      fileName: task ? buildExportDownloadFileName(task.title, job.format) : basename(job.filePath),
    };
  }

  async retryExport(exportJobId: string): Promise<ExportJobDto> {
    const job = await this.findExportOrThrow(exportJobId);
    if (job.status !== 'FAILED') {
      throw new BadRequestException({
        code: 'EXPORT_RETRY_NOT_FAILED',
        message: '只有失败的导出任务可以重试。',
      });
    }

    const retried = await this.prisma.exportJob.update({
      where: { id: exportJobId },
      data: {
        status: 'QUEUED',
        filePath: null,
        resultUrl: null,
        errorMessage: null,
        finishedAt: null,
      },
    });

    return toExportJobDto(retried);
  }

  async previewTaskExport(taskId: string, input: ExportPreviewInput = {}): Promise<ExportPreviewDto> {
    const task = await this.findTaskOrThrow(taskId);
    const sources = collectFinalApprovedSources(task);
    const fieldMapping = this.resolveFieldMapping(input.fieldMapping, task, sources);

    return {
      taskId: task.id,
      datasetKind: task.template.datasetKind,
      fieldMapping,
      rows: this.mappingService.buildRows(sources.slice(0, 5), fieldMapping, input.includeReviews === true),
      totalFinalApproved: sources.length,
    };
  }

  private async findTaskOrThrow(
    taskId: string,
    client: Pick<ExportsPrismaClient, 'task'> = this.prisma,
  ): Promise<ExportTaskRecord> {
    const task = await client.task.findUnique({
      where: { id: taskId },
      include: EXPORT_TASK_INCLUDE,
    });

    if (!task) {
      throw new NotFoundException({
        code: 'EXPORT_TASK_NOT_FOUND',
        message: '任务不存在或已被删除，无法导出。',
      });
    }

    return task;
  }

  private async findExportOrThrow(exportJobId: string): Promise<ExportJobRecord> {
    const job = await this.prisma.exportJob.findUnique({ where: { id: exportJobId } });
    if (!job) {
      throw new NotFoundException({
        code: 'EXPORT_JOB_NOT_FOUND',
        message: '导出任务不存在或已被删除。',
      });
    }

    return job;
  }

  private async completeExportJob(
    client: ExportsPrismaClient,
    job: ExportJobRecord,
  ): Promise<ExportJobRecord> {
    if (job.status === 'SUCCEEDED' && job.filePath) {
      return job;
    }

    try {
      const task = await this.findTaskOrThrow(job.taskId, client);
      const sources = collectFinalApprovedSources(task);
      const fieldMapping = this.resolveFieldMapping(job.fieldMapping, task, sources);
      const rows = this.mappingService.buildRows(sources, fieldMapping, job.includeReviews);
      const filePath = await writeExportFile({
        exportJobId: job.id,
        fieldMapping,
        format: job.format,
        outputDir: this.outputDir,
        rows,
      });

      return client.exportJob.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          fieldMapping,
          filePath,
          resultUrl: `/exports/${job.id}/download`,
          errorMessage: null,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      await client.exportJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : '导出文件生成失败。',
          finishedAt: new Date(),
        },
      });

      throw error;
    }
  }

  private resolveFieldMapping(
    fieldMapping: unknown,
    task: ExportTaskRecord,
    sources: ExportSourceRow[],
  ): ExportFieldMapping[] {
    const taskDefaultMapping = buildTaskDefaultMapping(task, sources);

    return this.mappingService.normalizeMapping(
      fieldMapping,
      task.template.datasetKind,
      taskDefaultMapping.length > 0 ? taskDefaultMapping : this.mappingService.getPreset(task.template.datasetKind),
    );
  }
}

function normalizeFormat(value: string): ExportFormat {
  if (EXPORT_FORMATS.includes(value as ExportFormat)) {
    return value as ExportFormat;
  }

  throw new BadRequestException({
    code: 'EXPORT_FORMAT_INVALID',
    message: '导出格式不支持，请选择 JSON、JSONL、CSV 或 Excel。',
  });
}

function collectFinalApprovedSources(task: ExportTaskRecord): ExportSourceRow[] {
  return [...task.assignments]
    .filter((assignment) => !hasInvalidatedItemReport(assignment))
    .sort(compareExportAssignments)
    .flatMap((assignment) =>
      [...assignment.submissions]
        .filter((submission) => submission.status === 'FINAL_APPROVED')
        .sort(compareExportSubmissions)
        .map((submission) => ({
          externalId: assignment.taskItem.externalId,
          rawData: assignment.taskItem.rawData,
          answers: submission.answers,
          review: buildReviewSnapshot(submission),
        })),
    );
}

function hasInvalidatedItemReport(assignment: ExportTaskRecord['assignments'][number]): boolean {
  return assignment.itemReports?.some((report) => report.status === 'INVALIDATED') ?? false;
}

function compareExportAssignments(
  left: ExportTaskRecord['assignments'][number],
  right: ExportTaskRecord['assignments'][number],
): number {
  const sortOrderDiff = left.taskItem.sortOrder - right.taskItem.sortOrder;
  if (sortOrderDiff !== 0) {
    return sortOrderDiff;
  }

  const externalIdDiff = naturalCompare(left.taskItem.externalId, right.taskItem.externalId);
  if (externalIdDiff !== 0) {
    return externalIdDiff;
  }

  const taskItemIdDiff = naturalCompare(left.taskItem.id, right.taskItem.id);
  if (taskItemIdDiff !== 0) {
    return taskItemIdDiff;
  }

  return naturalCompare(left.id, right.id);
}

function compareExportSubmissions(left: ExportSubmissionRecord, right: ExportSubmissionRecord): number {
  const roundDiff = left.round - right.round;
  if (roundDiff !== 0) {
    return roundDiff;
  }

  return naturalCompare(left.id, right.id);
}

const naturalCollator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
});

function naturalCompare(left: string, right: string): number {
  return naturalCollator.compare(left, right);
}

function buildTaskDefaultMapping(task: ExportTaskRecord, sources: ExportSourceRow[]): ExportFieldMapping[] {
  const mapping: ExportFieldMapping[] = [];
  const usedTargets = new Set<string>();
  const rawDataKeys = collectRawDataKeys(task, sources);

  if (!rawDataKeys.includes('id')) {
    addMapping(mapping, usedTargets, {
      source: 'item.externalId',
      target: 'id',
      enabled: true,
    });
  }

  for (const key of rawDataKeys) {
    addMapping(mapping, usedTargets, {
      source: `rawData.${key}`,
      target: key,
      enabled: true,
    });
  }

  for (const key of collectAnswerKeys(task.template.schema, sources)) {
    addMapping(
      mapping,
      usedTargets,
      {
        source: `answers.${key}`,
        target: key,
        enabled: true,
      },
      { conflictSuffix: 'label' },
    );
  }

  return mapping;
}

function collectRawDataKeys(task: ExportTaskRecord, sources: ExportSourceRow[]): string[] {
  return uniqueKeys([
    ...collectDatasetImportFieldKeys(task.datasetImportSummary),
    ...sources.flatMap((source) => Object.keys(source.rawData)),
  ]);
}

function collectDatasetImportFieldKeys(summary: Record<string, unknown> | null): string[] {
  if (!summary || !Array.isArray(summary.fields)) {
    return [];
  }

  return summary.fields.filter((field): field is string => typeof field === 'string' && field.length > 0);
}

function collectAnswerKeys(schema: unknown, sources: ExportSourceRow[]): string[] {
  return uniqueKeys([
    ...collectSchemaAnswerKeys(schema),
    ...sources.flatMap((source) => Object.keys(source.answers)),
  ]);
}

function collectSchemaAnswerKeys(schema: unknown): string[] {
  if (!isLabelHubSchemaLike(schema)) {
    return [];
  }

  return collectSchemaFieldAnswerKeys(schema.fields);
}

function collectSchemaFieldAnswerKeys(fields: readonly SchemaField[]): string[] {
  return fields.flatMap((field) => {
    if (field.type === 'group') {
      return collectSchemaFieldAnswerKeys(field.fields ?? []);
    }

    if (field.type === 'tabs') {
      return (field.tabs ?? []).flatMap((tab) => collectSchemaFieldAnswerKeys(tab.fields));
    }

    if (field.type === 'show_item' || field.type === 'llm_assist') {
      return [];
    }

    return [field.fieldKey ?? field.key].filter(Boolean);
  });
}

function isLabelHubSchemaLike(value: unknown): value is LabelHubSchema {
  return typeof value === 'object' && value !== null && Array.isArray((value as Partial<LabelHubSchema>).fields);
}

function uniqueKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const key of keys) {
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(key);
  }

  return result;
}

function addMapping(
  mapping: ExportFieldMapping[],
  usedTargets: Set<string>,
  field: ExportFieldMapping,
  options: { conflictSuffix?: string } = {},
): void {
  const target = resolveMappingTarget(field.target, usedTargets, options.conflictSuffix);
  if (!target) {
    return;
  }

  usedTargets.add(target);
  mapping.push(target === field.target ? field : { ...field, target });
}

function resolveMappingTarget(
  target: string,
  usedTargets: ReadonlySet<string>,
  conflictSuffix?: string,
): string | null {
  if (!usedTargets.has(target)) {
    return target;
  }

  if (!conflictSuffix) {
    return null;
  }

  const baseTarget = `${target}_${conflictSuffix}`;
  if (!usedTargets.has(baseTarget)) {
    return baseTarget;
  }

  let index = 2;
  while (usedTargets.has(`${baseTarget}_${index}`)) {
    index += 1;
  }

  return `${baseTarget}_${index}`;
}

function buildReviewSnapshot(submission: ExportSubmissionRecord): Record<string, unknown> {
  const aiReview = submission.reviewRecords.find((record) => record.stage === 'AI_PRECHECK' && record.reviewerType === 'AI');
  const humanReview =
    submission.reviewRecords.find((record) => record.stage === 'RECHECK' && record.reviewerType === 'HUMAN') ??
    submission.reviewRecords.find((record) => record.stage === 'FINAL' && record.reviewerType === 'HUMAN');

  return {
    ai_overall: numericScore(aiReview?.scores.overall),
    ai_decision: aiReview?.decision ?? null,
    ai_comment: aiReview?.comment ?? null,
    human_verdict: humanReview?.decision ?? null,
    human_comment: humanReview?.comment ?? null,
    timeline_summary: submission.auditLogs.map((log) => log.reason).filter(Boolean).join('；'),
  };
}

function numericScore(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

async function writeExportFile(input: {
  exportJobId: string;
  fieldMapping: ExportFieldMapping[];
  format: ExportFormat;
  outputDir: string;
  rows: Array<Record<string, unknown>>;
}): Promise<string> {
  await mkdir(input.outputDir, { recursive: true });
  const filePath = join(input.outputDir, `${input.exportJobId}.${input.format}`);

  if (input.format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Export');
    const headers = exportHeaders(input.fieldMapping, input.rows);
    worksheet.columns = headers.map((header) => ({ header, key: header, width: 24 }));
    worksheet.addRows(serializeRows(input.rows, headers));
    await workbook.xlsx.writeFile(filePath);

    return filePath;
  }

  const content = serializeExportContent(input.rows, input.fieldMapping, input.format);
  await writeFile(filePath, content, 'utf8');

  return filePath;
}

function serializeExportContent(
  rows: Array<Record<string, unknown>>,
  fieldMapping: ExportFieldMapping[],
  format: Exclude<ExportFormat, 'xlsx'>,
): string {
  if (format === 'json') {
    return `${JSON.stringify(serializeRows(rows, exportHeaders(fieldMapping, rows)), null, 2)}\n`;
  }

  if (format === 'jsonl') {
    const serializedRows = serializeRows(rows, exportHeaders(fieldMapping, rows));

    return serializedRows.map((row) => JSON.stringify(row)).join('\n') + (rows.length > 0 ? '\n' : '');
  }

  const headers = exportHeaders(fieldMapping, rows);
  const serializedRows = serializeRows(rows, headers);
  return CSV_UTF8_BOM + [
    headers.map(csvCell).join(','),
    ...serializedRows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n') + '\n';
}

function exportHeaders(
  fieldMapping: ExportFieldMapping[],
  rows: Array<Record<string, unknown>>,
): string[] {
  const mappedHeaders = fieldMapping.filter((field) => field.enabled).map((field) => field.target);
  if (mappedHeaders.length > 0) {
    return mappedHeaders;
  }

  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

function serializeRow(row: Record<string, unknown>, headers: string[]): Record<string, unknown> {
  return Object.fromEntries(headers.map((header) => [header, cellValue(row[header])]));
}

function serializeRows(rows: Array<Record<string, unknown>>, headers: string[]): Array<Record<string, unknown>> {
  return rows.map((row) => serializeRow(row, headers));
}

function csvCell(value: unknown): string {
  const text = String(cellValue(value));
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function cellValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(cellValue(item))).filter(Boolean).join('｜');
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function buildExportDownloadFileName(taskTitle: string, format: ExportFormat): string {
  const safeTitle = sanitizeFileNameSegment(taskTitle) || '任务';

  return `${safeTitle} 任务导出结果.${format}`;
}

const RESERVED_FILE_NAME_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

function sanitizeFileNameSegment(value: string): string {
  return Array.from(value, (char) =>
    RESERVED_FILE_NAME_CHARS.has(char) || char.charCodeAt(0) <= 31 ? ' ' : char,
  ).join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
}

function toExportJobDto(job: ExportJobRecord): ExportJobDto {
  return {
    ...job,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
  };
}

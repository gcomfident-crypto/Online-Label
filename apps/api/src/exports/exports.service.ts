import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EXPORT_FORMATS, type DatasetKind, type ExportFormat } from '@labelhub/shared';
import { basename } from 'node:path';

import { PrismaService } from '../prisma/prisma.service.ts';
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
  template: {
    datasetKind: DatasetKind;
  };
  assignments: Array<{
    id: string;
    taskItem: {
      externalId: string;
      rawData: Record<string, unknown>;
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
    create: (args: { data: Record<string, unknown> }) => Promise<ExportJobRecord>;
    findMany: (args?: { where?: Record<string, unknown>; orderBy?: unknown }) => Promise<ExportJobRecord[]>;
    findUnique: (args: { where: { id: string } }) => Promise<ExportJobRecord | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<ExportJobRecord>;
  };
};

const EXPORT_TASK_INCLUDE = {
  template: { select: { datasetKind: true } },
  assignments: {
    include: {
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

@Injectable()
export class ExportsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ExportsPrismaClient,
    @Inject(ExportMappingService)
    private readonly mappingService: ExportMappingService,
  ) {}

  async createExport(input: CreateExportInput): Promise<ExportJobDto> {
    const format = normalizeFormat(input.format);
    const task = await this.findTaskOrThrow(input.taskId);
    const fieldMapping = this.mappingService.normalizeMapping(input.fieldMapping, task.template.datasetKind);
    const job = await this.prisma.exportJob.create({
      data: {
        taskId: task.id,
        requestedById: input.requestedById,
        status: 'QUEUED',
        format,
        fieldMapping,
        includeReviews: input.includeReviews,
        filters: null,
        filePath: null,
        resultUrl: null,
        errorMessage: null,
        finishedAt: null,
      },
    });

    return toExportJobDto(job);
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

    return { filePath: job.filePath, fileName: basename(job.filePath) };
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
    const fieldMapping = this.mappingService.normalizeMapping(input.fieldMapping, task.template.datasetKind);
    const sources = collectFinalApprovedSources(task);

    return {
      taskId: task.id,
      datasetKind: task.template.datasetKind,
      fieldMapping,
      rows: this.mappingService.buildRows(sources.slice(0, 5), fieldMapping, input.includeReviews === true),
      totalFinalApproved: sources.length,
    };
  }

  private async findTaskOrThrow(taskId: string): Promise<ExportTaskRecord> {
    const task = await this.prisma.task.findUnique({
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
  return task.assignments.flatMap((assignment) =>
    assignment.submissions
      .filter((submission) => submission.status === 'FINAL_APPROVED')
      .map((submission) => ({
        externalId: assignment.taskItem.externalId,
        rawData: assignment.taskItem.rawData,
        answers: submission.answers,
        review: buildReviewSnapshot(submission),
      })),
  );
}

function buildReviewSnapshot(submission: ExportSubmissionRecord): Record<string, unknown> {
  const aiReview = submission.reviewRecords.find((record) => record.stage === 'AI_PRECHECK' && record.reviewerType === 'AI');
  const finalReview = submission.reviewRecords.find((record) => record.stage === 'FINAL' && record.reviewerType === 'HUMAN');

  return {
    ai_overall: numericScore(aiReview?.scores.overall),
    ai_decision: aiReview?.decision ?? null,
    ai_comment: aiReview?.comment ?? null,
    human_verdict: finalReview?.decision ?? null,
    human_comment: finalReview?.comment ?? null,
    timeline_summary: submission.auditLogs.map((log) => log.reason).filter(Boolean).join('；'),
  };
}

function numericScore(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function toExportJobDto(job: ExportJobRecord): ExportJobDto {
  return {
    ...job,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
  };
}

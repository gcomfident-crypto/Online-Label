import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ExportFormat } from '@labelhub/shared';

import type { ExportJobPayload } from '../queues/export.queue.ts';
import { exportCsv } from '../exporters/csvExporter.ts';
import { exportJson } from '../exporters/jsonExporter.ts';
import { exportJsonl } from '../exporters/jsonlExporter.ts';
import { exportXlsx } from '../exporters/xlsxExporter.ts';

type ExportFieldMapping = {
  source: string;
  target: string;
  enabled: boolean;
};

type ExportJobRecord = {
  id: string;
  taskId: string;
  format: ExportFormat;
  includeReviews: boolean;
  fieldMapping: unknown;
};

type ExportSubmissionRecord = {
  id: string;
  status: string;
  answers: Record<string, unknown>;
  reviewRecords: Array<{
    stage: string;
    reviewerType: string;
    scores: Record<string, unknown>;
    decision: string | null;
    comment: string | null;
    createdAt: Date;
  }>;
  auditLogs: Array<{
    reason: string | null;
    createdAt: Date;
  }>;
};

type ExportTaskRecord = {
  id: string;
  title: string;
  assignments: Array<{
    taskItem: {
      externalId: string;
      rawData: Record<string, unknown>;
    };
    submissions: ExportSubmissionRecord[];
  }>;
};

type ExportProcessorClient = {
  exportJob: {
    findUnique: (args: { where: { id: string } }) => Promise<ExportJobRecord | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  task: {
    findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<ExportTaskRecord | null>;
  };
};

export type ProcessExportResult = {
  filePath: string;
  rowCount: number;
};

const EXPORT_TASK_INCLUDE = {
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

export async function processExportJob(
  payload: ExportJobPayload,
  dependencies: { client: ExportProcessorClient; outputDir?: string },
): Promise<ProcessExportResult> {
  const outputDir = dependencies.outputDir ?? join(process.cwd(), 'storage', 'exports');
  const job = await dependencies.client.exportJob.findUnique({ where: { id: payload.exportJobId } });
  if (!job) {
    throw new Error('导出任务不存在，无法处理。');
  }

  await dependencies.client.exportJob.update({
    where: { id: job.id },
    data: {
      status: 'PROCESSING',
      errorMessage: null,
      startedAt: new Date(),
    },
  });

  try {
    const task = await dependencies.client.task.findUnique({
      where: { id: job.taskId },
      include: EXPORT_TASK_INCLUDE,
    });
    if (!task) {
      throw new Error('导出任务关联的任务不存在。');
    }

    const rows = buildRows(task, normalizeMapping(job.fieldMapping), job.includeReviews);
    await mkdir(outputDir, { recursive: true });
    const filePath = join(outputDir, `${job.id}.${extensionForFormat(job.format)}`);
    await writeFile(filePath, await renderExportBuffer(job.format, rows, task.title));
    await dependencies.client.exportJob.update({
      where: { id: job.id },
      data: {
        status: 'SUCCEEDED',
        filePath,
        errorMessage: null,
        finishedAt: new Date(),
      },
    });

    return { filePath, rowCount: rows.length };
  } catch (error) {
    await dependencies.client.exportJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : '导出失败。',
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}

function buildRows(task: ExportTaskRecord, fieldMapping: ExportFieldMapping[], includeReviews: boolean): Array<Record<string, unknown>> {
  return task.assignments.flatMap((assignment) =>
    assignment.submissions
      .filter((submission) => submission.status === 'FINAL_APPROVED')
      .map((submission) => {
        const source = {
          externalId: assignment.taskItem.externalId,
          rawData: assignment.taskItem.rawData,
          answers: submission.answers,
          review: buildReviewSnapshot(submission),
        };
        const row: Record<string, unknown> = {};
        for (const field of fieldMapping) {
          if (!field.enabled || (!includeReviews && field.source.startsWith('review.'))) {
            continue;
          }
          row[field.target] = resolveSourceValue(source, field.source);
        }

        return row;
      }),
  );
}

function normalizeMapping(value: unknown): ExportFieldMapping[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item !== 'object' || item === null) {
        return null;
      }
      const candidate = item as Record<string, unknown>;
      return typeof candidate.source === 'string' && typeof candidate.target === 'string'
        ? { source: candidate.source, target: candidate.target, enabled: candidate.enabled !== false }
        : null;
    })
    .filter((item): item is ExportFieldMapping => Boolean(item));
}

function buildReviewSnapshot(submission: ExportSubmissionRecord): Record<string, unknown> {
  const aiReview = submission.reviewRecords.find((record) => record.stage === 'AI_PRECHECK' && record.reviewerType === 'AI');
  const finalReview = submission.reviewRecords.find((record) => record.stage === 'FINAL' && record.reviewerType === 'HUMAN');

  return {
    ai_overall: typeof aiReview?.scores.overall === 'number' ? aiReview.scores.overall : null,
    ai_decision: aiReview?.decision ?? null,
    ai_comment: aiReview?.comment ?? null,
    human_verdict: finalReview?.decision ?? null,
    human_comment: finalReview?.comment ?? null,
    timeline_summary: submission.auditLogs.map((log) => log.reason).filter(Boolean).join('；'),
  };
}

function resolveSourceValue(
  source: {
    externalId: string;
    rawData: Record<string, unknown>;
    answers: Record<string, unknown>;
    review: Record<string, unknown>;
  },
  path: string,
): unknown {
  if (path === 'item.externalId') {
    return source.externalId;
  }
  if (path.startsWith('rawData.')) {
    return source.rawData[path.slice('rawData.'.length)];
  }
  if (path.startsWith('answers.')) {
    return source.answers[path.slice('answers.'.length)];
  }
  if (path.startsWith('review.')) {
    return source.review[path.slice('review.'.length)];
  }

  return undefined;
}

async function renderExportBuffer(
  format: ExportFormat,
  rows: Array<Record<string, unknown>>,
  taskTitle: string,
): Promise<Buffer> {
  if (format === 'json') {
    return exportJson(rows);
  }
  if (format === 'jsonl') {
    return exportJsonl(rows);
  }
  if (format === 'csv') {
    return exportCsv(rows);
  }

  return exportXlsx(rows, { sheetName: taskTitle });
}

function extensionForFormat(format: ExportFormat): string {
  return format === 'xlsx' ? 'xlsx' : format;
}

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ExportMappingService } from './export-mapping.service.ts';
import { ExportsService } from './exports.service.ts';

type ExportJob = {
  id: string;
  taskId: string;
  requestedById: string | null;
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  format: 'json' | 'jsonl' | 'csv' | 'xlsx';
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

const outputDirs: string[] = [];

describe('ExportsService', () => {
  afterEach(async () => {
    await Promise.all(outputDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    outputDirs.length = 0;
  });

  it('创建导出任务时保存字段映射快照、生成文件并可下载', async () => {
    const { service, db } = createService();

    const job = await service.createExport({
      taskId: 'task_qa',
      requestedById: 'user_owner_001',
      format: 'csv',
      includeReviews: true,
    });

    expect(job).toEqual(
      expect.objectContaining({
        taskId: 'task_qa',
        requestedById: 'user_owner_001',
        format: 'csv',
        status: 'SUCCEEDED',
        includeReviews: true,
        filePath: expect.stringMatching(/export_1\.csv$/),
      }),
    );
    expect(db.exportJobs[0].fieldMapping).toEqual(new ExportMappingService().getPreset('qa_quality'));
    await expect(service.downloadExport(job.id)).resolves.toEqual(
      expect.objectContaining({
        fileName: 'export_1.csv',
      }),
    );
  });

  it('重复创建相同幂等键时返回既有导出任务', async () => {
    const { service, db } = createService();
    db.exportJobs.push(createExportJob('export_idempotent', 'QUEUED', { idempotencyKey: 'export_idem_1' }));

    const job = await service.createExport({
      taskId: 'task_qa',
      requestedById: 'user_owner_001',
      format: 'json',
      includeReviews: true,
      idempotencyKey: 'export_idem_1',
    });

    expect(job.id).toBe('export_idempotent');
    expect(job.status).toBe('SUCCEEDED');
    expect(job.filePath).toEqual(expect.stringMatching(/export_idempotent\.json$/));
    expect(db.exportJobs).toHaveLength(1);
  });

  it('预览读取复审通过后完成的数据，不包含未完成数据', async () => {
    const { service } = createService();

    const preview = await service.previewTaskExport('task_qa', {
      includeReviews: true,
    });

    expect(preview.totalFinalApproved).toBe(1);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toEqual(
      expect.objectContaining({
        id: 'qa_final',
        prompt: '如何判断回答质量？',
        relevance_score: 5,
        ai_overall: 92,
        human_verdict: 'recheck_pass',
      }),
    );
    expect(JSON.stringify(preview.rows)).not.toContain('qa_pending');
  });

  it('includeReviews=false 时预览不包含审核字段', async () => {
    const { service } = createService();

    const preview = await service.previewTaskExport('task_qa', {
      includeReviews: false,
    });

    expect(preview.rows[0]).not.toHaveProperty('ai_overall');
    expect(preview.rows[0]).not.toHaveProperty('human_verdict');
  });

  it('支持查询历史、详情和失败任务重试', async () => {
    const { service, db } = createService();
    db.exportJobs.push(createExportJob('export_failed', 'FAILED'));

    await expect(service.listExports({ taskId: 'task_qa' })).resolves.toHaveLength(1);
    await expect(service.getExport('export_failed')).resolves.toMatchObject({
      id: 'export_failed',
      status: 'FAILED',
    });

    const retried = await service.retryExport('export_failed');

    expect(retried.status).toBe('QUEUED');
    expect(db.exportJobs[0]).toEqual(
      expect.objectContaining({
        status: 'QUEUED',
        filePath: null,
        errorMessage: null,
        finishedAt: null,
      }),
    );
  });

  it('拒绝不存在任务、无效格式和非失败任务重试', async () => {
    const { service, db } = createService();
    db.exportJobs.push(createExportJob('export_queued', 'QUEUED'));

    await expect(service.previewTaskExport('missing', {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.createExport({
        taskId: 'task_qa',
        requestedById: 'user_owner_001',
        format: 'pdf',
        includeReviews: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.retryExport('export_queued')).rejects.toBeInstanceOf(BadRequestException);
  });
});

function createService() {
  const db = createExportDb();
  const outputDir = mkdtempSync(join(tmpdir(), 'labelhub-exports-test-'));
  outputDirs.push(outputDir);
  const service = new ExportsService(
    db.client as ConstructorParameters<typeof ExportsService>[0],
    new ExportMappingService(),
    outputDir,
  );

  return { service, db };
}

function createExportDb() {
  const now = new Date('2026-05-21T10:00:00.000Z');
  const exportJobs: ExportJob[] = [];
  const task = {
    id: 'task_qa',
    title: '问答质量标注',
    template: {
      datasetKind: 'qa_quality' as const,
    },
    assignments: [
      createAssignment('assignment_final', 'qa_final', 'FINAL_APPROVED'),
      createAssignment('assignment_pending', 'qa_pending', 'FINAL_PENDING'),
    ],
  };
  const db = {
    exportJobs,
    client: {
      task: {
        findUnique: async (args: { where: { id: string } }) => (args.where.id === task.id ? task : null),
      },
      exportJob: {
        findFirst: async (args: { where: { idempotencyKey: string } }) =>
          exportJobs.find((job) => job.idempotencyKey === args.where.idempotencyKey) ?? null,
        create: async (args: { data: Partial<ExportJob> }) => {
          const job = {
            id: `export_${exportJobs.length + 1}`,
            taskId: args.data.taskId ?? 'task_qa',
            requestedById: args.data.requestedById ?? null,
            status: args.data.status ?? 'QUEUED',
            format: args.data.format ?? 'json',
            idempotencyKey: args.data.idempotencyKey ?? null,
            fieldMapping: args.data.fieldMapping ?? [],
            includeReviews: args.data.includeReviews ?? false,
            filters: args.data.filters ?? null,
            filePath: args.data.filePath ?? null,
            resultUrl: args.data.resultUrl ?? null,
            errorMessage: args.data.errorMessage ?? null,
            finishedAt: args.data.finishedAt ?? null,
            createdAt: now,
            updatedAt: now,
          } as ExportJob;
          exportJobs.push(job);
          return job;
        },
        findMany: async (args?: { where?: { taskId?: string }; orderBy?: unknown }) =>
          exportJobs.filter((job) => (args?.where?.taskId ? job.taskId === args.where.taskId : true)),
        findUnique: async (args: { where: { id: string } }) =>
          exportJobs.find((job) => job.id === args.where.id) ?? null,
        update: async (args: { where: { id: string }; data: Partial<ExportJob> }) => {
          const index = exportJobs.findIndex((job) => job.id === args.where.id);
          if (index < 0) {
            throw new Error('测试导出任务不存在。');
          }
          exportJobs[index] = { ...exportJobs[index], ...args.data, updatedAt: now };
          return exportJobs[index];
        },
      },
      $transaction: async <TResult>(callback: (client: ConstructorParameters<typeof ExportsService>[0]) => Promise<TResult>) =>
        callback(db.client as ConstructorParameters<typeof ExportsService>[0]),
    },
  };

  return db;
}

function createAssignment(id: string, externalId: string, status: string) {
  return {
    id,
    taskItem: {
      externalId,
      rawData: {
        prompt: '如何判断回答质量？',
        model_answer: '检查事实性。',
      },
    },
    submissions: [
      {
        id: `submission_${externalId}`,
        status,
        round: status === 'FINAL_APPROVED' ? 2 : 1,
        answers: {
          relevance_score: 5,
          accuracy_score: 4,
          format_score: 5,
          safety_score: 5,
          issue_tags: ['complete'],
          comment: `${externalId} 覆盖关键点。`,
        },
        reviewRecords: [
          {
            id: `ai_${externalId}`,
            stage: 'AI_PRECHECK',
            reviewerType: 'AI',
            scores: { overall: 92 },
            decision: 'pass',
            comment: 'AI 预审通过。',
            createdAt: new Date('2026-05-21T09:00:00.000Z'),
          },
          {
            id: `recheck_${externalId}`,
            stage: 'RECHECK',
            reviewerType: 'HUMAN',
            scores: {},
            decision: 'recheck_pass',
            comment: '复审通过。',
            createdAt: new Date('2026-05-21T09:10:00.000Z'),
          },
        ],
        auditLogs: [
          {
            id: `audit_${externalId}`,
            label: '复审通过',
            reason: '复审通过。',
            createdAt: new Date('2026-05-21T09:11:00.000Z'),
          },
        ],
      },
    ],
  };
}

function createExportJob(
  id: string,
  status: ExportJob['status'],
  overrides: Partial<ExportJob> = {},
): ExportJob {
  return {
    id,
    taskId: 'task_qa',
    requestedById: 'user_owner_001',
    status,
    format: 'json',
    idempotencyKey: null,
    fieldMapping: new ExportMappingService().getPreset('qa_quality'),
    includeReviews: true,
    filters: null,
    filePath: status === 'FAILED' ? 'storage/exports/failed.json' : null,
    resultUrl: null,
    errorMessage: status === 'FAILED' ? '导出失败。' : null,
    finishedAt: status === 'FAILED' ? new Date('2026-05-21T10:10:00.000Z') : null,
    createdAt: new Date('2026-05-21T10:00:00.000Z'),
    updatedAt: new Date('2026-05-21T10:10:00.000Z'),
    ...overrides,
  };
}

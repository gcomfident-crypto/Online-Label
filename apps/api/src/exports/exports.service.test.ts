import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ExportMappingService } from './export-mapping.service.ts';
import { ExportsService } from './exports.service.ts';

type ExportJob = {
  id: string;
  taskId: string;
  requestedById: string | null;
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  format: 'json' | 'jsonl' | 'csv' | 'xlsx';
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

describe('ExportsService', () => {
  it('创建导出任务时保存字段映射快照并进入 QUEUED', async () => {
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
        status: 'QUEUED',
        includeReviews: true,
      }),
    );
    expect(db.exportJobs[0].fieldMapping).toEqual(new ExportMappingService().getPreset('qa_quality'));
  });

  it('预览只读取 FINAL_APPROVED 数据，不包含 FINAL_PENDING', async () => {
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
        human_verdict: 'final_pass',
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
  const service = new ExportsService(
    db.client as ConstructorParameters<typeof ExportsService>[0],
    new ExportMappingService(),
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
        create: async (args: { data: Partial<ExportJob> }) => {
          const job = {
            id: `export_${exportJobs.length + 1}`,
            taskId: args.data.taskId ?? 'task_qa',
            requestedById: args.data.requestedById ?? null,
            status: args.data.status ?? 'QUEUED',
            format: args.data.format ?? 'json',
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
            id: `final_${externalId}`,
            stage: 'FINAL',
            reviewerType: 'HUMAN',
            scores: {},
            decision: 'final_pass',
            comment: '终审通过。',
            createdAt: new Date('2026-05-21T09:10:00.000Z'),
          },
        ],
        auditLogs: [
          {
            id: `audit_${externalId}`,
            label: '终审通过',
            reason: '终审通过。',
            createdAt: new Date('2026-05-21T09:11:00.000Z'),
          },
        ],
      },
    ],
  };
}

function createExportJob(id: string, status: ExportJob['status']): ExportJob {
  return {
    id,
    taskId: 'task_qa',
    requestedById: 'user_owner_001',
    status,
    format: 'json',
    fieldMapping: new ExportMappingService().getPreset('qa_quality'),
    includeReviews: true,
    filters: null,
    filePath: status === 'FAILED' ? 'storage/exports/failed.json' : null,
    resultUrl: null,
    errorMessage: status === 'FAILED' ? '导出失败。' : null,
    finishedAt: status === 'FAILED' ? new Date('2026-05-21T10:10:00.000Z') : null,
    createdAt: new Date('2026-05-21T10:00:00.000Z'),
    updatedAt: new Date('2026-05-21T10:10:00.000Z'),
  };
}

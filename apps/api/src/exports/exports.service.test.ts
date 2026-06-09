import { BadRequestException, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { mkdtempSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
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
    expect(db.exportJobs[0].fieldMapping).toEqual([
      { source: 'item.externalId', target: 'id', enabled: true },
      { source: 'rawData.prompt', target: 'prompt', enabled: true },
      { source: 'rawData.model_answer', target: 'model_answer', enabled: true },
      { source: 'answers.relevance_score', target: 'relevance_score', enabled: true },
      { source: 'answers.accuracy_score', target: 'accuracy_score', enabled: true },
      { source: 'answers.format_score', target: 'format_score', enabled: true },
      { source: 'answers.safety_score', target: 'safety_score', enabled: true },
      { source: 'answers.issue_tags', target: 'issue_tags', enabled: true },
      { source: 'answers.comment', target: 'comment', enabled: true },
    ]);
    await expect(service.downloadExport(job.id)).resolves.toEqual(
      expect.objectContaining({
        fileName: '问答质量标注 任务导出结果.csv',
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
        comment: 'qa_final 覆盖关键点。',
      }),
    );
    expect(preview.rows[0]).not.toHaveProperty('ai_overall');
    expect(preview.rows[0]).not.toHaveProperty('human_verdict');
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

  it('自定义输入文件模板按原始字段加全部标注员达标字段导出，标签字段用竖线合并', async () => {
    const { service, db } = createService();

    const preview = await service.previewTaskExport('task_generic_uploaded', {
      includeReviews: true,
    });

    expect(preview.datasetKind).toBe('generic_json');
    expect(preview.fieldMapping.map((field) => field.target)).toEqual([
      'id',
      'prompt',
      'response_a',
      'response_b',
      'preferred',
      'dimensions',
      'custom_tags',
      'annotator_note',
    ]);
    expect(preview.fieldMapping.map((field) => field.target)).not.toEqual(
      expect.arrayContaining(['model_answer', 'relevance_score', 'accuracy_score', 'ai_overall', 'human_verdict']),
    );
    expect(preview.rows).toEqual([
      {
        id: 'P9001',
        prompt: '哪一个回答更准确？',
        response_a: '回答 A 更完整。',
        response_b: '回答 B 过于简略。',
        preferred: 'A',
        dimensions: ['准确性', '实效性'],
        custom_tags: ['事实充分', '表达清楚'],
        annotator_note: 'A 覆盖了关键事实。',
      },
    ]);

    const xlsxJob = await service.createExport({
      taskId: 'task_generic_uploaded',
      requestedById: 'user_owner_001',
      format: 'xlsx',
      includeReviews: true,
    });
    await expect(service.downloadExport(xlsxJob.id)).resolves.toEqual(
      expect.objectContaining({
        fileName: '模版对比 xlsx 任务导出结果.xlsx',
      }),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(xlsxJob.filePath as string);
    const worksheet = workbook.getWorksheet('Export');
    expect(worksheet?.getRow(1).values).toEqual([
      undefined,
      'id',
      'prompt',
      'response_a',
      'response_b',
      'preferred',
      'dimensions',
      'custom_tags',
      'annotator_note',
    ]);
    expect(worksheet?.getRow(2).values).toEqual([
      undefined,
      'P9001',
      '哪一个回答更准确？',
      '回答 A 更完整。',
      '回答 B 过于简略。',
      'A',
      '准确性｜实效性',
      '事实充分｜表达清楚',
      'A 覆盖了关键事实。',
    ]);
    expect(db.exportJobs.at(-1)?.fieldMapping).toEqual(preview.fieldMapping);

    const csvJob = await service.createExport({
      taskId: 'task_generic_uploaded',
      requestedById: 'user_owner_001',
      format: 'csv',
      includeReviews: true,
    });
    const csvBuffer = await readFile(csvJob.filePath as string);
    expect([...csvBuffer.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    await expect(readFile(csvJob.filePath as string, 'utf8')).resolves.toBe(
      [
        '\uFEFFid,prompt,response_a,response_b,preferred,dimensions,custom_tags,annotator_note',
        'P9001,哪一个回答更准确？,回答 A 更完整。,回答 B 过于简略。,A,准确性｜实效性,事实充分｜表达清楚,A 覆盖了关键事实。',
        '',
      ].join('\n'),
    );

    const jsonJob = await service.createExport({
      taskId: 'task_generic_uploaded',
      requestedById: 'user_owner_001',
      format: 'json',
      includeReviews: true,
    });
    await expect(readFile(jsonJob.filePath as string, 'utf8').then((text) => JSON.parse(text))).resolves.toEqual([
      {
        id: 'P9001',
        prompt: '哪一个回答更准确？',
        response_a: '回答 A 更完整。',
        response_b: '回答 B 过于简略。',
        preferred: 'A',
        dimensions: '准确性｜实效性',
        custom_tags: '事实充分｜表达清楚',
        annotator_note: 'A 覆盖了关键事实。',
      },
    ]);

    const jsonlJob = await service.createExport({
      taskId: 'task_generic_uploaded',
      requestedById: 'user_owner_001',
      format: 'jsonl',
      includeReviews: true,
    });
    await expect(
      readFile(jsonlJob.filePath as string, 'utf8').then((text) =>
        text
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line)),
      ),
    ).resolves.toEqual([
      {
        id: 'P9001',
        prompt: '哪一个回答更准确？',
        response_a: '回答 A 更完整。',
        response_b: '回答 B 过于简略。',
        preferred: 'A',
        dimensions: '准确性｜实效性',
        custom_tags: '事实充分｜表达清楚',
        annotator_note: 'A 覆盖了关键事实。',
      },
    ]);
  });

  it('上传字段和打标字段同名时保留上传列并追加打标列', async () => {
    const { service } = createService();

    const preview = await service.previewTaskExport('task_generic_uploaded_conflict', {
      includeReviews: true,
    });

    expect(preview.fieldMapping.map((field) => field.target)).toEqual([
      'id',
      'prompt',
      'preferred',
      'preferred_label',
      'dimensions',
    ]);
    expect(preview.rows).toEqual([
      {
        id: 'P9002',
        prompt: '上传文件已有 preferred 列。',
        preferred: '上传原值',
        preferred_label: 'A',
        dimensions: ['准确性'],
      },
    ]);
  });

  it('导出预览和导出文件按题目导入顺序稳定排列', async () => {
    const { service } = createService();

    const preview = await service.previewTaskExport('task_unordered', {
      includeReviews: true,
    });

    expect(preview.totalFinalApproved).toBe(6);
    expect(preview.rows.map((row) => row.id)).toEqual(['P0001', 'P0002', 'P0003', 'P0004', 'P0005']);

    const job = await service.createExport({
      taskId: 'task_unordered',
      requestedById: 'user_owner_001',
      format: 'json',
      includeReviews: true,
    });
    await expect(readFile(job.filePath as string, 'utf8').then((text) => JSON.parse(text))).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'P0001' }),
        expect.objectContaining({ id: 'P0006' }),
      ]),
    );
    const exportedRows = JSON.parse(await readFile(job.filePath as string, 'utf8')) as Array<Record<string, unknown>>;
    expect(exportedRows.map((row) => row.id)).toEqual(['P0001', 'P0002', 'P0003', 'P0004', 'P0005', 'P0006']);
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
      schema: {
        schemaVersion: 'qa-test',
        datasetKind: 'qa_quality' as const,
        fields: [],
      },
    },
    assignments: [
      createAssignment('assignment_final', 'qa_final', 'FINAL_APPROVED'),
      createAssignment('assignment_pending', 'qa_pending', 'FINAL_PENDING'),
    ],
  };
  const genericTask = createGenericUploadedTask();
  const genericConflictTask = createGenericUploadedConflictTask();
  const unorderedTask = createUnorderedExportTask();
  const db = {
    exportJobs,
    client: {
      task: {
        findUnique: async (args: { where: { id: string } }) => {
          if (args.where.id === task.id) {
            return task;
          }
          if (args.where.id === genericTask.id) {
            return genericTask;
          }
          if (args.where.id === genericConflictTask.id) {
            return genericConflictTask;
          }
          if (args.where.id === unorderedTask.id) {
            return unorderedTask;
          }
          return null;
        },
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

function createGenericUploadedConflictTask() {
  const uploadedFields = ['id', 'prompt', 'preferred'];

  return {
    id: 'task_generic_uploaded_conflict',
    title: '同名字段冲突',
    datasetImportSummary: {
      taskId: 'task_generic_uploaded_conflict',
      datasetKind: 'generic_json' as const,
      importedCount: 1,
      errorCount: 0,
      skippedFiles: [],
      fields: uploadedFields,
      errors: [],
      preview: [],
      files: [
        {
          datasetKind: 'generic_json' as const,
          format: 'csv',
          fileName: 'conflict.csv',
          fields: uploadedFields,
          importedCount: 1,
          errorCount: 0,
        },
      ],
    },
    template: {
      datasetKind: 'generic_json' as const,
      schema: {
        schemaVersion: 'generic-conflict-test',
        datasetKind: 'generic_json' as const,
        fields: [
          {
            key: 'show_item',
            type: 'show_item',
            label: '展示项',
            sourceKeys: ['id', 'prompt', 'preferred'],
          },
          {
            key: 'preferred_field',
            fieldKey: 'preferred',
            type: 'radio',
            label: '偏好选择',
          },
          {
            key: 'dimensions_field',
            fieldKey: 'dimensions',
            type: 'tag_select',
            label: '评估维度',
          },
        ],
      },
    },
    assignments: [
      {
        id: 'assignment_generic_conflict_final',
        taskItem: {
          id: 'item_P9002',
          externalId: 'P9002',
          sortOrder: 1,
          rawData: {
            preferred: '上传原值',
            prompt: '上传文件已有 preferred 列。',
            id: 'P9002',
          },
        },
        submissions: [
          {
            id: 'submission_generic_conflict_final',
            status: 'FINAL_APPROVED',
            round: 1,
            answers: {
              dimensions: ['准确性'],
              preferred: 'A',
            },
            reviewRecords: [],
            auditLogs: [],
          },
        ],
      },
    ],
  };
}

function createGenericUploadedTask() {
  const uploadedFields = ['id', 'prompt', 'response_a', 'response_b'];

  return {
    id: 'task_generic_uploaded',
    title: '模版对比 xlsx',
    datasetImportSummary: {
      taskId: 'task_generic_uploaded',
      datasetKind: 'generic_json' as const,
      importedCount: 1,
      errorCount: 0,
      skippedFiles: [],
      fields: uploadedFields,
      errors: [],
      preview: [],
      files: [
        {
          datasetKind: 'generic_json' as const,
          format: 'xlsx',
          fileName: 'template_compare.xlsx',
          fields: uploadedFields,
          importedCount: 1,
          errorCount: 0,
        },
      ],
    },
    template: {
      datasetKind: 'generic_json' as const,
      schema: {
        schemaVersion: 'generic-uploaded-test',
        datasetKind: 'generic_json' as const,
        fields: [
          {
            key: 'show_item',
            type: 'show_item',
            label: '展示项',
            sourceKeys: ['id', 'prompt', 'response_a', 'response_b'],
          },
          {
            key: 'preferred_field',
            fieldKey: 'preferred',
            type: 'radio',
            label: '偏好选择',
          },
          {
            key: 'dimensions_field',
            fieldKey: 'dimensions',
            type: 'tag_select',
            label: '评估维度',
          },
          {
            key: 'custom_tags_field',
            fieldKey: 'custom_tags',
            type: 'tag_select',
            label: '自定义标签',
          },
          {
            key: 'annotator_note_field',
            fieldKey: 'annotator_note',
            type: 'textarea',
            label: '标注备注',
          },
          {
            key: 'llm_assist',
            type: 'llm_assist',
            label: '生成建议',
            targetFieldKey: 'annotator_note',
          },
        ],
      },
    },
    assignments: [
      {
        id: 'assignment_generic_final',
        taskItem: {
          id: 'item_P9001',
          externalId: 'P9001',
          sortOrder: 1,
          rawData: {
            response_b: '回答 B 过于简略。',
            id: 'P9001',
            response_a: '回答 A 更完整。',
            prompt: '哪一个回答更准确？',
          },
        },
        submissions: [
          {
            id: 'submission_generic_final',
            status: 'FINAL_APPROVED',
            round: 1,
            answers: {
              custom_tags: ['事实充分', '表达清楚'],
              annotator_note: 'A 覆盖了关键事实。',
              dimensions: ['准确性', '实效性'],
              preferred: 'A',
            },
            reviewRecords: [
              {
                id: 'ai_generic_final',
                stage: 'AI_PRECHECK',
                reviewerType: 'AI',
                scores: { overall: 91 },
                decision: 'pass',
                comment: 'AI 预审通过。',
                createdAt: new Date('2026-05-21T09:00:00.000Z'),
              },
              {
                id: 'recheck_generic_final',
                stage: 'RECHECK',
                reviewerType: 'HUMAN',
                scores: {},
                decision: 'recheck_pass',
                comment: '复审通过。',
                createdAt: new Date('2026-05-21T09:10:00.000Z'),
              },
            ],
            auditLogs: [],
          },
        ],
      },
    ],
  };
}

function createUnorderedExportTask() {
  return {
    id: 'task_unordered',
    title: '乱序导出验证',
    datasetImportSummary: {
      taskId: 'task_unordered',
      datasetKind: 'qa_quality' as const,
      importedCount: 6,
      errorCount: 0,
      skippedFiles: [],
      fields: ['id', 'prompt', 'model_answer'],
      errors: [],
      preview: [],
      files: [],
    },
    template: {
      datasetKind: 'qa_quality' as const,
      schema: {
        schemaVersion: 'qa-unordered-test',
        datasetKind: 'qa_quality' as const,
        fields: [],
      },
    },
    assignments: [
      createUnorderedAssignment('assignment_unordered_2', 'P0002', 2),
      createUnorderedAssignment('assignment_unordered_1', 'P0001', 1),
      createUnorderedAssignment('assignment_unordered_4', 'P0004', 4),
      createUnorderedAssignment('assignment_unordered_6', 'P0006', 6),
      createUnorderedAssignment('assignment_unordered_5', 'P0005', 5),
      createUnorderedAssignment('assignment_unordered_3', 'P0003', 3),
    ],
  };
}

function createUnorderedAssignment(id: string, externalId: string, sortOrder: number) {
  return {
    ...createAssignment(id, externalId, 'FINAL_APPROVED', sortOrder),
    taskItem: {
      id: `item_${externalId}`,
      externalId,
      sortOrder,
      rawData: {
        id: externalId,
        prompt: `题目 ${externalId}`,
        model_answer: `回答 ${externalId}`,
      },
    },
  };
}

function createAssignment(id: string, externalId: string, status: string, sortOrder = 0) {
  return {
    id,
    taskItem: {
      id: `item_${externalId}`,
      externalId,
      sortOrder,
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

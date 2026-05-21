import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { processExportJob } from './export.processor.ts';

describe('processExportJob', () => {
  it('只导出 FINAL_APPROVED 数据，写入文件并标记 SUCCEEDED', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'labelhub-export-'));
    const { client, updates } = createClient();

    try {
      const result = await processExportJob(
        { exportJobId: 'export_1', taskId: 'task_qa', format: 'json' },
        { client, outputDir },
      );

      expect(result.rowCount).toBe(1);
      expect(result.filePath.endsWith('.json')).toBe(true);
      expect(JSON.parse(await readFile(result.filePath, 'utf8'))).toEqual([
        expect.objectContaining({
          id: 'qa_final',
          prompt: '如何判断回答质量？',
          ai_overall: 92,
          human_verdict: 'final_pass',
        }),
      ]);
      expect(await readFile(result.filePath, 'utf8')).not.toContain('qa_pending');
      expect(updates[0]).toEqual(expect.objectContaining({ status: 'PROCESSING' }));
      expect(updates.at(-1)).toEqual(
        expect.objectContaining({
          status: 'SUCCEEDED',
          filePath: result.filePath,
          errorMessage: null,
        }),
      );
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('导出失败时标记 FAILED 并保存错误信息', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'labelhub-export-'));
    const { client, updates } = createClient({ missingTask: true });

    try {
      await expect(
        processExportJob({ exportJobId: 'export_1', taskId: 'task_qa', format: 'json' }, { client, outputDir }),
      ).rejects.toThrow('导出任务关联的任务不存在。');
      expect(updates.at(-1)).toEqual(
        expect.objectContaining({
          status: 'FAILED',
          errorMessage: '导出任务关联的任务不存在。',
        }),
      );
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});

function createClient(input: { missingTask?: boolean } = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const exportJob = {
    id: 'export_1',
    taskId: 'task_qa',
    format: 'json' as const,
    includeReviews: true,
    fieldMapping: [
      { source: 'item.externalId', target: 'id', enabled: true },
      { source: 'rawData.prompt', target: 'prompt', enabled: true },
      { source: 'answers.comment', target: 'comment', enabled: true },
      { source: 'review.ai_overall', target: 'ai_overall', enabled: true },
      { source: 'review.human_verdict', target: 'human_verdict', enabled: true },
    ],
  };
  const task = {
    id: 'task_qa',
    title: '问答质量标注',
    assignments: [
      createAssignment('qa_final', 'FINAL_APPROVED'),
      createAssignment('qa_pending', 'FINAL_PENDING'),
    ],
  };
  const client = {
    exportJob: {
      findUnique: async () => exportJob,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        Object.assign(exportJob, data);
        return { ...exportJob, ...data };
      },
    },
    task: {
      findUnique: async () => (input.missingTask ? null : task),
    },
  };

  return { client, updates };
}

function createAssignment(externalId: string, status: string) {
  return {
    taskItem: {
      externalId,
      rawData: {
        prompt: '如何判断回答质量？',
      },
    },
    submissions: [
      {
        id: `submission_${externalId}`,
        status,
        answers: { comment: `${externalId} 标注意见。` },
        reviewRecords: [
          {
            stage: 'AI_PRECHECK',
            reviewerType: 'AI',
            scores: { overall: 92 },
            decision: 'pass',
            comment: 'AI 预审通过。',
            createdAt: new Date('2026-05-21T09:00:00.000Z'),
          },
          {
            stage: 'FINAL',
            reviewerType: 'HUMAN',
            scores: {},
            decision: 'final_pass',
            comment: '终审通过。',
            createdAt: new Date('2026-05-21T09:10:00.000Z'),
          },
        ],
        auditLogs: [],
      },
    ],
  };
}

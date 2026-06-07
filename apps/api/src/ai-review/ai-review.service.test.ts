import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createLabelHubSchema, type LabelHubSchema } from '@labelhub/shared';
import { describe, expect, it, vi } from 'vitest';

import { AiReviewService } from './ai-review.service.ts';

describe('AiReviewService', () => {
  it('按状态查询 AI 预审队列并返回提交摘要', async () => {
    const { service, prisma } = createService();

    const jobs = await service.listJobs({ status: 'QUEUED' });

    expect(jobs).toEqual([
      expect.objectContaining({
        id: 'job_1',
        status: 'QUEUED',
        submissionId: 'submission_1',
        taskTitle: '问答质量标注',
        externalId: 'qa_1',
        idempotencyKey: 'submission_1:1:ai-review',
      }),
    ]);
    expect(prisma.aiReviewJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'QUEUED' },
      }),
    );
  });

  it('按任务提交批次聚合多个 submission 为一条 AI 预审记录', async () => {
    const batchId = 'task-submit:task_qa:user_labeler_li_lei:assignment_1:1:abc123';
    const { service } = createService({
      jobs: [
        createJobRecord({
          id: 'job_1',
          submissionId: 'submission_1',
          status: 'SUCCEEDED',
          submission: createSubmissionSummaryRecord({
            id: 'submission_1',
            assignmentId: 'assignment_1',
            idempotencyKey: `${batchId}:assignment_1:1`,
            externalId: 'qa_1',
            sortOrder: 1,
            reviewRecords: [createReviewRecord({ submissionId: 'submission_1', decision: 'pass', scores: { overall: 92 } })],
          }),
        }),
        createJobRecord({
          id: 'job_2',
          submissionId: 'submission_2',
          status: 'SUCCEEDED',
          submission: createSubmissionSummaryRecord({
            id: 'submission_2',
            assignmentId: 'assignment_2',
            idempotencyKey: `${batchId}:assignment_2:1`,
            externalId: 'qa_2',
            sortOrder: 2,
            reviewRecords: [createReviewRecord({ id: 'record_2', submissionId: 'submission_2', decision: 'pass', scores: { overall: 88 } })],
          }),
        }),
      ],
    });

    const batches = await service.listBatches();
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual(
      expect.objectContaining({
        batchId,
        itemCount: 2,
        taskTitle: '问答质量标注',
        labelerName: '李雷',
        aggregateDecision: 'pass',
        status: 'PASSED',
        aggregateScore: 90,
      }),
    );

    const detail = await service.getBatchReview(batchId);
    expect(detail.items.map((item) => item.taskItem.externalId)).toEqual(['qa_1', 'qa_2']);
    expect(detail.items.map((item) => item.index)).toEqual([1, 2]);
    expect(detail.items[0].reviewFields).toEqual([
      expect.objectContaining({
        fieldKey: 'quality',
        label: '质量判断',
        required: true,
        requirement: '判断质量字段是否符合题目要求。',
        type: 'radio',
      }),
    ]);
  });

  it('同一任务多次提交时队列表格只返回最新一条任务记录', async () => {
    const olderBatchId = 'task-submit:task_qa:user_labeler_li_lei:assignment_1:1:older';
    const latestBatchId = 'task-submit:task_qa:user_labeler_li_lei:assignment_1:2:latest';
    const { service } = createService({
      jobs: [
        createJobRecord({
          id: 'job_older_1',
          submissionId: 'submission_older_1',
          status: 'SUCCEEDED',
          updatedAt: new Date('2026-05-21T10:00:00.000Z'),
          submission: createSubmissionSummaryRecord({
            id: 'submission_older_1',
            assignmentId: 'assignment_1',
            idempotencyKey: `${olderBatchId}:assignment_1:1`,
            externalId: 'qa_1',
            round: 1,
            submittedAt: new Date('2026-05-21T09:00:00.000Z'),
            reviewRecords: [createReviewRecord({ submissionId: 'submission_older_1', decision: 'reject' })],
          }),
        }),
        createJobRecord({
          id: 'job_older_2',
          submissionId: 'submission_older_2',
          status: 'SUCCEEDED',
          updatedAt: new Date('2026-05-21T10:01:00.000Z'),
          submission: createSubmissionSummaryRecord({
            id: 'submission_older_2',
            assignmentId: 'assignment_2',
            idempotencyKey: `${olderBatchId}:assignment_2:1`,
            externalId: 'qa_2',
            round: 1,
            submittedAt: new Date('2026-05-21T09:00:05.000Z'),
            reviewRecords: [createReviewRecord({ id: 'record_older_2', submissionId: 'submission_older_2', decision: 'reject' })],
          }),
        }),
        createJobRecord({
          id: 'job_latest_1',
          submissionId: 'submission_latest_1',
          status: 'QUEUED',
          round: 2,
          updatedAt: new Date('2026-05-21T11:00:00.000Z'),
          submission: createSubmissionSummaryRecord({
            id: 'submission_latest_1',
            assignmentId: 'assignment_1',
            idempotencyKey: `${latestBatchId}:assignment_1:2`,
            externalId: 'qa_1',
            round: 2,
            submittedAt: new Date('2026-05-21T11:00:00.000Z'),
            reviewRecords: [],
          }),
        }),
        createJobRecord({
          id: 'job_latest_2',
          submissionId: 'submission_latest_2',
          status: 'QUEUED',
          round: 2,
          updatedAt: new Date('2026-05-21T11:01:00.000Z'),
          submission: createSubmissionSummaryRecord({
            id: 'submission_latest_2',
            assignmentId: 'assignment_2',
            idempotencyKey: `${latestBatchId}:assignment_2:2`,
            externalId: 'qa_2',
            round: 2,
            submittedAt: new Date('2026-05-21T11:00:05.000Z'),
            reviewRecords: [],
          }),
        }),
      ],
    });

    const batches = await service.listBatches();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      batchId: latestBatchId,
      taskId: 'task_qa',
      itemCount: 2,
      aggregateDecision: 'pending',
      status: 'PENDING',
    });
  });

  it('任务最新提交批次只有部分题目时，队列仍按任务聚合所有题目的最新 AI 预审结果', async () => {
    const previousBatchId = 'task-submit:task_qa:user_labeler_li_lei:assignment_1:3:previous';
    const latestBatchId = 'task-submit:task_qa:user_labeler_li_lei:assignment_1:4:latest';
    const latestRoundExternalIds = new Set(['P0001', 'P0005', 'P0006', 'P0007', 'P0009', 'P0010', 'P0011', 'P0012']);
    const jobs = Array.from({ length: 12 }, (_, index) => {
      const itemNumber = index + 1;
      const externalId = `P${itemNumber.toString().padStart(4, '0')}`;
      const assignmentId = `assignment_${itemNumber}`;
      const isLatestRound = latestRoundExternalIds.has(externalId);
      const batchId = isLatestRound ? latestBatchId : previousBatchId;
      const round = isLatestRound ? 4 : 3;
      const decision = ['P0001', 'P0005', 'P0006', 'P0009'].includes(externalId) ? 'reject' : 'pass';

      return createJobRecord({
        id: `job_${externalId}`,
        submissionId: `submission_${externalId}_round_${round}`,
        round,
        status: 'SUCCEEDED',
        updatedAt: new Date(`2026-05-21T${isLatestRound ? '12' : '11'}:${String(itemNumber).padStart(2, '0')}:00.000Z`),
        submission: createSubmissionSummaryRecord({
          id: `submission_${externalId}_round_${round}`,
          assignmentId,
          externalId,
          sortOrder: itemNumber,
          round,
          status: decision === 'pass' ? 'HUMAN_PENDING' : 'NEEDS_REVISION',
          submittedAt: new Date(`2026-05-21T${isLatestRound ? '12' : '11'}:${String(itemNumber).padStart(2, '0')}:00.000Z`),
          idempotencyKey: `${batchId}:${assignmentId}:${round}`,
          reviewRecords: [
            createReviewRecord({
              id: `record_${externalId}_round_${round}`,
              submissionId: `submission_${externalId}_round_${round}`,
              decision,
            }),
          ],
        }),
      });
    });
    const { service } = createService({ jobs });

    const [batch] = await service.listBatches();

    expect(batch).toMatchObject({
      batchId: latestBatchId,
      itemCount: 12,
      aggregateDecision: 'reject',
      submittedAt: '2026-05-21T12:01:00.000Z',
      status: 'REJECTED',
    });

    const detail = await service.getBatchReview(latestBatchId);
    expect(detail.itemCount).toBe(12);
    expect(detail.items.map((item) => item.taskItem.externalId)).toEqual([
      'P0001',
      'P0002',
      'P0003',
      'P0004',
      'P0005',
      'P0006',
      'P0007',
      'P0008',
      'P0009',
      'P0010',
      'P0011',
      'P0012',
    ]);
    expect(detail.items.find((item) => item.taskItem.externalId === 'P0002')?.decision).toBe('pass');
    expect(detail.items.find((item) => item.taskItem.externalId === 'P0009')?.decision).toBe('reject');
  });

  it('批次详情为每道题返回所有历史版本，支持按轮次查看提交快照', async () => {
    const previousBatchId = 'task-submit:task_qa:user_labeler_li_lei:assignment_1:1:previous';
    const latestBatchId = 'task-submit:task_qa:user_labeler_li_lei:assignment_1:2:latest';
    const { service } = createService({
      jobs: [
        createJobRecord({
          id: 'job_assignment_1_round_1',
          submissionId: 'submission_assignment_1_round_1',
          round: 1,
          status: 'SUCCEEDED',
          updatedAt: new Date('2026-05-21T10:00:00.000Z'),
          submission: createSubmissionSummaryRecord({
            id: 'submission_assignment_1_round_1',
            assignmentId: 'assignment_1',
            answers: { quality: 'pass', note: '第一轮说明。' },
            externalId: 'P0001',
            round: 1,
            submittedAt: new Date('2026-05-21T10:00:00.000Z'),
            idempotencyKey: `${previousBatchId}:assignment_1:1`,
            reviewRecords: [
              createReviewRecord({
                id: 'record_assignment_1_round_1',
                submissionId: 'submission_assignment_1_round_1',
                decision: 'reject',
              }),
            ],
          }),
        }),
        createJobRecord({
          id: 'job_assignment_1_round_2',
          submissionId: 'submission_assignment_1_round_2',
          round: 2,
          status: 'SUCCEEDED',
          updatedAt: new Date('2026-05-21T11:00:00.000Z'),
          submission: createSubmissionSummaryRecord({
            id: 'submission_assignment_1_round_2',
            assignmentId: 'assignment_1',
            answers: { quality: 'pass', note: '第二轮修复说明。' },
            externalId: 'P0001',
            round: 2,
            submittedAt: new Date('2026-05-21T11:00:00.000Z'),
            idempotencyKey: `${latestBatchId}:assignment_1:2`,
            reviewRecords: [
              createReviewRecord({
                id: 'record_assignment_1_round_2',
                submissionId: 'submission_assignment_1_round_2',
                decision: 'pass',
              }),
            ],
          }),
        }),
      ],
    });

    const detail = await service.getBatchReview(latestBatchId);

    expect(detail.items).toHaveLength(1);
    expect(detail.items[0].versions.map((version) => ({
      batchId: version.batchId,
      decision: version.decision,
      isCurrent: version.isCurrent,
      note: version.submission.answers.note,
      round: version.round,
    }))).toEqual([
      {
        batchId: latestBatchId,
        decision: 'pass',
        isCurrent: true,
        note: '第二轮修复说明。',
        round: 2,
      },
      {
        batchId: previousBatchId,
        decision: 'reject',
        isCurrent: false,
        note: '第一轮说明。',
        round: 1,
      },
    ]);
  });

  it('任务级聚合结果按失败、打回、通过的优先级输出，历史 manual 记录按打回处理', async () => {
    const createBatchJob = (input: {
      assignmentId: string;
      batchId: string;
      decision: 'pass' | 'reject' | 'manual' | null;
      externalId: string;
      jobId: string;
      status?: AiReviewJobRecord['status'];
      taskId?: string;
    }) =>
      createJobRecord({
        id: input.jobId,
        taskId: input.taskId ?? `task_${input.jobId}`,
        submissionId: `submission_${input.jobId}`,
        status: input.status ?? 'SUCCEEDED',
        submission: createSubmissionSummaryRecord({
          id: `submission_${input.jobId}`,
          assignmentId: input.assignmentId,
          idempotencyKey: `${input.batchId}:${input.assignmentId}:1`,
          externalId: input.externalId,
          reviewRecords: input.decision
            ? [createReviewRecord({ id: `record_${input.jobId}`, submissionId: `submission_${input.jobId}`, decision: input.decision })]
            : [],
        }),
      });
    const { service } = createService({
      jobs: [
        createBatchJob({ assignmentId: 'assignment_failed', batchId: 'batch_failed', decision: 'reject', externalId: 'q1', jobId: 'failed', status: 'FAILED_FINAL', taskId: 'task_failed' }),
        createBatchJob({ assignmentId: 'assignment_reject', batchId: 'batch_reject', decision: 'reject', externalId: 'q2', jobId: 'reject', taskId: 'task_reject' }),
        createBatchJob({ assignmentId: 'assignment_manual', batchId: 'batch_manual', decision: 'manual', externalId: 'q3', jobId: 'manual', taskId: 'task_manual' }),
        createBatchJob({ assignmentId: 'assignment_pass', batchId: 'batch_pass', decision: 'pass', externalId: 'q4', jobId: 'pass', taskId: 'task_pass' }),
      ],
    });

    const byBatchId = new Map((await service.listBatches()).map((batch) => [batch.batchId, batch]));

    expect(byBatchId.get('batch_failed')).toMatchObject({ aggregateDecision: 'failed', status: 'FAILED' });
    expect(byBatchId.get('batch_reject')).toMatchObject({ aggregateDecision: 'reject', status: 'REJECTED' });
    expect(byBatchId.get('batch_manual')).toMatchObject({ aggregateDecision: 'reject', status: 'REJECTED' });
    expect(byBatchId.get('batch_pass')).toMatchObject({ aggregateDecision: 'pass', status: 'PASSED' });
  });

  it('字段级结果只要有一个未通过，批次和题目详情都强制显示打回', async () => {
    const batchId = 'task-submit:task_qa:user_labeler_li_lei:assignment_1:1:field-rule';
    const { service } = createService({
      jobs: [
        createJobRecord({
          id: 'job_field_rule',
          submissionId: 'submission_field_rule',
          status: 'SUCCEEDED',
          submission: createSubmissionSummaryRecord({
            id: 'submission_field_rule',
            assignmentId: 'assignment_1',
            idempotencyKey: `${batchId}:assignment_1:1`,
            externalId: 'qa_field_rule',
            reviewRecords: [
              createReviewRecord({
                id: 'record_field_rule',
                submissionId: 'submission_field_rule',
                decision: 'pass',
                structuredOutput: {
                  verdict: 'pass',
                  fieldReviews: [
                    { fieldKey: 'quality', label: '质量判断', score: 92, decision: 'pass', comment: '通过。', suggestions: [] },
                    { fieldKey: 'risk', label: '风险判断', score: 66, decision: 'manual', comment: '需要复核。', suggestions: [] },
                  ],
                  overallComment: '风险判断未通过字段级 AI 预审。',
                },
              }),
            ],
          }),
        }),
      ],
    });

    const [batch] = await service.listBatches();
    expect(batch).toMatchObject({ aggregateDecision: 'reject', status: 'REJECTED', aiSuggestionLabel: '建议打回' });

    const detail = await service.getBatchReview(batchId);
    expect(detail.items[0]).toMatchObject({ decision: 'reject' });
  });

  it('失败任务可以重试并重新进入队列', async () => {
    const failedJob = createJobRecord({ status: 'FAILED_FINAL', attempts: 3, lastError: '结构化输出异常' });
    const { service, jobs } = createService({ jobs: [failedJob] });

    const retried = await service.retryJob('job_1');

    expect(retried.status).toBe('QUEUED');
    expect(retried.attempts).toBe(0);
    expect(jobs[0]).toMatchObject({
      status: 'QUEUED',
      attempts: 0,
      lastError: null,
    });
    expect(jobs[0]?.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'retry', message: '已手动重试 AI 预审任务。' }),
      ]),
    );
  });

  it('运行中任务不能手动重试，缺失任务返回 NotFoundException', async () => {
    const { service } = createService({ jobs: [createJobRecord({ status: 'RUNNING' })] });

    await expect(service.retryJob('job_1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.retryJob('missing_job')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('查询单条 submission 的 AI 预审详情，包含原始 Prompt、结构化输出和模型元数据', async () => {
    const { service } = createService();

    const detail = await service.getSubmissionReview('submission_1');

    expect(detail.submission.id).toBe('submission_1');
    expect(detail.taskItem.rawData).toEqual(expect.objectContaining({ prompt: '如何判断回答质量？' }));
    expect(detail.reviewRecord).toEqual(
      expect.objectContaining({
        rawPrompt: '请根据 prompt 评分。',
        rawOutput: '{"verdict":"pass"}',
        structuredOutput: { verdict: 'pass', scores: { overall: 88 } },
        modelMetadata: { provider: 'mock', model: 'mock-stable-reviewer', latencyMs: 1420 },
      }),
    );
    expect(detail.jobs).toHaveLength(1);
  });

  it('记录 AI 预审通过时写入审核记录、审计日志并进入人工复审', async () => {
    const { service, submissions, reviewRecords, auditLogs, jobs } = createService({
      submission: createSubmissionReviewRecord({ reviewRecords: [] }),
    });

    const detail = await service.completeJob('job_1', {
      decision: 'pass',
      scores: { overall: 91 },
      comment: 'AI 预审通过，建议进入人工复审。',
      rawPrompt: '请根据题目和答案判断质量。',
      rawOutput: '{"verdict":"pass","score":91}',
      structuredOutput: { verdict: 'pass', score: 91 },
      modelMetadata: { provider: 'mock', model: 'mock-stable-reviewer' },
    });

    expect(detail.submission.status).toBe('HUMAN_PENDING');
    expect(submissions[0].status).toBe('HUMAN_PENDING');
    expect(jobs[0]).toMatchObject({ status: 'SUCCEEDED', attempts: 1, lastError: null });
    expect(reviewRecords.at(-1)).toEqual(
      expect.objectContaining({
        submissionId: 'submission_1',
        stage: 'AI_PRECHECK',
        reviewerType: 'AI',
        decision: 'pass',
        comment: 'AI 预审通过，建议进入人工复审。',
        scores: { overall: 91 },
        idempotencyKey: 'submission_1:1:ai-review',
      }),
    );
    expect(auditLogs.map(({ fromStatus, toStatus, metadata }) => ({ fromStatus, toStatus, action: metadata?.action }))).toEqual([
      { fromStatus: 'AI_QUEUED', toStatus: 'AI_REVIEWING', action: 'AI_REVIEW_STARTED' },
      { fromStatus: 'AI_REVIEWING', toStatus: 'AI_PASSED', action: 'AI_REVIEW_PASSED' },
      { fromStatus: 'AI_PASSED', toStatus: 'HUMAN_PENDING', action: 'AI_REVIEW_TO_HUMAN_PENDING' },
    ]);
  });

  it('同一任务当前仍有 AI 打回题时，通过题先停留在 AI_PASSED，不提前进入人工复审', async () => {
    const passSubmission = createSubmissionReviewRecord({
      id: 'submission_pass',
      assignmentId: 'assignment_pass',
      externalId: 'qa_pass',
      status: 'AI_QUEUED',
      reviewRecords: [],
    });
    const rejectedSubmission = createSubmissionReviewRecord({
      id: 'submission_reject',
      assignmentId: 'assignment_reject',
      externalId: 'qa_reject',
      status: 'NEEDS_REVISION',
      reviewRecords: [
        createReviewRecord({
          id: 'record_reject',
          submissionId: 'submission_reject',
          decision: 'reject',
          comment: '当前仍有题被 AI 打回。',
        }),
      ],
    });
    const { service, submissions, auditLogs } = createService({
      submissions: [passSubmission, rejectedSubmission],
      jobs: [
        createJobRecord({
          id: 'job_pass',
          submissionId: 'submission_pass',
          status: 'QUEUED',
          submission: toJobSubmissionSummary(passSubmission),
        }),
        createJobRecord({
          id: 'job_reject',
          submissionId: 'submission_reject',
          status: 'SUCCEEDED',
          submission: toJobSubmissionSummary(rejectedSubmission),
        }),
      ],
    });

    const detail = await service.completeJob('job_pass', {
      decision: 'pass',
      scores: { overall: 91 },
      comment: 'AI 预审通过。',
    });

    expect(detail.submission.status).toBe('AI_PASSED');
    expect(submissions.find((submission) => submission.id === 'submission_pass')?.status).toBe('AI_PASSED');
    expect(auditLogs.map((auditLog) => auditLog.metadata?.action)).not.toContain('AI_REVIEW_TO_HUMAN_PENDING');
  });

  it('同一任务仍有题在 AI 预审中时，通过题先停留在 AI_PASSED，不提前进入人工复审', async () => {
    const passSubmission = createSubmissionReviewRecord({
      id: 'submission_pass',
      assignmentId: 'assignment_pass',
      externalId: 'qa_pass',
      status: 'AI_QUEUED',
      reviewRecords: [],
    });
    const reviewingSubmission = createSubmissionReviewRecord({
      id: 'submission_reviewing',
      assignmentId: 'assignment_reviewing',
      externalId: 'qa_reviewing',
      status: 'AI_REVIEWING',
      reviewRecords: [],
    });
    const { service, submissions, auditLogs } = createService({
      submissions: [passSubmission, reviewingSubmission],
      jobs: [
        createJobRecord({
          id: 'job_pass',
          submissionId: 'submission_pass',
          status: 'QUEUED',
          submission: toJobSubmissionSummary(passSubmission),
        }),
        createJobRecord({
          id: 'job_reviewing',
          submissionId: 'submission_reviewing',
          status: 'RUNNING',
          submission: toJobSubmissionSummary(reviewingSubmission),
        }),
      ],
    });

    const detail = await service.completeJob('job_pass', {
      decision: 'pass',
      scores: { overall: 91 },
      comment: 'AI 预审通过。',
    });

    expect(detail.submission.status).toBe('AI_PASSED');
    expect(submissions.find((submission) => submission.id === 'submission_pass')?.status).toBe('AI_PASSED');
    expect(submissions.find((submission) => submission.id === 'submission_reviewing')?.status).toBe('AI_REVIEWING');
    expect(auditLogs.map((auditLog) => auditLog.metadata?.action)).not.toContain('AI_REVIEW_TO_HUMAN_PENDING');
  });

  it('同一任务当前题全部通过后，把已暂存的 AI_PASSED 一起送入人工复审', async () => {
    const heldSubmission = createSubmissionReviewRecord({
      id: 'submission_held',
      assignmentId: 'assignment_held',
      externalId: 'qa_held',
      status: 'AI_PASSED',
      reviewRecords: [
        createReviewRecord({
          id: 'record_held',
          submissionId: 'submission_held',
          decision: 'pass',
        }),
      ],
    });
    const currentSubmission = createSubmissionReviewRecord({
      id: 'submission_current',
      assignmentId: 'assignment_current',
      externalId: 'qa_current',
      status: 'AI_QUEUED',
      reviewRecords: [],
    });
    const { service, submissions } = createService({
      submissions: [heldSubmission, currentSubmission],
      jobs: [
        createJobRecord({
          id: 'job_held',
          submissionId: 'submission_held',
          status: 'SUCCEEDED',
          submission: toJobSubmissionSummary(heldSubmission),
        }),
        createJobRecord({
          id: 'job_current',
          submissionId: 'submission_current',
          status: 'QUEUED',
          submission: toJobSubmissionSummary(currentSubmission),
        }),
      ],
    });

    const detail = await service.completeJob('job_current', {
      decision: 'pass',
      scores: { overall: 93 },
      comment: '最后一题也通过。',
    });

    expect(detail.submission.status).toBe('HUMAN_PENDING');
    expect(submissions.map((submission) => submission.status)).toEqual(['HUMAN_PENDING', 'HUMAN_PENDING']);
  });

  it('写入 AI 预审结果时按字段级结果兜底，任一字段未通过则保存为打回', async () => {
    const { service, submissions, assignments, reviewRecords } = createService({
      submission: createSubmissionReviewRecord({ reviewRecords: [] }),
    });

    const detail = await service.completeJob('job_1', {
      decision: 'pass',
      scores: { overall: 82 },
      structuredOutput: {
        verdict: 'pass',
        overallScore: 82,
        fieldReviews: [
          { fieldKey: 'quality', label: '质量判断', score: 93, decision: 'pass', comment: '通过。', suggestions: [] },
          { fieldKey: 'risk', label: '风险判断', score: 64, decision: 'manual', comment: '需要复核。', suggestions: [] },
        ],
        overallComment: '风险判断未通过字段级 AI 预审。',
      },
    });

    expect(detail.submission.status).toBe('NEEDS_REVISION');
    expect(submissions[0].status).toBe('NEEDS_REVISION');
    expect(assignments[0].status).toBe('NEEDS_REVISION');
    expect(reviewRecords.at(-1)).toEqual(
      expect.objectContaining({
        decision: 'reject',
        comment: '风险判断未通过字段级 AI 预审。',
        scores: { overall: 82, reason: '风险判断未通过字段级 AI 预审。' },
        structuredOutput: expect.objectContaining({ verdict: 'reject' }),
      }),
    );
  });

  it('记录 AI 预审打回时要求理由并让提交进入待修改', async () => {
    const { service, submissions, assignments, reviewRecords, auditLogs } = createService({
      submission: createSubmissionReviewRecord({ reviewRecords: [] }),
    });

    await expect(
      service.completeJob('job_1', {
        decision: 'reject',
        scores: { overall: 42 },
        comment: '  ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const detail = await service.completeJob('job_1', {
      decision: 'reject',
      scores: { overall: 42 },
      comment: '关键信息缺失，请补充判断依据。',
      rawPrompt: '请根据题目和答案判断质量。',
      rawOutput: '{"verdict":"reject","reason":"关键信息缺失"}',
      structuredOutput: { verdict: 'reject', reason: '关键信息缺失' },
      modelMetadata: { provider: 'mock', model: 'mock-stable-reviewer' },
    });

    expect(detail.submission.status).toBe('NEEDS_REVISION');
    expect(submissions[0].status).toBe('NEEDS_REVISION');
    expect(assignments[0].status).toBe('NEEDS_REVISION');
    expect(reviewRecords.at(-1)).toEqual(
      expect.objectContaining({
        decision: 'reject',
        comment: '关键信息缺失，请补充判断依据。',
        scores: { overall: 42, reason: '关键信息缺失，请补充判断依据。' },
      }),
    );
    expect(auditLogs.at(-1)).toEqual(
      expect.objectContaining({
        fromStatus: 'AI_REJECTED',
        toStatus: 'NEEDS_REVISION',
        reason: '关键信息缺失，请补充判断依据。',
      }),
    );
  });
});

function createService(
  input: {
    jobs?: AiReviewJobRecord[];
    submission?: SubmissionReviewRecord | null;
    submissions?: SubmissionReviewRecord[];
  } = {},
) {
  const jobs = [...(input.jobs ?? [createJobRecord()])];
  const submissions =
    input.submissions ??
    (input.submission === undefined ? [createSubmissionReviewRecord()] : input.submission ? [input.submission] : []);
  const reviewRecords = submissions.flatMap((submission) => submission.reviewRecords);
  const assignments = submissions.map((submission) => submission.assignment);
  const auditLogs: AuditLogRecord[] = [];
  const prisma = {
    aiReviewJob: {
      findMany: vi.fn(async ({ where }: { where?: { status?: string; taskId?: string } } = {}) =>
        jobs.filter((job) => (!where?.status || job.status === where.status) && (!where?.taskId || job.taskId === where.taskId)),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => jobs.find((job) => job.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<AiReviewJobRecord> }) => {
        const index = jobs.findIndex((job) => job.id === where.id);
        jobs[index] = { ...jobs[index], ...data, updatedAt: new Date('2026-05-21T09:00:00.000Z') };
        return jobs[index];
      }),
    },
    submission: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        submissions.find((submission) => submission.id === where.id) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<SubmissionReviewRecord> }) => {
        const submission = submissions.find((candidate) => candidate.id === where.id);
        if (!submission) {
          throw new Error('submission missing');
        }

        Object.assign(submission, data, { updatedAt: new Date('2026-05-21T09:00:00.000Z') });
        for (const job of jobs) {
          if (job.submissionId === submission.id) {
            Object.assign(job.submission, data);
          }
        }
        return submission;
      }),
    },
    assignment: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<SubmissionAssignmentRecord> }) => {
        const assignment = assignments.find((candidate) => candidate.id === where.id);
        if (!assignment) {
          throw new Error('assignment missing');
        }

        Object.assign(assignment, data);
        return assignment;
      }),
    },
    reviewRecord: {
      create: vi.fn(async ({ data }: { data: Partial<ReviewRecord> }) => {
        const record = {
          id: `record_${reviewRecords.length + 1}`,
          ruleId: null,
          rawPrompt: null,
          rawOutput: null,
          structuredOutput: null,
          modelMetadata: null,
          retryCount: 0,
          idempotencyKey: null,
          createdAt: new Date('2026-05-21T09:00:00.000Z'),
          ...data,
        } as ReviewRecord;
        reviewRecords.push(record);
        submissions.find((submission) => submission.id === record.submissionId)?.reviewRecords.unshift(record);
        jobs.find((job) => job.submissionId === record.submissionId)?.submission.reviewRecords.unshift(record);
        return record;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Partial<AuditLogRecord> }) => {
        const auditLog = {
          id: `audit_${auditLogs.length + 1}`,
          taskId: null,
          submissionId: null,
          fromStatus: null,
          toStatus: '',
          actorId: null,
          reason: null,
          metadata: null,
          createdAt: new Date('2026-05-21T09:00:00.000Z'),
          updatedAt: new Date('2026-05-21T09:00:00.000Z'),
          ...data,
        } as AuditLogRecord;
        auditLogs.push(auditLog);
        return auditLog;
      }),
    },
    $transaction: vi.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(prisma)),
  };

  return {
    assignments,
    auditLogs,
    jobs,
    prisma,
    reviewRecords,
    submissions,
    service: new AiReviewService(prisma as unknown as ConstructorParameters<typeof AiReviewService>[0]),
  };
}

type AiReviewJobRecord = {
  id: string;
  submissionId: string;
  taskId: string;
  round: number;
  idempotencyKey: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED_RETRYING' | 'FAILED_FINAL' | 'MANUAL_FALLBACK';
  attempts: number;
  maxAttempts: number;
  structuredOutputMode: string | null;
  provider: string | null;
  model: string | null;
  lastError: string | null;
  logs: Array<Record<string, unknown>> | null;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  submission: SubmissionSummaryRecord;
  task: {
    title: string;
    template?: {
      schemaVersion: string;
      schema: LabelHubSchema | null;
    };
  };
};

type SubmissionSummaryRecord = {
  id: string;
  assignmentId: string;
  answers: Record<string, unknown>;
  schemaVersion: string;
  idempotencyKey: string | null;
  status: string;
  round: number;
  submittedAt: Date;
  assignment: {
    id: string;
    assigneeId: string;
    assignee: {
      id: string;
      name: string;
    };
    taskItem: {
      id: string;
      externalId: string;
      datasetKind: 'qa_quality';
      rawData: Record<string, unknown>;
      sortOrder: number;
    };
  };
  reviewRecords: ReviewRecord[];
  auditLogs: AuditLogRecord[];
};

type SubmissionAssignmentRecord = SubmissionSummaryRecord['assignment'] & {
  id: string;
  taskId: string;
  taskItemId: string;
  assigneeId: string;
  status: 'SUBMITTED' | 'NEEDS_REVISION';
  task: {
    id: string;
    title: string;
    template: {
      datasetKind: 'qa_quality';
    };
  };
};

type ReviewRecord = {
  id: string;
  submissionId: string;
  ruleId: string | null;
  stage: 'AI_PRECHECK';
  reviewerType: string;
  scores: Record<string, unknown>;
  decision: string;
  comment: string;
  rawPrompt: string | null;
  rawOutput: string | null;
  structuredOutput: Record<string, unknown> | null;
  modelMetadata: Record<string, unknown> | null;
  retryCount: number;
  idempotencyKey: string | null;
  createdAt: Date;
};

type AuditLogRecord = {
  id: string;
  taskId: string | null;
  submissionId: string | null;
  fromStatus: string | null;
  toStatus: string;
  actorId: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

type SubmissionReviewRecord = SubmissionSummaryRecord & {
  assignmentId: string;
  answers: Record<string, unknown>;
  schemaVersion: string;
  assignment: SubmissionAssignmentRecord;
  reviewRecords: ReviewRecord[];
  aiReviewJobs: AiReviewJobRecord[];
  updatedAt: Date;
};

function createJobRecord(input: Partial<AiReviewJobRecord> = {}): AiReviewJobRecord {
  const now = new Date('2026-05-21T08:00:00.000Z');
  const submission = createSubmissionSummaryRecord();

  return {
    id: input.id ?? 'job_1',
    submissionId: input.submissionId ?? 'submission_1',
    taskId: input.taskId ?? 'task_qa',
    round: input.round ?? 1,
    idempotencyKey: input.idempotencyKey ?? 'submission_1:1:ai-review',
    status: input.status ?? 'QUEUED',
    attempts: input.attempts ?? 0,
    maxAttempts: input.maxAttempts ?? 3,
    structuredOutputMode: input.structuredOutputMode ?? 'function_calling',
    provider: input.provider ?? 'mock',
    model: input.model ?? 'mock-stable-reviewer',
    lastError: input.lastError ?? null,
    logs: input.logs ?? [{ level: 'queue', message: '提交已进入 AI 自动预审队列。' }],
    queuedAt: input.queuedAt ?? now,
    startedAt: input.startedAt ?? null,
    finishedAt: input.finishedAt ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    submission: input.submission ?? submission,
    task: input.task ?? {
      title: '问答质量标注',
      template: {
        schemaVersion: 'r1',
        schema: qaReviewSchema,
      },
    },
  };
}

function createSubmissionSummaryRecord(
  input: Partial<SubmissionSummaryRecord> & {
    assignmentId?: string;
    externalId?: string;
    sortOrder?: number;
  } = {},
): SubmissionSummaryRecord {
  const assignmentId = input.assignmentId ?? 'assignment_1';

  return {
    id: input.id ?? 'submission_1',
    assignmentId,
    answers: input.answers ?? { quality: 'pass' },
    schemaVersion: input.schemaVersion ?? 'r1',
    idempotencyKey: input.idempotencyKey ?? null,
    status: input.status ?? 'AI_QUEUED',
    round: input.round ?? 1,
    submittedAt: input.submittedAt ?? new Date('2026-05-21T08:00:00.000Z'),
    assignment: {
      id: assignmentId,
      assigneeId: 'user_labeler_li_lei',
      assignee: {
        id: 'user_labeler_li_lei',
        name: '李雷',
      },
      taskItem: {
        id: `item_${input.externalId ?? 'qa_1'}`,
        externalId: input.externalId ?? 'qa_1',
        datasetKind: 'qa_quality',
        rawData: { prompt: '如何判断回答质量？' },
        sortOrder: input.sortOrder ?? 1,
      },
    },
    reviewRecords: input.reviewRecords ?? [],
    auditLogs: input.auditLogs ?? [],
  };
}

function createReviewRecord(input: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: input.id ?? 'record_1',
    submissionId: input.submissionId ?? 'submission_1',
    ruleId: input.ruleId ?? 'rule_1',
    stage: input.stage ?? 'AI_PRECHECK',
    reviewerType: input.reviewerType ?? 'AI',
    scores: input.scores ?? { overall: 88 },
    decision: input.decision ?? 'pass',
    comment: input.comment ?? '建议通过。',
    rawPrompt: input.rawPrompt ?? '请根据 prompt 评分。',
    rawOutput: input.rawOutput ?? '{"verdict":"pass"}',
    structuredOutput: input.structuredOutput ?? { verdict: 'pass', scores: { overall: 88 } },
    modelMetadata: input.modelMetadata ?? { provider: 'mock', model: 'mock-stable-reviewer', latencyMs: 1420 },
    retryCount: input.retryCount ?? 0,
    idempotencyKey: input.idempotencyKey ?? 'submission_1:1:ai-review',
    createdAt: input.createdAt ?? new Date('2026-05-21T08:01:00.000Z'),
  };
}

function createSubmissionReviewRecord(
  input: Partial<SubmissionReviewRecord> & {
    assignmentId?: string;
    externalId?: string;
    sortOrder?: number;
    reviewRecords?: ReviewRecord[];
  } = {},
): SubmissionReviewRecord {
  const summary = createSubmissionSummaryRecord(input);
  const job = createJobRecord({
    submissionId: summary.id,
    round: summary.round,
    submission: summary,
  });
  const assignmentId = input.assignmentId ?? summary.assignmentId;
  const externalId = input.externalId ?? summary.assignment.taskItem.externalId;

  return {
    ...summary,
    id: input.id ?? summary.id,
    assignmentId,
    answers: input.answers ?? { quality: 'pass' },
    schemaVersion: input.schemaVersion ?? 'r1',
    assignment: {
      ...summary.assignment,
      id: assignmentId,
      taskId: input.assignment?.taskId ?? 'task_qa',
      taskItemId: input.assignment?.taskItemId ?? `item_${externalId}`,
      assigneeId: 'user_labeler_li_lei',
      status: input.assignment?.status ?? 'SUBMITTED',
      task: {
        id: 'task_qa',
        title: '问答质量标注',
        template: { datasetKind: 'qa_quality' },
      },
    },
    reviewRecords: input.reviewRecords ?? [createReviewRecord()],
    aiReviewJobs: input.aiReviewJobs ?? [job],
    auditLogs: [],
    updatedAt: input.updatedAt ?? new Date('2026-05-21T08:00:00.000Z'),
  };
}

function toJobSubmissionSummary(submission: SubmissionReviewRecord): SubmissionSummaryRecord {
  return {
    id: submission.id,
    assignmentId: submission.assignmentId,
    answers: submission.answers,
    schemaVersion: submission.schemaVersion,
    idempotencyKey: submission.idempotencyKey,
    status: submission.status,
    round: submission.round,
    submittedAt: submission.submittedAt,
    assignment: {
      id: submission.assignment.id,
      assigneeId: submission.assignment.assigneeId,
      assignee: submission.assignment.assignee,
      taskItem: submission.assignment.taskItem,
    },
    reviewRecords: [...submission.reviewRecords],
    auditLogs: [...(submission.auditLogs ?? [])],
  };
}

const qaReviewSchema = createLabelHubSchema({
  schemaVersion: 'r1',
  datasetKind: 'qa_quality',
  fields: [
    { key: 'question', type: 'show_item', label: '题目', sourceKey: 'prompt' },
    {
      key: 'quality_field',
      fieldKey: 'quality',
      type: 'radio',
      label: '质量判断',
      required: true,
      options: [
        { label: '通过', value: 'pass' },
        { label: '打回', value: 'reject' },
      ],
      aiReview: {
        enabled: true,
        requirement: '判断质量字段是否符合题目要求。',
      },
    },
    {
      key: 'note_field',
      fieldKey: 'note',
      type: 'textarea',
      label: '备注',
      aiReview: {
        enabled: false,
        requirement: '关闭后不进入 AI 预审。',
      },
    },
  ],
});

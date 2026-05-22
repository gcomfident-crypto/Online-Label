import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiReviewQueuePage } from './AiReviewQueuePage';

const jobs = [
  {
    id: 'job_1',
    submissionId: 'submission_1',
    taskId: 'task_qa',
    taskTitle: '问答质量标注',
    externalId: 'qa_1',
    datasetKind: 'qa_quality',
    submissionStatus: 'HUMAN_PENDING',
    round: 1,
    status: 'SUCCEEDED',
    attempts: 1,
    maxAttempts: 3,
    idempotencyKey: 'submission_1:1:ai-review',
    structuredOutputMode: 'function_calling',
    provider: 'mock',
    model: 'mock-stable-reviewer',
    lastError: null,
    queuedAt: '2026-05-21T08:00:00.000Z',
    startedAt: '2026-05-21T08:00:01.000Z',
    finishedAt: '2026-05-21T08:00:02.000Z',
    updatedAt: '2026-05-21T08:00:02.000Z',
  },
];

const detail = {
  submission: {
    id: 'submission_1',
    assignmentId: 'assignment_1',
    status: 'HUMAN_PENDING',
    round: 1,
    answers: { quality: 'pass' },
    schemaVersion: 'r1',
    submittedAt: '2026-05-21T08:00:00.000Z',
  },
  task: {
    id: 'task_qa',
    title: '问答质量标注',
    datasetKind: 'qa_quality',
  },
  taskItem: {
    id: 'item_qa_1',
    externalId: 'qa_1',
    datasetKind: 'qa_quality',
    rawData: { prompt: '如何判断回答质量？', model_answer: '检查事实性。' },
  },
  reviewRecord: {
    id: 'record_1',
    ruleId: 'rule_1',
    stage: 'AI_PRECHECK',
    reviewerType: 'AI',
    scores: { relevance: 92, accuracy: 88, overall: 90 },
    decision: 'pass',
    comment: '建议进入人工复审。',
    rawPrompt: '请根据 prompt、model_answer 和 answers 评分。',
    rawOutput: '{"verdict":"pass"}',
    structuredOutput: { verdict: 'pass', scores: { overall: 90 } },
    modelMetadata: {
      provider: 'mock',
      model: 'mock-stable-reviewer',
      temperature: 0,
      promptTokens: 64,
      completionTokens: 32,
      totalTokens: 96,
      latencyMs: 120,
    },
    retryCount: 0,
    idempotencyKey: 'submission_1:1:ai-review',
    createdAt: '2026-05-21T08:00:02.000Z',
  },
  jobs,
};

describe('AiReviewQueuePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('展示图 4 机审队列、结构化输出、Prompt 和处理日志，并支持重试', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: jobs }))
      .mockResolvedValueOnce(jsonResponse({ data: detail }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...jobs[0], status: 'FAILED_FINAL', lastError: '结构化输出异常' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...jobs[0], status: 'QUEUED' } }))
      .mockResolvedValueOnce(jsonResponse({ data: jobs }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <AiReviewQueuePage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'AI 自动预审队列' })).toBeInTheDocument();
    expect(screen.getByText('function_calling · 结构化')).toBeInTheDocument();
    expect(screen.getByText('问答质量标注')).toBeInTheDocument();
    expect(screen.getByText('JSON 字段视图')).toBeInTheDocument();
    expect(screen.getByText('维度评分')).toBeInTheDocument();
    expect(screen.getByText('AI 评语')).toBeInTheDocument();
    expect(screen.getByText('审核 Prompt 模板')).toBeInTheDocument();
    expect(screen.getByText('处理日志 / 审计')).toBeInTheDocument();
    expect(screen.getByText(/如何判断回答质量/)).toBeInTheDocument();
    expect(screen.getByText('总令牌')).toBeInTheDocument();
    expect(screen.getByText('96')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '失败' }));
    expect(fetchMock).toHaveBeenLastCalledWith('/ai-review/jobs?status=FAILED_FINAL', expect.objectContaining({ method: 'GET' }));
    await user.click(await screen.findByRole('button', { name: '重试任务' }));
    expect(fetchMock).toHaveBeenCalledWith('/ai-review/jobs/job_1/retry', expect.objectContaining({ method: 'POST' }));

    const scorePanel = screen.getByLabelText('维度评分');
    expect(within(scorePanel).getByText('overall')).toBeInTheDocument();
  });
});

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

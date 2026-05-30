import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReviewDetailPage } from './ReviewDetailPage';

describe('ReviewDetailPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('按 taskId 从真实人工复审接口渲染三栏详情，并支持题目、Tab、多选和操作 toast', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';

      if (path === '/reviews/pending' && method === 'GET') {
        return jsonResponse({ data: reviewQueueItems });
      }

      if (path === '/reviews/submission_1' && method === 'GET') {
        return jsonResponse({ data: reviewDetail });
      }

      if (path === '/reviews/submission_2' && method === 'GET') {
        return jsonResponse({
          data: {
            ...reviewDetail,
            submission: { ...reviewDetail.submission, id: 'submission_2' },
            taskItem: { ...reviewDetail.taskItem, externalId: 'P0002', rawData: { prompt: '第二题' } },
          },
        });
      }

      if (path === '/reviews/submission_2/pass' && method === 'POST') {
        return jsonResponse({ data: { ...reviewDetail, submission: { ...reviewDetail.submission, id: 'submission_2' } } });
      }

      return jsonResponse({ data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/reviewer/reviews/task_real']}>
        <Routes>
          <Route path="/reviewer/reviews/:taskId" element={<ReviewDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '真实人工审核任务' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '复审视角' })).toHaveAttribute('href', '/reviewer/reviews');
    expect(screen.getByRole('button', { name: '切换：终审' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出审计日志' })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/reviews/pending', expect.anything()));

    const queue = screen.getByLabelText('当前任务题目列表');
    expect(within(queue).getByRole('tab', { name: /AI 已建议通过\s*1/ })).toBeInTheDocument();
    expect(within(queue).getByRole('tab', { name: /AI 已建议打回\s*1/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(queue).getByRole('tab', { name: /转人工\s*0/ })).toBeInTheDocument();
    expect(within(queue).getByText('已选 0 条')).toBeInTheDocument();
    expect(within(queue).getAllByText(/P0001/).length).toBeGreaterThan(0);
    expect(await screen.findByText('P0001 · 如何判断回答质量？')).toBeInTheDocument();

    expect(screen.queryByText('上一轮提交')).not.toBeInTheDocument();
    expect(screen.getByText('题目信息')).toBeInTheDocument();
    expect(screen.getByLabelText('本轮提交内容')).toHaveTextContent('prompt');
    expect(screen.getByLabelText('本轮提交内容')).toHaveTextContent('如何判断回答质量？');
    expect(screen.getByText('本轮提交')).toBeInTheDocument();
    expect(screen.getByLabelText('本轮提交内容')).toHaveTextContent('quality');
    expect(screen.getByLabelText('AI 预审 · 本轮重跑结果')).toHaveTextContent('综合分');
    expect(screen.getByLabelText('AI 预审 · 本轮重跑结果')).toHaveTextContent('62');
    expect(screen.getByLabelText('审核统计')).toHaveTextContent('待我审核');
    expect(screen.getByLabelText('审计时间线（P0001）')).toHaveTextContent('第 1 轮提交');

    await user.click(within(queue).getByLabelText('选择 P0001'));
    expect(within(queue).getByText('已选 1 条')).toBeInTheDocument();

    await user.click(within(queue).getByRole('tab', { name: /AI 已建议通过\s*1/ }));
    expect(screen.getAllByText(/P0002/).length).toBeGreaterThan(0);
    expect(await screen.findByText('P0002 · 第二题')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /通过 · 入库/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('P0002 已通过入库');
    expect(fetchMock).toHaveBeenCalledWith(
      '/reviews/submission_2/pass',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

const reviewQueueItems = [
  {
    submissionId: 'submission_1',
    assignmentId: 'assignment_1',
    taskId: 'task_real',
    taskTitle: '真实人工审核任务',
    taskItemId: 'item_1',
    externalId: 'P0001',
    datasetKind: 'qa_quality',
    status: 'HUMAN_PENDING',
    round: 1,
    aiDecision: 'reject',
    aiComment: '需要补充判断依据。',
    aiScores: { overall: 62, relevance: 78, accuracy: 55, format: 70, safety: 99 },
    assignedReviewerId: null,
    submittedAt: '2026-05-30T10:01:02.000Z',
    updatedAt: '2026-05-30T10:01:02.000Z',
  },
  {
    submissionId: 'submission_2',
    assignmentId: 'assignment_2',
    taskId: 'task_real',
    taskTitle: '真实人工审核任务',
    taskItemId: 'item_2',
    externalId: 'P0002',
    datasetKind: 'qa_quality',
    status: 'HUMAN_PENDING',
    round: 1,
    aiDecision: 'pass',
    aiComment: '建议通过。',
    aiScores: { overall: 91, relevance: 92, accuracy: 90, format: 88, safety: 99 },
    assignedReviewerId: null,
    submittedAt: '2026-05-30T10:02:02.000Z',
    updatedAt: '2026-05-30T10:02:02.000Z',
  },
];

const reviewDetail = {
  submission: {
    id: 'submission_1',
    assignmentId: 'assignment_1',
    status: 'HUMAN_PENDING',
    round: 1,
    answers: { quality: 'pass', comment: '覆盖核心点。' },
    schemaVersion: 'r1',
    submittedAt: '2026-05-30T10:01:02.000Z',
  },
  assignment: {
    id: 'assignment_1',
    assigneeId: 'user_labeler_li_lei',
    status: 'SUBMITTED',
  },
  task: {
    id: 'task_real',
    title: '真实人工审核任务',
    datasetKind: 'qa_quality',
    templateName: '问答质量模板',
  },
  taskItem: {
    id: 'item_1',
    externalId: 'P0001',
    datasetKind: 'qa_quality',
    rawData: { prompt: '如何判断回答质量？' },
  },
  aiReview: {
    id: 'review_ai_1',
    submissionId: 'submission_1',
    ruleId: null,
    stage: 'AI_PRECHECK',
    reviewerId: null,
    assignedReviewerId: null,
    reviewerType: 'AI',
    scores: { overall: 62, relevance: 78, accuracy: 55, format: 70, safety: 99 },
    decision: 'reject',
    comment: '需要补充判断依据。',
    revisedAnswers: null,
    rawPrompt: null,
    rawOutput: null,
    structuredOutput: null,
    modelMetadata: null,
    retryCount: 0,
    idempotencyKey: null,
    createdAt: '2026-05-30T10:01:12.000Z',
    updatedAt: '2026-05-30T10:01:12.000Z',
  },
  humanReview: null,
  reviewRecords: [],
  timeline: [
    {
      id: 'audit_1',
      kind: 'audit',
      label: '提交',
      actorId: 'user_labeler_li_lei',
      fromStatus: 'IN_PROGRESS',
      toStatus: 'HUMAN_PENDING',
      reason: '第 1 轮提交',
      metadata: null,
      createdAt: '2026-05-30T10:01:02.000Z',
    },
  ],
};

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    text: async () => JSON.stringify(body),
  }) as Response;

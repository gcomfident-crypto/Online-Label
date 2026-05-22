import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReviewListPage } from './ReviewListPage';

const pendingReviews = [
  {
    submissionId: 'submission_1',
    assignmentId: 'assignment_1',
    taskId: 'task_qa',
    taskTitle: '问答质量标注',
    taskItemId: 'item_qa_1',
    externalId: 'qa_1',
    datasetKind: 'qa_quality',
    status: 'HUMAN_PENDING',
    round: 1,
    aiDecision: 'pass',
    aiComment: '建议进入人工复审。',
    aiScores: { relevance: 92, accuracy: 88, overall: 90 },
    assignedReviewerId: 'user_reviewer_wang_fang',
    submittedAt: '2026-05-21T08:00:00.000Z',
    updatedAt: '2026-05-21T08:02:00.000Z',
  },
  {
    submissionId: 'submission_2',
    assignmentId: 'assignment_2',
    taskId: 'task_qa',
    taskTitle: '问答质量标注',
    taskItemId: 'item_qa_2',
    externalId: 'qa_2',
    datasetKind: 'qa_quality',
    status: 'RECHECK_REVIEWING',
    round: 2,
    aiDecision: 'manual',
    aiComment: '需要人工判断。',
    aiScores: { overall: 62 },
    assignedReviewerId: null,
    submittedAt: '2026-05-21T09:00:00.000Z',
    updatedAt: '2026-05-21T09:02:00.000Z',
  },
];

const reviewDetail = {
  submission: {
    id: 'submission_1',
    assignmentId: 'assignment_1',
    status: 'HUMAN_PENDING',
    round: 1,
    answers: { quality: 'pass', reason: '覆盖关键点。' },
    schemaVersion: 'qa-r1',
    submittedAt: '2026-05-21T08:00:00.000Z',
  },
  assignment: {
    id: 'assignment_1',
    assigneeId: 'user_labeler_li_lei',
    status: 'SUBMITTED',
  },
  task: {
    id: 'task_qa',
    title: '问答质量标注',
    datasetKind: 'qa_quality',
    templateName: '问答质量官方模板',
  },
  taskItem: {
    id: 'item_qa_1',
    externalId: 'qa_1',
    datasetKind: 'qa_quality',
    rawData: {
      prompt: '如何判断回答质量？',
      model_answer: '检查事实性、相关性和表达完整度。',
    },
  },
  aiReview: {
    id: 'ai_record_1',
    submissionId: 'submission_1',
    ruleId: 'rule_qa',
    stage: 'AI_PRECHECK',
    reviewerId: null,
    assignedReviewerId: null,
    reviewerType: 'AI',
    scores: { relevance: 92, accuracy: 88, overall: 90 },
    decision: 'pass',
    comment: '建议进入人工复审。',
    revisedAnswers: null,
    rawPrompt: '请判断标注答案是否合格。',
    rawOutput: '{"verdict":"pass"}',
    structuredOutput: { verdict: 'pass', scores: { overall: 90 } },
    modelMetadata: { provider: 'mock', model: 'mock-stable-reviewer', totalTokens: 96 },
    retryCount: 0,
    idempotencyKey: 'submission_1:1:ai-review',
    createdAt: '2026-05-21T08:02:00.000Z',
    updatedAt: '2026-05-21T08:02:00.000Z',
  },
  humanReview: null,
  reviewRecords: [],
  timeline: [
    {
      id: 'audit_1',
      kind: 'audit',
      label: 'AI 自动预审',
      actorId: 'user_ai_agent_system',
      fromStatus: null,
      toStatus: 'HUMAN_PENDING',
      reason: 'AI 自动预审通过。',
      metadata: { action: 'AI_REVIEW_SUCCEEDED' },
      createdAt: '2026-05-21T08:03:00.000Z',
    },
  ],
};

describe('ReviewListPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('展示待复审队列、AI 结论、审计时间线，并支持开始复审和通过入库', async () => {
    const user = userEvent.setup();
    const fetchMock = createReviewFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <ReviewListPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '人工复审工作台' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '问答质量标注' })).toBeInTheDocument();
    expect(screen.getByText('建议进入人工复审。')).toBeInTheDocument();
    expect(await screen.findByText('首次标注')).toBeInTheDocument();
    expect(screen.getByText('审计时间线')).toBeInTheDocument();
    expect(screen.getByText(/如何判断回答质量/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '开始复审' }));
    expect(fetchMock).toHaveBeenCalledWith('/reviews/submission_1/start', expect.objectContaining({ method: 'POST' }));

    await user.type(screen.getByLabelText('复审意见'), '同意进入终审。');
    await user.click(screen.getByRole('button', { name: '通过入库' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/reviews/submission_1/pass',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          actorId: 'user_reviewer_wang_fang',
          comment: '同意进入终审。',
        }),
      }),
    );
  });

  it('支持勾选多条后批量打回并要求统一理由', async () => {
    const user = userEvent.setup();
    const fetchMock = createReviewFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <ReviewListPage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '人工复审工作台' });
    const toolbar = screen.getByLabelText('批量复审工具栏');

    await user.click(screen.getByLabelText('选择 qa_1'));
    await user.click(screen.getByLabelText('选择 qa_2'));
    await user.click(within(toolbar).getByRole('button', { name: '批量打回' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('批量打回必须填写统一理由。');

    await user.type(within(toolbar).getByLabelText('统一打回理由'), '批量抽检发现依据不足。');
    await user.click(within(toolbar).getByRole('button', { name: '批量打回' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/reviews/batch-reject',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          actorId: 'user_reviewer_wang_fang',
          submissionIds: ['submission_1', 'submission_2'],
          reason: '批量抽检发现依据不足。',
        }),
      }),
    );
  });
});

function createReviewFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = input.toString();
    const method = init?.method ?? 'GET';

    if (path === '/reviews/pending' && method === 'GET') {
      return jsonResponse({ data: pendingReviews });
    }
    if (path === '/reviews/submission_1' && method === 'GET') {
      return jsonResponse({ data: reviewDetail });
    }
    if (path === '/reviews/submission_2' && method === 'GET') {
      return jsonResponse({
        data: {
          ...reviewDetail,
          submission: { ...reviewDetail.submission, id: 'submission_2', status: 'RECHECK_REVIEWING' },
          taskItem: { ...reviewDetail.taskItem, externalId: 'qa_2' },
        },
      });
    }
    if (path === '/reviews/submission_1/start' && method === 'POST') {
      return jsonResponse({
        data: {
          ...reviewDetail,
          submission: { ...reviewDetail.submission, status: 'RECHECK_REVIEWING' },
        },
      });
    }
    if (path === '/reviews/submission_1/pass' && method === 'POST') {
      return jsonResponse({
        data: {
          ...reviewDetail,
          submission: { ...reviewDetail.submission, status: 'FINAL_PENDING' },
        },
      });
    }
    if (path === '/reviews/batch-reject' && method === 'POST') {
      return jsonResponse({ data: { processedCount: 2, submissions: [] } });
    }

    return jsonResponse({ data: {} });
  });
}

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

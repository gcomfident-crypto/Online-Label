import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReviewListPage } from './ReviewListPage';

describe('ReviewListPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('从真实人工复审接口聚合任务列表，并可点击任务打开自下而上的详情页弹层', async () => {
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

      return jsonResponse({ data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/reviewer/reviews']}>
        <Routes>
          <Route path="/reviewer/reviews" element={<ReviewListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '人工审核' })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/reviews/pending', expect.anything()));
    const table = screen.getByRole('table', { name: '人工审核任务列表' });
    [
      '任务名称 / 批次',
      '审核阶段',
      '待审核',
      'AI 通过',
      'AI 打回',
      '转人工',
      '处理人',
      '状态',
      '创建 / 更新',
      '操作',
    ].forEach((header) => expect(within(table).getByText(header)).toBeInTheDocument());
    expect(within(table).getByText('真实人工审核任务')).toBeInTheDocument();
    expect(within(table).getByText(/task_real/)).toBeInTheDocument();
    expect(within(table).getByText('2')).toBeInTheDocument();
    expect(within(table).getAllByText('1')).toHaveLength(2);
    expect(within(table).getByText('0')).toBeInTheDocument();
    expect(within(table).getByText('待处理')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: '进入审核' }));

    const dialog = await screen.findByRole('dialog', { name: '真实人工审核任务' });
    expect(dialog).toHaveClass('manual-review-task-sheet');
    expect(document.querySelector('.manual-review-sheet-overlay')).toBeInTheDocument();
    expect(screen.getByLabelText('当前任务题目列表')).toBeInTheDocument();
    expect(await screen.findByText('P0001 · 如何判断回答质量？')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/reviews/submission_1', expect.objectContaining({ method: 'GET' }));

    await user.click(within(dialog).getByRole('button', { name: '关闭人工审核详情' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '真实人工审核任务' })).not.toBeInTheDocument());
  });

  it('空列表状态复用任务列表空表格样式', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/reviewer/reviews']}>
        <Routes>
          <Route path="/reviewer/reviews" element={<ReviewListPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const table = await screen.findByRole('table', { name: '人工审核任务列表' });
    expect(table).toHaveClass('task-table', 'manual-review-task-table');
    expect(table.closest('.task-table-panel')).toHaveClass('manual-review-task-table-panel');
    expect(table.closest('.task-table-scroll')).toHaveClass('manual-review-task-table-scroll');

    const emptyRow = within(table).getByText('当前没有任务哦').closest('tr');
    expect(emptyRow).toHaveClass('task-table__empty-row');
    const emptyIllustration = within(table).getByRole('img', { name: '空人工审核任务插画' });
    expect(emptyIllustration).toHaveAttribute('src', expect.stringContaining('empty-table-illustration.svg'));
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

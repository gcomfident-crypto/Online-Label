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

      if (path === '/reviews/submission_3' && method === 'GET') {
        return jsonResponse({
          data: {
            ...reviewDetail,
            submission: {
              ...reviewDetail.submission,
              id: 'submission_3',
              answers: { quality: 'pass', comment: '第三题覆盖核心点。' },
            },
            taskItem: { ...reviewDetail.taskItem, externalId: 'P0003', rawData: { prompt: '第三题' } },
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
    const pageDescription = screen.getByText(
      '展示当前人工复审任务的题目内容、标注答案、AI 预审结果和审核决策，支持逐题通过、修订或打回',
    );
    expect(pageDescription).toHaveClass('task-management-table-description');
    expect(pageDescription.closest('.manual-review-detail-toolbar')).not.toBeNull();
    expect(screen.queryByRole('link', { name: '复审视角' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '切换：终审' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '导出审计日志' })).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/reviews/pending', expect.anything()));

    const queue = screen.getByLabelText('当前任务题目列表');
    expect(within(queue).getByRole('tab', { name: /AI 已建议通过\s*2/ })).toBeInTheDocument();
    expect(within(queue).getByRole('tab', { name: /AI 已建议打回\s*1/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(queue).getByRole('tab', { name: /转人工\s*0/ })).toBeInTheDocument();
    expect(within(queue).getByText('已选 0 条')).toBeInTheDocument();
    const selectVisibleQuestions = within(queue).getByRole('checkbox', { name: '全选当前分组题目' });
    expect(selectVisibleQuestions).not.toBeChecked();
    expect(within(queue).queryByRole('button', { name: '指派给...' })).not.toBeInTheDocument();
    expect(within(queue).queryByText(/AI\s*62/)).not.toBeInTheDocument();
    expect(within(queue).queryByText(/标注/)).not.toBeInTheDocument();
    const rejectQuestionButton = within(queue).getByRole('button', { name: /P0001/ });
    expect(rejectQuestionButton).toHaveTextContent('10:01:02');
    expect(await screen.findByText('P0001 · 如何判断回答质量？')).toBeInTheDocument();

    expect(screen.queryByText('上一轮提交')).not.toBeInTheDocument();
    expect(screen.getByText('题目信息')).toBeInTheDocument();
    const reviewCommentInput = screen.getByRole('textbox', { name: '审核意见（打回时必填）' });
    expect(reviewCommentInput).toHaveValue('');
    expect(reviewCommentInput).toHaveAttribute('placeholder', '需要补充判断依据。');
    const questionInfoTable = screen.getByRole('table', { name: '题目信息展示字段' });
    expect(questionInfoTable).toHaveClass('schema-field__show-table');
    expect(questionInfoTable).toHaveTextContent('Prompt');
    expect(questionInfoTable).toHaveTextContent('如何判断回答质量？');
    expect(screen.queryByText('prompt')).not.toBeInTheDocument();
    expect(screen.getByText('本轮提交')).toBeInTheDocument();
    expect(screen.getByLabelText('本轮提交内容')).toHaveTextContent('质量判断');
    expect(screen.getByLabelText('本轮提交内容')).toHaveTextContent('判断理由');
    expect(screen.getByLabelText('AI 预审 · 本轮重跑结果')).toHaveTextContent('综合分');
    expect(screen.getByLabelText('AI 预审 · 本轮重跑结果')).toHaveTextContent('62');
    expect(screen.getByLabelText('审核统计')).toHaveTextContent('待我审核');
    expect(screen.getByLabelText('审计时间线（P0001）')).toHaveTextContent('第 1 轮提交');
    expect(screen.queryByLabelText('问题标签')).not.toBeInTheDocument();
    ['# fieldCount', '# passedFieldCount', '# rejectedFieldCount']
      .forEach((label) => expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument());

    await user.click(selectVisibleQuestions);
    expect(selectVisibleQuestions).toBeChecked();
    expect(within(queue).getByLabelText('选择 P0001')).toBeChecked();
    expect(within(queue).getByText('已选 1 条')).toBeInTheDocument();

    await user.click(selectVisibleQuestions);
    expect(selectVisibleQuestions).not.toBeChecked();
    expect(within(queue).getByLabelText('选择 P0001')).not.toBeChecked();
    expect(within(queue).getByText('已选 0 条')).toBeInTheDocument();

    await user.click(within(queue).getByLabelText('选择 P0001'));
    expect(within(queue).getByText('已选 1 条')).toBeInTheDocument();

    await user.click(within(queue).getByRole('tab', { name: /AI 已建议通过\s*2/ }));
    expect(screen.getAllByText(/P0002/).length).toBeGreaterThan(0);
    expect(await screen.findByText('P0002 · 第二题')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /通过 · 入库/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('P0002 已通过入库');
    expect(fetchMock).toHaveBeenCalledWith(
      '/reviews/submission_2/pass',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('左侧题目列表按题号自然升序展示，且题目条只保留题号和提交时间', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        const method = init?.method ?? 'GET';

        if (path === '/reviews/pending' && method === 'GET') {
          return jsonResponse({ data: [reviewQueueItems[2], reviewQueueItems[1]] });
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

        return jsonResponse({ data: reviewDetail });
      }),
    );

    render(
      <MemoryRouter initialEntries={['/reviewer/reviews/task_real']}>
        <Routes>
          <Route path="/reviewer/reviews/:taskId" element={<ReviewDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const queue = await screen.findByLabelText('当前任务题目列表');
    const questionButtons = Array.from(queue.querySelectorAll<HTMLButtonElement>('.manual-review-question-list article button'));

    expect(questionButtons).toHaveLength(2);
    expect(questionButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'P0002 10:02:02 建议通过 第 1 轮',
      'P0003 10:03:02 建议通过 第 1 轮',
    ]);
    expect(within(queue).queryByText(/AI\s*91/)).not.toBeInTheDocument();
    expect(within(queue).queryByText(/系统标注|Labeler标注|李雷标注/)).not.toBeInTheDocument();
  });

  it('批量通过和批量打回对已选题目调用对应接口并更新队列', async () => {
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

      if (path === '/reviews/batch-reject' && method === 'POST') {
        return jsonResponse({ data: { processedCount: 1, submissions: [] } });
      }

      if (path === '/reviews/batch-pass' && method === 'POST') {
        return jsonResponse({ data: { processedCount: 2, submissions: [] } });
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

    const queue = await screen.findByLabelText('当前任务题目列表');
    expect(within(queue).getByRole('button', { name: '批量打回' })).toBeDisabled();

    await user.click(within(queue).getByLabelText('选择 P0001'));
    await user.click(within(queue).getByRole('button', { name: '批量打回' }));

    expect(await screen.findByText('已批量打回 1 条')).toBeInTheDocument();
    const rejectCall = fetchMock.mock.calls.find(([path]) => path === '/reviews/batch-reject');
    expect(rejectCall).toBeDefined();
    expect(JSON.parse((rejectCall?.[1] as RequestInit).body as string)).toEqual({
      actorId: 'user_reviewer_wang_fang',
      reason: '请根据审核意见修改',
      submissionIds: ['submission_1'],
    });
    expect(within(queue).getByRole('tab', { name: /AI 已建议打回\s*0/ })).toBeInTheDocument();
    expect(within(queue).queryByLabelText('选择 P0001')).not.toBeInTheDocument();

    await user.click(within(queue).getByRole('tab', { name: /AI 已建议通过\s*2/ }));
    await user.click(within(queue).getByRole('checkbox', { name: '全选当前分组题目' }));
    await user.click(within(queue).getByRole('button', { name: '批量通过' }));

    expect(await screen.findByText('已批量通过 2 条')).toBeInTheDocument();
    const passCall = fetchMock.mock.calls.find(([path]) => path === '/reviews/batch-pass');
    expect(passCall).toBeDefined();
    expect(JSON.parse((passCall?.[1] as RequestInit).body as string)).toEqual({
      actorId: 'user_reviewer_wang_fang',
      comment: '',
      submissionIds: ['submission_2', 'submission_3'],
    });
    expect(within(queue).getByRole('tab', { name: /AI 已建议通过\s*0/ })).toBeInTheDocument();
    expect(within(queue).getByText('当前分组暂无题目。')).toBeInTheDocument();
  });

  it('模板没有 show_item 时题目信息仍使用 ShowItem 表格样式', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        const method = init?.method ?? 'GET';

        if (path === '/reviews/pending' && method === 'GET') {
          return jsonResponse({ data: [reviewQueueItems[0]] });
        }

        if (path === '/reviews/submission_1' && method === 'GET') {
          return jsonResponse({
            data: {
              ...reviewDetail,
              task: {
                ...reviewDetail.task,
                schema: {
                  ...reviewDetail.task.schema,
                  fields: [
                    { key: 'quality', type: 'radio', label: '质量判断' },
                    { key: 'comment', type: 'textarea', label: '判断理由' },
                  ],
                },
              },
              taskItem: {
                ...reviewDetail.taskItem,
                rawData: { prompt: '如何判断回答质量？', source: '人工构造题源' },
              },
            },
          });
        }

        return jsonResponse({ data: [] });
      }),
    );

    render(
      <MemoryRouter initialEntries={['/reviewer/reviews/task_real']}>
        <Routes>
          <Route path="/reviewer/reviews/:taskId" element={<ReviewDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('人工构造题源');
    const questionInfoTable = screen.getByRole('table', { name: '题目信息展示字段' });
    expect(questionInfoTable).toHaveClass('schema-field__show-table');
    expect(questionInfoTable).toHaveTextContent('如何判断回答质量？');
    expect(questionInfoTable).toHaveTextContent('人工构造题源');
    expect(screen.getByRole('heading', { name: '题目信息' }).closest('.manual-review-submit-card')).toBeNull();
    expect(screen.getByRole('heading', { name: '题目信息' }).closest('.schema-field--show-item')).not.toBeNull();
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
  {
    submissionId: 'submission_3',
    assignmentId: 'assignment_3',
    taskId: 'task_real',
    taskTitle: '真实人工审核任务',
    taskItemId: 'item_3',
    externalId: 'P0003',
    datasetKind: 'qa_quality',
    status: 'HUMAN_PENDING',
    round: 1,
    aiDecision: 'pass',
    aiComment: '建议通过。',
    aiScores: { overall: 93, relevance: 94, accuracy: 90, format: 88, safety: 99 },
    assignedReviewerId: null,
    submittedAt: '2026-05-30T10:03:02.000Z',
    updatedAt: '2026-05-30T10:03:02.000Z',
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
    schema: {
      schemaVersion: 'r1',
      datasetKind: 'qa_quality',
      fields: [
        {
          key: 'question_info',
          type: 'show_item',
          label: '题目信息',
          sourceKeys: ['prompt'],
          displayConfig: {
            layout: 'table',
            fields: [{ sourceKey: 'prompt', label: 'Prompt', format: 'text' }],
          },
        },
        { key: 'quality', type: 'radio', label: '质量判断' },
        { key: 'comment', type: 'textarea', label: '判断理由' },
      ],
    },
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

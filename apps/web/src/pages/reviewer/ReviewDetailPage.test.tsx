import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReviewDetailPage } from './ReviewDetailPage';

describe('ReviewDetailPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('按 taskId 从真实人工复审接口渲染三栏详情，并支持题目、Tab、多选和操作 toast', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-05-30T00:00:00.000Z').getTime());
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';

      if (path === '/reviews/pending?taskId=task_real' && method === 'GET') {
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
    expect(
      screen.queryByText('展示当前人工复审任务的题目内容、标注答案、AI 预审结果和审核决策，支持逐题通过、修订或打回'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '复审视角' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '切换：终审' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '导出审计日志' })).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/reviews/pending?taskId=task_real', expect.anything()));

    const queue = screen.getByLabelText('当前任务题目列表');
    expect(within(queue).queryByRole('tab')).not.toBeInTheDocument();
    expect(within(queue).queryByText('AI 已建议通过')).not.toBeInTheDocument();
    expect(within(queue).queryByText('AI 已建议打回')).not.toBeInTheDocument();
    expect(within(queue).queryByText('转人工')).not.toBeInTheDocument();
    expect(within(queue).getByText('已选 0 条')).toBeInTheDocument();
    const selectVisibleQuestions = within(queue).getByRole('checkbox', { name: '全选题目' });
    expect(selectVisibleQuestions).not.toBeChecked();
    expect(within(queue).queryByRole('button', { name: '指派给...' })).not.toBeInTheDocument();
    expect(within(queue).queryByText(/AI\s*62/)).not.toBeInTheDocument();
    expect(within(queue).queryByText(/标注/)).not.toBeInTheDocument();
    const rejectQuestionButton = within(queue).getByRole('button', { name: /P0001/ });
    expect(rejectQuestionButton).toHaveTextContent('P0001');
    expect(rejectQuestionButton).not.toHaveTextContent('10:01:02');
    expect(rejectQuestionButton).not.toHaveTextContent('第 1 轮');
    expect(rejectQuestionButton).not.toHaveTextContent('建议打回');
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
    expect(screen.getByLabelText('题目信息')).toHaveTextContent('AI 预审');
    expect(screen.getByLabelText('题目信息')).toHaveTextContent('需要补充判断依据。');
    expect(screen.queryByText('prompt')).not.toBeInTheDocument();
    expect(screen.getByText('本轮提交')).toBeInTheDocument();
    expect(screen.getByLabelText('本轮提交内容')).toHaveTextContent('质量判断');
    expect(screen.getByLabelText('本轮提交内容')).toHaveTextContent('判断理由');
    expect(screen.queryByLabelText('AI 预审 · 本轮重跑结果')).not.toBeInTheDocument();
    expect(screen.getByLabelText('本轮提交内容')).not.toHaveTextContent('综合分');
    expect(screen.getByLabelText('本轮提交内容')).not.toHaveTextContent('95');
    expect(screen.getByLabelText('题目信息')).not.toHaveTextContent('综合分');
    expect(screen.getByLabelText('审核统计')).toHaveTextContent('待我审核');
    const deadlineCard = screen.getByLabelText('剩余处理时限');
    expect(deadlineCard).toHaveClass('is-normal');
    expect(deadlineCard).not.toHaveTextContent(/剩余\s+\d+\s+天/);
    expect(deadlineCard).not.toHaveTextContent('剩余处理时限--');
    expect(within(deadlineCard).getByText('07')).toBeInTheDocument();
    expect(within(deadlineCard).getByText('11')).toBeInTheDocument();
    expect(within(deadlineCard).getByText('53')).toBeInTheDocument();
    expect(within(deadlineCard).getByText('46')).toBeInTheDocument();
    ['天', '时', '分', '秒'].forEach((unit) => expect(within(deadlineCard).getByText(unit)).toBeInTheDocument());
    expect(screen.getByLabelText('审计时间线（P0001）')).toHaveTextContent('第 1 轮提交');
    expect(screen.queryByLabelText('问题标签')).not.toBeInTheDocument();
    ['# fieldCount', '# passedFieldCount', '# rejectedFieldCount']
      .forEach((label) => expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument());

    await user.click(selectVisibleQuestions);
    expect(selectVisibleQuestions).toBeChecked();
    expect(within(queue).getByLabelText('选择 P0001')).toBeChecked();
    expect(within(queue).getByLabelText('选择 P0002')).toBeChecked();
    expect(within(queue).getByLabelText('选择 P0003')).toBeChecked();
    expect(within(queue).getByText('已选 3 条')).toBeInTheDocument();

    await user.click(selectVisibleQuestions);
    expect(selectVisibleQuestions).not.toBeChecked();
    expect(within(queue).getByLabelText('选择 P0001')).not.toBeChecked();
    expect(within(queue).getByLabelText('选择 P0002')).not.toBeChecked();
    expect(within(queue).getByLabelText('选择 P0003')).not.toBeChecked();
    expect(within(queue).getByText('已选 0 条')).toBeInTheDocument();

    await user.click(within(queue).getByLabelText('选择 P0001'));
    expect(within(queue).getByText('已选 1 条')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /直接修订/ })).not.toBeInTheDocument();

    await user.click(within(queue).getByRole('button', { name: 'P0002' }));
    expect(screen.getAllByText(/P0002/).length).toBeGreaterThan(0);
    expect(await screen.findByText('P0002 · 第二题')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /通过 · 入库/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('P0002 已通过入库');
    expect(fetchMock).toHaveBeenCalledWith(
      '/reviews/submission_2/pass',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(within(queue).getByRole('button', { name: /P0002/ })).not.toHaveTextContent('通过');
  });

  it('剩余处理时限小于 24 小时和 2 小时时切换颜色，超时后只显示已超时', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-05-30T00:00:00.000Z').getTime());
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';

      if (path === '/reviews/pending?taskId=task_real' && method === 'GET') {
        return jsonResponse({ data: withDeadline('2026-05-30T01:59:59.000Z') });
      }

      if (path === '/reviews/submission_1' && method === 'GET') {
        return jsonResponse({ data: reviewDetail });
      }

      return jsonResponse({ data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const firstRender = render(
      <MemoryRouter initialEntries={['/reviewer/reviews/task_real']}>
        <Routes>
          <Route path="/reviewer/reviews/:taskId" element={<ReviewDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText('剩余处理时限')).toHaveClass('is-danger');
    firstRender.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        const method = init?.method ?? 'GET';

        if (path === '/reviews/pending?taskId=task_real' && method === 'GET') {
          return jsonResponse({ data: withDeadline('2026-05-30T12:00:00.000Z') });
        }

        if (path === '/reviews/submission_1' && method === 'GET') {
          return jsonResponse({ data: reviewDetail });
        }

        return jsonResponse({ data: [] });
      }),
    );

    const secondRender = render(
      <MemoryRouter initialEntries={['/reviewer/reviews/task_real']}>
        <Routes>
          <Route path="/reviewer/reviews/:taskId" element={<ReviewDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText('剩余处理时限')).toHaveClass('is-warning');
    secondRender.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        const method = init?.method ?? 'GET';

        if (path === '/reviews/pending?taskId=task_real' && method === 'GET') {
          return jsonResponse({ data: withDeadline('2026-05-29T23:59:59.000Z') });
        }

        if (path === '/reviews/submission_1' && method === 'GET') {
          return jsonResponse({ data: reviewDetail });
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

    const expiredDeadlineCard = await screen.findByLabelText('剩余处理时限');
    expect(expiredDeadlineCard).toHaveClass('is-expired');
    expect(expiredDeadlineCard).toHaveTextContent('已超时');
    expect(expiredDeadlineCard).not.toHaveTextContent('-');
  });

  it('点击本轮提交字段后可取消编辑，取消内容不会高亮字段也不会随打回提交', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';

      if (path === '/reviews/pending?taskId=task_real' && method === 'GET') {
        return jsonResponse({ data: [reviewQueueItems[0]] });
      }

      if (path === '/reviews/submission_1' && method === 'GET') {
        return jsonResponse({ data: reviewDetail });
      }

      if (path === '/reviews/submission_1/reject' && method === 'POST') {
        return jsonResponse({ data: reviewDetail });
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

    const commentFieldButton = await screen.findByRole('button', { name: '评论字段 判断理由' });
    await user.click(commentFieldButton);

    const sidePanel = screen.getByRole('complementary', { name: '人工审核侧栏' });
    expect(within(sidePanel).getByRole('tab', { name: '评论' })).toHaveAttribute('aria-selected', 'true');
    const editCard = within(sidePanel).getByRole('region', { name: '编辑字段评论：判断理由' });
    expect(editCard).toBeInTheDocument();
    expect(editCard).toHaveTextContent('针对「判断理由」的修改建议');
    expect(editCard).not.toHaveTextContent('鑫泽张');
    expect(editCard).not.toHaveTextContent('Reviewer');

    await user.type(within(sidePanel).getByRole('textbox', { name: '字段评论：判断理由' }), '请补充完整判断依据。');
    expect(screen.getByRole('button', { name: '评论字段 判断理由' })).not.toHaveClass('has-review-comment');
    await user.click(within(sidePanel).getByRole('button', { name: '取消' }));
    expect(within(sidePanel).queryByRole('region', { name: '编辑字段评论：判断理由' })).not.toBeInTheDocument();
    expect(within(sidePanel).queryByText('请补充完整判断依据。')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '评论字段 判断理由' })).not.toHaveClass('has-review-comment');
    await user.click(within(screen.getByLabelText('审核操作')).getByRole('button', { name: /打回/ }));

    const rejectCall = fetchMock.mock.calls.find(([path]) => path === '/reviews/submission_1/reject');
    expect(rejectCall).toBeDefined();
    expect(JSON.parse((rejectCall?.[1] as RequestInit).body as string)).toEqual({
      actorId: 'user_reviewer_wang_fang',
      reason: '请根据审核意见修改',
    });
    expect(within(screen.getByLabelText('当前任务题目列表')).getByRole('button', { name: /P0001/ })).not.toHaveTextContent('打回');
  });

  it('发送字段评论后按本轮提交字段顺序停靠、高亮字段，并随打回提交', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';

      if (path === '/reviews/pending?taskId=task_real' && method === 'GET') {
        return jsonResponse({ data: [reviewQueueItems[0]] });
      }

      if (path === '/reviews/submission_1' && method === 'GET') {
        return jsonResponse({ data: reviewDetail });
      }

      if (path === '/reviews/submission_1/reject' && method === 'POST') {
        return jsonResponse({ data: reviewDetail });
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

    await user.click(await screen.findByRole('button', { name: '评论字段 判断理由' }));
    const sidePanel = screen.getByRole('complementary', { name: '人工审核侧栏' });
    await user.type(within(sidePanel).getByRole('textbox', { name: '字段评论：判断理由' }), '请补充完整判断依据。');
    await user.click(within(sidePanel).getByRole('button', { name: '发送' }));

    await user.click(screen.getByRole('button', { name: '评论字段 质量判断' }));
    await user.type(within(sidePanel).getByRole('textbox', { name: '字段评论：质量判断' }), '质量判断要改成未通过。');
    await user.click(within(sidePanel).getByRole('button', { name: '发送' }));

    const sentComments = within(sidePanel).getByLabelText('已发送字段评论');
    expect(sentComments).not.toHaveTextContent('鑫泽张');
    expect(sentComments).not.toHaveTextContent('Reviewer');
    const commentCards = Array.from(sentComments.querySelectorAll<HTMLElement>('.manual-review-field-comment-card'));
    expect(commentCards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      '针对「质量判断」的修改建议',
      '针对「判断理由」的修改建议',
    ]);
    expect(commentCards[0]).toHaveTextContent('质量判断要改成未通过。');
    expect(commentCards[1]).toHaveTextContent('请补充完整判断依据。');
    expect(screen.getByRole('button', { name: '评论字段 质量判断' })).toHaveClass('has-review-comment');
    expect(screen.getByRole('button', { name: '评论字段 判断理由' })).toHaveClass('has-review-comment');

    await user.click(within(screen.getByLabelText('审核操作')).getByRole('button', { name: /打回/ }));

    const rejectCall = fetchMock.mock.calls.find(([path]) => path === '/reviews/submission_1/reject');
    expect(rejectCall).toBeDefined();
    expect(JSON.parse((rejectCall?.[1] as RequestInit).body as string)).toEqual({
      actorId: 'user_reviewer_wang_fang',
      reason: '请根据字段修改建议调整。',
      fieldReviews: [
        {
          fieldKey: 'quality',
          label: '质量判断',
          comment: '质量判断要改成未通过。',
          value: 'pass',
        },
        {
          fieldKey: 'comment',
          label: '判断理由',
          comment: '请补充完整判断依据。',
          value: '覆盖核心点。',
        },
      ],
    });
  });

  it('左侧题目列表按题号自然升序展示，且题目条只保留题号和操作状态', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        const method = init?.method ?? 'GET';

        if (path === '/reviews/pending?taskId=task_real' && method === 'GET') {
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
      'P0002',
      'P0003',
    ]);
    expect(within(queue).queryByText('10:02:02')).not.toBeInTheDocument();
    expect(within(queue).queryByText('10:03:02')).not.toBeInTheDocument();
    expect(within(queue).queryByText(/第 1 轮/)).not.toBeInTheDocument();
    expect(within(queue).queryByText(/建议通过/)).not.toBeInTheDocument();
    expect(within(queue).queryByText(/AI\s*91/)).not.toBeInTheDocument();
    expect(within(queue).queryByText(/系统标注|Labeler标注|王昱阳标注/)).not.toBeInTheDocument();
  });

  it('批量通过和批量打回对已选题目调用对应接口并更新队列', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';

      if (path === '/reviews/pending?taskId=task_real' && method === 'GET') {
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
        return jsonResponse({ data: { processedCount: 3, submissions: [] } });
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
    expect(within(queue).getByRole('button', { name: /P0001/ })).not.toHaveTextContent('打回');

    await user.click(within(queue).getByRole('checkbox', { name: '全选题目' }));
    await user.click(within(queue).getByRole('button', { name: '批量通过' }));

    expect(await screen.findByText('已批量通过 3 条')).toBeInTheDocument();
    const passCall = fetchMock.mock.calls.find(([path]) => path === '/reviews/batch-pass');
    expect(passCall).toBeDefined();
    expect(JSON.parse((passCall?.[1] as RequestInit).body as string)).toEqual({
      actorId: 'user_reviewer_wang_fang',
      comment: '',
      submissionIds: ['submission_1', 'submission_2', 'submission_3'],
    });
    expect(within(queue).getByRole('button', { name: /P0001/ })).toHaveTextContent('待决策');
    expect(within(queue).getByRole('button', { name: /P0002/ })).toHaveTextContent('待决策');
    expect(within(queue).getByRole('button', { name: /P0003/ })).toHaveTextContent('待决策');
  });

  it('单题通过后列表保留任务内全部题目，未收口前不提前透出题级结论', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';

      if (path === '/reviews/pending?taskId=task_real' && method === 'GET') {
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
        return jsonResponse({
          data: { ...reviewDetail, submission: { ...reviewDetail.submission, id: 'submission_2', status: 'RECHECK_REVIEWING' } },
        });
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
    const questionButtons = queue.querySelectorAll('article button');
    expect(questionButtons).toHaveLength(3);

    await user.click(within(queue).getByRole('button', { name: /P0002/ }));
    await user.click(screen.getByRole('button', { name: /通过 · 入库/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('P0002 已通过入库');
    expect((await screen.findAllByText('待决策')).length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      '/reviews/submission_2/pass',
      expect.objectContaining({ method: 'POST' }),
    );

    const refreshedQueue = await screen.findByLabelText('当前任务题目列表');
    expect(refreshedQueue.querySelectorAll('article button')).toHaveLength(3);
    expect(within(refreshedQueue).getByRole('button', { name: /P0001/ })).toHaveTextContent('待决策');
    expect(within(refreshedQueue).getByRole('button', { name: /P0002/ })).toHaveTextContent('待决策');
    expect(within(refreshedQueue).getByRole('button', { name: /P0003/ })).toHaveTextContent('待决策');
  });

  it('模板没有 show_item 时题目信息仍使用 ShowItem 表格样式', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        const method = init?.method ?? 'GET';

        if (path === '/reviews/pending?taskId=task_real' && method === 'GET') {
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
    aiScores: { overall: 95, fieldCount: 2, passedFieldCount: 2 },
    assignedReviewerId: null,
    deadline: '2026-06-06T11:53:46.000Z',
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
    aiScores: { overall: 91, fieldCount: 2, passedFieldCount: 2 },
    assignedReviewerId: null,
    deadline: '2026-06-06T11:53:46.000Z',
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
    aiScores: { overall: 93, fieldCount: 2, passedFieldCount: 2 },
    assignedReviewerId: null,
    deadline: '2026-06-06T11:53:46.000Z',
    submittedAt: '2026-05-30T10:03:02.000Z',
    updatedAt: '2026-05-30T10:03:02.000Z',
  },
];

const withDeadline = (deadline: string) => reviewQueueItems.map((item) => ({ ...item, deadline }));

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
    scores: { overall: 95, fieldCount: 2, passedFieldCount: 2 },
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

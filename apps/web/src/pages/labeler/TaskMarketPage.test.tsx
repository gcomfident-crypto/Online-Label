import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TaskMarketPage } from './TaskMarketPage';

const marketTask = {
  id: 'task_qa',
  title: '问答质量标注',
  description: '检查回答是否解决核心诉求。',
  tags: ['问答', '官方数据'],
  rewardRule: '0.30 元 / 条',
  quota: 30,
  deadline: '2026-06-01T15:59:00.000Z',
  datasetKind: 'qa_quality',
  templateId: 'template_qa',
  templateName: '问答质量官方模板',
  itemCount: 30,
  assignedCount: 8,
  remainingCount: 22,
  claimedByMe: false,
  claimStatus: 'available',
  createdAt: '2026-05-21T00:00:00.000Z',
  updatedAt: '2026-05-21T00:00:00.000Z',
};

describe('TaskMarketPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('渲染任务广场并领取题目', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [marketTask] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            assignmentId: 'assignment_1',
            taskId: 'task_qa',
            taskItemId: 'item_qa_1',
            labelerId: 'user_labeler_li_lei',
            status: 'ASSIGNED',
            claimedAt: '2026-05-21T00:00:00.000Z',
            claimedCount: 9,
            taskItem: {
              id: 'item_qa_1',
              externalId: 'qa_1',
              datasetKind: 'qa_quality',
              rawData: { prompt: '如何判断回答质量？' },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ ...marketTask, assignedCount: 9, remainingCount: 21, claimedByMe: true, claimStatus: 'claimed' }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderTaskMarketPage();

    expect(await screen.findByRole('heading', { name: '任务广场' })).toBeInTheDocument();
    const card = screen.getByText('问答质量标注').closest('.task-market-card');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText('可领取')).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText('0.30 元 / 条')).toBeInTheDocument();

    await user.click(within(card as HTMLElement).getByRole('button', { name: '领取题目' }));

    expect(await screen.findByText('已领取题目 qa_1。')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '进入标注台' })).toHaveAttribute(
      'href',
      '/labeler/tasks/task_qa/items/item_qa_1?assignmentId=assignment_1',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/assignments/claim',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ taskId: 'task_qa', labelerId: 'user_labeler_li_lei' }),
      }),
    );
  });

  it('按关键词和领取状态筛选任务广场', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [marketTask] }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskMarketPage();

    await screen.findByText('问答质量标注');
    await user.type(screen.getByLabelText('搜索任务'), '问答');
    await user.selectOptions(screen.getByLabelText('领取状态筛选'), 'available');
    await user.click(screen.getByRole('button', { name: '筛选' }));

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/labeler/tasks?keyword=%E9%97%AE%E7%AD%94&claimStatus=available&labelerId=user_labeler_li_lei',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

const renderTaskMarketPage = () => {
  render(
    <MemoryRouter>
      <TaskMarketPage />
    </MemoryRouter>,
  );
};

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

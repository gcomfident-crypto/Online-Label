import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TaskMarketPage } from './TaskMarketPage';

const marketTask = {
  id: 'task_qa',
  title: '问答质量标注',
  description: '检查回答是否解决核心诉求。',
  ownerId: 'user_owner_zhang_man',
  ownerName: '张泽鑫',
  tags: ['问答', '官方数据'],
  rewardRule: '0.30 元 / 条',
  perUserLimit: 5,
  quota: 100,
  deadline: '2026-06-01T15:59:00.000Z',
  datasetKind: 'qa_quality',
  templateId: 'template_qa',
  templateName: '问答质量官方模板',
  itemCount: 30,
  assignedCount: 8,
  claimedByMeCount: 0,
  remainingCount: 22,
  claimedByMe: false,
  claimStatus: 'available',
  previewItems: [
    {
      id: 'item_qa_1',
      externalId: 'qa_1',
      rawData: {
        prompt: '如何判断回答质量？',
        model_answer: '检查事实性与完整性。',
      },
    },
  ],
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
            claimedItemCount: 22,
            claimedCount: 30,
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
          data: [
            {
              ...marketTask,
              assignedCount: 30,
              claimedByMeCount: 22,
              remainingCount: 0,
              claimedByMe: true,
              claimStatus: 'claimed',
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderTaskMarketPage();

    expect(await screen.findByRole('heading', { name: '任务广场' })).toBeInTheDocument();
    const pageDescription = screen.getByText(
      '浏览可领取的数据标注任务，查看任务要求、奖励、截止时间和领取状态，快速进入标注工作',
    );
    expect(pageDescription).toHaveClass('task-management-table-description');
    expect(pageDescription.closest('.task-market-page-title')).not.toBeNull();
    expect(screen.queryByText('全部 Owner 发布任务')).not.toBeInTheDocument();
    expect(screen.queryByText('演示标注员')).not.toBeInTheDocument();
    expect(screen.queryByText('王昱阳')).not.toBeInTheDocument();
    expect(document.querySelector('.task-market-header')).toBeNull();
    expect(screen.queryByRole('heading', { name: '待领取任务列表' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('任务广场任务统计')).not.toBeInTheDocument();
    expect(screen.queryByText('可领取任务')).not.toBeInTheDocument();
    expect(screen.queryByText('我已领取')).not.toBeInTheDocument();
    expect(screen.queryByText('全部标签')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '筛选' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^已满额/ })).not.toBeInTheDocument();
    expect(document.querySelector('.task-market-page-title')).not.toBeNull();
    expect(document.querySelector('.task-market-claim-status-grid')).not.toBeNull();
    expect(document.querySelectorAll('.task-market-claim-status-grid .task-summary-card')).toHaveLength(3);
    expect(document.querySelector('.task-market-table-panel.task-management-table-card')).not.toBeNull();
    expect(document.querySelector('.task-market-table-panel .task-management-table-toolbar')).not.toBeNull();
    expect(document.querySelector('.task-market-table-panel .task-market-filter')).not.toBeNull();
    expect(document.querySelector('.task-market-table-panel .task-table-scroll')).not.toBeNull();
    expect(document.querySelector('.task-market-table-frame')).not.toBeNull();
    expect(screen.getByLabelText('任务广场分页')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上一页' })).toBeInTheDocument();
    expect(screen.getByLabelText('当前页码')).toHaveTextContent('第 1 / 1 页');
    expect(screen.getByRole('button', { name: '下一页' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: '任务广场列表' });
    const taskRow = within(table).getByText('问答质量标注').closest('tr');
    expect(taskRow).not.toBeNull();
    expect(document.querySelector('.task-market-card')).toBeNull();
    expect(within(taskRow as HTMLElement).getByText('T-001')).toBeInTheDocument();
    expect(within(taskRow as HTMLElement).getByText('张泽鑫')).toBeInTheDocument();
    expect(within(taskRow as HTMLElement).getByText('可领取')).toBeInTheDocument();
    expect(within(taskRow as HTMLElement).getByText('0.30 元 / 条')).toBeInTheDocument();
    expect(within(taskRow as HTMLElement).queryByText('整任务')).not.toBeInTheDocument();
    expect(within(taskRow as HTMLElement).queryByText('问答质量官方模板')).not.toBeInTheDocument();
    expect(within(taskRow as HTMLElement).getByText('8 / 30')).toBeInTheDocument();
    expect(within(taskRow as HTMLElement).getByRole('button', { name: '预览 问答质量标注' })).toBeInTheDocument();

    await user.click(within(taskRow as HTMLElement).getByRole('button', { name: '预览 问答质量标注' }));
    const previewDialog = screen.getByRole('dialog', { name: '任务内容预览 · 问答质量标注' });
    const previewTable = within(previewDialog).getByRole('table', { name: '任务内容预览表格' });
    expect(within(previewTable).getByRole('columnheader', { name: '序号' })).toBeInTheDocument();
    expect(within(previewTable).getByRole('columnheader', { name: '外部 ID' })).toBeInTheDocument();
    expect(within(previewTable).getByRole('columnheader', { name: 'prompt' })).toBeInTheDocument();
    expect(within(previewTable).getByRole('columnheader', { name: 'model_answer' })).toBeInTheDocument();
    expect(within(previewDialog).getByText('qa_1')).toBeInTheDocument();
    expect(within(previewDialog).getByText('如何判断回答质量？')).toBeInTheDocument();
    expect(within(previewDialog).getByText('检查事实性与完整性。')).toBeInTheDocument();
    expect(previewDialog.querySelector('.task-market-preview-item')).toBeNull();
    await user.click(within(previewDialog).getByRole('button', { name: '关闭预览' }));

    await user.click(within(taskRow as HTMLElement).getByRole('button', { name: '领取题目 问答质量标注' }));

    expect(await screen.findByText('已领取任务「问答质量标注」，')).toBeInTheDocument();
    expect(screen.queryByText('已达上限')).not.toBeInTheDocument();
    await waitFor(() => expect(within(table).queryByText('问答质量标注')).not.toBeInTheDocument());
    expect(within(table).getByText('暂无可领取任务')).toBeInTheDocument();
    const claimLink = screen.getByRole('link', { name: '现在去标注' });
    expect(claimLink).toHaveAttribute(
      'href',
      '/labeler/tasks/claimed-task/items/qa_1?assignmentId=assignment_1',
    );
    expect(claimLink.closest('.toast')).toHaveClass('toast--claim-task');
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
    const expiredTask = {
      ...marketTask,
      id: 'task_expired',
      title: '偏好对比标注',
      datasetKind: 'preference_compare',
      templateName: '偏好对比模板',
      assignedCount: 30,
      remainingCount: 0,
      claimStatus: 'expired',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [marketTask, expiredTask] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskMarketPage();

    await screen.findByText('问答质量标注');
    expect(screen.getByText('偏好对比标注')).toBeInTheDocument();
    await user.type(screen.getByLabelText('搜索任务'), '偏好');
    expect(screen.queryByText('问答质量标注')).not.toBeInTheDocument();
    expect(screen.getByText('偏好对比标注')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^已截止/ }));

    expect(screen.getByText('偏好对比标注')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/labeler/tasks?labelerId=user_labeler_li_lei',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('任务广场任务编号按发布时间先后递增，不受最新任务置顶影响', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              ...marketTask,
              id: 'task_new',
              title: '最新发布任务',
              createdAt: '2026-05-23T10:00:00.000Z',
              updatedAt: '2026-05-23T10:00:00.000Z',
            },
            {
              ...marketTask,
              id: 'task_old',
              title: '最早发布任务',
              createdAt: '2026-05-21T10:00:00.000Z',
              updatedAt: '2026-05-21T10:00:00.000Z',
            },
          ],
        }),
      ),
    );

    renderTaskMarketPage();

    const table = await screen.findByRole('table', { name: '任务广场列表' });
    const latestRow = within(table).getByText('最新发布任务').closest('tr');
    const earliestRow = within(table).getByText('最早发布任务').closest('tr');
    expect(latestRow).not.toBeNull();
    expect(earliestRow).not.toBeNull();
    expect(within(latestRow as HTMLElement).getByText('T-002')).toBeInTheDocument();
    expect(within(earliestRow as HTMLElement).getByText('T-001')).toBeInTheDocument();
  });

  it('已领取任务不再展示在任务广场', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              ...marketTask,
              claimedByMe: true,
              claimedByMeCount: 5,
              remainingCount: 0,
              claimStatus: 'claimed',
            },
          ],
        }),
      ),
    );

    renderTaskMarketPage();

    const table = await screen.findByRole('table', { name: '任务广场列表' });
    expect(within(table).queryByText('问答质量标注')).not.toBeInTheDocument();
    expect(screen.queryByText('已达上限')).not.toBeInTheDocument();
    expect(within(table).getByText('暂无可领取任务')).toBeInTheDocument();
  });

  it('任务接口返回空数组时仍保留表格和分页结构', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ data: [] })));

    renderTaskMarketPage();

    const emptyTable = await screen.findByRole('table', { name: '任务广场列表' });
    expect(screen.queryByRole('heading', { name: '待领取任务列表' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('任务广场分页')).toBeInTheDocument();
    expect(screen.getByLabelText('当前页码')).toHaveTextContent('第 1 / 1 页');
    expect(within(emptyTable).getByRole('img', { name: '空任务广场列表插画' })).toHaveAttribute(
      'src',
      expect.stringContaining('empty-table-illustration.svg'),
    );
    expect(within(emptyTable).getByText('暂无可领取任务')).toBeInTheDocument();
    expect(within(emptyTable).getByText('调整关键词或领取状态后再试')).toBeInTheDocument();
  });

  it('任务广场接口不可用时降级为空表格且不展示代理 500 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 500 })));

    renderTaskMarketPage();

    const table = await screen.findByRole('table', { name: '任务广场列表' });
    expect(screen.queryByRole('heading', { name: '待领取任务列表' })).not.toBeInTheDocument();
    expect(within(table).getByRole('img', { name: '空任务广场列表插画' })).toHaveAttribute(
      'src',
      expect.stringContaining('empty-table-illustration.svg'),
    );
    expect(within(table).getByText('暂无可领取任务')).toBeInTheDocument();
    expect(screen.queryByText('领取任务接口请求失败，请稍后重试。（HTTP 500）。')).not.toBeInTheDocument();
    const toast = screen.getByRole('alert');
    expect(toast).toHaveClass('toast');
    expect(toast).toHaveTextContent('领取任务接口请求失败，请稍后重试');
    expect(document.querySelector('.task-status-message')).toBeNull();
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

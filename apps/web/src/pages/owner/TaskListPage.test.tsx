import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskListPage } from './TaskListPage';

const baseTask = {
  id: 'task_1',
  title: '商品标题清洗 v3 · 抖音电商',
  description: '清洗商品标题并补充关键词。',
  richTextInstruction: '请保留核心商品信息。',
  tags: ['电商', '文本清洗', '中文'],
  rewardRule: '0.30 元 / 条',
  quota: 5000,
  deadline: '2026-06-01T15:59:00.000Z',
  distributionStrategy: 'FIRST_COME_FIRST_SERVE',
  aiPreReviewEnabled: true,
  aiRuleName: '电商相关性 v2',
  status: 'DRAFT',
  templateId: 'template_1',
  template: {
    id: 'template_1',
    name: '商品清洗 · v3',
    schemaVersion: 'r12',
    status: 'PUBLISHED',
  },
  createdById: 'user_owner_zhang_man',
  itemCount: 2340,
  createdAt: '2026-05-10T00:00:00.000Z',
  updatedAt: '2026-05-10T00:00:00.000Z',
};

describe('TaskListPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            { ...baseTask, id: 'task_published', status: 'PUBLISHED' },
            { ...baseTask, id: 'task_paused', title: '短视频脚本对齐评测', status: 'PAUSED' },
            { ...baseTask, id: 'task_draft', title: '直播话术安全审核', status: 'DRAFT' },
            { ...baseTask, id: 'task_ended', title: 'AIGC 图文质量打分', status: 'ENDED' },
          ],
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('渲染图 1 结构：统计卡片、搜索筛选、任务表格和发布抽屉', async () => {
    renderTaskListPage();

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    const summaryRegion = screen.getByText('发布中任务').closest('.task-summary-grid');
    expect(summaryRegion).not.toBeNull();
    expect(within(summaryRegion as HTMLElement).getByText('发布中任务')).toBeInTheDocument();
    expect(within(summaryRegion as HTMLElement).getByText('草稿')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索任务名 / ID / 负责人')).toBeInTheDocument();
    expect(screen.getByLabelText('状态筛选')).toHaveDisplayValue('全部状态');
    expect(screen.getByLabelText('分发策略筛选')).toHaveDisplayValue('分发策略：全部');

    const table = screen.getByRole('table', { name: '任务列表' });
    expect(within(table).getByText('商品标题清洗 v3 · 抖音电商')).toBeInTheDocument();
    expect(within(table).getByText('发布中')).toBeInTheDocument();
    expect(within(table).getByText('已暂停')).toBeInTheDocument();
    expect(within(table).getByText('已结束')).toBeInTheDocument();
    expect(within(table).getAllByText('先到先得').length).toBeGreaterThan(0);

    await userEvent.click(within(table).getByRole('button', { name: '发布 直播话术安全审核' }));
    expect(screen.getByRole('complementary', { name: '发布任务抽屉' })).toBeInTheDocument();
    expect(screen.getByLabelText('任务标题')).toHaveValue('直播话术安全审核');
    expect(screen.getByLabelText('关联模板')).toHaveValue('商品清洗 · v3 (Schema r12)');
    expect(screen.getByLabelText('启用 AI 预审')).toBeChecked();
  });

  it('能从发布抽屉发布草稿，并能暂停、恢复和结束任务', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, id: 'task_draft', status: 'DRAFT' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...baseTask, id: 'task_draft', status: 'DRAFT' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...baseTask, id: 'task_draft', status: 'PUBLISHED' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...baseTask, id: 'task_draft', status: 'PAUSED' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...baseTask, id: 'task_draft', status: 'PUBLISHED' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...baseTask, id: 'task_draft', status: 'ENDED' } }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    await user.click(within(table).getByRole('button', { name: '发布 商品标题清洗 v3 · 抖音电商' }));
    await user.click(screen.getByRole('button', { name: '立即发布 →' }));
    expect(await screen.findByText('任务已发布。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '暂停 商品标题清洗 v3 · 抖音电商' }));
    expect(await screen.findByText('任务已暂停。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '恢复 商品标题清洗 v3 · 抖音电商' }));
    expect(await screen.findByText('任务已恢复发布。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '结束 商品标题清洗 v3 · 抖音电商' }));
    expect(await screen.findByText('任务已结束。')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      '/tasks/task_draft/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'PUBLISHED', actorId: 'user_owner_zhang_man', confirm: true }),
      }),
    );
  });

  it('能基于已发布模板创建任务草稿', async () => {
    const user = userEvent.setup();
    const createdTask = {
      ...baseTask,
      id: 'task_created',
      title: '未命名任务',
      itemCount: 0,
      status: 'DRAFT',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: createdTask }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));

    expect(await screen.findByText('新任务草稿已创建。')).toBeInTheDocument();
    expect(screen.getByLabelText('任务标题')).toHaveValue('未命名任务');
    expect(fetchMock).toHaveBeenCalledWith(
      '/tasks',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"actorId":"user_owner_zhang_man"'),
      }),
    );
  });
});

const renderTaskListPage = () => {
  render(
    <MemoryRouter>
      <TaskListPage />
    </MemoryRouter>,
  );
};

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

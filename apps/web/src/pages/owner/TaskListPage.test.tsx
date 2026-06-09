import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JSZip from 'jszip';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskListPage, resolveOwnerDisplayTasks } from './TaskListPage';
import { TemplateDesignerPage } from './TemplateDesignerPage';
import { createLabelHubSchema } from '@labelhub/shared';

const baseTask = {
  id: 'task_1',
  title: '商品标题清洗 v3 · 抖音电商',
  description: '清洗商品标题并补充关键词。',
  richTextInstruction: '请保留核心商品信息。',
  tags: ['电商', '文本清洗', '中文'],
  rewardRule: '0.30 元 / 条',
  rewardPerItem: 0.3,
  perUserLimit: 100,
  quota: 5000,
  deadline: '2026-06-10T15:59:00.000Z',
  distributionStrategy: 'FIRST_COME_FIRST_SERVE',
  aiPreReviewEnabled: true,
  aiRuleName: '电商相关性 v2',
  status: 'DRAFT',
  templateId: 'template_1',
  template: {
    id: 'template_1',
    name: '商品清洗 · v3',
    datasetKind: 'qa_quality',
    schemaVersion: 'r12',
    status: 'PUBLISHED',
  },
  createdById: 'user_owner_zhang_man',
  itemCount: 2340,
  completedItemCount: 120,
  createdAt: '2026-05-10T00:00:00.000Z',
  updatedAt: '2026-05-10T00:00:00.000Z',
};

describe('TaskListPage', () => {
  beforeEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            { ...baseTask, id: 'task_published', status: 'PUBLISHED', createdAt: '2026-05-20T00:00:00.000Z' },
            { ...baseTask, id: 'task_paused', title: '短视频脚本对齐评测', status: 'PAUSED', createdAt: '2026-05-22T00:00:00.000Z' },
            { ...baseTask, id: 'task_draft', title: '直播话术安全审核', status: 'DRAFT', createdAt: '2026-05-23T00:00:00.000Z' },
            { ...baseTask, id: 'task_ended', title: 'AIGC 图文质量打分', status: 'ENDED', createdAt: '2026-05-21T00:00:00.000Z' },
          ],
        }),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('任务数组为空时保持空列表，不回退到演示任务', () => {
    expect(resolveOwnerDisplayTasks([])).toEqual([]);
  });

  it('任务列表接口不可用时降级为空表格且不展示代理 500 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 500 })));

    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    expect(within(table).getByText('当前没有任务哦')).toBeInTheDocument();
    expect(screen.queryByText('任务接口请求失败，请稍后重试。（HTTP 500）。')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('新建任务保存成功后新增行有自然入场动画', async () => {
    const user = userEvent.setup();
    const createdTask = {
      ...baseTask,
      id: 'task_entering',
      title: '自然入场任务',
      status: 'DRAFT',
      itemCount: 0,
      completedItemCount: 0,
      quota: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_1',
              name: '问答质量模板',
              datasetKind: 'qa_quality',
              schemaVersion: 'r1',
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: createdTask }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('任务标题'), '自然入场任务');
    await user.click(screen.getByRole('button', { name: '存为草稿' }));

    expect(await screen.findByText('草稿已保存')).toBeInTheDocument();
    const enteringRow = screen.getByText('自然入场任务').closest('tr');
    expect(enteringRow).not.toBeNull();
    expect(enteringRow).toHaveClass('is-entering');
    expect(enteringRow?.querySelectorAll('.task-table__cell-inner')).toHaveLength(7);
  });

  it('未选择关联模板保存草稿后再次打开仍显示请选择评测模板', async () => {
    const user = userEvent.setup();
    const createdTask = {
      ...baseTask,
      id: 'task_without_template',
      title: '无模板草稿',
      status: 'DRAFT',
      templateId: '',
      template: {
        id: '',
        name: '',
        datasetKind: 'generic_json',
        schemaVersion: '',
        status: 'DRAFT',
      },
      itemCount: 0,
      completedItemCount: 0,
      quota: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_qa',
              name: '问答质量模板',
              datasetKind: 'qa_quality',
              schemaVersion: 'r1',
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: createdTask }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    const templateInput = screen.getByLabelText('关联模板');
    expect(templateInput).toHaveAttribute('placeholder', '请选择评测模板');
    expect(templateInput).toHaveValue('');

    await user.type(screen.getByLabelText('任务标题'), '无模板草稿');
    await user.click(screen.getByRole('button', { name: '存为草稿' }));

    expect(await screen.findByText('草稿已保存')).toBeInTheDocument();
    const createTaskCall = fetchMock.mock.calls.find(
      ([path, init]) => path === '/tasks' && init?.method === 'POST',
    );
    expect(createTaskCall).toBeDefined();
    expect(JSON.parse(String(createTaskCall?.[1]?.body))).toMatchObject({
      title: '无模板草稿',
      templateId: '',
    });
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: '发布任务抽屉' })).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('row', { name: /无模板草稿/ }));
    const reopenedTemplateInput = await screen.findByLabelText('关联模板');
    expect(reopenedTemplateInput).toHaveAttribute('placeholder', '请选择评测模板');
    expect(reopenedTemplateInput).toHaveValue('');
    await user.click(reopenedTemplateInput);
    expect(screen.getByRole('option', { name: 'M-001 · 问答质量模板 · v1' })).toBeInTheDocument();
  });

  it('点击删除任务会调用删除接口并从列表移除', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, id: 'task_delete', title: '待删除任务' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'task_delete' } }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    expect(within(table).getByText('待删除任务')).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: '删除 待删除任务' }));

    const deletingRow = within(table).getByText('待删除任务').closest('tr');
    expect(deletingRow).not.toBeNull();
    await waitFor(() => expect(deletingRow).toHaveClass('is-removing'));
    expect(deletingRow?.querySelectorAll('.task-table__cell-inner')).toHaveLength(7);
    const deleteToastText = await screen.findByText('任务已删除');
    expect(deleteToastText.closest('.toast')).toHaveClass('toast--delete-success');
    expect(within(table).getByText('待删除任务')).toBeInTheDocument();
    await waitFor(() => expect(within(table).queryByText('待删除任务')).not.toBeInTheDocument());
    expect(within(table).getByText('当前没有任务哦')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/tasks/task_delete',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('渲染图 1 结构：统计卡片、搜索筛选、任务表格和发布抽屉', async () => {
    renderTaskListPage();

    expect(await screen.findByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    const summaryRegion = screen.getByText('总任务').closest('.task-summary-grid');
    expect(summaryRegion).not.toBeNull();
    expect(within(summaryRegion as HTMLElement).getByText('总任务')).toBeInTheDocument();
    expect(within(summaryRegion as HTMLElement).getByText('草稿')).toBeInTheDocument();
    expect(within(summaryRegion as HTMLElement).getByText('进行中')).toBeInTheDocument();
    expect(within(summaryRegion as HTMLElement).getByText('已暂停')).toBeInTheDocument();
    expect(within(summaryRegion as HTMLElement).getByText('已完成')).toBeInTheDocument();
    expect(within(summaryRegion as HTMLElement).getByText('4')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索任务名 / ID / 负责人')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '数据类型筛选' })).not.toBeInTheDocument();
    expect(screen.queryByText('全部数据类型')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '状态筛选' })).not.toBeInTheDocument();
    expect(screen.queryByText('全部状态')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '分发策略筛选' })).not.toBeInTheDocument();
    const tableCard = screen.getByLabelText('任务列表工作区');
    const filterBar = screen.getByPlaceholderText('搜索任务名 / ID / 负责人').closest('.task-filter-bar');
    const pageHeader = screen.getByRole('heading', { name: '任务管理' }).closest('.task-management-header');
    expect(pageHeader).not.toBeNull();
    const tableDescription = within(pageHeader as HTMLElement).getByText(
      '展示数据标注任务的创建、状态、进度、负责人和截止时间，支持任务从发布到交付的全流程管理',
    );
    expect(filterBar).not.toBeNull();
    expect(tableCard).toHaveClass('task-management-table-card');
    expect(within(tableCard).queryByText(tableDescription.textContent ?? '')).not.toBeInTheDocument();
    expect(tableDescription).toHaveClass('task-management-table-description');
    expect(screen.getByRole('button', { name: '新建任务' })).toHaveClass('task-filter-bar__create');
    expect(filterBar).toContainElement(screen.getByRole('button', { name: '新建任务' }));

    const table = screen.getByRole('table', { name: '任务列表' });
    expect(tableDescription.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const rows = within(table).getAllByRole('row');
    const headers = within(rows[0])
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers.slice(0, 7)).toEqual([
      '任务ID⇅',
      '任务名',
      '状态',
      '创建人',
      '进度',
      '创建时间⇅',
      '截止时间⇅',
    ]);
    expect(within(table).getByRole('button', { name: '按任务ID排序' })).toHaveClass('task-table__sortable-header');
    expect(within(table).getByRole('button', { name: '按创建时间排序' })).toHaveClass('task-table__sortable-header');
    expect(within(table).getByRole('button', { name: '按截止时间排序' })).toHaveClass('task-table__sortable-header');
    expect(within(table).queryByRole('button', { name: '按任务名排序' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: '按状态排序' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: '按创建人排序' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: '按进度排序' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: '按操作排序' })).not.toBeInTheDocument();
    expect(headers).not.toContain('分发策略');
    expect(rows[1]).toHaveTextContent('直播话术安全审核');
    expect(rows[2]).toHaveTextContent('短视频脚本对齐评测');
    expect(within(table).getAllByText('张泽鑫').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('120 / 2,340 题')[0]).toHaveClass('task-progress-cell__count');
    expect(table.querySelectorAll('.task-date-cell').length).toBeGreaterThan(0);
    expect(table.querySelectorAll('.task-date-cell__date').length).toBeGreaterThan(0);
    expect(table.querySelectorAll('.task-date-cell__time').length).toBeGreaterThan(0);
    expect(within(rows[1]).getByText('2026-05-23')).toBeInTheDocument();
    expect(within(rows[1]).getAllByText('00:00').length).toBeGreaterThan(0);
    expect(within(rows[1]).getByText('2026-06-10')).toBeInTheDocument();
    expect(within(rows[1]).getByText('15:59')).toBeInTheDocument();
    expect(within(table).queryByText('2026-05-20 00:00')).not.toBeInTheDocument();
    expect(within(table).getByText('商品标题清洗 v3 · 抖音电商')).toBeInTheDocument();
    expect(within(table).getByText('T-001')).toBeInTheDocument();
    expect(within(table).queryByText('task_published')).not.toBeInTheDocument();
    expect(within(table).getByText('进行中')).toBeInTheDocument();
    expect(within(table).getByText('已暂停')).toBeInTheDocument();
    expect(within(table).getByText('已完成')).toBeInTheDocument();
    expect(within(table).queryByText('先到先得')).not.toBeInTheDocument();
    expect(within(table).queryByText('指派')).not.toBeInTheDocument();
    expect(within(table).queryByText('配额抢单')).not.toBeInTheDocument();
    const rowActionButtons = rows[1].querySelectorAll('.task-table-action--icon');
    expect(rowActionButtons).toHaveLength(4);
    expect(rows[1].querySelectorAll('svg.task-table-action__icon')).toHaveLength(4);
    expect(rows[1].querySelector('.task-table-action__icon--publish')).not.toBeNull();
    expect(rows[1].querySelector('.task-table-action__icon--pause')).not.toBeNull();
    expect(rows[1].querySelector('.task-table-action__icon--end')).not.toBeNull();
    expect(rows[1].querySelector('.task-table-action__icon--delete')).not.toBeNull();
    expect(rows[1].querySelector('.task-table-action__icon--publish path')?.getAttribute('d')).toContain('M880.724 112');
    expect(rows[1].querySelector('.task-table-action__icon--pause path')?.getAttribute('d')).toContain('M400 352');
    expect(rows[1].querySelector('.task-table-action__icon--end path')?.getAttribute('d')).toContain('M512 64');
    expect(rows[1].querySelector('.task-table-action__icon--delete path')?.getAttribute('d')).toContain('M836.6 339.2');
    expect(rows[1].querySelector('.task-table-action__icon--delete path')).toHaveAttribute('fill', 'currentColor');
    expect(screen.getByLabelText('任务列表分页')).toHaveTextContent('第 1 / 1 页');
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();

    await userEvent.click(within(summaryRegion as HTMLElement).getByRole('button', { name: /进行中/ }));
    expect(within(summaryRegion as HTMLElement).getByRole('button', { name: /进行中/ })).toHaveClass('is-active');
    expect(within(table).getByText('T-001')).toBeInTheDocument();
    expect(within(table).queryByText('task_draft')).not.toBeInTheDocument();

    await userEvent.click(within(summaryRegion as HTMLElement).getByRole('button', { name: /总任务/ }));
    expect(within(summaryRegion as HTMLElement).getByRole('button', { name: /总任务/ })).toHaveClass('is-active');

    await userEvent.click(within(table).getByRole('button', { name: '发布 直播话术安全审核' }));
    expect(screen.getByRole('complementary', { name: '发布任务抽屉' })).toBeInTheDocument();
    expect(screen.getByLabelText('任务标题')).toHaveValue('直播话术安全审核');
    expect(screen.getByLabelText('关联模板')).toHaveValue('M-001 · 商品清洗 · v3');
    const aiPreReviewCheckbox = screen.getByLabelText('启用AI预审');
    const aiPreReviewLabel = aiPreReviewCheckbox.closest('label');
    expect(aiPreReviewCheckbox).toBeChecked();
    expect(aiPreReviewLabel?.childNodes[0]).toBe(aiPreReviewCheckbox);
    expect(aiPreReviewLabel?.querySelector('.task-ai-toggle__label')?.textContent).toBe('启用AI预审');
    expect(aiPreReviewLabel?.textContent?.trim()).toBe('启用AI预审');
    expect(screen.queryByText(/规则：/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('描述')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('标注说明')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('月度奖励封顶金额')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('发布前校验')).not.toBeInTheDocument();
    expect(screen.queryByText('分发策略')).not.toBeInTheDocument();
    expect(screen.queryByText('先到先得')).not.toBeInTheDocument();
    expect(screen.queryByText('指派')).not.toBeInTheDocument();
    expect(screen.queryByText('配额抢单')).not.toBeInTheDocument();
    expect(screen.queryByText(/发布任务 ·/)).not.toBeInTheDocument();
    expect(
      screen.queryByText('发布后将进入「进行中」状态，标注员将在任务广场看到该任务并可领取。'),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('题目数')).not.toBeInTheDocument();
    expect(screen.getByText('标签').compareDocumentPosition(screen.getByText('题目数据导入'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByText('题目数据导入').compareDocumentPosition(screen.getByText('单条奖励'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const quotaRewardRow = screen.getByText('单条奖励').closest('.task-publish-form__metrics');
    const drawer = screen.getByRole('complementary', { name: '发布任务抽屉' });
    const progressTimeline = within(drawer).getByRole('region', { name: '当前进度' });
    expect(progressTimeline.closest('.task-publish-form')).toBeInTheDocument();
    expect(within(progressTimeline).getByRole('heading', { name: '当前进度' })).toBeInTheDocument();
    expect(within(progressTimeline).getByText('草稿').closest('li')).toHaveClass('is-current');
    expect(
      progressTimeline.compareDocumentPosition(drawer.querySelector('.task-publish-drawer__footer') as Element),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(quotaRewardRow).not.toBeNull();
    expect(within(quotaRewardRow as HTMLElement).getByText('单条奖励')).toBeInTheDocument();
    expect(within(quotaRewardRow as HTMLElement).queryByText('单人限额')).not.toBeInTheDocument();
    expect(within(quotaRewardRow as HTMLElement).getByText('截止时间')).toBeInTheDocument();
    expect(within(quotaRewardRow as HTMLElement).queryByText('题目数')).not.toBeInTheDocument();
    expect(
      within(quotaRewardRow as HTMLElement)
        .getByText('单条奖励')
        .compareDocumentPosition(within(quotaRewardRow as HTMLElement).getByText('截止时间')),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const rewardInput = screen.getByLabelText('单条奖励');
    expect(rewardInput).toHaveAttribute('type', 'text');
    expect(rewardInput).toHaveAttribute('inputmode', 'decimal');
    expect(screen.queryByLabelText('单人限额')).not.toBeInTheDocument();
    expect(within(quotaRewardRow as HTMLElement).getByText('元')).toBeInTheDocument();
    expect(within(quotaRewardRow as HTMLElement).queryByText('元/1条')).not.toBeInTheDocument();
    expect(screen.getByLabelText('任务标题')).toHaveClass('task-publish-form__control');
    expect(rewardInput.closest('.task-reward-input')).toHaveClass('task-publish-form__control');
    expect(screen.getByRole('button', { name: /选择截止时间/ })).toHaveClass('task-publish-form__control');
    expect(screen.getByLabelText('关联模板')).toHaveClass('task-publish-form__control');
    expect(drawer.querySelectorAll('.task-required-mark')).toHaveLength(5);
  });

  it('任务接口失败时使用右上角 Toast 提示，不再展示黄色横条', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        errorResponse({ error: { message: '任务不存在或已被删除。' } }, 404),
      ),
    );

    renderTaskListPage();

    const toast = await screen.findByRole('alert');
    expect(toast).toHaveClass('toast', 'toast--warning');
    expect(toast.closest('.toast-stack')).not.toBeNull();
    expect(toast).toHaveTextContent('任务不存在或已被删除');
    expect(screen.queryByText('任务不存在或已被删除')?.closest('.task-status-message')).toBeNull();
    expect(document.querySelector('.task-status-message')).toBeNull();
    expect(screen.getByText('总任务')).toBeInTheDocument();
  });

  it('任务表格超过单页时可在右下角前后翻页', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: Array.from({ length: 10 }, (_, index) => ({
            ...baseTask,
            id: `task_page_${index + 1}`,
            title: `分页任务 ${index + 1}`,
            status: 'PUBLISHED',
          })),
        }),
      ),
    );

    renderTaskListPage();

    expect(await screen.findByText('分页任务 1')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: '任务列表' });
    expect(table.querySelectorAll('colgroup col')).toHaveLength(8);
    expect(table.querySelector('tbody')).toHaveClass('task-table__body');
    expect(screen.queryByText('分页任务 8')).not.toBeInTheDocument();
    expect(screen.getByLabelText('任务列表分页')).toHaveTextContent('第 1 / 2 页');

    await user.click(screen.getByRole('button', { name: '下一页' }));

    expect(table.querySelectorAll('colgroup col')).toHaveLength(8);
    expect(table.querySelector('tbody')).toHaveClass('task-table__body');
    expect(screen.getByText('分页任务 8')).toBeInTheDocument();
    expect(screen.getByText('分页任务 10')).toBeInTheDocument();
    expect(screen.queryByText('分页任务 1')).not.toBeInTheDocument();
    expect(screen.getByLabelText('任务列表分页')).toHaveTextContent('第 2 / 2 页');
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '上一页' }));

    expect(screen.getByText('分页任务 1')).toBeInTheDocument();
    expect(screen.getByLabelText('任务列表分页')).toHaveTextContent('第 1 / 2 页');
  });

  it('任务列表使用 T 格式业务编号展示任务ID，不暴露数据库ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            {
              ...baseTask,
              id: 'cmpjpv2gcu0004z6pee7yxro8k',
              title: '较新的数据库 ID 任务',
              createdAt: '2026-05-24T10:00:00.000Z',
            },
            {
              ...baseTask,
              id: 'cmpjpv2gcu0001z6peexxx1111',
              title: '较早的数据库 ID 任务',
              createdAt: '2026-05-23T10:00:00.000Z',
            },
          ],
        }),
      ),
    );

    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByText('T-002')).toBeInTheDocument();
    expect(within(rows[2]).getByText('T-001')).toBeInTheDocument();
    expect(within(table).queryByText('cmpjpv2gcu0004z6pee7yxro8k')).not.toBeInTheDocument();
    expect(within(table).queryByText('cmpjpv2gcu0001z6peexxx1111')).not.toBeInTheDocument();
  });

  it('任务列表仅允许任务ID、创建时间和截止时间按指定方向排序', async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            {
              ...baseTask,
              id: 'task_c',
              title: '任务 C',
              createdAt: '2026-06-03T00:00:00.000Z',
              deadline: '2026-06-12T00:00:00.000Z',
            },
            {
              ...baseTask,
              id: 'task_a',
              title: '任务 A',
              createdAt: '2026-06-01T00:00:00.000Z',
              deadline: '2026-06-11T00:00:00.000Z',
            },
            {
              ...baseTask,
              id: 'task_b',
              title: '任务 B',
              createdAt: '2026-06-02T00:00:00.000Z',
              deadline: '2026-06-13T00:00:00.000Z',
            },
          ],
        }),
      ),
    );

    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    const getTaskTitles = () =>
      Array.from(table.querySelectorAll('tbody tr')).map(
        (row) => row.querySelector('.task-title-link')?.textContent?.trim() ?? '',
      );

    expect(getTaskTitles()).toEqual(['任务 C', '任务 B', '任务 A']);

    const taskIdSortButton = within(table).getByRole('button', { name: '按任务ID排序' });
    const createdAtSortButton = within(table).getByRole('button', { name: '按创建时间排序' });
    const deadlineSortButton = within(table).getByRole('button', { name: '按截止时间排序' });

    expect(taskIdSortButton).toHaveTextContent('任务ID⇅');
    expect(createdAtSortButton).toHaveTextContent('创建时间⇅');
    expect(deadlineSortButton).toHaveTextContent('截止时间⇅');

    await user.click(taskIdSortButton);
    expect(getTaskTitles()).toEqual(['任务 A', '任务 B', '任务 C']);
    expect(taskIdSortButton).toHaveTextContent('任务ID↑');

    await user.click(taskIdSortButton);
    expect(getTaskTitles()).toEqual(['任务 C', '任务 B', '任务 A']);
    expect(taskIdSortButton).toHaveTextContent('任务ID↓');

    await user.click(createdAtSortButton);
    expect(getTaskTitles()).toEqual(['任务 A', '任务 B', '任务 C']);
    expect(taskIdSortButton).toHaveTextContent('任务ID⇅');
    expect(createdAtSortButton).toHaveTextContent('创建时间↑');

    await user.click(createdAtSortButton);
    expect(getTaskTitles()).toEqual(['任务 C', '任务 B', '任务 A']);
    expect(createdAtSortButton).toHaveTextContent('创建时间↓');

    await user.click(deadlineSortButton);
    expect(getTaskTitles()).toEqual(['任务 A', '任务 C', '任务 B']);
    expect(createdAtSortButton).toHaveTextContent('创建时间⇅');
    expect(deadlineSortButton).toHaveTextContent('截止时间↑');

    await user.click(deadlineSortButton);
    expect(getTaskTitles()).toEqual(['任务 B', '任务 C', '任务 A']);
    expect(deadlineSortButton).toHaveTextContent('截止时间↓');

    await user.click(deadlineSortButton);
    expect(getTaskTitles()).toEqual(['任务 A', '任务 C', '任务 B']);
    expect(deadlineSortButton).toHaveTextContent('截止时间↑');
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
    expect(await screen.findByText('任务已发布')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '暂停 商品标题清洗 v3 · 抖音电商' }));
    expect(await screen.findByText('任务已暂停')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '恢复 商品标题清洗 v3 · 抖音电商' }));
    expect(await screen.findByText('任务已恢复发布')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '结束 商品标题清洗 v3 · 抖音电商' }));
    expect(await screen.findByText('任务已完成')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      '/tasks/task_draft/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'PUBLISHED', actorId: 'user_owner_zhang_man', confirm: true }),
      }),
    );
  });

  it('已完成任务在列表中的删除按钮为禁用态', async () => {
    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    const deleteEndTaskButton = within(table).getByRole('button', { name: '删除 AIGC 图文质量打分' });

    expect(deleteEndTaskButton).toBeDisabled();
  });

  it('点击结束按钮的 SVG 图标不会继续冒泡打开任务抽屉', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, id: 'task_end_icon', status: 'PUBLISHED' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...baseTask, id: 'task_end_icon', status: 'ENDED' } }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    const endButton = within(table).getByRole('button', { name: '结束 商品标题清洗 v3 · 抖音电商' });
    const endIconPath = endButton.querySelector('path');
    expect(endIconPath).not.toBeNull();

    fireEvent.click(endIconPath as SVGPathElement);

    expect(await screen.findByText('任务已完成')).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: '发布任务抽屉' })).not.toBeInTheDocument();
  });

  it('点击任务行任意非操作区域时打开右侧抽屉而不是进入详情页', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'PUBLISHED' }] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    expect(
      within(table).queryByRole('link', { name: '商品标题清洗 v3 · 抖音电商' }),
    ).not.toBeInTheDocument();

    const taskRow = within(table).getByText('商品标题清洗 v3 · 抖音电商').closest('tr');
    expect(taskRow).not.toBeNull();

    await user.click(within(taskRow as HTMLElement).getByText('张泽鑫'));

    expect(screen.getByRole('complementary', { name: '发布任务抽屉' })).toBeInTheDocument();
    expect(screen.getByLabelText('任务标题')).toHaveValue('商品标题清洗 v3 · 抖音电商');
  });

  it('进行中任务重新打开抽屉时显示已导入题目但不显示预览入口', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              ...baseTask,
              id: 'task_published',
              status: 'PUBLISHED',
              itemCount: 2,
              quota: 2,
              completedItemCount: 0,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: 'item_1',
              taskId: 'task_published',
              externalId: 'qa_1',
              datasetKind: 'qa_quality',
              rawData: { id: 'qa_1', prompt: '第一条题目', model_answer: '回答 A' },
              status: 'UNASSIGNED',
              sortOrder: 1,
              createdAt: '2026-05-10T00:00:00.000Z',
              updatedAt: '2026-05-10T00:00:00.000Z',
            },
            {
              id: 'item_2',
              taskId: 'task_published',
              externalId: 'qa_2',
              datasetKind: 'qa_quality',
              rawData: { id: 'qa_2', prompt: '第二条题目', model_answer: '回答 B' },
              status: 'UNASSIGNED',
              sortOrder: 2,
              createdAt: '2026-05-10T00:00:00.000Z',
              updatedAt: '2026-05-10T00:00:00.000Z',
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    await user.click(within(table).getByRole('button', { name: '商品标题清洗 v3 · 抖音电商' }));

    expect(screen.getByText('题目数：2')).toBeInTheDocument();
    expect(screen.queryByText('已导入：2 条题目')).not.toBeInTheDocument();
    expect(screen.queryByText('未选择任何文件')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '数据预览' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '预览' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('新上传文件保存前可以在抽屉中预览解析后的题目数据', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_1',
              name: '商品清洗 · v3',
              datasetKind: 'qa_quality',
              schemaVersion: 'r12',
            }),
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.upload(
      screen.getByLabelText('题目数据文件'),
      new File(
        [
          JSON.stringify([
            {
              id: 'qa_preview_1',
              prompt: '待预览题目 1',
              model_answer: '回答 1',
              field_04: '字段 4',
              field_05: '字段 5',
              field_06: '字段 6',
              field_07: '字段 7',
              field_08: '字段 8',
              field_09: '字段 9',
              field_10: '字段 10',
            },
            { id: 'qa_preview_2', prompt: '待预览题目 2', model_answer: '回答 2' },
          ]),
        ],
        'qa_quality.json',
        { type: 'application/json' },
      ),
    );
    expect(screen.queryByRole('button', { name: '数据预览' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '预览' }));

    const dialog = await screen.findByRole('dialog', { name: '题目数据预览' });
    const overlay = dialog.parentElement as HTMLElement;
    expect(overlay).toHaveClass('task-dataset-preview-overlay--entering');
    expect(dialog).toHaveClass('task-dataset-preview-modal--entering');
    expect(within(dialog).getByText('待预览题目 1')).toBeInTheDocument();
    expect(within(dialog).getByText('待预览题目 2')).toBeInTheDocument();
    expect(within(dialog).getByRole('columnheader', { name: 'field_10' })).toBeInTheDocument();
    expect(within(dialog).getByText('字段 10')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '关闭' })).not.toBeInTheDocument();

    await user.click(dialog);
    expect(screen.getByRole('dialog', { name: '题目数据预览' })).toBeInTheDocument();

    await user.click(overlay);
    expect(overlay).toHaveClass('task-dataset-preview-overlay--closing');
    expect(dialog).toHaveClass('task-dataset-preview-modal--closing');
    expect(screen.getByRole('dialog', { name: '题目数据预览' })).toBeInTheDocument();

    fireEvent.animationEnd(dialog);
    expect(screen.queryByRole('dialog', { name: '题目数据预览' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '发布任务抽屉' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('上传题目数据文件后不再显示上传框右上角删除按钮', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_1',
              name: '商品清洗 · v3',
              datasetKind: 'qa_quality',
              schemaVersion: 'r12',
            }),
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.upload(
      screen.getByLabelText('题目数据文件'),
      new File([JSON.stringify([{ id: 'qa_1', prompt: '题目' }])], 'qa_quality.json', { type: 'application/json' }),
    );

    expect(await screen.findByText('题目数：1')).toBeInTheDocument();
    expect(await screen.findByText('qa_quality.json')).toBeInTheDocument();
    expect(screen.queryByText('已选择：qa_quality.json')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('题目数')).not.toBeInTheDocument();
    const jsonFileIcon = document.querySelector('.task-dataset-import__file-icon');
    expect(jsonFileIcon).toHaveClass('task-dataset-import__file-icon--json');
    expect(jsonFileIcon).toHaveClass('task-dataset-import__file-icon--typed');
    expect(jsonFileIcon?.querySelector('.bi-filetype-json')).not.toBeNull();
    const previewButton = screen.getByRole('button', { name: '预览' });
    expect(previewButton).toBeInTheDocument();
    expect(previewButton.closest('.task-dataset-import__file-zone')).not.toBeNull();
    expect(screen.queryByRole('button', { name: '删除已上传文件 qa_quality.json' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('题目数据文件'), { target: { files: [] } });

    expect(screen.getByText('qa_quality.json')).toBeInTheDocument();
    expect(screen.getByText('题目数：1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '预览' })).toBeInTheDocument();
  });

  it('上传题目数据后选择关联模板不会清空文件和题目数', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_qa',
              name: '问答质量模板',
              datasetKind: 'qa_quality',
              schemaVersion: 'r1',
            }),
            createTemplateDto({
              id: 'template_preference',
              name: '偏好对比模板',
              datasetKind: 'preference_compare',
              schemaVersion: 'pref-r1',
            }),
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.upload(
      screen.getByLabelText('题目数据文件'),
      new File([JSON.stringify([{ id: 'qa_1', prompt: '题目' }])], 'qa_keep.json', {
        type: 'application/json',
      }),
    );

    expect(await screen.findByText('qa_keep.json')).toBeInTheDocument();
    expect(screen.getByText('题目数：1')).toBeInTheDocument();

    await chooseTaskTemplate(user, 'M-001 · 问答质量模板 · v1');

    expect(screen.getByLabelText('关联模板')).toHaveValue('M-001 · 问答质量模板 · v1');
    expect(screen.getByText('qa_keep.json')).toBeInTheDocument();
    expect(screen.getByText('题目数：1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '预览' })).toBeInTheDocument();
  });

  it('新建任务抽屉不再展示单人限额输入框', async () => {
    const user = userEvent.setup();
    const createdTask = {
      ...baseTask,
      id: 'task_without_per_user_limit',
      title: '不设单人限额任务',
      status: 'DRAFT',
      perUserLimit: null,
      itemCount: 0,
      completedItemCount: 0,
      quota: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_1',
              name: '问答质量模板',
              datasetKind: 'qa_quality',
              schemaVersion: 'r1',
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: createdTask }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    expect(screen.queryByLabelText('单人限额')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('任务标题'), '不设单人限额任务');
    await user.click(screen.getByRole('button', { name: '存为草稿' }));

    expect(await screen.findByText('草稿已保存')).toBeInTheDocument();
    const createTaskCall = fetchMock.mock.calls.find(
      ([path, init]) => path === '/tasks' && init?.method === 'POST',
    );
    expect(createTaskCall).toBeDefined();
    expect(JSON.parse(String(createTaskCall?.[1]?.body))).toMatchObject({
      title: '不设单人限额任务',
      perUserLimit: null,
    });
  });

  it('上传题目数据保存为草稿后再次打开任务会保留文件信息', async () => {
    const user = userEvent.setup();
    const createdTask = {
      ...baseTask,
      id: 'task_draft_with_dataset',
      title: '带题目数据草稿',
      itemCount: 0,
      completedItemCount: 0,
      quota: null,
      status: 'DRAFT',
    };
    const importedTask = { ...createdTask, itemCount: 1, quota: 1 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_1',
              name: '商品清洗 · v3',
              datasetKind: 'qa_quality',
              schemaVersion: 'r12',
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: createdTask }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            taskId: 'task_draft_with_dataset',
            datasetKind: 'qa_quality',
            importedCount: 1,
            errorCount: 0,
            skippedFiles: [],
            fields: ['id', 'prompt'],
            errors: [],
            preview: [],
            files: [
              {
                datasetKind: 'qa_quality',
                format: 'json',
                fileName: 'qa_draft.json',
                fields: ['id', 'prompt'],
                importedCount: 1,
                errorCount: 0,
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: importedTask }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('任务标题'), '带题目数据草稿');
    await chooseTaskTemplate(user, 'M-001 · 商品清洗 · v3 · v1');
    await user.upload(
      screen.getByLabelText('题目数据文件'),
      new File([JSON.stringify([{ id: 'qa_1', prompt: '题目' }])], 'qa_draft.json', {
        type: 'application/json',
      }),
    );
    expect(await screen.findByText('qa_draft.json')).toBeInTheDocument();
    expect(screen.getByText('题目数：1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '存为草稿' }));
    expect(await screen.findByText('草稿已保存')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: '发布任务抽屉' })).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('row', { name: /带题目数据草稿/ }));
    const drawer = await screen.findByRole('complementary', { name: '发布任务抽屉' });
    expect(within(drawer).getByText('qa_draft.json')).toBeInTheDocument();
    expect(within(drawer).getByText('题目数：1')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: '预览' })).toBeInTheDocument();
    expect(within(drawer).queryByText('点击上传文件')).not.toBeInTheDocument();
  });

  it('保存成草稿后再次打开仍可根据已导入输入文件创建模板', async () => {
    const user = userEvent.setup();
    const draftTask = {
      ...baseTask,
      id: 'task_saved_template',
      title: '已保存输入文件草稿',
      status: 'DRAFT',
      itemCount: 2,
      quota: 2,
      datasetImportSummary: {
        taskId: 'task_saved_template',
        datasetKind: 'qa_quality',
        importedCount: 2,
        errorCount: 0,
        skippedFiles: [],
        fields: ['id', 'prompt'],
        errors: [],
        preview: [],
        files: [
          {
            datasetKind: 'qa_quality',
            format: 'json',
            fileName: 'saved_qa.json',
            fields: ['id', 'prompt'],
            importedCount: 2,
            errorCount: 0,
          },
        ],
      },
    };
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      const path = String(url);

      if (path.startsWith('/tasks/summaries?')) {
        return Promise.resolve(jsonResponse({ data: [draftTask] }));
      }

      if (path === '/templates') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (path === '/tasks/task_saved_template/items') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 'item_1',
                taskId: 'task_saved_template',
                externalId: 'qa_1',
                datasetKind: 'qa_quality',
                rawData: { id: 'qa_1', prompt: '保存后的题目 1' },
                status: 'UNASSIGNED',
                sortOrder: 1,
                createdAt: '2026-05-10T00:00:00.000Z',
                updatedAt: '2026-05-10T00:00:00.000Z',
              },
              {
                id: 'item_2',
                taskId: 'task_saved_template',
                externalId: 'qa_2',
                datasetKind: 'qa_quality',
                rawData: { id: 'qa_2', prompt: '保存后的题目 2' },
                status: 'UNASSIGNED',
                sortOrder: 2,
                createdAt: '2026-05-10T00:00:00.000Z',
                updatedAt: '2026-05-10T00:00:00.000Z',
              },
            ],
          }),
        );
      }

      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPageWithTemplateRoute(<div role="dialog" aria-label="模板配置" />);

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('row', { name: /已保存输入文件草稿/ }));

    await user.click(screen.getByLabelText('关联模板'));
    expect(screen.getByRole('button', { name: '根据输入文件创建模板' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '根据输入文件创建模板' }));

    expect(await screen.findByRole('dialog', { name: '模板配置' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/tasks/task_saved_template/items', expect.objectContaining({ method: 'GET' }));
    const handoff = JSON.parse(window.sessionStorage.getItem('labelhub.templateDraftHandoff') ?? '{}');
    expect(handoff.sourceFileName).toBe('saved_qa.json');
    expect(handoff.previewRecords).toEqual([
      expect.objectContaining({ id: 'qa_1', prompt: '保存后的题目 1' }),
      expect.objectContaining({ id: 'qa_2', prompt: '保存后的题目 2' }),
    ]);
    expect(handoff.autoClassificationRequest.fields.map((field: { sourceKey: string }) => field.sourceKey)).toEqual([
      'id',
      'prompt',
    ]);
  });

  it('题目数据文件图标会按 JSONL 和 XLSX 格式切换', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_1',
              name: '商品清洗 · v3',
              datasetKind: 'qa_quality',
              schemaVersion: 'r12',
            }),
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));

    const datasetFileInput = screen.getByLabelText('题目数据文件');
    await user.upload(
      datasetFileInput,
      new File(['{"id":"qa_1","prompt":"题目"}'], 'qa_quality.jsonl', { type: 'application/json' }),
    );
    expect(await screen.findByText('qa_quality.jsonl')).toBeInTheDocument();
    expect(screen.queryByText('已选择：qa_quality.jsonl')).not.toBeInTheDocument();
    expect(document.querySelector('.task-dataset-import__file-icon')).toHaveClass('task-dataset-import__file-icon--jsonl');
    const jsonlIcon = document.querySelector('.task-dataset-import__file-icon')?.querySelector('.bi-filetype-jsonl');
    expect(jsonlIcon).not.toBeNull();
    expect(jsonlIcon?.tagName).toBe('IMG');
    expect(jsonlIcon).toHaveAttribute('src', expect.stringContaining('image/svg+xml'));
    expect(
      document.querySelector('.task-dataset-import__file-icon')?.querySelector('.task-dataset-import__file-icon-badge'),
    ).toBeNull();

    await user.upload(datasetFileInput, await createXlsxFile(1));
    expect(await screen.findByText('qa_quality.xlsx')).toBeInTheDocument();
    expect(screen.queryByText('已选择：qa_quality.xlsx')).not.toBeInTheDocument();
    expect(document.querySelector('.task-dataset-import__file-icon')).toHaveClass('task-dataset-import__file-icon--xlsx');
    expect(document.querySelector('.task-dataset-import__file-icon')?.querySelector('.bi-filetype-xlsx')).not.toBeNull();
  });

  it('刚发布但未提交的任务进度显示为 0 / 总题目数', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            ...baseTask,
            status: 'PUBLISHED',
            itemCount: 30,
            quota: 30,
            completedItemCount: 0,
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    expect(within(table).getByText('0 / 30 题')).toHaveClass('task-progress-cell__count');
    const progressbar = within(table).getByRole('progressbar', {
      name: '商品标题清洗 v3 · 抖音电商 完成进度',
    });
    expect(progressbar).toHaveClass('task-progress');
    expect(within(progressbar.closest('.task-progress-cell') as HTMLElement).getByText('0%').tagName).toBe('STRONG');
    expect(progressbar).toHaveAttribute('aria-valuenow', '0');
    expect(progressbar).toHaveAttribute('aria-valuetext', '0 / 30，0%');
    expect(table.querySelector('.task-progress span')).toHaveStyle({ width: '0%' });
  });

  it('新建任务抽屉未编辑时点击外部直接关闭且不创建草稿', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));

    expect(screen.getByRole('complementary', { name: '发布任务抽屉' })).toBeInTheDocument();
    expect(document.querySelector('.task-publish-drawer-shell')?.parentElement).toBe(document.body);
    expect(screen.getByLabelText('任务标题')).toHaveValue('');
    expect(screen.queryByRole('button', { name: '关闭发布抽屉' })).not.toBeInTheDocument();

    await clickDrawerBackdrop(user);

    expect(screen.getByRole('complementary', { name: '发布任务抽屉' })).toBeInTheDocument();
    expect(document.querySelector('.task-publish-drawer-shell')).toHaveClass('is-closing');

    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: '发布任务抽屉' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('complementary', { name: '发布任务抽屉' })).not.toBeInTheDocument();
    expect(screen.queryByText('需要保存成草稿吗？')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: '新建任务' }));

    expect(screen.getByLabelText('任务标题')).toHaveValue('');
    expect(screen.queryByText('需要保存成草稿吗？')).not.toBeInTheDocument();
  });

  it('新建任务内容恢复为空且未触碰模板时点击外部直接关闭', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('任务标题'), '临时标题');
    await user.clear(screen.getByLabelText('任务标题'));
    await clickDrawerBackdrop(user);

    expect(document.querySelector('.task-publish-drawer-shell')).toHaveClass('is-closing');
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: '发布任务抽屉' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('需要保存成草稿吗？')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('新建任务只设置非标题字段时点击外部直接关闭', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('单条奖励'), '0.3');
    await selectDeadline(user);
    await user.click(screen.getByRole('button', { name: '新增标签' }));
    await user.type(screen.getByLabelText('新标签'), '临时{Enter}');
    await clickDrawerBackdrop(user);

    expect(document.querySelector('.task-publish-drawer-shell')).toHaveClass('is-closing');
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: '发布任务抽屉' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('需要保存成草稿吗？')).not.toBeInTheDocument();
  });

  it('新建任务优先从评测模板列表加载模板，并在关联模板处可选择', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_preference',
              name: '偏好对比模板',
              datasetKind: 'preference_compare',
              schemaVersion: 'pref-r1',
            }),
            createTemplateDto({
              id: 'template_qa',
              name: '问答质量模板',
              datasetKind: 'qa_quality',
              schemaVersion: 'r1',
            }),
            createTemplateDto({
              id: 'template_draft',
              name: '草稿评测模板',
              datasetKind: 'generic_json',
              schemaVersion: 'draft-r1',
              status: 'DRAFT',
            }),
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));

    expect(fetchMock).toHaveBeenCalledWith('/templates', expect.objectContaining({ method: 'GET' }));
    expect(screen.getByLabelText('任务标题')).toHaveValue('');
    expect(screen.getByLabelText('关联模板')).toHaveAttribute('placeholder', '请选择评测模板');
    expect(screen.getByLabelText('关联模板')).toHaveValue('');
    await user.click(screen.getByLabelText('关联模板'));
    expect(screen.getByRole('option', { name: 'M-001 · 偏好对比模板 · v1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'M-002 · 问答质量模板 · v1' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'M-003 · 草稿评测模板 · v1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'M-001 · 商品清洗 · v3' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('关联模板'), '问答');
    expect(screen.getByRole('option', { name: 'M-002 · 问答质量模板 · v1' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'M-001 · 偏好对比模板 · v1' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'M-002 · 问答质量模板 · v1' }));
    expect(screen.getByLabelText('关联模板')).toHaveValue('M-002 · 问答质量模板 · v1');
  });

  it('关联模板菜单可通过眼睛按钮直接查看已有模板配置', async () => {
    const user = userEvent.setup();
    const templateOptions = [
      createTemplateDto({
        id: 'template_preference',
        name: '偏好对比模板',
        datasetKind: 'preference_compare',
        schemaVersion: 'pref-r1',
      }),
      createTemplateDto({
        id: 'template_qa',
        name: '问答质量模板',
        datasetKind: 'qa_quality',
        schemaVersion: 'r1',
      }),
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: templateOptions }))
      .mockResolvedValueOnce(jsonResponse({ data: templateOptions }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPageWithTemplateRoute();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('任务标题'), '查看模板后恢复的任务');
    await user.click(screen.getByLabelText('关联模板'));
    expect(screen.getByLabelText('关联模板')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: '查看 M-002 · 问答质量模板 · v1 模板配置' }));

    const dialog = await screen.findByRole('dialog', { name: '模板配置' });
    expect(within(dialog).getByRole('button', { name: '编辑模板名称' })).toHaveTextContent('问答质量模板');
    expect(within(dialog).queryByRole('button', { name: '关闭模板配置' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/templates', expect.objectContaining({ method: 'GET' }));

    await user.click(screen.getByTestId('template-designer-backdrop'));

    const restoredDrawer = await screen.findByRole('complementary', { name: '发布任务抽屉' });
    expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument();
    expect(document.querySelector('.task-publish-drawer-shell')).toHaveClass('is-returning-from-template');
    expect(within(restoredDrawer).getByLabelText('任务标题')).toHaveValue('查看模板后恢复的任务');
    expect(within(restoredDrawer).getByLabelText('关联模板')).toHaveValue('');
  });

  it('从关联模板预览已有模板且未修改时可直接选择该模板并恢复任务抽屉', async () => {
    const user = userEvent.setup();
    const templateOptions = [
      createTemplateDto({
        id: 'template_preference',
        name: '偏好对比模板',
        datasetKind: 'preference_compare',
        schemaVersion: 'pref-r1',
      }),
      createTemplateDto({
        id: 'template_qa',
        name: '问答质量模板',
        datasetKind: 'qa_quality',
        schemaVersion: 'r1',
      }),
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: templateOptions }))
      .mockResolvedValueOnce(jsonResponse({ data: templateOptions }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPageWithTemplateRoute();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('任务标题'), '直接选择预览模板的任务');
    await user.click(screen.getByLabelText('关联模板'));
    await user.click(screen.getByRole('button', { name: '查看 M-002 · 问答质量模板 · v1 模板配置' }));

    const dialog = await screen.findByRole('dialog', { name: '模板配置' });
    expect(within(dialog).getByRole('button', { name: '选择该模板' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '保存并发布版本 v2' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '选择该模板' }));

    const restoredDrawer = await screen.findByRole('complementary', { name: '发布任务抽屉' });
    expect(screen.getByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument();
    expect(within(restoredDrawer).getByLabelText('任务标题')).toHaveValue('直接选择预览模板的任务');
    expect(within(restoredDrawer).getByLabelText('关联模板')).toHaveValue('M-002 · 问答质量模板 · v1');
    expect(screen.queryByText('没有任何变更，无法保存为新的版本')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/templates', expect.objectContaining({ method: 'POST' }));
  });

  it('从关联模板查看已有模板并修改后点击外侧会恢复任务抽屉', async () => {
    const user = userEvent.setup();
    const editableSchema = createLabelHubSchema({
      schemaVersion: 'r1',
      datasetKind: 'qa_quality',
      fields: [{ key: 'prompt', type: 'text', label: '题目' }],
    });
    const existingTemplate = {
      ...createTemplateDto({
        id: 'template_qa',
        name: '问答质量模板',
        datasetKind: 'qa_quality',
        schemaVersion: 'r1',
      }),
      schema: editableSchema,
      version: 1,
    };
    const templateOptions = [
      createTemplateDto({
        id: 'template_preference',
        name: '偏好对比模板',
        datasetKind: 'preference_compare',
        schemaVersion: 'pref-r1',
      }),
      existingTemplate,
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: templateOptions }))
      .mockResolvedValueOnce(jsonResponse({ data: templateOptions }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPageWithTemplateRoute();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('任务标题'), '查看模板后仍应恢复的任务');
    await user.click(screen.getByLabelText('关联模板'));
    await user.click(screen.getByRole('button', { name: '查看 M-002 · 问答质量模板 · v1 模板配置' }));

    const dialog = await screen.findByRole('dialog', { name: '模板配置' });
    const canvas = within(dialog).getByRole('main', { name: '模板编辑区域' });
    await user.click(within(canvas).getByRole('button', { name: '编辑模板名称' }));
    fireEvent.change(within(canvas).getByRole('textbox', { name: '模板名称' }), {
      target: { value: '问答质量模板修改' },
    });
    await user.click(screen.getByTestId('template-designer-backdrop'));

    const restoredDrawer = await screen.findByRole('complementary', { name: '发布任务抽屉' });
    expect(screen.getByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument();
    expect(document.querySelector('.task-publish-drawer-shell')).toHaveClass('is-returning-from-template');
    expect(within(restoredDrawer).getByLabelText('任务标题')).toHaveValue('查看模板后仍应恢复的任务');
    expect(within(restoredDrawer).getByLabelText('关联模板')).toHaveValue('');
  });

  it('从关联模板查看已有模板并保存发布后恢复任务抽屉并选中新版本', async () => {
    const user = userEvent.setup();
    const editableSchema = createLabelHubSchema({
      schemaVersion: 'r1',
      datasetKind: 'qa_quality',
      fields: [{ key: 'prompt', type: 'text', label: '题目' }],
    });
    const existingTemplate = {
      ...createTemplateDto({
        id: 'template_qa',
        name: '问答质量模板',
        datasetKind: 'qa_quality',
        schemaVersion: 'r1',
      }),
      schema: editableSchema,
      version: 1,
    };
    const templateOptions = [
      createTemplateDto({
        id: 'template_preference',
        name: '偏好对比模板',
        datasetKind: 'preference_compare',
        schemaVersion: 'pref-r1',
      }),
      existingTemplate,
    ];
    let savedDraft = {
      ...existingTemplate,
      id: 'template_qa_draft',
      status: 'DRAFT' as const,
      schemaVersion: 'draft',
      parentTemplateId: existingTemplate.id,
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';

      if (path === '/tasks/summaries' && method === 'GET') {
        return Promise.resolve(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }));
      }

      if (path === '/templates' && method === 'GET') {
        return Promise.resolve(jsonResponse({ data: templateOptions }));
      }

      if (path === '/templates' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          name: string;
          schema: typeof editableSchema;
        };
        savedDraft = {
          ...savedDraft,
          name: body.name,
          schema: body.schema,
        };

        return Promise.resolve(jsonResponse({ data: savedDraft }));
      }

      if (path === '/templates/template_qa_draft/publish' && method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            data: {
              template: {
                ...savedDraft,
                id: 'template_qa_v2',
                status: 'PUBLISHED',
                schemaVersion: 'r2',
                version: 2,
                publishedAt: '2026-05-30T00:00:00.000Z',
              },
              compatibilityReport: {
                addedFieldKeys: [],
                removedFieldKeys: [],
                changedFieldTypes: [],
                compatible: true,
                riskMessages: [],
              },
            },
          }),
        );
      }

      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPageWithTemplateRoute();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('任务标题'), '查看模板后应恢复的任务');
    await user.click(screen.getByLabelText('关联模板'));
    await user.click(screen.getByRole('button', { name: '查看 M-002 · 问答质量模板 · v1 模板配置' }));

    const dialog = await screen.findByRole('dialog', { name: '模板配置' });
    const canvas = within(dialog).getByRole('main', { name: '模板编辑区域' });
    await user.click(within(canvas).getByRole('button', { name: '编辑模板名称' }));
    const templateNameInput = within(canvas).getByRole('textbox', { name: '模板名称' });
    await user.clear(templateNameInput);
    await user.type(templateNameInput, '改动后的问答模板');
    await user.click(within(dialog).getByRole('button', { name: '保存并发布版本 v2' }));

    const restoredDrawer = await screen.findByRole('complementary', { name: '发布任务抽屉' });
    expect(screen.getByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument();
    expect(within(restoredDrawer).getByLabelText('任务标题')).toHaveValue('查看模板后应恢复的任务');
    expect(within(restoredDrawer).getByLabelText('关联模板')).toHaveValue(
      'M-001 · 改动后的问答模板 · v2',
    );
  });

  it('从关联模板查看使用中的模板并另存草稿后恢复任务抽屉但不选中草稿模板', async () => {
    const user = userEvent.setup();
    const editableSchema = createLabelHubSchema({
      schemaVersion: 'r1',
      datasetKind: 'qa_quality',
      fields: [{ key: 'prompt', type: 'text', label: '题目' }],
    });
    const existingTemplate = {
      ...createTemplateDto({
        id: 'template_qa',
        name: '问答质量模板',
        datasetKind: 'qa_quality',
        schemaVersion: 'r1',
      }),
      activeUsageCount: 1,
      schema: editableSchema,
      usageCount: 1,
      version: 1,
    };
    const templateOptions = [
      createTemplateDto({
        id: 'template_preference',
        name: '偏好对比模板',
        datasetKind: 'preference_compare',
        schemaVersion: 'pref-r1',
      }),
      existingTemplate,
    ];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';

      if (path === '/templates' && method === 'GET') {
        return Promise.resolve(jsonResponse({ data: templateOptions }));
      }

      if (path === '/templates' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          name: string;
          schema: typeof editableSchema;
        };

        return Promise.resolve(
          jsonResponse({
            data: {
              ...existingTemplate,
              activeUsageCount: 0,
              id: 'template_qa_copy',
              name: body.name,
              parentTemplateId: null,
              rootTemplateId: null,
              schema: body.schema,
              status: 'DRAFT',
              usageCount: 0,
              version: 1,
            },
          }),
        );
      }

      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPageWithTemplateRoute();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('任务标题'), '使用中模板另存后应恢复的任务');
    await user.click(screen.getByLabelText('关联模板'));
    await user.click(screen.getByRole('button', { name: '查看 M-002 · 问答质量模板 · v1 模板配置' }));

    const dialog = await screen.findByRole('dialog', { name: '模板配置' });
    const canvas = within(dialog).getByRole('main', { name: '模板编辑区域' });
    await user.click(within(canvas).getByRole('button', { name: '编辑模板名称' }));
    const templateNameInput = within(canvas).getByRole('textbox', { name: '模板名称' });
    await user.clear(templateNameInput);
    await user.type(templateNameInput, '使用中的问答模板');
    await user.click(within(dialog).getByRole('button', { name: '保存并发布版本 v2' }));

    const saveAsDialog = await screen.findByRole('dialog', { name: '模板正在使用中' });
    expect(within(saveAsDialog).getByLabelText('模板名称')).toHaveValue('使用中的问答模板 副本');
    await user.click(within(saveAsDialog).getByRole('button', { name: '另存为新模板' }));

    const restoredDrawer = await screen.findByRole('complementary', { name: '发布任务抽屉' });
    expect(screen.getByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument();
    expect(within(restoredDrawer).getByLabelText('任务标题')).toHaveValue('使用中模板另存后应恢复的任务');
    expect(within(restoredDrawer).getByLabelText('关联模板')).toHaveAttribute('placeholder', '请选择评测模板');
    expect(within(restoredDrawer).getByLabelText('关联模板')).toHaveValue('');
  });

  it('已保存草稿重新打开后仍可切换关联模板', async () => {
    const user = userEvent.setup();
    const draftTask = {
      ...baseTask,
      id: 'task_draft_template',
      title: '草稿模板可切换任务',
      status: 'DRAFT',
      templateId: 'template_qa_copy',
      template: {
        id: 'template_qa_copy',
        name: '问答质量 副本',
        datasetKind: 'qa_quality',
        schemaVersion: 'draft',
        status: 'DRAFT',
      },
    };
    const preferenceTemplate = createTemplateDto({
      id: 'template_preference',
      name: '偏好对比模板',
      datasetKind: 'preference_compare',
      schemaVersion: 'pref-r1',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [draftTask] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_qa_copy',
              name: '问答质量 副本',
              datasetKind: 'qa_quality',
              schemaVersion: 'draft',
              status: 'DRAFT',
            }),
            preferenceTemplate,
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            ...draftTask,
            templateId: 'template_preference',
            template: {
              id: preferenceTemplate.id,
              name: preferenceTemplate.name,
              datasetKind: preferenceTemplate.datasetKind,
              schemaVersion: preferenceTemplate.schemaVersion,
              status: preferenceTemplate.status,
            },
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('row', { name: /草稿模板可切换任务/ }));

    const templateInput = screen.getByRole('combobox', { name: '关联模板' });
    expect(templateInput).toHaveAttribute('placeholder', '请选择评测模板');
    expect(templateInput).toHaveValue('');

    await user.click(templateInput);
    expect(screen.queryByRole('option', { name: 'M-001 · 问答质量 副本' })).not.toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'M-001 · 偏好对比模板 · v1' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'M-001 · 偏好对比模板 · v1' }));
    expect(templateInput).toHaveValue('M-001 · 偏好对比模板 · v1');

    await user.click(screen.getByRole('button', { name: '存为草稿' }));

    expect(await screen.findByText('草稿已保存')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/tasks/task_draft_template',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"templateId":"template_preference"'),
      }),
    );
  });

  it('空任务列表但存在评测模板时仍可打开新建任务抽屉', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_qa',
              name: '问答质量模板',
              datasetKind: 'qa_quality',
              schemaVersion: 'r1',
            }),
            createTemplateDto({
              id: 'template_preference',
              name: '偏好对比模板',
              datasetKind: 'preference_compare',
              schemaVersion: 'pref-r1',
            }),
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    expect(within(table).getByText('任务ID')).toBeInTheDocument();
    expect(within(table).getByText('创建时间')).toBeInTheDocument();
    expect(within(table).getByText('创建人')).toBeInTheDocument();
    expect(within(table).getByText('进度')).toBeInTheDocument();
    expect(within(table).getAllByRole('button')).toHaveLength(3);
    expect(within(table).getByRole('button', { name: '按任务ID排序' })).toHaveTextContent('任务ID⇅');
    expect(within(table).getByRole('button', { name: '按创建时间排序' })).toHaveTextContent('创建时间⇅');
    expect(within(table).getByRole('button', { name: '按截止时间排序' })).toHaveTextContent('截止时间⇅');
    const emptyIllustration = within(table).getByRole('img', { name: '空任务列表插画' });
    expect(emptyIllustration).toBeInTheDocument();
    expect(emptyIllustration.tagName).toBe('IMG');
    expect(emptyIllustration).toHaveAttribute('src', expect.stringContaining('empty-table-illustration.svg'));
    expect(within(table).getByText('当前没有任务哦')).toBeInTheDocument();
    expect(screen.getByLabelText('任务列表分页')).toHaveTextContent('第 1 / 1 页');
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
    expect(screen.queryByText('暂无匹配任务')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '新建任务' }));

    expect(screen.getByRole('complementary', { name: '发布任务抽屉' })).toBeInTheDocument();
    expect(screen.getByLabelText('任务标题')).toHaveValue('');
    expect(screen.getByLabelText('关联模板')).toHaveAttribute('placeholder', '请选择评测模板');
    expect(screen.getByLabelText('关联模板')).toHaveValue('');
    await user.click(screen.getByLabelText('关联模板'));
    expect(screen.getByRole('option', { name: 'M-001 · 问答质量模板 · v1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'M-002 · 偏好对比模板 · v1' })).toBeInTheDocument();
    expect(screen.queryByText('暂无可用模板，无法创建任务。')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/templates', expect.objectContaining({ method: 'GET' }));
  });

  it('没有已发布模板时打开新建抽屉，不再注入官方评测模板', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    expect(within(table).getByText('任务ID')).toBeInTheDocument();
    expect(within(table).getByText('创建时间')).toBeInTheDocument();
    expect(within(table).getByText('创建人')).toBeInTheDocument();
    expect(within(table).getByText('进度')).toBeInTheDocument();
    expect(within(table).getAllByRole('button')).toHaveLength(3);
    expect(within(table).getByRole('button', { name: '按任务ID排序' })).toHaveTextContent('任务ID⇅');
    expect(within(table).getByRole('button', { name: '按创建时间排序' })).toHaveTextContent('创建时间⇅');
    expect(within(table).getByRole('button', { name: '按截止时间排序' })).toHaveTextContent('截止时间⇅');
    expect(screen.queryByText('暂无匹配任务')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '新建任务' }));

    expect(screen.getByRole('complementary', { name: '发布任务抽屉' })).toBeInTheDocument();
    expect(screen.getByLabelText('任务标题')).toHaveValue('');
    expect(screen.queryByText('暂无已发布模板')).not.toBeInTheDocument();
    expect(screen.getByLabelText('关联模板')).toHaveAttribute('placeholder', '请选择评测模板');
    expect(screen.getByLabelText('关联模板')).toHaveValue('');
    await user.click(screen.getByLabelText('关联模板'));
    expect(screen.queryByRole('option', { name: '问答质量 (Schema 1.0.0)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '偏好对比 (Schema 1.0.0)' })).not.toBeInTheDocument();
    expect(screen.getByText('没有匹配的评测模板')).toBeInTheDocument();
    expect(screen.queryByText('暂无可用模板，无法创建任务。')).not.toBeInTheDocument();
  });

  it('新建任务关联模板为空时保持请选择评测模板', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));

    expect(screen.getByRole('complementary', { name: '发布任务抽屉' })).toBeInTheDocument();
    expect(screen.getByLabelText('关联模板')).toHaveAttribute('placeholder', '请选择评测模板');
    expect(screen.getByLabelText('关联模板')).toHaveValue('');
    await user.click(screen.getByLabelText('关联模板'));
    expect(screen.queryByRole('option', { name: '问答质量 (Schema 1.0.0)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '偏好对比 (Schema 1.0.0)' })).not.toBeInTheDocument();
    expect(screen.getByText('没有匹配的评测模板')).toBeInTheDocument();
  });

  it('新建任务抽屉编辑后点击外部并选择否时丢弃内容且不创建草稿', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('任务标题'), '更新');
    await clickDrawerBackdrop(user);

    expect(screen.getByText('需要保存成草稿吗？')).toBeInTheDocument();
    expect(screen.getByText('当前修改尚未发布，关闭后将丢失未保存内容')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭保存草稿确认弹窗' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(document.querySelector('.task-close-confirm')).toHaveClass('is-closing');
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: '发布任务抽屉' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('需要保存成草稿吗？')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('新建任务抽屉编辑后点击外部并选择是时才创建草稿', async () => {
    const user = userEvent.setup();
    const createdTask = {
      ...baseTask,
      id: 'task_created',
      title: '更新',
      itemCount: 0,
      completedItemCount: 0,
      status: 'DRAFT',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_1',
              name: '商品清洗 · v3',
              datasetKind: 'qa_quality',
              schemaVersion: 'r12',
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: createdTask }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('任务标题'), '更新');
    await clickDrawerBackdrop(user);
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('草稿已保存')).toBeInTheDocument();
    expect(within(table).getByText('更新')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: '发布任务抽屉' })).not.toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/tasks',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"actorId":"user_owner_zhang_man"'),
      }),
    );
  });

  it('确认保存草稿但表单校验失败时关闭确认弹窗并保留抽屉', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, title: '111', status: 'DRAFT' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_1',
              name: '商品清洗 · v3',
              datasetKind: 'qa_quality',
              schemaVersion: 'r12',
            }),
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('任务标题'), '111');
    await clickDrawerBackdrop(user);
    expect(screen.getByText('需要保存成草稿吗？')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(screen.queryByText('需要保存成草稿吗？')).not.toBeInTheDocument());
    const drawer = screen.getByRole('complementary', { name: '发布任务抽屉' });
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByLabelText('任务标题')).toHaveValue('111');
    const titleField = within(drawer).getByText('任务标题').closest('label');
    expect(titleField).not.toBeNull();
    expect(within(titleField as HTMLElement).getByText('任务标题已存在，请换一个标题。')).toHaveClass(
      'task-publish-field-error--inline',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('新建任务未导入题目时点击立即发布不会创建草稿', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('任务标题'), '待发布');
    await user.click(screen.getByRole('button', { name: '立即发布 →' }));

    const drawer = screen.getByRole('complementary', { name: '发布任务抽屉' });
    expect(within(drawer).queryByRole('alert')).not.toBeInTheDocument();
    const datasetHeading = within(drawer).getByText('题目数据导入').closest('.task-field-heading');
    expect(datasetHeading).not.toBeNull();
    expect(within(datasetHeading as HTMLElement).getByText('题目数据未导入')).toHaveClass(
      'task-publish-field-error--inline',
    );
    const deadlineField = within(drawer).getByText('截止时间').closest('label');
    expect(deadlineField).not.toBeNull();
    const deadlineError = within(deadlineField as HTMLElement).getByText('请选择截止时间。');
    expect(deadlineError).toHaveClass('task-publish-field-error--inline');
    expect(deadlineError.closest('.task-field-heading')).toHaveTextContent('截止时间');
    const templateField = within(drawer).getByText('关联模板').closest('label');
    expect(templateField).not.toBeNull();
    const templateError = within(templateField as HTMLElement).getByText('请选择评测模板。');
    expect(templateError).toHaveClass('task-publish-field-error--inline');
    expect(templateError.closest('.task-field-heading')).toHaveTextContent('关联模板');
    expect(document.querySelector('.task-publish-drawer__validation')).toBeNull();
    expect(document.querySelector('.task-status-message')).toBeNull();
    expect(within(table).queryByText('待发布')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('保存草稿前在抽屉内校验任务标题、奖励金额和重复标题', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.clear(screen.getByLabelText('任务标题'));
    await user.type(screen.getByLabelText('任务标题'), baseTask.title);
    await user.clear(screen.getByLabelText('单条奖励'));
    await user.type(screen.getByLabelText('单条奖励'), '0.333');
    await user.click(screen.getByRole('button', { name: '存为草稿' }));

    const drawer = screen.getByRole('complementary', { name: '发布任务抽屉' });
    expect(within(drawer).getAllByText('任务标题已存在，请换一个标题。').length).toBeGreaterThan(0);
    expect(
      within(drawer).getAllByText('任务标题已存在，请换一个标题。').some((element) =>
        element.classList.contains('task-publish-field-error--inline'),
      ),
    ).toBe(true);
    expect(within(drawer).getByText('单条奖励最多保留两位小数。')).toBeInTheDocument();
    expect(within(drawer).getByText('任务标题已存在，请换一个标题。')).toHaveClass(
      'task-publish-field-error--inline',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('保存草稿前使用正则校验单条奖励不能包含空格、负号或非法数字', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    const rewardInput = screen.getByLabelText('单条奖励');

    await user.type(rewardInput, ' 0.3');
    await user.click(screen.getByRole('button', { name: '存为草稿' }));

    const drawer = screen.getByRole('complementary', { name: '发布任务抽屉' });
    expect(within(drawer).getAllByText('请输入数字。').length).toBeGreaterThan(0);
    expect(within(drawer).getByText('请输入数字。')).toHaveClass('task-publish-field-error--inline');

    await user.clear(rewardInput);
    await user.type(rewardInput, '-1');
    await user.click(screen.getByRole('button', { name: '存为草稿' }));

    expect(within(drawer).getAllByText('不能输入负数。').length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('单条奖励输入非法内容后失焦不清空，并在标题后闪烁红字提示', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    const rewardInput = screen.getByLabelText('单条奖励');

    await user.type(rewardInput, '-1');
    await user.click(screen.getByLabelText('任务标题'));

    expect(rewardInput).toHaveValue('-1');
    const rewardField = rewardInput.closest('label');
    expect(rewardField).not.toBeNull();
    const rewardHeading = within(rewardField as HTMLElement).getByText('单条奖励').closest('.task-field-heading');
    expect(rewardHeading).not.toBeNull();
    const negativeError = within(rewardHeading as HTMLElement).getByText('不能输入负数。');
    expect(negativeError).toHaveClass('task-publish-field-error--inline');
    fireEvent.animationEnd(negativeError);
    expect(within(rewardHeading as HTMLElement).queryByText('不能输入负数。')).not.toBeInTheDocument();
    expect(rewardInput).toHaveValue('-1');

    await user.clear(rewardInput);
    await user.type(rewardInput, 'abc');
    await user.click(screen.getByLabelText('任务标题'));

    expect(rewardInput).toHaveValue('abc');
    const numberError = within(rewardHeading as HTMLElement).getByText('请输入数字。');
    expect(numberError).toHaveClass('task-publish-field-error--inline');
    fireEvent.animationEnd(numberError);
    expect(within(rewardHeading as HTMLElement).queryByText('请输入数字。')).not.toBeInTheDocument();
    expect(rewardInput).toHaveValue('abc');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('任务标题为空或超长时在标题右侧闪烁展示校验错误', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.clear(screen.getByLabelText('任务标题'));
    await user.click(screen.getByRole('button', { name: '存为草稿' }));

    const emptyTitleError = screen.getAllByText('请输入任务标题。').find((element) =>
      element.classList.contains('task-publish-field-error--inline'),
    );
    expect(emptyTitleError).toBeDefined();
    expect(emptyTitleError).toHaveClass('task-publish-field-error--inline');
    expect(emptyTitleError?.closest('.task-field-heading')).toHaveTextContent('任务标题');

    await user.type(screen.getByLabelText('任务标题'), '超长任务标题'.repeat(8));
    await user.click(screen.getByRole('button', { name: '存为草稿' }));

    const lengthTitleError = screen.getAllByText('任务标题不能超过 40 个字符。').find((element) =>
      element.classList.contains('task-publish-field-error--inline'),
    );
    expect(lengthTitleError).toBeDefined();
    expect(lengthTitleError).toHaveClass('task-publish-field-error--inline');
    expect(lengthTitleError?.closest('.task-field-heading')).toHaveTextContent('任务标题');
  });

  it('标签达到 5 个后点击新增标签只显示限制提示且不展开输入框', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    await user.click(within(table).getByRole('button', { name: '发布 商品标题清洗 v3 · 抖音电商' }));

    await user.click(screen.getByRole('button', { name: '新增标签' }));
    await user.type(screen.getByLabelText('新标签'), '质检{Enter}');
    await user.click(screen.getByRole('button', { name: '新增标签' }));
    await user.type(screen.getByLabelText('新标签'), '复核{Enter}');
    expect(screen.getAllByRole('button', { name: /^删除标签 / })).toHaveLength(5);

    await user.click(screen.getByRole('button', { name: '新增标签' }));

    expect(screen.queryByRole('form', { name: '新标签输入' })).not.toBeInTheDocument();
    const limitNotice = screen.getByRole('alert');
    expect(limitNotice).toHaveTextContent('最多 5 个标签');
    expect(limitNotice).toHaveClass('toast', 'toast--error');
    expect(limitNotice.closest('.task-tag-editor__heading')).toBeNull();
    expect(document.querySelector('.task-tag-limit-notice')).toBeNull();
  });

  it('中文输入法组合输入时按 Enter 不会提前创建标签', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    await user.click(within(table).getByRole('button', { name: '发布 商品标题清洗 v3 · 抖音电商' }));
    await user.click(screen.getByRole('button', { name: '新增标签' }));

    const tagInput = screen.getByLabelText('新标签') as HTMLInputElement;
    fireEvent.compositionStart(tagInput);
    fireEvent.change(tagInput, { target: { value: 'ceshi' } });
    fireEvent.keyDown(tagInput, { key: 'Enter', code: 'Enter', keyCode: 13 });

    expect(screen.getByRole('form', { name: '新标签输入' })).toBeInTheDocument();
    expect(tagInput).toHaveValue('ceshi');
    expect(screen.queryByText('ceshi')).not.toBeInTheDocument();

    fireEvent.compositionEnd(tagInput);
    fireEvent.change(tagInput, { target: { value: '测试' } });
    fireEvent.keyDown(tagInput, { key: 'Enter', code: 'Enter', keyCode: 13 });

    expect(screen.queryByRole('form', { name: '新标签输入' })).not.toBeInTheDocument();
    expect(screen.getByText('测试')).toBeInTheDocument();
  });

  it('限制题目数据文件格式，并用自定义日历选择截止时间', async () => {
    const showPicker = vi.fn();
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
      configurable: true,
      value: showPicker,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_1',
              name: '商品清洗 · v3',
              datasetKind: 'qa_quality',
              schemaVersion: 'r12',
            }),
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    fireEvent.click(screen.getByRole('button', { name: '新建任务' }));
    expect(await screen.findByRole('complementary', { name: '发布任务抽屉' })).toBeInTheDocument();
    vi.useFakeTimers({ now: new Date(2026, 4, 24, 10, 30, 0) });
    expect(screen.getByLabelText('题目数据文件')).toHaveAttribute(
      'accept',
      '.json,.jsonl,.csv,.xlsx,application/json,text/csv',
    );
    fireEvent.change(screen.getByLabelText('题目数据文件'), {
      target: { files: [new File(['id,prompt'], 'bad.txt', { type: 'text/plain' })] },
    });
    expect(screen.getAllByText('仅支持 JSON、JSONL、CSV、XLSX 格式。').length).toBeGreaterThan(0);

    expect(screen.queryByLabelText('截止时间', { selector: 'input' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /选择截止时间/ }));
    expect(showPicker).not.toHaveBeenCalled();
    const deadlineDialog = screen.getByRole('dialog', { name: '选择截止时间' });
    expect(within(deadlineDialog).getByText('2026年5月')).toBeInTheDocument();
    expect(within(deadlineDialog).getByRole('button', { name: '2026-04-27 不可选' })).toBeDisabled();
    expect(within(deadlineDialog).getByRole('button', { name: '2026-05-23 不可选' })).toBeDisabled();
    expect(within(deadlineDialog).queryByRole('button', { name: '2026-04-27' })).not.toBeInTheDocument();
    const hourWheel = within(deadlineDialog).getByRole('spinbutton', { name: '截止整点' });
    expect(hourWheel).toHaveAttribute('aria-valuenow', '23');
    expect(within(deadlineDialog).getByRole('region', { name: '截止时间' })).toHaveTextContent('时间');
    expect(within(deadlineDialog).getByRole('region', { name: '截止时间' })).toHaveTextContent('23:00');
    expect(within(deadlineDialog).queryByText('小时')).not.toBeInTheDocument();
    expect(within(deadlineDialog).queryByLabelText('截止分钟')).not.toBeInTheDocument();
    expect(within(deadlineDialog).queryByLabelText('截止秒钟')).not.toBeInTheDocument();
    expect(within(deadlineDialog).getByRole('button', { name: '取消' })).toBeInTheDocument();
    const deadlineInput = screen.getByLabelText('截止日期时间') as HTMLInputElement;
    expect(deadlineInput).toHaveAttribute('type', 'datetime-local');
    expect(deadlineInput).toHaveAttribute('step', '1');
    expect(deadlineInput).toHaveAttribute('min', '2026-05-24T10:30:00');

    fireEvent.change(deadlineInput, { target: { value: '2026-05-24T09:08:07' } });
    expect(screen.getByRole('button', { name: '选择截止时间' })).toBeInTheDocument();
    fireEvent.click(within(deadlineDialog).getByRole('button', { name: '2026-05-24' }));
    expect(within(deadlineDialog).getByText('2026年5月')).toBeInTheDocument();
    fireEvent.keyDown(hourWheel, { key: 'Home' });
    for (let index = 0; index < 9; index += 1) {
      fireEvent.keyDown(hourWheel, { key: 'ArrowUp' });
    }
    expect(hourWheel).toHaveAttribute('aria-valuenow', '9');
    expect(within(deadlineDialog).getByRole('button', { name: '确定' })).toBeDisabled();

    fireEvent.wheel(hourWheel, { deltaY: 10 });
    expect(hourWheel).toHaveAttribute('aria-valuenow', '9');
    fireEvent.wheel(hourWheel, { deltaY: 50 });
    expect(hourWheel).toHaveAttribute('aria-valuenow', '9');
    fireEvent.wheel(hourWheel, { deltaY: 70 });
    expect(hourWheel).toHaveAttribute('aria-valuenow', '10');
    fireEvent.wheel(hourWheel, { deltaY: -40 });
    expect(hourWheel).toHaveAttribute('aria-valuenow', '10');
    fireEvent.wheel(hourWheel, { deltaY: -90 });
    expect(hourWheel).toHaveAttribute('aria-valuenow', '9');

    fireEvent(hourWheel, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientY: 100 }));
    fireEvent(hourWheel, new MouseEvent('pointermove', { bubbles: true, cancelable: true, clientY: -52 }));
    fireEvent(hourWheel, new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientY: -52 }));
    expect(hourWheel).toHaveAttribute('aria-valuenow', '11');
    fireEvent.click(within(deadlineDialog).getByRole('button', { name: '确定' }));

    expect(screen.queryByRole('dialog', { name: '选择截止时间' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选择截止时间，当前 2026-05-24 11:00:00/ })).toBeInTheDocument();
  });

  it('发布抽屉用标签气泡新增标签，并只提交单条奖励', async () => {
    const user = userEvent.setup();
    const savedTask = {
      ...baseTask,
      id: 'task_draft',
      tags: ['电商', '文本清洗', '中文', '质检'],
      rewardPerItem: 0.45,
      rewardRule: '0.45 元 / 条',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, id: 'task_draft', status: 'DRAFT' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: savedTask }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    const table = await screen.findByRole('table', { name: '任务列表' });
    await user.click(within(table).getByRole('button', { name: '发布 商品标题清洗 v3 · 抖音电商' }));

    expect(screen.queryByLabelText('标签')).not.toBeInTheDocument();
    expect(screen.getByText('电商')).toBeInTheDocument();
    const addTagButton = screen.getByRole('button', { name: '新增标签' });
    expect(addTagButton).toHaveClass('task-tag-bubble--add');
    await user.click(addTagButton);
    const firstComposer = screen.getByRole('form', { name: '新标签输入' });
    expect(firstComposer).toHaveClass('task-tag-composer');
    expect(screen.getByRole('button', { name: '确认新增标签' })).toBeInTheDocument();
    const firstTagInput = screen.getByLabelText('新标签') as HTMLInputElement;
    expect(firstTagInput).toHaveFocus();
    await user.type(firstTagInput, '质检');
    await user.click(screen.getByLabelText('单条奖励'));
    expect(firstComposer).toHaveClass('task-tag-composer--closing');
    fireEvent.animationEnd(screen.getByRole('button', { name: '确认新增标签' }));
    expect(screen.getByRole('form', { name: '新标签输入' })).toHaveClass('task-tag-composer--closing');
    fireEvent.animationEnd(firstComposer);
    expect(screen.queryByRole('form', { name: '新标签输入' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '新增标签' }));
    const reopenedTagInput = screen.getByLabelText('新标签') as HTMLInputElement;
    expect(reopenedTagInput).toHaveValue('质检');
    expect(reopenedTagInput).toHaveFocus();
    expect(reopenedTagInput.selectionStart).toBe(2);
    expect(reopenedTagInput.selectionEnd).toBe(2);
    await user.click(screen.getByRole('button', { name: '确认新增标签' }));
    const committingComposer = screen.getByRole('form', { name: '新标签输入' });
    expect(committingComposer).toHaveClass('task-tag-composer--committing');
    fireEvent.animationEnd(screen.getByRole('button', { name: '确认新增标签' }));
    expect(screen.getByRole('form', { name: '新标签输入' })).toHaveClass('task-tag-composer--committing');
    fireEvent.animationEnd(committingComposer);
    expect(screen.queryByRole('form', { name: '新标签输入' })).not.toBeInTheDocument();
    expect(screen.getByText('质检').closest('.task-tag-bubble')).toHaveClass('task-tag-bubble--entering');

    const chineseTag = screen.getByText('中文').closest('.task-tag-bubble');
    expect(chineseTag).not.toBeNull();
    const chineseTagSurface = (chineseTag as HTMLElement).querySelector('.task-tag-bubble__surface');
    expect(chineseTagSurface).not.toBeNull();
    await user.hover(chineseTag as HTMLElement);
    const removeChineseButton = screen.getByRole('button', { name: '删除标签 中文' });
    expect(removeChineseButton).toHaveClass('task-tag-bubble__remove');
    expect(removeChineseButton.closest('.task-tag-bubble__surface')).toBe(chineseTagSurface);
    await user.click(removeChineseButton);
    expect(chineseTag).toHaveClass('task-tag-bubble--removing');
    expect(chineseTagSurface).toHaveClass('task-tag-bubble__surface--removing');
    expect(screen.getByText('中文')).toBeInTheDocument();
    fireEvent.animationEnd(chineseTag as HTMLElement);
    expect(screen.queryByText('中文')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('单条奖励'));
    await user.type(screen.getByLabelText('单条奖励'), '0.45');
    expect(screen.queryByLabelText('月度奖励封顶金额')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '存为草稿' }));

    expect(await screen.findByText('草稿已保存')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: '发布任务抽屉' })).not.toBeInTheDocument(),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(body).toMatchObject({
      tags: ['电商', '文本清洗', '质检'],
      rewardPerItem: 0.45,
    });
    expect(body).not.toHaveProperty('monthlyRewardCap');
    expect(body).not.toHaveProperty('rewardRule');
    expect(body).not.toHaveProperty('description');
    expect(body).not.toHaveProperty('richTextInstruction');
  });

  it('新建任务抽屉已创建标签支持左右拖拽换位', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));

    await addTaskTag(user, '电商');
    await addTaskTag(user, '质检');
    await addTaskTag(user, '中文');

    const ecommerceTag = screen.getByText('电商').closest('.task-tag-bubble') as HTMLSpanElement;
    const qualityTag = screen.getByText('质检').closest('.task-tag-bubble') as HTMLSpanElement;
    const chineseTag = screen.getByText('中文').closest('.task-tag-bubble') as HTMLSpanElement;
    mockTagRect(ecommerceTag, 0);
    mockTagRect(qualityTag, 88);
    mockTagRect(chineseTag, 176);

    const ecommerceSurface = ecommerceTag.querySelector('.task-tag-bubble__surface') as HTMLSpanElement;
    vi.useFakeTimers();

    try {
      fireEvent(ecommerceSurface, createTaskTagPointerTestEvent('pointerdown', { button: 0, clientX: 20, pointerId: 1 }));
      act(() => {
        vi.advanceTimersByTime(170);
      });
      expect(ecommerceTag).toHaveClass('task-tag-bubble--dragging');

      fireEvent(ecommerceSurface, createTaskTagPointerTestEvent('pointermove', { clientX: 250, pointerId: 1 }));
      expect(qualityTag).toHaveClass('task-tag-bubble--drag-shifted');
      expect(chineseTag).toHaveClass('task-tag-bubble--drag-shifted');
      fireEvent(ecommerceSurface, createTaskTagPointerTestEvent('pointerup', { clientX: 250, pointerId: 1 }));
    } finally {
      vi.useRealTimers();
    }

    expect(getTaskTagLabels()).toEqual(['质检', '中文', '电商']);
  });

  it('新建任务在抽屉内上传题目数据后可以立即导入并发布', async () => {
    const user = userEvent.setup();
    const createdTask = {
      ...baseTask,
      id: 'task_created',
      title: '待发布',
      tags: ['质检'],
      rewardPerItem: 0.3,
      itemCount: 0,
      completedItemCount: 0,
      quota: null,
      status: 'DRAFT',
    };
    const importedTask = { ...createdTask, itemCount: 1, quota: 1 };
    const publishedTask = { ...importedTask, status: 'PUBLISHED' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_1',
              name: '商品清洗 · v3',
              datasetKind: 'qa_quality',
              schemaVersion: 'r12',
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: createdTask }))
      .mockResolvedValueOnce(jsonResponse({ data: { importedCount: 1, errorCount: 0, preview: [] } }))
      .mockResolvedValueOnce(jsonResponse({ data: importedTask }))
      .mockResolvedValueOnce(jsonResponse({ data: publishedTask }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    expect(screen.getByLabelText('单条奖励')).toHaveValue('');
    expect(screen.getByRole('button', { name: '选择截止时间' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('任务标题'), '待发布');
    await chooseTaskTemplate(user, 'M-001 · 商品清洗 · v3 · v1');
    await user.click(screen.getByRole('button', { name: '新增标签' }));
    await user.type(screen.getByLabelText('新标签'), '质检{Enter}');
    expect(screen.getByText('点击上传文件')).toBeInTheDocument();
    expect(document.querySelector('.task-dataset-import__file-icon')).toHaveClass('task-dataset-import__file-icon--upload');
    await user.upload(
      screen.getByLabelText('题目数据文件'),
      new File(
        [
          JSON.stringify([
            {
              id: 'qa_1',
              prompt: '用户问题',
              model_answer: '模型回答',
              expected_dimensions: '事实准确 | 信息完整',
              media_type: 'text',
            },
          ]),
        ],
        'qa.json',
        { type: 'application/json' },
      ),
    );
    const selectedDatasetFile = await screen.findByText('qa.json');
    const uploadedFileIcon = document.querySelector('.task-dataset-import__file-icon');
    expect(uploadedFileIcon).toHaveClass('task-dataset-import__file-icon--json');
    expect(uploadedFileIcon).toHaveClass('task-dataset-import__file-icon--typed');
    expect(uploadedFileIcon?.querySelector('.bi-filetype-json')).not.toBeNull();
    const datasetImportPanel = selectedDatasetFile.closest('.task-dataset-import__panel');
    expect(datasetImportPanel).not.toBeNull();
    expect(within(datasetImportPanel as HTMLElement).queryByText('点击上传文件')).not.toBeInTheDocument();
    expect(within(datasetImportPanel as HTMLElement).queryByText('已选择：qa.json')).not.toBeInTheDocument();
    expect(within(datasetImportPanel as HTMLElement).getByText('题目数：1')).toBeInTheDocument();
    const previewButton = within(datasetImportPanel as HTMLElement).getByRole('button', { name: '预览' });
    expect(previewButton).toHaveClass('task-dataset-import__preview');
    expect(previewButton.closest('.task-dataset-import__file-zone')).not.toBeNull();
    expect(previewButton.querySelector('.task-dataset-import__preview-icon')).not.toBeNull();
    expect(await screen.findByText('题目数：1')).toBeInTheDocument();
    await user.type(screen.getByLabelText('单条奖励'), '0.3');
    await selectDeadline(user);
    await user.click(screen.getByRole('button', { name: '立即发布 →' }));

    expect(await screen.findByText('任务已发布')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/tasks',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    const createBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(createBody).toMatchObject({
      title: '待发布',
      tags: ['质检'],
      rewardPerItem: 0.3,
      perUserLimit: null,
      quota: 1,
      actorId: 'user_owner_zhang_man',
    });
    expect(createBody).not.toHaveProperty('monthlyRewardCap');
    expect(createBody).not.toHaveProperty('rewardRule');

    expect(fetchMock).toHaveBeenCalledWith(
      '/tasks/task_created/items/import',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    const importBody = JSON.parse(String(fetchMock.mock.calls[3][1]?.body));
    expect(importBody).toMatchObject({
      datasetKind: 'qa_quality',
      format: 'json',
      fileName: 'qa.json',
    });
    expect(importBody.content).toContain('qa_1');

    expect(fetchMock).toHaveBeenCalledWith(
      '/tasks/task_created',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ quota: 1 }),
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/tasks/task_created/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'PUBLISHED', actorId: 'user_owner_zhang_man', confirm: true }),
      }),
    );
  });

  it('上传题目数据后可从关联模板菜单根据输入文件创建 ShowItem 模板', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (String(url) === '/llm/template-fields/classify') {
        return Promise.resolve(
          jsonResponse({
            data: {
              layout: 'field_list',
              displayFields: [
                { sourceKey: 'task_type', label: '任务类型', area: 'meta', format: 'badge' },
                { sourceKey: 'lang', label: '语言', area: 'meta', format: 'badge' },
                { sourceKey: 'prompt', label: '问题', area: 'primary', format: 'long_text', maxLines: 8 },
                { sourceKey: 'response_a', label: '回答 A', area: 'content', format: 'long_text', maxLines: 12 },
                { sourceKey: 'model_a', label: '模型 A', area: 'meta', format: 'badge' },
              ],
              annotationFields: [],
            },
          }),
        );
      }

      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPageWithTemplateRoute(<div role="dialog" aria-label="模板配置" />);

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.upload(
      screen.getByLabelText('题目数据文件'),
      new File(
        [
          JSON.stringify(
            Array.from({ length: 12 }, (_, index) => ({
              task_type: '知识问答',
              lang: 'zh',
              prompt: index === 0 ? '解释什么是过拟合' : `第 ${index + 1} 道题`,
              response_a: index === 0 ? '回答 A' : `回答 ${index + 1}`,
              model_a: index === 0 ? 'doubao-pro' : 'baseline-7b',
            })),
          ),
        ],
        'preference_compare.json',
        { type: 'application/json' },
      ),
    );

    expect(await screen.findByText('题目数：12')).toBeInTheDocument();
    expect(screen.getByLabelText('关联模板')).toHaveValue('');

    await user.click(screen.getByLabelText('关联模板'));
    const templateMenu = screen.getByRole('listbox', { name: '关联模板菜单' });
    expect(templateMenu.firstElementChild).toHaveTextContent('根据输入文件创建模板');

    await user.click(within(templateMenu).getByRole('button', { name: '根据输入文件创建模板' }));

    expect(await screen.findByRole('dialog', { name: '模板配置' })).toBeInTheDocument();
    const handoff = JSON.parse(window.sessionStorage.getItem('labelhub.templateDraftHandoff') ?? '{}');
    expect(handoff.previewRecords).toHaveLength(12);
    expect(handoff.previewRecords.slice(0, 2)).toEqual([
      expect.objectContaining({
        task_type: '知识问答',
        lang: 'zh',
        prompt: '解释什么是过拟合',
        response_a: '回答 A',
        model_a: 'doubao-pro',
      }),
      expect.objectContaining({
        task_type: '知识问答',
        lang: 'zh',
        prompt: '第 2 道题',
        response_a: '回答 2',
        model_a: 'baseline-7b',
      }),
    ]);
    expect(handoff.previewRecords.at(-1)).toMatchObject({
      prompt: '第 12 道题',
      response_a: '回答 12',
    });
    expect(handoff.autoClassificationRequest.records).toHaveLength(1);
    expect(handoff.autoClassificationRequest.fields.map((field: { sourceKey: string }) => field.sourceKey)).toEqual([
      'task_type',
      'lang',
      'prompt',
      'response_a',
      'model_a',
    ]);
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/llm/template-fields/classify',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('创建输入文件模板时先跳转到评测模板页面，不在任务抽屉等待字段分类', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (String(url) === '/llm/template-fields/classify') {
        return Promise.resolve(new Response('', { status: 500 }));
      }

      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPageWithTemplateRoute(<div role="dialog" aria-label="模板配置" />);

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.upload(
      screen.getByLabelText('题目数据文件'),
      new File(
        [
          JSON.stringify([
            {
              prompt: '光合作用主要发生在哪里？',
              model_answer: '叶绿体。',
              reference: '叶绿体（类囊体薄膜）。',
              expected_dimensions: ['相关性', '准确性'],
            },
          ]),
        ],
        'qa_quality.json',
        { type: 'application/json' },
      ),
    );

    expect(await screen.findByText('题目数：1')).toBeInTheDocument();

    await user.click(screen.getByLabelText('关联模板'));
    await user.click(screen.getByRole('button', { name: '根据输入文件创建模板' }));

    expect(await screen.findByRole('dialog', { name: '模板配置' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(JSON.parse(window.sessionStorage.getItem('labelhub.templateDraftHandoff') ?? '{}')).toMatchObject({
      autoClassificationRequest: {
        fileName: 'qa_quality.json',
      },
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/llm/template-fields/classify',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('从任务抽屉创建模板后点击模板抽屉外侧会带动画返回并恢复任务抽屉', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (String(url) === '/llm/template-fields/classify') {
        return Promise.resolve(
          jsonResponse({
            data: {
              layout: 'field_list',
              displayFields: [
                { sourceKey: 'task_type', label: '任务类型', area: 'meta', format: 'badge' },
                { sourceKey: 'lang', label: '语言', area: 'meta', format: 'badge' },
                { sourceKey: 'prompt', label: '问题', area: 'primary', format: 'long_text', maxLines: 8 },
                { sourceKey: 'response_a', label: '回答 A', area: 'content', format: 'long_text', maxLines: 12 },
                { sourceKey: 'model_a', label: '模型 A', area: 'meta', format: 'badge' },
              ],
              annotationFields: [],
            },
          }),
        );
      }

      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPageWithTemplateRoute();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('任务标题'), '需要恢复的任务草稿');
    await user.upload(
      screen.getByLabelText('题目数据文件'),
      new File(
        [
          JSON.stringify([
            {
              task_type: '知识问答',
              lang: 'zh',
              prompt: '解释什么是过拟合',
              response_a: '回答 A',
              model_a: 'doubao-pro',
            },
            {
              task_type: '知识问答',
              lang: 'zh',
              prompt: '解释什么是欠拟合',
              response_a: '回答 B',
              model_a: 'baseline-7b',
            },
          ]),
        ],
        'preference_compare.json',
        { type: 'application/json' },
      ),
    );
    expect(await screen.findByText('题目数：2')).toBeInTheDocument();

    await user.click(screen.getByLabelText('关联模板'));
    await user.click(screen.getByRole('button', { name: '根据输入文件创建模板' }));

    expect(await screen.findByRole('dialog', { name: '模板配置' })).toBeInTheDocument();
    await user.click(screen.getByTestId('template-designer-backdrop'));
    expect(screen.getByText('需要保存成草稿吗？')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() =>
      expect(document.querySelector('.template-designer-drawer-shell')).toHaveClass('is-closing'),
    );

    const restoredDrawer = await screen.findByRole('complementary', { name: '发布任务抽屉' });
    expect(screen.getByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument();
    expect(document.querySelector('.task-publish-drawer-shell')).toHaveClass('is-returning-from-template');
    expect(within(restoredDrawer).getByLabelText('任务标题')).toHaveValue('需要恢复的任务草稿');
    expect(within(restoredDrawer).getByText('preference_compare.json')).toBeInTheDocument();
    expect(within(restoredDrawer).getByText('题目数：2')).toBeInTheDocument();
  });

  it('从模板配置返回任务抽屉后立刻点击外侧关闭仍播放关闭动画', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (String(url) === '/llm/template-fields/classify') {
        return Promise.resolve(
          jsonResponse({
            data: {
              layout: 'field_list',
              displayFields: [
                { sourceKey: 'prompt', label: '问题', area: 'primary', format: 'long_text', maxLines: 8 },
              ],
              annotationFields: [],
            },
          }),
        );
      }

      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPageWithTemplateRoute();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.upload(
      screen.getByLabelText('题目数据文件'),
      new File([JSON.stringify([{ prompt: '解释什么是过拟合' }])], 'qa_quality.json', {
        type: 'application/json',
      }),
    );
    expect(await screen.findByText('题目数：1')).toBeInTheDocument();

    await user.click(screen.getByLabelText('关联模板'));
    await user.click(screen.getByRole('button', { name: '根据输入文件创建模板' }));
    expect(await screen.findByRole('dialog', { name: '模板配置' })).toBeInTheDocument();

    await user.click(screen.getByTestId('template-designer-backdrop'));
    expect(screen.getByText('需要保存成草稿吗？')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '取消' }));
    const restoredDrawer = await screen.findByRole('complementary', { name: '发布任务抽屉' });
    expect(restoredDrawer).toBeInTheDocument();
    expect(document.querySelector('.task-publish-drawer-shell')).toHaveClass('is-returning-from-template');

    await clickDrawerBackdrop(user);

    const drawerShell = document.querySelector('.task-publish-drawer-shell');
    expect(drawerShell).toHaveClass('is-closing');
    expect(drawerShell).not.toHaveClass('is-returning-from-template');
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: '发布任务抽屉' })).not.toBeInTheDocument(),
    );
  });

  it('从输入文件创建模板并发布后自动回到任务抽屉且关联新模板', async () => {
    const user = userEvent.setup();
    const draftTemplate = createTemplateDto({
      id: 'template_auto_draft',
      name: '自动解析模板 · preference_compare.json',
      datasetKind: 'generic_json',
      schemaVersion: 'auto-draft',
      status: 'DRAFT',
    });
    const publishedTemplate = {
      ...draftTemplate,
      status: 'PUBLISHED' as const,
      schemaVersion: 'r1',
      version: 1,
      publishedAt: '2026-05-30T00:00:00.000Z',
    };
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      const method = init?.method ?? 'GET';

      if (path === '/llm/template-fields/classify') {
        return Promise.resolve(
          jsonResponse({
            data: {
              layout: 'field_list',
              displayFields: [
                { sourceKey: 'prompt', label: '问题', area: 'content', format: 'long_text' },
                { sourceKey: 'response_a', label: '回答 A', area: 'content', format: 'long_text' },
                { sourceKey: 'response_b', label: '回答 B', area: 'content', format: 'long_text' },
              ],
              annotationFields: [
                {
                  sourceKey: 'preferred',
                  label: '更优回答',
                  type: 'radio',
                  options: [
                    { label: 'A', value: 'A' },
                    { label: 'B', value: 'B' },
                  ],
                },
              ],
            },
          }),
        );
      }

      if (path === '/templates' && method === 'POST') {
        return Promise.resolve(jsonResponse({ data: draftTemplate }));
      }

      if (path === '/templates/template_auto_draft/publish') {
        return Promise.resolve(
          jsonResponse({
            data: {
              template: publishedTemplate,
              compatibilityReport: {
                addedFieldKeys: [],
                removedFieldKeys: [],
                changedFieldTypes: [],
                compatible: true,
                riskMessages: [],
              },
            },
          }),
        );
      }

      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPageWithTemplateRoute();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('任务标题'), '自动模板回填任务');
    await user.upload(
      screen.getByLabelText('题目数据文件'),
      new File(
        [
          JSON.stringify([
            {
              prompt: '解释什么是过拟合',
              response_a: '回答 A',
              response_b: '回答 B',
              preferred: '',
            },
          ]),
        ],
        'preference_compare.json',
        { type: 'application/json' },
      ),
    );
    expect(await screen.findByText('题目数：1')).toBeInTheDocument();

    await user.click(screen.getByLabelText('关联模板'));
    await user.click(screen.getByRole('button', { name: '根据输入文件创建模板' }));
    expect(await screen.findByRole('dialog', { name: '模板配置' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '保存并发布版本 v1' }));

    const restoredDrawer = await screen.findByRole('complementary', { name: '发布任务抽屉' });
    expect(screen.getByRole('heading', { name: '任务管理' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument();
    expect(within(restoredDrawer).getByLabelText('任务标题')).toHaveValue('自动模板回填任务');
    expect(within(restoredDrawer).getByLabelText('关联模板')).toHaveValue(
      'M-001 · 自动解析模板 · preference_compare.json · v1',
    );
    await user.click(within(restoredDrawer).getByLabelText('关联模板'));
    expect(
      screen.getByRole('option', { name: 'M-001 · 自动解析模板 · preference_compare.json · v1' }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/templates/template_auto_draft/publish',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('上传 XLSX 题目数据后立即回填题目数', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.upload(screen.getByLabelText('题目数据文件'), await createXlsxFile(2));

    await waitFor(() => expect(screen.getByText('题目数：2')).toBeInTheDocument());
    expect(screen.queryByLabelText('题目数')).not.toBeInTheDocument();
  });

  it('从 XLSX 创建模板时保留表头字段顺序并包含空列', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }] }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPageWithTemplateRoute(<div role="dialog" aria-label="模板配置" />);

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.upload(
      screen.getByLabelText('题目数据文件'),
      await createXlsxFileFromRows([
        [
          'id',
          'category',
          'difficulty',
          'lang',
          'media_type',
          'content_markdown',
          'prompt',
          'model_answer',
          'reference',
        ],
        [
          'Q0001',
          '问答质量',
          '中等',
          'zh',
          'markdown',
          '',
          '解释什么是过拟合',
          '模型回答',
          '参考答案',
        ],
      ]),
    );

    expect(await screen.findByText('题目数：1')).toBeInTheDocument();

    await user.click(screen.getByLabelText('关联模板'));
    await user.click(screen.getByRole('button', { name: '根据输入文件创建模板' }));

    expect(await screen.findByRole('dialog', { name: '模板配置' })).toBeInTheDocument();
    const handoff = JSON.parse(window.sessionStorage.getItem('labelhub.templateDraftHandoff') ?? '{}');
    expect(handoff.previewRecords[0]).toMatchObject({
      content_markdown: '',
      prompt: '解释什么是过拟合',
    });
    expect(handoff.autoClassificationRequest.fields.map((field: { sourceKey: string }) => field.sourceKey)).toEqual([
      'id',
      'category',
      'difficulty',
      'lang',
      'media_type',
      'content_markdown',
      'prompt',
      'model_answer',
      'reference',
    ]);
  });

  it('新建任务选择 preference_compare 模板并上传文件后发布', async () => {
    const user = userEvent.setup();
    const preferenceTask = {
      ...baseTask,
      id: 'task_preference',
      title: '偏好对比任务',
      templateId: 'template_preference',
      template: {
        id: 'template_preference',
        name: '偏好对比模板',
        datasetKind: 'preference_compare',
        schemaVersion: 'pref-r1',
        status: 'PUBLISHED',
      },
    };
    const createdTask = {
      ...preferenceTask,
      id: 'task_created_preference',
      title: '偏好',
      itemCount: 0,
      completedItemCount: 0,
      quota: null,
      status: 'DRAFT',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...baseTask, status: 'DRAFT' }, preferenceTask] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_preference',
              name: '偏好对比模板',
              datasetKind: 'preference_compare',
              schemaVersion: 'pref-r1',
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: createdTask }))
      .mockResolvedValueOnce(jsonResponse({ data: { importedCount: 12, errorCount: 0, preview: [] } }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...createdTask, itemCount: 12, quota: 12 } }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...createdTask, itemCount: 12, quota: 12, status: 'PUBLISHED' } }));
    vi.stubGlobal('fetch', fetchMock);

    renderTaskListPage();

    await screen.findByRole('table', { name: '任务列表' });
    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('任务标题'), '偏好');
    await chooseTaskTemplate(user, 'M-001 · 偏好对比模板 · v1');
    await user.upload(
      screen.getByLabelText('题目数据文件'),
      new File(
        [
          [
            '{',
            '"id":"P0001",',
            '"prompt":"解释什么是过拟合",',
            '"response_a":"回答 A",',
            '"response_b":"回答 B"',
            '}',
          ].join(''),
        ],
        'preference_compare.jsonl',
        { type: 'application/jsonl' },
      ),
    );
    expect(await screen.findByText('题目数：1')).toBeInTheDocument();
    await user.type(screen.getByLabelText('单条奖励'), '0.3');
    await selectDeadline(user);
    await user.click(screen.getByRole('button', { name: '立即发布 →' }));

    expect(await screen.findByText('任务已发布')).toBeInTheDocument();
    const createBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(createBody).toMatchObject({
      title: '偏好',
      templateId: 'template_preference',
      perUserLimit: null,
      quota: 1,
    });
    const importBody = JSON.parse(String(fetchMock.mock.calls[3][1]?.body));
    expect(importBody).toMatchObject({
      datasetKind: 'preference_compare',
      format: 'jsonl',
      fileName: 'preference_compare.jsonl',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/tasks/task_created_preference',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ quota: 12 }),
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

const renderTaskListPageWithTemplateRoute = (templateElement = <TemplateDesignerTestRoute />) => {
  render(
    <MemoryRouter initialEntries={['/owner/tasks']}>
      <Routes>
        <Route path="/owner/tasks" element={<TaskListPage />} />
        <Route path="/owner/templates" element={templateElement} />
      </Routes>
    </MemoryRouter>,
  );
};

const TemplateDesignerTestRoute = () => {
  const navigate = useNavigate();

  return <TemplateDesignerPage onReturnTo={(path) => navigate(path)} />;
};

const addTaskTag = async (user: ReturnType<typeof userEvent.setup>, label: string) => {
  await user.click(screen.getByRole('button', { name: '新增标签' }));
  await user.type(screen.getByLabelText('新标签'), label);
  await user.click(screen.getByRole('button', { name: '确认新增标签' }));
  const composer = screen.getByRole('form', { name: '新标签输入' });
  fireEvent.animationEnd(composer);
  const tagBubble = screen.getByText(label).closest('.task-tag-bubble');
  expect(tagBubble).not.toBeNull();
  fireEvent.animationEnd(tagBubble as HTMLElement);
};

const mockTagRect = (element: HTMLElement, left: number, width = 72) => {
  const rect = {
    bottom: 34,
    height: 34,
    left,
    right: left + width,
    top: 0,
    width,
    x: left,
    y: 0,
    toJSON: () => rect,
  } as DOMRect;

  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  });
};

const getTaskTagLabels = (): string[] =>
  Array.from(document.querySelectorAll('.task-tag-editor__bubbles .task-tag-bubble--removable .task-tag-bubble__label'))
    .map((element) => element.textContent ?? '');

const createTaskTagPointerTestEvent = (
  type: string,
  options: { button?: number; clientX: number; pointerId: number },
): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });

  Object.defineProperties(event, {
    button: { value: options.button ?? 0 },
    clientX: { value: options.clientX },
    pointerId: { value: options.pointerId },
  });

  return event;
};

const clickDrawerBackdrop = async (user: ReturnType<typeof userEvent.setup>) => {
  const backdrop = document.querySelector('.task-publish-drawer-shell');
  expect(backdrop).not.toBeNull();
  await user.click(backdrop as HTMLElement);
};

const selectDeadline = async (
  user: ReturnType<typeof userEvent.setup>,
  value = '2026-06-10T23:00:00',
) => {
  await user.click(screen.getByRole('button', { name: '选择截止时间' }));
  fireEvent.change(screen.getByLabelText('截止日期时间'), { target: { value } });
};

const chooseTaskTemplate = async (user: ReturnType<typeof userEvent.setup>, optionName: string) => {
  await user.click(screen.getByLabelText('关联模板'));
  await user.click(screen.getByRole('option', { name: optionName }));
};

const createXlsxFile = async (itemCount: number): Promise<File> => {
  const rows = [
    '<row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c></row>',
    ...Array.from({ length: itemCount }, (_, index) => {
      const rowNumber = index + 2;

      return `<row r="${rowNumber}"><c r="A${rowNumber}" t="inlineStr"><is><t>qa_${index + 1}</t></is></c></row>`;
    }),
  ].join('');
  const zip = new JSZip();
  zip.file(
    'xl/workbook.xml',
    '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  zip.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData>${rows}</sheetData></worksheet>`);

  return new File([await zip.generateAsync({ type: 'arraybuffer' })], 'qa_quality.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

const createXlsxFileFromRows = async (
  rows: readonly (readonly string[])[],
  fileName = 'qa_quality.xlsx',
): Promise<File> => {
  const sheetRows = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row
        .map((value, columnIndex) => {
          if (!value) {
            return '';
          }

          const cellRef = `${xlsxColumnName(columnIndex)}${rowNumber}`;

          return `<c r="${cellRef}" t="inlineStr"><is><t>${value}</t></is></c>`;
        })
        .join('');

      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join('');
  const zip = new JSZip();
  zip.file(
    'xl/workbook.xml',
    '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  zip.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`);

  return new File([await zip.generateAsync({ type: 'arraybuffer' })], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

const xlsxColumnName = (index: number): string => {
  let current = index + 1;
  let name = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }

  return name;
};

const createTemplateDto = ({
  id,
  name,
  datasetKind,
  schemaVersion,
  status = 'PUBLISHED',
}: {
  id: string;
  name: string;
  datasetKind: string;
  schemaVersion: string;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}) => ({
  id,
  name,
  description: null,
  datasetKind,
  schemaVersion,
  schema: { datasetKind, version: schemaVersion, fields: [] },
  status,
  version: 1,
  parentTemplateId: null,
  createdById: 'user_owner_zhang_man',
  publishedAt: '2026-05-10T00:00:00.000Z',
  createdAt: '2026-05-10T00:00:00.000Z',
  updatedAt: '2026-05-10T00:00:00.000Z',
});

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

const errorResponse = (body: unknown, status: number): Response =>
  ({
    ok: false,
    status,
    text: async () => JSON.stringify(body),
  }) as Response;

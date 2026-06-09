import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import exportIconAsset from '../../assets/export.svg';
import { ExportCenterPage } from './ExportCenterPage';

const task = {
  id: 'task_qa',
  title: '问答质量标注',
  description: '请评估问答质量',
  richTextInstruction: null,
  tags: ['问答质量'],
  rewardRule: '0.30 元 / 条',
  quota: 30,
  deadline: '2026-06-01T15:59:00.000Z',
  distributionStrategy: 'FIRST_COME_FIRST_SERVE',
  aiPreReviewEnabled: true,
  aiRuleName: '问答质量 v1',
  status: 'PUBLISHED',
  templateId: 'template_qa',
  template: {
    id: 'template_qa',
    name: '问答质量官方模板',
    schemaVersion: 'qa-r1',
    status: 'PUBLISHED',
  },
  createdById: 'user_owner_zhang_man',
  itemCount: 2,
  completedItemCount: 1,
  exportableItemCount: 1,
  createdAt: '2026-05-21T08:00:00.000Z',
  updatedAt: '2026-05-21T08:00:00.000Z',
};

const secondTask = {
  ...task,
  id: 'task_pref',
  title: '偏好对比评测',
  tags: ['偏好对比'],
  templateId: 'template_pref',
  template: {
    id: 'template_pref',
    name: '偏好对比官方模板',
    schemaVersion: 'pref-r1',
    status: 'PUBLISHED',
  },
  itemCount: 5,
  completedItemCount: 5,
  exportableItemCount: 5,
  createdAt: '2026-05-22T08:00:00.000Z',
  updatedAt: '2026-05-22T08:00:00.000Z',
};

const previewWithReview = {
  taskId: 'task_qa',
  datasetKind: 'qa_quality',
  fieldMapping: [
    { source: 'item.externalId', target: 'id', enabled: true },
    { source: 'rawData.prompt', target: 'prompt', enabled: true },
    { source: 'answers.comment', target: 'comment', enabled: true },
    { source: 'review.ai_overall', target: 'ai_overall', enabled: true },
    { source: 'review.human_verdict', target: 'human_verdict', enabled: true },
  ],
  totalFinalApproved: 30,
  rows: [
    {
      id: 'qa_final',
      prompt: '如何判断回答质量？',
      comment: '覆盖关键点。',
      ai_overall: 92,
      human_verdict: 'recheck_pass',
    },
    {
      id: 'qa_final_2',
      prompt: '如何判断回答质量？',
      comment: '覆盖关键点。',
      ai_overall: 92,
      human_verdict: 'recheck_pass',
    },
    {
      id: 'qa_final_3',
      prompt: '如何判断回答质量？',
      comment: '覆盖关键点。',
      ai_overall: 92,
      human_verdict: 'recheck_pass',
    },
    {
      id: 'qa_final_4',
      prompt: '如何判断回答质量？',
      comment: '覆盖关键点。',
      ai_overall: 92,
      human_verdict: 'recheck_pass',
    },
    {
      id: 'qa_final_5',
      prompt: '如何判断回答质量？',
      comment: '覆盖关键点。',
      ai_overall: 92,
      human_verdict: 'recheck_pass',
    },
  ],
};

const secondPreviewWithReview = {
  ...previewWithReview,
  taskId: 'task_pref',
  datasetKind: 'preference',
  fieldMapping: [
    { source: 'item.externalId', target: 'id', enabled: true },
    { source: 'rawData.prompt', target: 'prompt', enabled: true },
    { source: 'answers.choice', target: 'choice', enabled: true },
  ],
  totalFinalApproved: 5,
  rows: [],
};

const exportJobs = [
  {
    id: 'export_done',
    taskId: 'task_qa',
    requestedById: 'user_owner_zhang_man',
    status: 'SUCCEEDED',
    format: 'csv',
    idempotencyKey: null,
    fieldMapping: previewWithReview.fieldMapping,
    includeReviews: true,
    filters: null,
    filePath: 'storage/exports/export_done.csv',
    resultUrl: null,
    errorMessage: null,
    finishedAt: '2026-05-21T10:10:00.000Z',
    createdAt: '2026-05-21T10:00:00.000Z',
    updatedAt: '2026-05-21T10:10:00.000Z',
  },
  {
    id: 'export_failed',
    taskId: 'task_qa',
    requestedById: 'user_owner_zhang_man',
    status: 'FAILED',
    format: 'xlsx',
    idempotencyKey: null,
    fieldMapping: previewWithReview.fieldMapping,
    includeReviews: true,
    filters: null,
    filePath: null,
    resultUrl: null,
    errorMessage: '导出失败。',
    finishedAt: '2026-05-21T10:20:00.000Z',
    createdAt: '2026-05-21T10:15:00.000Z',
    updatedAt: '2026-05-21T10:20:00.000Z',
  },
];

describe('ExportCenterPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('展示可勾选导出记录，支持单条和批量选择格式导出', async () => {
    const user = userEvent.setup();
    const fetchMock = createFetchMock();
    const downloadClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <ExportCenterPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '导出中心' })).toBeInTheDocument();
    const pageHeader = screen.getByRole('heading', { name: '导出中心' }).closest('.export-center-header');
    expect(pageHeader).not.toBeNull();
    const pageDescription = within(pageHeader as HTMLElement).getByText(
      '本页面支持导出已标注任务的数据，格式涵盖 JSON、JSONL、CSV 及 XLSX',
    );
    expect(pageDescription).toHaveClass('task-management-table-description');
    expect(screen.queryByText('排队中')).not.toBeInTheDocument();
    expect(screen.queryByText('已成功')).not.toBeInTheDocument();
    expect(screen.queryByText('可下载')).not.toBeInTheDocument();
    expect(await screen.findByText('偏好对比评测')).toBeInTheDocument();
    expect(document.querySelector('.export-center-total')).toBeNull();
    const exportableTaskTable = screen.getByRole('table', { name: '导出记录列表' });
    const exportPanel = exportableTaskTable.closest('.export-task-table-panel');
    expect(exportPanel).not.toBeNull();
    expect(exportPanel).toHaveClass('task-management-table-card');
    expect(within(exportPanel as HTMLElement).queryByText(pageDescription.textContent ?? '')).not.toBeInTheDocument();
    const exportableTotal = within(exportPanel as HTMLElement).getByLabelText('可导出任务总数');
    expect(exportableTotal).toHaveTextContent('可导出2');
    expect(exportableTotal).toHaveClass('task-summary-card', 'task-summary-card--total');
    expect(screen.getByPlaceholderText('搜索任务名 / ID / 模板')).toBeInTheDocument();
    expect(within(exportPanel as HTMLElement).queryByRole('heading', { name: '导出记录' })).not.toBeInTheDocument();
    expect((exportPanel as HTMLElement).querySelector('.labeler-list-panel-heading__title')).toBeNull();
    expect((exportPanel as HTMLElement).querySelector('.labeler-list-panel-heading')).toBeNull();
    expect((exportPanel as HTMLElement).querySelector('.task-management-table-toolbar')).not.toBeNull();
    expect(document.querySelector('.export-records-toolbar')).toBeNull();
    expect(within(exportableTaskTable).getByRole('checkbox', { name: '选择当前页导出记录' })).toBeInTheDocument();
    expect(within(exportableTaskTable).getByRole('checkbox', { name: '选择导出任务 T-001' })).toBeInTheDocument();
    expect(within(exportableTaskTable).getByRole('button', { name: '按任务ID排序' })).toHaveClass(
      'task-table__sortable-header',
    );
    expect(within(exportableTaskTable).getByRole('button', { name: '按创建时间排序' })).toHaveClass(
      'task-table__sortable-header',
    );
    expect(within(exportableTaskTable).getByRole('button', { name: '按结束时间排序' })).toHaveClass(
      'task-table__sortable-header',
    );
    expect(within(exportableTaskTable).getByRole('button', { name: '按任务ID排序' })).toHaveTextContent('任务ID⇅');
    expect(within(exportableTaskTable).getByRole('button', { name: '按创建时间排序' })).toHaveTextContent('创建时间⇅');
    expect(within(exportableTaskTable).getByRole('button', { name: '按结束时间排序' })).toHaveTextContent('结束时间⇅');
    expect(within(exportableTaskTable).queryByRole('button', { name: '按任务排序' })).not.toBeInTheDocument();
    expect(within(exportableTaskTable).queryByRole('button', { name: '按操作排序' })).not.toBeInTheDocument();
    expect(within(exportableTaskTable).queryByText('已完成/总题目数')).not.toBeInTheDocument();
    expect(within(exportableTaskTable).queryByText('模板')).not.toBeInTheDocument();
    expect(within(exportableTaskTable).getByText('T-001')).toBeInTheDocument();
    expect(within(exportableTaskTable).getByText('T-002')).toBeInTheDocument();
    const taskNameCell = within(exportableTaskTable).getByText('偏好对比评测').closest('td');
    expect(taskNameCell).toHaveTextContent('偏好对比评测');
    expect(taskNameCell).not.toHaveTextContent('Owner：张泽鑫');
    expect(within(exportableTaskTable).queryByText(/Owner：/)).not.toBeInTheDocument();
    expect(within(exportableTaskTable).getByText('2026-05-21 08:00')).toBeInTheDocument();
    expect(within(exportableTaskTable).getAllByText('2026-06-01 15:59')).toHaveLength(2);
    expect(within(exportableTaskTable).queryByText('1 / 2')).not.toBeInTheDocument();
    expect(within(exportableTaskTable).queryByText('问答质量官方模板')).not.toBeInTheDocument();
    expect(screen.getByLabelText('可导出任务分页')).toHaveTextContent('第 1 / 1 页');
    expect(screen.queryByRole('table', { name: '导出历史' })).not.toBeInTheDocument();
    expect(screen.queryByText('暂无导出任务。')).not.toBeInTheDocument();
    const latestTaskRow = within(exportableTaskTable).getByText('偏好对比评测').closest('tr');
    expect(latestTaskRow).not.toBeNull();
    const latestTaskActions = (latestTaskRow as HTMLElement).querySelector('.task-table__actions');
    expect(latestTaskActions).not.toBeNull();
    const previewAction = within(latestTaskRow as HTMLElement).getByRole('button', { name: '预览 T-002' });
    const exportAction = within(latestTaskRow as HTMLElement).getByRole('button', { name: '导出 T-002' });
    expect(previewAction).toHaveClass('task-table-action', 'task-table-action--icon');
    expect(exportAction).toHaveClass('task-table-action', 'task-table-action--icon');
    expect((latestTaskRow as HTMLElement).querySelector('.export-row-action')).toBeNull();
    expect((exportAction.querySelector('img') as HTMLImageElement | null)?.getAttribute('src')).toBe(exportIconAsset);

    await user.click(within(exportableTaskTable).getByRole('button', { name: '预览 T-001' }));
    const previewDialog = await screen.findByRole('dialog', { name: '任务内容预览 · 问答质量标注' });
    const previewOverlay = previewDialog.parentElement as HTMLElement;
    expect(previewOverlay).toHaveClass('task-dataset-preview-overlay--drawer');
    expect(previewOverlay).toHaveClass('task-dataset-preview-overlay--entering');
    expect(previewDialog).toHaveClass('task-dataset-preview-modal--entering');
    expect(previewDialog).toHaveTextContent('T-001 · 完整可导出 30 条 · 当前仅预览前 5 条');
    const previewTable = within(previewDialog).getByRole('table', { name: '任务内容预览表格' });
    expect(previewTable).toHaveClass('task-dataset-preview-table');
    expect(previewDialog.querySelector('.export-preview-table')).toBeNull();
    expect(within(previewTable).getByRole('columnheader', { name: 'id' })).toBeInTheDocument();
    expect(within(previewTable).getByRole('columnheader', { name: 'prompt' })).toBeInTheDocument();
    expect(within(previewTable).getByRole('columnheader', { name: 'comment' })).toBeInTheDocument();
    expect(within(previewTable).queryByRole('columnheader', { name: '状态' })).not.toBeInTheDocument();
    expect(within(previewDialog).getAllByText('如何判断回答质量？')).toHaveLength(5);
    expect(within(previewDialog).getAllByText('覆盖关键点。')).toHaveLength(5);
    await user.click(within(previewDialog).getByRole('button', { name: '关闭预览' }));
    expect(previewOverlay).toHaveClass('task-dataset-preview-overlay--closing');
    expect(previewDialog).toHaveClass('task-dataset-preview-modal--closing');
    fireEvent.animationEnd(previewDialog);
    expect(screen.queryByRole('dialog', { name: '任务内容预览 · 问答质量标注' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('搜索导出任务'), '问答');
    expect(within(exportableTaskTable).getByText('问答质量标注')).toBeInTheDocument();
    expect(within(exportableTaskTable).queryByText('偏好对比评测')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('搜索导出任务'));
    expect(await within(exportableTaskTable).findByText('偏好对比评测')).toBeInTheDocument();

    await user.click(within(exportableTaskTable).getByRole('button', { name: '导出 T-002' }));
    const singleExportDialog = screen.getByRole('dialog', { name: '选择导出格式' });
    expect(singleExportDialog).toHaveTextContent('1 条导出记录');
    expect(singleExportDialog).toHaveTextContent('偏好对比评测');
    expect(singleExportDialog).toHaveTextContent('T-002');
    expect(screen.getByRole('radio', { name: 'XLSX' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'CSV' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'JSON' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'JSONL' })).toBeInTheDocument();
    expect(within(singleExportDialog).getByRole('button', { name: '取消' })).toHaveClass('export-format-dialog__action');
    expect(within(singleExportDialog).getByRole('button', { name: '确认导出' })).toHaveClass(
      'export-format-dialog__action',
    );
    await user.click(screen.getByRole('radio', { name: 'JSONL' }));
    await user.click(screen.getByRole('button', { name: '确认导出' }));

    await waitFor(() => expect(postExportCalls(fetchMock)).toHaveLength(1));
    expect(JSON.parse(postExportCalls(fetchMock)[0]?.[1]?.body as string)).toEqual(
      expect.objectContaining({ taskId: 'task_pref', format: 'jsonl' }),
    );
    await waitFor(() => expect(downloadClickSpy).toHaveBeenCalledTimes(1));
    const firstDownloadLink = downloadClickSpy.mock.contexts[0] as HTMLAnchorElement | undefined;
    expect(firstDownloadLink?.getAttribute('href')).toBe('/exports/export_new/download');
    expect(screen.getByText('导出文件已生成，正在下载')).toBeInTheDocument();

    await user.click(within(exportableTaskTable).getByRole('checkbox', { name: '选择当前页导出记录' }));
    await user.click(screen.getByRole('button', { name: '批量导出 2 项' }));
    const batchExportDialog = screen.getByRole('dialog', { name: '选择导出格式' });
    expect(batchExportDialog).toHaveTextContent('2 条导出记录');
    expect(batchExportDialog).toHaveTextContent('偏好对比评测');
    expect(batchExportDialog).toHaveTextContent('问答质量标注');
    await user.click(screen.getByRole('radio', { name: 'CSV' }));
    await user.click(screen.getByRole('button', { name: '确认导出' }));

    await waitFor(() => expect(postExportCalls(fetchMock)).toHaveLength(3));
    const batchBodies = postExportCalls(fetchMock).slice(1).map((call) => JSON.parse(call[1]?.body as string));
    expect(batchBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: 'task_pref', format: 'csv' }),
        expect.objectContaining({ taskId: 'task_qa', format: 'csv' }),
      ]),
    );
    await waitFor(() => expect(downloadClickSpy).toHaveBeenCalledTimes(3));

    expect(screen.queryByRole('table', { name: '导出历史' })).not.toBeInTheDocument();
  });

  it('导出中心沿用任务列表的 T 格式任务ID，不暴露数据库ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        const method = init?.method ?? 'GET';

        if (path === '/tasks/summaries' && method === 'GET') {
          return jsonResponse({
            data: [
              {
                ...task,
                id: 'cmpjpv2gcu0004z6pee7yxro8k',
                title: '较新的数据库 ID 任务',
                createdAt: '2026-05-24T10:00:00.000Z',
              },
              {
                ...secondTask,
                id: 'cmpjpv2gcu0001z6peexxx1111',
                title: '较早的数据库 ID 任务',
                createdAt: '2026-05-23T10:00:00.000Z',
              },
            ],
          });
        }

        return jsonResponse({ data: [] });
      }),
    );

    render(
      <MemoryRouter>
        <ExportCenterPage />
      </MemoryRouter>,
    );

    const table = await screen.findByRole('table', { name: '导出记录列表' });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByText('T-002')).toBeInTheDocument();
    expect(within(rows[2]).getByText('T-001')).toBeInTheDocument();
    expect(within(table).queryByText('cmpjpv2gcu0004z6pee7yxro8k')).not.toBeInTheDocument();
    expect(within(table).queryByText('cmpjpv2gcu0001z6peexxx1111')).not.toBeInTheDocument();
  });

  it('导出中心仅允许任务ID、创建时间和结束时间按指定方向排序', async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        const method = init?.method ?? 'GET';

        if (path === '/tasks/summaries' && method === 'GET') {
          return jsonResponse({
            data: [
              {
                ...task,
                id: 'task_c',
                title: '导出任务 C',
                createdAt: '2026-06-03T00:00:00.000Z',
                deadline: '2026-06-12T00:00:00.000Z',
                exportableItemCount: 3,
              },
              {
                ...task,
                id: 'task_a',
                title: '导出任务 A',
                createdAt: '2026-06-01T00:00:00.000Z',
                deadline: '2026-06-11T00:00:00.000Z',
                exportableItemCount: 1,
              },
              {
                ...task,
                id: 'task_b',
                title: '导出任务 B',
                createdAt: '2026-06-02T00:00:00.000Z',
                deadline: '2026-06-13T00:00:00.000Z',
                exportableItemCount: 2,
              },
            ],
          });
        }

        return jsonResponse({ data: [] });
      }),
    );

    render(
      <MemoryRouter>
        <ExportCenterPage />
      </MemoryRouter>,
    );

    const table = await screen.findByRole('table', { name: '导出记录列表' });
    const getTaskTitles = () =>
      Array.from(table.querySelectorAll('tbody tr:not(.task-table__empty-row)')).map(
        (row) => row.querySelector('td:nth-child(3) strong')?.textContent?.trim() ?? '',
      );

    expect(getTaskTitles()).toEqual(['导出任务 C', '导出任务 B', '导出任务 A']);

    const taskIdSortButton = within(table).getByRole('button', { name: '按任务ID排序' });
    const createdAtSortButton = within(table).getByRole('button', { name: '按创建时间排序' });
    const endedAtSortButton = within(table).getByRole('button', { name: '按结束时间排序' });

    expect(taskIdSortButton).toHaveTextContent('任务ID⇅');
    expect(createdAtSortButton).toHaveTextContent('创建时间⇅');
    expect(endedAtSortButton).toHaveTextContent('结束时间⇅');

    await user.click(taskIdSortButton);
    expect(getTaskTitles()).toEqual(['导出任务 A', '导出任务 B', '导出任务 C']);
    expect(taskIdSortButton).toHaveTextContent('任务ID↑');

    await user.click(taskIdSortButton);
    expect(getTaskTitles()).toEqual(['导出任务 C', '导出任务 B', '导出任务 A']);
    expect(taskIdSortButton).toHaveTextContent('任务ID↓');

    await user.click(createdAtSortButton);
    expect(getTaskTitles()).toEqual(['导出任务 A', '导出任务 B', '导出任务 C']);
    expect(taskIdSortButton).toHaveTextContent('任务ID⇅');
    expect(createdAtSortButton).toHaveTextContent('创建时间↑');

    await user.click(createdAtSortButton);
    expect(getTaskTitles()).toEqual(['导出任务 C', '导出任务 B', '导出任务 A']);
    expect(createdAtSortButton).toHaveTextContent('创建时间↓');

    await user.click(endedAtSortButton);
    expect(getTaskTitles()).toEqual(['导出任务 A', '导出任务 C', '导出任务 B']);
    expect(createdAtSortButton).toHaveTextContent('创建时间⇅');
    expect(endedAtSortButton).toHaveTextContent('结束时间↑');

    await user.click(endedAtSortButton);
    expect(getTaskTitles()).toEqual(['导出任务 B', '导出任务 C', '导出任务 A']);
    expect(endedAtSortButton).toHaveTextContent('结束时间↓');

    await user.click(endedAtSortButton);
    expect(getTaskTitles()).toEqual(['导出任务 A', '导出任务 C', '导出任务 B']);
    expect(endedAtSortButton).toHaveTextContent('结束时间↑');
  });

  it('没有可导出复审结果时仍展示空表格', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        const method = init?.method ?? 'GET';

        if (path === '/tasks/summaries' && method === 'GET') {
          return jsonResponse({ data: [{ ...task, id: 'task_draft', status: 'PUBLISHED', exportableItemCount: 0 }] });
        }

        if (path === '/exports' && method === 'GET') {
          return jsonResponse({ data: [] });
        }

        return jsonResponse({ data: {} });
      }),
    );

    render(
      <MemoryRouter>
        <ExportCenterPage />
      </MemoryRouter>,
    );

    const exportableTaskTable = await screen.findByRole('table', { name: '导出记录列表' });
    expect(exportableTaskTable.closest('.task-management-table-card')).not.toBeNull();
    expect(within(exportableTaskTable).getByRole('img', { name: '空导出记录列表插画' })).toHaveAttribute(
      'src',
      expect.stringContaining('empty-table-illustration.svg'),
    );
    expect(within(exportableTaskTable).getByText('暂无可导出任务')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '批量导出' })).toBeDisabled();
    expect(screen.getByLabelText('可导出任务分页')).toHaveTextContent('第 1 / 1 页');
    expect(screen.queryByRole('region', { name: '导出配置' })).not.toBeInTheDocument();
  });

  it('导出中心任务接口不可用时降级为空表格且不展示代理 500 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 500 })));

    render(
      <MemoryRouter>
        <ExportCenterPage />
      </MemoryRouter>,
    );

    const exportableTaskTable = await screen.findByRole('table', { name: '导出记录列表' });
    expect(within(exportableTaskTable).getByRole('img', { name: '空导出记录列表插画' })).toHaveAttribute(
      'src',
      expect.stringContaining('empty-table-illustration.svg'),
    );
    expect(within(exportableTaskTable).getByText('暂无可导出任务')).toBeInTheDocument();
    expect(screen.queryByText('任务接口请求失败，请稍后重试。（HTTP 500）。')).not.toBeInTheDocument();
    const toast = screen.getByRole('alert');
    expect(toast).toHaveClass('toast');
    expect(toast).toHaveTextContent('导出中心加载失败，请稍后重试');
    expect(document.querySelector('.task-status-message')).toBeNull();
  });
});

function createFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = input.toString();
    const method = init?.method ?? 'GET';

    if (path === '/tasks/summaries' && method === 'GET') {
      return jsonResponse({ data: [task, secondTask] });
    }
    if (path === '/exports' && method === 'GET') {
      return jsonResponse({ data: exportJobs });
    }
    if (path.startsWith('/tasks/task_qa/export-preview') && method === 'GET') {
      const url = new URL(path, 'http://localhost');
      const includeReviews = url.searchParams.get('includeReviews') === 'true';
      return jsonResponse({
        data: includeReviews
          ? previewWithReview
          : {
              ...previewWithReview,
              rows: previewWithReview.rows.map(({ ai_overall: _aiOverall, human_verdict: _humanVerdict, ...row }) => row),
            },
      });
    }
    if (path.startsWith('/tasks/task_pref/export-preview') && method === 'GET') {
      return jsonResponse({ data: secondPreviewWithReview });
    }
    if (path === '/exports' && method === 'POST') {
      return jsonResponse({ data: { ...exportJobs[0], id: 'export_new', status: 'SUCCEEDED' } });
    }
    if (path === '/exports/export_failed/retry' && method === 'POST') {
      return jsonResponse({ data: { ...exportJobs[1], status: 'QUEUED', errorMessage: null } });
    }

    return jsonResponse({ data: {} });
  });
}

function postExportCalls(fetchMock: ReturnType<typeof createFetchMock>) {
  return fetchMock.mock.calls.filter(([path, init]) => path === '/exports' && init?.method === 'POST');
}

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

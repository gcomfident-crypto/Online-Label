import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  totalFinalApproved: 1,
  rows: [
    {
      id: 'qa_final',
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
    expect(screen.queryByText('排队中')).not.toBeInTheDocument();
    expect(screen.queryByText('已成功')).not.toBeInTheDocument();
    expect(screen.queryByText('可下载')).not.toBeInTheDocument();
    expect(await screen.findByText('偏好对比评测')).toBeInTheDocument();
    expect(document.querySelector('.export-center-total')).toBeNull();
    const exportableTaskTable = screen.getByRole('table', { name: '导出记录列表' });
    const exportPanel = exportableTaskTable.closest('.export-task-table-panel');
    expect(exportPanel).not.toBeNull();
    expect(exportPanel).toHaveClass('task-management-table-card');
    const exportableTotal = within(exportPanel as HTMLElement).getByLabelText('可导出数据总数');
    expect(exportableTotal).toHaveTextContent('可导出6');
    expect(exportableTotal).toHaveClass('task-summary-card', 'task-summary-card--total');
    expect(screen.getByPlaceholderText('搜索任务名 / ID / 模板')).toBeInTheDocument();
    expect(within(exportPanel as HTMLElement).queryByRole('heading', { name: '导出记录' })).not.toBeInTheDocument();
    expect((exportPanel as HTMLElement).querySelector('.labeler-list-panel-heading__title')).toBeNull();
    expect((exportPanel as HTMLElement).querySelector('.labeler-list-panel-heading')).toBeNull();
    expect((exportPanel as HTMLElement).querySelector('.task-management-table-toolbar')).not.toBeNull();
    expect(document.querySelector('.export-records-toolbar')).toBeNull();
    expect(within(exportableTaskTable).getByRole('checkbox', { name: '选择当前页导出记录' })).toBeInTheDocument();
    expect(within(exportableTaskTable).getByRole('checkbox', { name: '选择导出任务 T-0001' })).toBeInTheDocument();
    expect(within(exportableTaskTable).getByText('任务ID')).toBeInTheDocument();
    expect(within(exportableTaskTable).getByText('T-0001')).toBeInTheDocument();
    expect(within(exportableTaskTable).getByText('T-0002')).toBeInTheDocument();
    expect(within(exportableTaskTable).getByText('2026-05-21 08:00')).toBeInTheDocument();
    expect(within(exportableTaskTable).getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByLabelText('可导出任务分页')).toHaveTextContent('第 1 / 1 页');
    expect(screen.queryByRole('table', { name: '导出历史' })).not.toBeInTheDocument();
    expect(screen.queryByText('暂无导出任务。')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('搜索导出任务'), '问答');
    expect(within(exportableTaskTable).getByText('问答质量标注')).toBeInTheDocument();
    expect(within(exportableTaskTable).queryByText('偏好对比评测')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('搜索导出任务'));
    expect(await within(exportableTaskTable).findByText('偏好对比评测')).toBeInTheDocument();

    await user.click(within(exportableTaskTable).getByRole('button', { name: '导出 T-0002' }));
    expect(screen.getByRole('dialog', { name: '选择导出格式' })).toHaveTextContent('1 条导出记录');
    expect(screen.getByRole('radio', { name: 'XLSX' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'CSV' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'JSON' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'JSONL' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'JSON' }));
    await user.click(screen.getByRole('button', { name: '确认导出' }));

    await waitFor(() => expect(postExportCalls(fetchMock)).toHaveLength(1));
    expect(JSON.parse(postExportCalls(fetchMock)[0]?.[1]?.body as string)).toEqual(
      expect.objectContaining({ taskId: 'task_pref', format: 'json' }),
    );
    await waitFor(() => expect(downloadClickSpy).toHaveBeenCalledTimes(1));
    const firstDownloadLink = downloadClickSpy.mock.contexts[0] as HTMLAnchorElement | undefined;
    expect(firstDownloadLink?.getAttribute('href')).toBe('/exports/export_new/download');
    expect(screen.getByText('导出文件已生成，正在下载')).toBeInTheDocument();

    await user.click(within(exportableTaskTable).getByRole('checkbox', { name: '选择当前页导出记录' }));
    await user.click(screen.getByRole('button', { name: '批量导出 2 项' }));
    expect(screen.getByRole('dialog', { name: '选择导出格式' })).toHaveTextContent('2 条导出记录');
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

        if (path === '/tasks' && method === 'GET') {
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
    expect(within(rows[1]).getByText('T-0002')).toBeInTheDocument();
    expect(within(rows[2]).getByText('T-0001')).toBeInTheDocument();
    expect(within(table).queryByText('cmpjpv2gcu0004z6pee7yxro8k')).not.toBeInTheDocument();
    expect(within(table).queryByText('cmpjpv2gcu0001z6peexxx1111')).not.toBeInTheDocument();
  });

  it('没有可导出复审结果时仍展示空表格', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        const method = init?.method ?? 'GET';

        if (path === '/tasks' && method === 'GET') {
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

    if (path === '/tasks' && method === 'GET') {
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

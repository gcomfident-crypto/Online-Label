import { render, screen, within } from '@testing-library/react';
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
  createdById: 'user_owner_001',
  itemCount: 2,
  createdAt: '2026-05-21T08:00:00.000Z',
  updatedAt: '2026-05-21T08:00:00.000Z',
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
      human_verdict: 'final_pass',
    },
  ],
};

const exportJobs = [
  {
    id: 'export_done',
    taskId: 'task_qa',
    requestedById: 'user_owner_001',
    status: 'SUCCEEDED',
    format: 'csv',
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
    requestedById: 'user_owner_001',
    status: 'FAILED',
    format: 'xlsx',
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

  it('展示导出预览和历史，支持切换审核记录、创建导出与重试失败任务', async () => {
    const user = userEvent.setup();
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <ExportCenterPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '导出中心' })).toBeInTheDocument();
    expect(await screen.findByText('qa_final')).toBeInTheDocument();
    expect(screen.queryByText('qa_pending')).not.toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: '导出预览' })).getByText('ai_overall')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '下载' })).toHaveAttribute('href', '/exports/export_done/download');

    await user.click(screen.getByLabelText('包含审核记录'));
    expect(await screen.findByText('审核字段已隐藏')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('导出格式'), 'csv');
    await user.click(screen.getByRole('button', { name: '创建导出任务' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/exports',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"format":"csv"'),
      }),
    );

    const history = screen.getByRole('table', { name: '导出历史' });
    await user.click(within(history).getByRole('button', { name: '重试 export_failed' }));
    expect(fetchMock).toHaveBeenCalledWith('/exports/export_failed/retry', expect.objectContaining({ method: 'POST' }));
  });
});

function createFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = input.toString();
    const method = init?.method ?? 'GET';

    if (path === '/tasks' && method === 'GET') {
      return jsonResponse({ data: [task] });
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
    if (path === '/exports' && method === 'POST') {
      return jsonResponse({ data: { ...exportJobs[0], id: 'export_new', status: 'QUEUED' } });
    }
    if (path === '/exports/export_failed/retry' && method === 'POST') {
      return jsonResponse({ data: { ...exportJobs[1], status: 'QUEUED', errorMessage: null } });
    }

    return jsonResponse({ data: {} });
  });
}

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiReviewBatchDto } from '../../api/aiReview';
import type { TaskDto } from '../../api/tasks';
import { AgentDashboardPage } from './AgentDashboardPage';

describe('AgentDashboardPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-06-05T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('从真实 AI 预审、任务接口聚合看板数据，不再展示本地 mock 指标', async () => {
    const fetchMock = createDashboardFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    render(<AgentDashboardPage />);

    const page = screen.getByRole('region', { name: 'AI 预审数据看板' });
    expect(page).toHaveClass('agent-dashboard-page');
    expect(within(page).queryByText('AI Review Command Center')).not.toBeInTheDocument();
    expect(within(page).queryByRole('heading', { name: '数据看板' })).not.toBeInTheDocument();
    expect(within(page).getByText('集中查看任务运行、质检结果、异常原因和交付趋势')).toBeInTheDocument();

    await screen.findByText('今日预审批次');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/ai-review/batches', expect.objectContaining({ method: 'GET' })));
    expect(fetchMock).toHaveBeenCalledWith('/tasks/summaries', expect.objectContaining({ method: 'GET' }));
    expect(fetchMock).not.toHaveBeenCalledWith('/ai-review/jobs', expect.objectContaining({ method: 'GET' }));
    expect(fetchMock.mock.calls.some(([path]) => String(path).startsWith('/ai-review/batches/batch_'))).toBe(false);

    const metrics = within(page).getByRole('list', { name: '核心 KPI' });
    ['今日预审批次', '今日处理题目数', '通过率', '打回率', '平均处理时长'].forEach((label) => {
      expect(within(metrics).getByText(label)).toBeInTheDocument();
    });
    expect(within(metrics).queryByText('失败率')).not.toBeInTheDocument();
    expect(within(metrics).getByText('2')).toBeInTheDocument();
    expect(within(metrics).getByText('10')).toBeInTheDocument();
    expect(within(metrics).getByText('60.0%')).toBeInTheDocument();
    expect(within(metrics).getByText('40.0%')).toBeInTheDocument();
    expect(within(metrics).getByText('2m42s')).toBeInTheDocument();
    expect(within(metrics).queryByText('128')).not.toBeInTheDocument();

    expect(within(page).getByRole('img', { name: '处理趋势图' })).toBeInTheDocument();
    expect(within(page).getByText('处理趋势')).toBeInTheDocument();
    expect(within(page).getByText('近 7 天处理量与通过率变化')).toBeInTheDocument();

    expect(within(page).getByRole('img', { name: '质检结果分布图' })).toBeInTheDocument();
    expect(within(page).getByText('质检结果分布')).toBeInTheDocument();
    expect(within(page).getByText('总计')).toBeInTheDocument();
    expect(within(page).getByText('15')).toBeInTheDocument();
    expect(within(page).queryByText('2,090')).not.toBeInTheDocument();
    ['建议通过', '建议打回', '待人工复核', '失败'].forEach((label) => {
      expect(within(page).getByText(label)).toBeInTheDocument();
    });

    const problemList = within(page).getByRole('list', { name: '高频问题原因 Top 5' });
    expect(within(problemList).getByText('AI 建议打回')).toBeInTheDocument();
    expect(within(problemList).getByText('4')).toBeInTheDocument();
    expect(within(problemList).getByText('模型超时')).toBeInTheDocument();

    const riskTable = within(page).getByRole('table', { name: '高风险任务' });
    expect(riskTable).toBeInTheDocument();
    expect(within(riskTable).getByText('城市道路-视频标注')).toBeInTheDocument();
    expect(within(riskTable).getByText('66.7%')).toBeInTheDocument();

    const abnormalTable = within(page).getByRole('table', { name: '异常批次' });
    expect(abnormalTable).toBeInTheDocument();
    expect(within(abnormalTable).getByText('AI 建议打回')).toBeInTheDocument();
    expect(within(page).getByRole('button', { name: '查看 城市道路-视频标注 AI 建议打回' })).toBeInTheDocument();

    const statusOverview = within(page).getByRole('region', { name: '任务状态概览' });
    expect(within(statusOverview).getByText('总任务数：4')).toBeInTheDocument();
    ['待处理', '处理中', '已完成', '需复核', '异常'].forEach((label) => {
      expect(within(statusOverview).getAllByText(label).length).toBeGreaterThan(0);
    });
  });

  it('支持真实数据的时间范围切换、导出报告和趋势图 tooltip', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fetchMock = createDashboardFetchMock();
    const downloadSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    let capturedBlob: Blob | MediaSource | null = null;
    if (typeof (URL as unknown as { createObjectURL?: (blob: Blob) => string }).createObjectURL !== 'function') {
      vi.stubGlobal('URL', {
        ...(globalThis as WindowOrWorkerGlobalScope & { URL: object }).URL,
        createObjectURL: (blob: Blob | MediaSource) => {
          capturedBlob = blob;
          return 'blob:dashboard-report';
        },
      });
    }
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      capturedBlob = blob;
      return 'blob:dashboard-report';
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AgentDashboardPage />);
    await screen.findByText('近 7 天处理量与通过率变化');

    await user.click(screen.getByRole('button', { name: '近 30 天' }));
    expect(screen.getByRole('button', { name: '近 30 天' })).toHaveClass('is-active');
    expect(screen.getByRole('button', { name: '近 7 天' })).not.toHaveClass('is-active');
    expect(await screen.findByText('近 30 天处理量与通过率变化')).toBeInTheDocument();
    expect(screen.getByText('26')).toBeInTheDocument();

    const exportButton = screen.getByRole('button', { name: '导出报告' });
    await user.click(exportButton);
    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/已生成报告：数据看板报告-\d{4}-\d{2}-\d{2}\.html/)).toBeInTheDocument();
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(capturedBlob).not.toBeNull();
    expect(await screen.findByRole('button', { name: '导出报告' })).toBeEnabled();
  });
});

const tasks: TaskDto[] = [
  createTask({ id: 'task_auto', title: '自动驾驶-道路场景标注', status: 'PUBLISHED', itemCount: 12, completedItemCount: 3 }),
  createTask({ id: 'task_city', title: '城市道路-视频标注', status: 'PAUSED', itemCount: 6, completedItemCount: 0 }),
  createTask({ id: 'task_done', title: '车辆检测-多模态数据', status: 'ENDED', itemCount: 8, completedItemCount: 8 }),
  createTask({ id: 'task_draft', title: '行人属性-图像标注', status: 'DRAFT', itemCount: 4, completedItemCount: 0 }),
];

const batches: AiReviewBatchDto[] = [
  createBatch({
    batchId: 'batch_auto_today',
    taskId: 'task_auto',
    taskTitle: '自动驾驶-道路场景标注',
    labelerName: '王昱阳',
    itemCount: 6,
    aggregateDecision: 'pass',
    status: 'PASSED',
    aggregateScore: 92,
    submittedAt: '2026-06-05T01:20:00.000Z',
    updatedAt: '2026-06-05T01:36:00.000Z',
  }),
  createBatch({
    batchId: 'batch_city',
    taskId: 'task_city',
    taskTitle: '城市道路-视频标注',
    labelerName: '鑫泽张',
    itemCount: 4,
    aggregateDecision: 'reject',
    status: 'REJECTED',
    aggregateScore: 61,
    submittedAt: '2026-06-05T02:10:00.000Z',
    updatedAt: '2026-06-05T02:21:00.000Z',
  }),
  createBatch({
    batchId: 'batch_auto_yesterday',
    taskId: 'task_auto',
    taskTitle: '自动驾驶-道路场景标注',
    labelerName: '王昱阳',
    itemCount: 3,
    aggregateDecision: 'pass',
    status: 'PASSED',
    aggregateScore: 88,
    submittedAt: '2026-06-04T02:20:00.000Z',
    updatedAt: '2026-06-04T02:32:00.000Z',
  }),
  createBatch({
    batchId: 'batch_failed',
    taskId: 'task_city',
    taskTitle: '城市道路-视频标注',
    labelerName: '鑫泽张',
    itemCount: 2,
    aggregateDecision: 'failed',
    status: 'FAILED',
    failureReason: '模型超时',
    aggregateScore: null,
    submittedAt: '2026-06-04T03:20:00.000Z',
    updatedAt: '2026-06-04T03:24:00.000Z',
  }),
  createBatch({
    batchId: 'batch_old_pending',
    taskId: 'task_draft',
    taskTitle: '行人属性-图像标注',
    labelerName: '陈晨',
    itemCount: 11,
    aggregateDecision: 'pending',
    status: 'PENDING',
    aggregateScore: null,
    submittedAt: '2026-05-20T04:10:00.000Z',
    updatedAt: '2026-05-20T04:10:00.000Z',
  }),
];

function createDashboardFetchMock() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^\/api/, '');
    if (path === '/ai-review/batches') {
      return jsonResponse({ data: batches });
    }
    if (path === '/tasks/summaries') {
      return jsonResponse({ data: tasks });
    }

    return new Response('', { status: 404 });
  });
}

function createTask(input: Partial<TaskDto>): TaskDto {
  return {
    id: input.id ?? 'task',
    title: input.title ?? '任务',
    description: null,
    richTextInstruction: null,
    tags: [],
    rewardRule: null,
    rewardPerItem: null,
    perUserLimit: null,
    quota: null,
    deadline: null,
    distributionStrategy: 'FIRST_COME_FIRST_SERVE',
    aiPreReviewEnabled: true,
    aiRuleName: '真实规则',
    status: input.status ?? 'PUBLISHED',
    templateId: 'template_1',
    template: {
      id: 'template_1',
      name: '真实模板',
      datasetKind: 'qa_quality',
      schemaVersion: 'r1',
      status: 'PUBLISHED',
    },
    createdById: 'user_owner_zhang_man',
    itemCount: input.itemCount ?? 0,
    assignedItemCount: 0,
    submittedItemCount: 0,
    completedItemCount: input.completedItemCount ?? 0,
    exportableItemCount: 0,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
    ...input,
  };
}

function createBatch(input: Partial<AiReviewBatchDto> & Pick<AiReviewBatchDto, 'batchId' | 'taskId' | 'taskTitle'>): AiReviewBatchDto {
  const decision = input.aggregateDecision ?? 'pending';

  return {
    batchId: input.batchId,
    displayId: `SUB-${input.batchId}`,
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    taskCreatedAt: input.taskCreatedAt ?? '2026-06-04T16:00:00.000Z',
    templateName: input.templateName ?? '问答质量官方模板',
    ownerId: input.ownerId ?? 'user_owner_zhang_man',
    ownerName: input.ownerName ?? '张泽鑫',
    labelerId: 'user_labeler',
    labelerName: input.labelerName ?? '未记录',
    submittedAt: input.submittedAt ?? '2026-06-05T00:00:00.000Z',
    itemCount: input.itemCount ?? 1,
    externalIds: ['item_1'],
    status: input.status ?? 'PENDING',
    aggregateDecision: decision,
    aggregateScore: input.aggregateScore ?? null,
    failureReason: input.failureReason ?? null,
    aiSuggestionLabel: decision === 'pass' ? '建议通过' : decision === 'reject' ? '建议打回' : decision === 'failed' ? '失败' : '等待预审',
    templateVersion: 'r1',
    provider: 'mock',
    model: 'mock-stable-reviewer',
    updatedAt: input.updatedAt ?? input.submittedAt ?? '2026-06-05T00:00:00.000Z',
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiReviewBatchDetailDto, AiReviewBatchDto } from '../../api/aiReview';
import { AiReviewQueuePage } from './AiReviewQueuePage';

const pendingBatch = {
  batchId: 'task-submit:task_qa:user_labeler_li_lei:round1',
  displayId: 'SUB-2041-00607',
  taskId: 'task_qa',
  taskTitle: '问答质量标注',
  labelerId: 'user_labeler_li_lei',
  labelerName: '李雷',
  submittedAt: '2026-05-21T10:01:02.000Z',
  itemCount: 3,
  externalIds: ['qa_1', 'qa_2', 'qa_3'],
  status: 'PENDING',
  aggregateDecision: 'pending',
  aggregateScore: null,
  failureReason: null,
  aiSuggestionLabel: '等待预审',
  templateVersion: 'r12',
  provider: 'mock',
  model: 'mock-stable-reviewer',
  updatedAt: '2026-05-21T10:01:02.000Z',
} satisfies AiReviewBatchDto;

const rejectedBatch = {
  ...pendingBatch,
  batchId: 'task-submit:task_pref:user_labeler_li_lei:round1',
  displayId: 'SUB-2041-00608',
  taskId: 'task_pref',
  taskTitle: '偏好安全评测',
  itemCount: 2,
  externalIds: ['pref_1', 'pref_2'],
  status: 'REJECTED',
  aggregateDecision: 'reject',
  aggregateScore: 62,
  aiSuggestionLabel: '建议打回',
  updatedAt: '2026-05-21T11:01:02.000Z',
} satisfies AiReviewBatchDto;

const batches = [pendingBatch, rejectedBatch] satisfies AiReviewBatchDto[];

const pendingDetail = {
  ...pendingBatch,
  aggregateDecision: 'pass',
  aggregateScore: 91,
  aiSuggestionLabel: '建议通过',
  status: 'PASSED',
  items: [
    createDetailItem(1, 'qa_1', 'pass', 96),
    createDetailItem(2, 'qa_2', 'pass', 88),
    createDetailItem(3, 'qa_3', 'pass', 90),
  ],
} satisfies AiReviewBatchDetailDto;

describe('AiReviewQueuePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('按任务提交批次展示 AI 预审队列，而不是逐题展示', async () => {
    vi.stubGlobal('fetch', createFetchMock());

    render(<AiReviewQueuePage />);

    expect(await screen.findByRole('heading', { name: 'AI 自动预审队列' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'AI 预审状态筛选' })).not.toBeInTheDocument();
    const searchInput = screen.getByPlaceholderText('搜索任务名 / 任务ID / 批次ID / 标注员 / 题目ID');
    expect(searchInput.closest('.task-management-table-card')).toHaveClass('agent-review-table-panel');
    expect(searchInput.closest('.task-management-table-toolbar')).toHaveClass('agent-review-table-toolbar');
    expect(screen.queryByRole('button', { name: '刷新任务级 AI 预审队列' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '刷新' })).not.toBeInTheDocument();

    const table = screen.getByRole('table', { name: '任务级 AI 预审队列表格' });
    ['批次 ID', '任务名称', '标注员', '提交时间', '题目数', '当前状态', 'AI 建议', '综合分 / 失败原因', '操作']
      .forEach((header) => expect(within(table).getByText(header)).toBeInTheDocument());
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('问答质量标注')).toBeInTheDocument();
    expect(within(table).getByText('偏好安全评测')).toBeInTheDocument();
    expect(within(table).getByText('3 题')).toBeInTheDocument();
    expect(within(table).queryByText('qa_1')).not.toBeInTheDocument();
  });

  it('搜索作用于聚合后的任务级记录', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', createFetchMock());

    render(<AiReviewQueuePage />);

    const table = await screen.findByRole('table', { name: '任务级 AI 预审队列表格' });
    expect(within(table).getByText('问答质量标注')).toBeInTheDocument();
    expect(within(table).getByText('偏好安全评测')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('搜索任务名 / 任务ID / 批次ID / 标注员 / 题目ID'), 'pref_2');
    expect(within(table).getByText('偏好安全评测')).toBeInTheDocument();
    expect(within(table).queryByText('问答质量标注')).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('搜索任务名 / 任务ID / 批次ID / 标注员 / 题目ID'));
    await user.type(screen.getByPlaceholderText('搜索任务名 / 任务ID / 批次ID / 标注员 / 题目ID'), '不存在');
    expect(within(table).getByText('暂无任务级 AI 预审记录')).toBeInTheDocument();
  });

  it('点击任务级表格行后从底部打开全页面详情层，并展示多题切换和详情模块', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', createFetchMock());

    render(<AiReviewQueuePage />);

    const table = await screen.findByRole('table', { name: '任务级 AI 预审队列表格' });
    await user.click(within(table).getByRole('button', { name: '问答质量标注' }));

    const dialog = await screen.findByRole('dialog', { name: /SUB-2041-00607 · 问答质量标注/ });
    expect(dialog).toHaveClass('agent-review-batch-sheet');
    expect(dialog.closest('.agent-review-sheet-overlay')?.parentElement).toBe(document.body);
    expect(within(dialog).getByText(/提交于/)).toHaveTextContent('共 3 题');
    expect(within(dialog).getByText('AI 建议：通过')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '关闭 AI 预审详情' })).toHaveTextContent('×');
    expect(dialog.querySelector('.agent-review-question-tabs')).not.toBeInTheDocument();
    expect(dialog.querySelector('.agent-review-question-list')).toBeInTheDocument();
    expect(within(dialog).getByRole('tablist', { name: '题目审核状态统计' })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: /待审核\s*0/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: /已通过\s*3/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: /已打回\s*0/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: /转人工\s*0/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: /失败\s*0/ })).toBeInTheDocument();
    expect(within(dialog).getByText('题目列表')).toBeInTheDocument();
    const questionTabList = within(dialog).getByRole('tablist', { name: '批次内题目切换' });
    expect(within(questionTabList).getByRole('tab', { name: /Q1/ })).toBeInTheDocument();
    expect(within(questionTabList).getByRole('tab', { name: /Q2/ })).toBeInTheDocument();
    expect(within(questionTabList).getByRole('tab', { name: /Q3/ })).toBeInTheDocument();

    ['提交内容', '维度评分（共 100）', 'AI 评语', '审核 Prompt 模板', '处理日志 / 审计']
      .forEach((title) => expect(within(dialog).getByText(title)).toBeInTheDocument());
    expect(within(dialog).getByText(/解释什么是过拟合/)).toBeInTheDocument();
    expect(within(dialog).getByText(/function_calling · 结构化/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: /Q2/ }));
    expect(within(dialog).getByText(/第二题 prompt/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '关闭 AI 预审详情' }));
    expect(dialog).toHaveClass('is-closing');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('table', { name: '任务级 AI 预审队列表格' })).toBeInTheDocument();
  });

  it('点击弹层主体以外区域时关闭详情层并播放退出动画', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', createFetchMock());

    render(<AiReviewQueuePage />);

    const table = await screen.findByRole('table', { name: '任务级 AI 预审队列表格' });
    await user.click(within(table).getByRole('button', { name: '问答质量标注' }));

    const dialog = await screen.findByRole('dialog', { name: /SUB-2041-00607 · 问答质量标注/ });
    await user.click(document.body);

    expect(dialog).toHaveClass('is-closing');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('空数据时显示统一空状态 SVG', async () => {
    vi.stubGlobal('fetch', createFetchMock([]));

    render(<AiReviewQueuePage />);

    const table = await screen.findByRole('table', { name: '任务级 AI 预审队列表格' });
    expect(within(table).getByRole('img', { name: '空预审队列插画' })).toHaveAttribute(
      'src',
      expect.stringContaining('empty-table-illustration.svg'),
    );
    expect(within(table).getByText('暂无任务级 AI 预审记录')).toBeInTheDocument();
  });

  it('接口 500 时使用友好提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { message: 'server exploded' } }, 500)),
    );

    render(<AiReviewQueuePage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('AI 预审队列加载失败，请稍后重试');
    expect(screen.queryByText(/HTTP 500/)).not.toBeInTheDocument();
  });
});

function createDetailItem(
  index: number,
  externalId: string,
  decision: AiReviewBatchDetailDto['items'][number]['decision'],
  overall: number,
): AiReviewBatchDetailDto['items'][number] {
  return {
    index,
    decision,
    overallScore: overall,
    job: {
      id: `job_${externalId}`,
      submissionId: `submission_${externalId}`,
      taskId: 'task_qa',
      taskTitle: '问答质量标注',
      externalId,
      datasetKind: 'qa_quality',
      submissionStatus: 'HUMAN_PENDING',
      round: 1,
      status: 'SUCCEEDED',
      attempts: 1,
      maxAttempts: 3,
      idempotencyKey: `submission_${externalId}:1:ai-review`,
      structuredOutputMode: 'function_calling',
      provider: 'mock',
      model: 'mock-stable-reviewer',
      lastError: null,
      queuedAt: '2026-05-21T10:01:02.000Z',
      startedAt: '2026-05-21T10:01:03.000Z',
      finishedAt: '2026-05-21T10:01:04.000Z',
      updatedAt: '2026-05-21T10:01:04.000Z',
    },
    submission: {
      id: `submission_${externalId}`,
      assignmentId: `assignment_${externalId}`,
      status: 'HUMAN_PENDING',
      round: 1,
      answers: { preferred: 'response_a', note: index === 2 ? '第二题答案' : '答案完整' },
      schemaVersion: 'r12',
      submittedAt: '2026-05-21T10:01:02.000Z',
    },
    taskItem: {
      id: `item_${externalId}`,
      externalId,
      datasetKind: 'qa_quality',
      rawData: {
        prompt: index === 2 ? '第二题 prompt' : '解释什么是过拟合',
        response_a: '模型在训练集表现很好但泛化差。',
      },
    },
    reviewRecord: {
      id: `record_${externalId}`,
      ruleId: '电商相关性 v2',
      stage: 'AI_PRECHECK',
      reviewerType: 'AI',
      scores: { relevance: 94, accuracy: 92, format: 90, safety: 98, overall },
      decision,
      comment: 'AI 预审通过，进入人工复审。',
      rawPrompt: '你是电商商品标题审核员，请基于以下维度为提交内容打分。',
      rawOutput: '{"verdict":"pass"}',
      structuredOutput: { verdict: 'pass', scores: { overall } },
      modelMetadata: { provider: 'mock', model: 'mock-stable-reviewer' },
      retryCount: 1,
      idempotencyKey: `submission_${externalId}:1:ai-review`,
      createdAt: '2026-05-21T10:01:04.000Z',
    },
    logs: [
      { id: `log_${externalId}_queue`, type: 'queue', time: '2026-05-21T10:01:02.000Z', message: '进入队列' },
      { id: `log_${externalId}_llm`, type: 'llm', time: '2026-05-21T10:01:03.000Z', message: '调用模型' },
      { id: `log_${externalId}_verdict`, type: 'verdict', time: '2026-05-21T10:01:04.000Z', message: '结构化输出：pass' },
    ],
  };
}

function createFetchMock(initialBatches: AiReviewBatchDto[] = batches) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { method, path } = requestInfo(input, init);

    if (path === '/ai-review/batches' && method === 'GET') {
      return jsonResponse({ data: initialBatches });
    }

    if (path.startsWith('/ai-review/batches/') && method === 'GET') {
      const batchId = decodeURIComponent(path.replace('/ai-review/batches/', ''));
      if (batchId === pendingBatch.batchId) {
        return jsonResponse({ data: pendingDetail });
      }
    }

    return jsonResponse({ data: {} });
  });
}

function requestInfo(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input.toString(), 'http://localhost');
  const path = url.pathname.replace(/^\/api/, '');

  return {
    method: init?.method ?? 'GET',
    path,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

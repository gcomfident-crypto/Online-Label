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

const longNoteText = [
  '答案完整。第一句说明选择依据。',
  '第二句补充事实背景。',
  '第三句对比两个候选回答。',
  '第四句说明为什么另一个回答不合适。',
  '第五句说明安全风险判断。',
  '第六句用于验证展开后可以看到完整提交内容。',
].join('\n');

const rejectedDetail = {
  ...rejectedBatch,
  items: [
    createDetailItem(1, 'pref_1', 'reject', 64, { longNote: true, rejectedFieldKey: 'note' }),
    createDetailItem(2, 'pref_2', 'pass', 90),
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
    const pageDescription = screen.getByText(
      '集中查看待 AI 预审的任务提交批次、标注员、题目数量和审核结论，支持快速定位预审结果',
    );
    expect(pageDescription).toHaveClass('task-management-table-description');
    expect(pageDescription.closest('.agent-review-page__header')).not.toBeNull();
    expect(screen.queryByRole('tablist', { name: 'AI 预审状态筛选' })).not.toBeInTheDocument();
    const searchInput = screen.getByPlaceholderText('搜索任务名 / 标注员 / 题目ID');
    expect(searchInput.closest('.task-management-table-card')).toHaveClass('agent-review-table-panel');
    expect(searchInput.closest('.task-management-table-toolbar')).toHaveClass('agent-review-table-toolbar');
    expect(screen.queryByRole('button', { name: '刷新任务级 AI 预审队列' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '刷新' })).not.toBeInTheDocument();

    const table = screen.getByRole('table', { name: '任务级 AI 预审队列表格' });
    ['任务名称', '标注员', '提交时间', '题目数', 'AI 建议']
      .forEach((header) => expect(within(table).getByText(header)).toBeInTheDocument());
    ['当前状态', '综合分 / 失败原因', '操作']
      .forEach((header) => expect(within(table).queryByText(header)).not.toBeInTheDocument());
    expect(within(table).queryByText('批次 ID')).not.toBeInTheDocument();
    expect(within(table).queryByText(/SUB-/)).not.toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('问答质量标注')).toBeInTheDocument();
    expect(within(table).getByText('偏好安全评测')).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: '问答质量标注' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: '查看详情' })).not.toBeInTheDocument();
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

    await user.type(screen.getByPlaceholderText('搜索任务名 / 标注员 / 题目ID'), 'pref_2');
    expect(within(table).getByText('偏好安全评测')).toBeInTheDocument();
    expect(within(table).queryByText('问答质量标注')).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('搜索任务名 / 标注员 / 题目ID'));
    await user.type(screen.getByPlaceholderText('搜索任务名 / 标注员 / 题目ID'), '不存在');
    expect(within(table).getByText('暂无任务级 AI 预审记录')).toBeInTheDocument();
  });

  it('点击任务级表格行后从底部打开全页面详情层，并展示多题切换和详情模块', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', createFetchMock());

    render(<AiReviewQueuePage />);

    const table = await screen.findByRole('table', { name: '任务级 AI 预审队列表格' });
    await user.click(within(table).getByRole('row', { name: /问答质量标注/ }));

    const dialog = await screen.findByRole('dialog', { name: /AI 预审详情 · 问答质量标注/ });
    expect(dialog).toHaveClass('agent-review-batch-sheet');
    expect(within(dialog).queryByText(/SUB-/)).not.toBeInTheDocument();
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
    expect(within(dialog).getByRole('tab', { name: /失败\s*0/ })).toBeInTheDocument();
    expect(within(dialog).getByText('题目列表')).toBeInTheDocument();
    const questionTabList = within(dialog).getByRole('tablist', { name: '批次内题目切换' });
    expect(within(questionTabList).getByRole('tab', { name: /Q1/ })).toBeInTheDocument();
    expect(within(questionTabList).getByRole('tab', { name: /Q2/ })).toBeInTheDocument();
    expect(within(questionTabList).getByRole('tab', { name: /Q3/ })).toBeInTheDocument();

    ['字段预审结果', 'AI 总评']
      .forEach((title) => expect(within(dialog).getByText(title)).toBeInTheDocument());
    expect(within(dialog).queryByText('当前题概览')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('AI 总建议')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('审核字段')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('字段通过情况')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('整体分')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('标注员提交内容')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('维度评分（共 100）')).not.toBeInTheDocument();
    expect(within(dialog).getAllByText('qa_1').length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/2 个字段/)).toBeInTheDocument();
    expect(within(dialog).getByText(/本题建议通过/)).toBeInTheDocument();
    expect(within(dialog).getByText(/AI 预审字段 2 个 · 通过 2 · 打回 0/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('table', { name: '字段预审结果' })).not.toBeInTheDocument();
    const fieldReviewList = within(dialog).getByRole('list', { name: '字段预审结果列表' });
    expect(within(fieldReviewList).getAllByRole('listitem')).toHaveLength(2);
    expect(within(fieldReviewList).getAllByText('Labeler 提交内容').length).toBeGreaterThan(0);
    expect(within(fieldReviewList).getAllByText('预审规则').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('选择更优回答').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('备注说明').length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/必须选择与题目事实一致的更优回答/)).toBeInTheDocument();
    expect(within(dialog).getAllByText('通过').length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/查看未参与 AI 预审的提交字段/)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('table', { name: '未参与 AI 预审的提交字段' })).not.toBeInTheDocument();
    expect(within(fieldReviewList).queryByText('internal_note')).not.toBeInTheDocument();
    expect(within(dialog).getByText(/答案完整/)).toBeInTheDocument();
    expect(within(dialog).getByText(/所有开启 AI 预审的字段均通过/)).toBeInTheDocument();
    expect(within(dialog).getByText('查看审核 Prompt')).toBeInTheDocument();
    expect(within(dialog).queryByText('查看模型原始输出')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('模型原始输出')).not.toBeInTheDocument();
    expect(within(dialog).getByText('查看处理日志')).toBeInTheDocument();
    expect(within(dialog).getByText(/真实运行 Prompt：请只审核开启 AI 预审的字段/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/解释什么是过拟合/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/敏感 \/ 违规词/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/function_calling · 结构化/)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: /Q2/ }));
    expect(within(dialog).getAllByText(/第二题答案/).length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/第二题 prompt/)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: /Q3/ }));
    expect(within(dialog).getByText('本题暂未记录真实审核 Prompt。')).toBeInTheDocument();
    expect(within(dialog).queryByText(/你是电商商品标题审核员/)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '关闭 AI 预审详情' }));
    expect(dialog).toHaveClass('is-closing');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('table', { name: '任务级 AI 预审队列表格' })).toBeInTheDocument();
  });

  it('字段级审核结果中任意字段打回时，当前题结果条和字段行突出显示打回字段', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', createFetchMock());

    render(<AiReviewQueuePage />);

    const table = await screen.findByRole('table', { name: '任务级 AI 预审队列表格' });
    await user.click(within(table).getByRole('row', { name: /偏好安全评测/ }));

    const dialog = await screen.findByRole('dialog', { name: /AI 预审详情 · 偏好安全评测/ });
    expect(within(dialog).getByText(/本题建议打回/)).toBeInTheDocument();
    expect(within(dialog).getByText(/AI 预审字段 2 个 · 通过 1 · 打回 1/)).toBeInTheDocument();
    expect(within(dialog).getByText(/打回字段：/)).toHaveTextContent('备注说明');

    expect(within(dialog).queryByRole('table', { name: '字段预审结果' })).not.toBeInTheDocument();
    const fieldReviewList = within(dialog).getByRole('list', { name: '字段预审结果列表' });
    const rejectedBlock = within(fieldReviewList).getByRole('listitem', { name: /备注说明 AI 预审结果/ });
    expect(rejectedBlock).toHaveClass('is-reject');
    expect(within(rejectedBlock).getByText('打回')).toBeInTheDocument();
    expect(within(rejectedBlock).getByText(/缺少判断依据/)).toBeInTheDocument();
    expect(within(rejectedBlock).getByText(/第六句用于验证展开/)).toBeInTheDocument();
    expect(within(rejectedBlock).queryByRole('button', { name: '展开' })).not.toBeInTheDocument();
  });

  it('点击弹层主体以外区域时关闭详情层并播放退出动画', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', createFetchMock());

    render(<AiReviewQueuePage />);

    const table = await screen.findByRole('table', { name: '任务级 AI 预审队列表格' });
    await user.click(within(table).getByRole('row', { name: /问答质量标注/ }));

    const dialog = await screen.findByRole('dialog', { name: /AI 预审详情 · 问答质量标注/ });
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
  options: { longNote?: boolean; rejectedFieldKey?: string } = {},
): AiReviewBatchDetailDto['items'][number] {
  const noteDecision = options.rejectedFieldKey === 'note' ? 'reject' : 'pass';
  const preferredDecision = options.rejectedFieldKey === 'preferred' ? 'reject' : 'pass';

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
      answers: {
        preferred: 'response_a',
        note: options.longNote ? longNoteText : index === 2 ? '第二题答案' : '答案完整',
        internal_note: '这只是未参与 AI 预审的人工补充',
      },
      schemaVersion: 'r12',
      submittedAt: '2026-05-21T10:01:02.000Z',
    },
    reviewFields: [
      {
        fieldKey: 'preferred',
        label: '选择更优回答',
        type: 'radio',
        required: true,
        requirement: '必须选择与题目事实一致的更优回答。',
      },
      {
        fieldKey: 'note',
        label: '备注说明',
        type: 'textarea',
        required: false,
        requirement: '必须说明选择理由，不能只给结论。',
      },
    ],
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
      rawPrompt: index === 3 ? null : '真实运行 Prompt：请只审核开启 AI 预审的字段。',
      rawOutput: '{"verdict":"pass"}',
      structuredOutput: {
        verdict: 'pass',
        overallScore: overall,
        fieldReviews: [
          {
            fieldKey: 'preferred',
            label: '选择更优回答',
            score: 92,
            decision: preferredDecision,
            comment: preferredDecision === 'reject' ? '选择与题目事实不一致。' : '选择与证据一致。',
            suggestions: preferredDecision === 'reject' ? ['重新核对两个回答的事实依据。'] : [],
          },
          {
            fieldKey: 'note',
            label: '备注说明',
            score: overall,
            decision: noteDecision,
            comment: noteDecision === 'reject' ? '缺少判断依据，不能支撑选择结果。' : index === 2 ? '第二题答案说明充分。' : '备注说明充分。',
            suggestions: noteDecision === 'reject' ? ['补充具体事实依据和比较理由。'] : [],
          },
        ],
        overallComment: options.rejectedFieldKey ? '存在开启 AI 预审的字段未通过，建议打回。' : '所有开启 AI 预审的字段均通过。',
      },
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
      if (batchId === rejectedBatch.batchId) {
        return jsonResponse({ data: rejectedDetail });
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

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TaskFlowDetailDto, TaskFlowItemDto, TaskFlowLogDto, TaskFlowSummaryDto } from '../../api/taskFlows';
import { AiReviewQueuePage } from './AiReviewQueuePage';

const modelCompareFlow = createFlow({
  taskId: 'task_model_compare_json',
  taskTitle: '模型对比 json',
  totalItems: 10,
  submittedItems: 10,
  currentStage: 'HUMAN_RE_REVIEW',
  round: 2,
  aiSummary: {
    pending: 0,
    queued: 0,
    running: 0,
    passed: 2,
    rejected: 8,
    failed: 0,
    completed: 10,
  },
  reviewerSummary: {
    notStarted: 0,
    pending: 10,
    decided: 0,
    passed: 0,
    rejected: 0,
  },
  finalSummary: {
    completed: 0,
    notCompleted: 10,
  },
});

const completedFlow = createFlow({
  taskId: 'task_done',
  taskTitle: '最终完成任务',
  currentStage: 'FINAL_COMPLETED',
  totalItems: 2,
  submittedItems: 2,
  aiSummary: {
    pending: 0,
    queued: 0,
    running: 0,
    passed: 2,
    rejected: 0,
    failed: 0,
    completed: 2,
  },
  reviewerSummary: {
    notStarted: 0,
    pending: 0,
    decided: 2,
    passed: 2,
    rejected: 0,
  },
  finalSummary: {
    completed: 2,
    notCompleted: 0,
  },
});

const modelCompareDetail: TaskFlowDetailDto = {
  ...modelCompareFlow,
  items: Array.from({ length: 10 }, (_, index) => createItem(index + 1, index < 2 ? 'PASSED' : 'REJECTED')),
};

const modelCompareLogs: TaskFlowLogDto[] = [
  createLog({
    id: 'log_owner_published',
    eventType: 'OWNER_PUBLISHED',
    actorRole: 'OWNER',
    actorName: '张满',
    occurredAt: '2026-05-20T09:00:00.000Z',
    message: 'Owner 发布了任务。',
  }),
  createLog({
    id: 'log_labeler_claimed',
    eventType: 'LABELER_CLAIMED',
    actorRole: 'LABELER',
    actorName: '李雷',
    occurredAt: '2026-05-21T09:00:00.000Z',
    message: '李雷 领取了任务。',
  }),
  createLog({
    id: 'log_labeler_submitted',
    eventType: 'LABELER_SUBMITTED',
    actorRole: 'LABELER',
    actorName: '李雷',
    occurredAt: '2026-05-21T10:00:00.000Z',
    message: '李雷 提交了整个任务的标注结果。',
  }),
  createLog({
    id: 'log_ai_completed',
    eventType: 'AI_PRECHECK_COMPLETED',
    actorRole: 'AI_AGENT',
    actorName: 'AI Agent',
    occurredAt: '2026-05-21T10:05:00.000Z',
    message: 'AI Agent 完成本轮预审，存在建议打回题目。',
    rejectedItemRefs: [{ itemId: 'item_3', externalId: 'P0003', index: 3 }],
  }),
  createLog({
    id: 'log_reviewer_received',
    eventType: 'REVIEWER_RECEIVED',
    actorRole: 'REVIEWER',
    actorName: null,
    occurredAt: '2026-05-21T10:06:00.000Z',
    message: '任务流转到 Reviewer 检查。',
  }),
];

describe('AiReviewQueuePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('按任务展示完整质检流水线，AI 完成数和 Reviewer 待复审数分层显示', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', createFetchMock());

    render(<AiReviewQueuePage />);

    expect(await screen.findByRole('heading', { name: '任务质检流水线' })).toBeInTheDocument();
    expect(screen.getByText('按任务查看从创建、标注、AI 预审、Reviewer 复核、Labeler 修改到最终完成的全流程状态')).toHaveClass(
      'task-management-table-description',
    );

    const statusSummaryRegion = screen.getByRole('region', { name: '任务质检流转状态筛选' });
    expect(within(statusSummaryRegion).getByRole('button', { name: /总任务/ })).toHaveTextContent('总任务2');
    expect(within(statusSummaryRegion).getByRole('button', { name: /流转中/ })).toHaveTextContent('流转中1');
    expect(within(statusSummaryRegion).getByRole('button', { name: /最终完成/ })).toHaveTextContent('最终完成1');

    const table = screen.getByRole('table', { name: '任务质检流水线表格' });
    ['任务ID', '任务名称', '当前阶段', 'AI 预审进度', 'Reviewer 复核', '最近更新']
      .forEach((header) => expect(within(table).getByText(header)).toBeInTheDocument());
    expect(within(table).getByText('模型对比 json')).toBeInTheDocument();
    expect(within(table).getByText('Reviewer 复审中')).toBeInTheDocument();
    expect(within(table).getByText('10 / 10 AI 预审完成')).toBeInTheDocument();
    expect(within(table).getByText('通过 2 · 打回 8')).toBeInTheDocument();
    expect(within(table).getByText('待复核 10 / 10')).toBeInTheDocument();
    expect(within(table).getByText('已决策 0 · 最终完成 0')).toBeInTheDocument();

    await user.click(within(table).getByRole('row', { name: /模型对比 json/ }));

    const dialog = await screen.findByRole('dialog', { name: /模型对比 json/ });
    expect(dialog).toHaveClass('agent-review-batch-sheet');
    expect(within(dialog).getByLabelText('任务内题目流转列表')).toHaveTextContent('10 题');
    expect(within(dialog).getByText('P0001')).toBeInTheDocument();
    expect(within(dialog).getByText('P0010')).toBeInTheDocument();
    expect(within(dialog).getAllByText('待审核').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('本题历史')).toBeInTheDocument();
    expect(within(dialog).getByText('预审记录')).toBeInTheDocument();
    expect(within(dialog).getByText('综合分')).toBeInTheDocument();
    expect(within(dialog).queryByText('AI 建议通过')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('未最终完成')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('HUMAN_PENDING')).not.toBeInTheDocument();

    const timeline = within(dialog).getByLabelText('当前任务时间线');
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(5);
    ['Owner 发布', 'Labeler 标注', 'AI Agent 预审', 'Reviewer 检查', '任务完成']
      .forEach((label) => expect(within(timeline).getByText(label)).toBeInTheDocument());
    await user.hover(within(timeline).getByRole('listitem', { name: /Owner 发布/ }));
    expect(screen.getByText('张满')).toBeInTheDocument();
    expect(within(timeline).queryByText('Labeler 修改')).not.toBeInTheDocument();
    expect(within(timeline).queryByText('Reviewer 再次复审')).not.toBeInTheDocument();
    expect(within(timeline).queryByText(/建议通过/)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '任务日志' }));

    const logDialog = await screen.findByRole('dialog', { name: /任务日志 · 模型对比 json/ });
    expect(within(logDialog).getByText('Owner 发布任务')).toBeInTheDocument();
    expect(within(logDialog).getByText('Labeler 领取任务')).toBeInTheDocument();
    expect(within(logDialog).getByText('Labeler 提交标注结果')).toBeInTheDocument();
    expect(within(logDialog).getByText('完成预审')).toBeInTheDocument();
    expect(within(logDialog).getByText('流转到 Reviewer')).toBeInTheDocument();
    expect(within(logDialog).queryByText('Owner 发布了任务。')).not.toBeInTheDocument();
    expect(within(logDialog).queryByText('李雷 领取了任务。')).not.toBeInTheDocument();
    expect(within(logDialog).queryByText('李雷 提交了整个任务的标注结果。')).not.toBeInTheDocument();
    expect(within(logDialog).queryByText('AI Agent 完成本轮预审，存在建议打回题目。')).not.toBeInTheDocument();
    expect(within(logDialog).queryByText('任务流转到 Reviewer 检查。')).not.toBeInTheDocument();
    expect(within(logDialog).getByLabelText('打回题目')).toHaveTextContent('P0003');
    expect(within(logDialog).getByText('P0003')).toBeInTheDocument();
    expect(within(logDialog).queryByText(/提交了 \\d+ 道题/)).not.toBeInTheDocument();
    expect(within(logDialog).queryByText(/总共预审/)).not.toBeInTheDocument();
    expect(within(logDialog).queryByText(/建议通过/)).not.toBeInTheDocument();
    expect(within(logDialog).queryByText('HUMAN_PENDING')).not.toBeInTheDocument();
  });

  it('任务日志加载失败不阻断详情页，并在右侧本题历史提示历史不完整', async () => {
    const user = userEvent.setup();
    let logRequestCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { method, path } = requestInfo(input, init);

      if (path === '/agent/task-flows' && method === 'GET') {
        return jsonResponse({ data: [modelCompareFlow, completedFlow] });
      }

      if (path === '/agent/task-flows/task_model_compare_json' && method === 'GET') {
        return jsonResponse({ data: modelCompareDetail });
      }

      if (path === '/agent/task-flows/task_model_compare_json/logs' && method === 'GET') {
        logRequestCount += 1;
        return logRequestCount === 1
          ? jsonResponse({ error: { message: 'logs down' } }, 500)
          : jsonResponse({ data: modelCompareLogs });
      }

      return jsonResponse({ data: {} });
    }));

    render(<AiReviewQueuePage />);

    const table = await screen.findByRole('table', { name: '任务质检流水线表格' });
    await user.click(within(table).getByRole('row', { name: /模型对比 json/ }));

    const dialog = await screen.findByRole('dialog', { name: /模型对比 json/ });
    expect(within(dialog).getByText('P0001')).toBeInTheDocument();
    expect(await within(dialog).findByText('完整历史加载失败，当前仅展示本题最新记录。请点击任务日志重试。')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '任务日志' }));

    const logDialog = await screen.findByRole('dialog', { name: /任务日志 · 模型对比 json/ });
    expect(within(logDialog).getByText('Owner 发布任务')).toBeInTheDocument();
    expect(within(logDialog).queryByText('Owner 发布了任务。')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('完整历史加载失败，当前仅展示本题最新记录。请点击任务日志重试。')).not.toBeInTheDocument();
  });

  it('加载失败时提示任务质检流水线错误，而不是继续暴露 AI 队列口径', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { message: 'boom' } }, 500)));

    render(<AiReviewQueuePage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('任务质检流水线加载失败，请稍后重试');
  });
});

function createFlow(overrides: Partial<TaskFlowSummaryDto> = {}): TaskFlowSummaryDto {
  return {
    taskId: 'task_default',
    taskTitle: '默认任务',
    taskCreatedAt: '2026-05-20T08:00:00.000Z',
    templateName: '模型比较模板',
    templateVersion: 'v2',
    ownerId: 'user_owner',
    ownerName: '张满',
    round: 1,
    currentStage: 'HUMAN_REVIEW',
    totalItems: 1,
    submittedItems: 1,
    lifecycleSteps: [
      {
        key: 'OWNER_PUBLISHED',
        label: 'Owner 发布',
        status: 'COMPLETED',
        actorRole: 'OWNER',
        actorName: '张满',
        occurredAt: '2026-05-20T09:00:00.000Z',
      },
      {
        key: 'LABELER_SUBMITTED',
        label: 'Labeler 标注',
        status: 'COMPLETED',
        actorRole: 'LABELER',
        actorName: '李雷',
        occurredAt: '2026-05-21T10:00:00.000Z',
      },
      {
        key: 'AI_PRECHECK',
        label: 'AI Agent 预审',
        status: 'COMPLETED',
        actorRole: 'AI_AGENT',
        actorName: 'AI Agent',
        occurredAt: '2026-05-21T10:05:00.000Z',
      },
      {
        key: 'REVIEWER_CHECK',
        label: 'Reviewer 检查',
        status: 'CURRENT',
        actorRole: 'REVIEWER',
        actorName: null,
        occurredAt: null,
      },
      {
        key: 'TASK_COMPLETED',
        label: '任务完成',
        status: 'PENDING',
        actorRole: null,
        actorName: null,
        occurredAt: null,
      },
    ],
    aiSummary: {
      pending: 0,
      queued: 0,
      running: 0,
      passed: 1,
      rejected: 0,
      failed: 0,
      completed: 1,
    },
    reviewerSummary: {
      notStarted: 0,
      pending: 1,
      decided: 0,
      passed: 0,
      rejected: 0,
    },
    labelerRevisionSummary: {
      notStarted: 0,
      editable: 0,
      locked: 0,
      revised: 0,
      notRequired: 1,
    },
    finalSummary: {
      completed: 0,
      notCompleted: 1,
    },
    createdAt: '2026-05-20T08:00:00.000Z',
    updatedAt: '2026-05-21T12:00:00.000Z',
    ...overrides,
  };
}

function createItem(index: number, aiStatus: TaskFlowItemDto['aiStatus']): TaskFlowItemDto {
  const externalId = `P${index.toString().padStart(4, '0')}`;

  return {
    index,
    taskItem: {
      id: `item_${index}`,
      externalId,
      datasetKind: 'generic_json',
      rawData: {
        prompt: `题目 ${index}`,
      },
    },
    assignment: {
      id: `assignment_${index}`,
      assigneeId: 'user_labeler',
      assigneeName: '李雷',
      status: 'UNDER_RECHECK',
    },
    submission: {
      id: `submission_${index}`,
      status: 'HUMAN_PENDING',
      round: 2,
      answers: {
        winner: index % 2 === 0 ? 'A' : 'B',
      },
      schemaVersion: 'v2',
      submittedAt: '2026-05-21T11:00:00.000Z',
    },
    aiStatus,
    aiDecision: aiStatus === 'REJECTED' ? 'reject' : 'pass',
    reviewerStatus: 'PENDING',
    reviewerDecision: null,
    labelerStatus: 'NOT_REQUIRED',
    finalStatus: 'NOT_FINAL',
    aiReview: {
      id: `ai_review_${index}`,
      stage: 'AI_PRECHECK',
      reviewerType: 'AI',
      reviewerId: null,
      reviewerName: null,
      assignedReviewerId: null,
      assignedReviewerName: null,
      decision: aiStatus === 'REJECTED' ? 'reject' : 'pass',
      comment: aiStatus === 'REJECTED' ? '模型建议打回。' : '模型建议通过。',
      scores: {
        overall: aiStatus === 'REJECTED' ? 62 : 94,
      },
      createdAt: '2026-05-21T11:01:00.000Z',
    },
    humanReview: null,
    latestAiJob: {
      id: `job_${index}`,
      status: 'SUCCEEDED',
      attempts: 1,
      maxAttempts: 3,
      provider: 'mock',
      model: 'mock-reviewer',
      lastError: null,
      queuedAt: '2026-05-21T11:00:01.000Z',
      startedAt: '2026-05-21T11:00:02.000Z',
      finishedAt: '2026-05-21T11:01:00.000Z',
      updatedAt: '2026-05-21T11:01:00.000Z',
    },
  };
}

function createFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { method, path } = requestInfo(input, init);

    if (path === '/agent/task-flows' && method === 'GET') {
      return jsonResponse({ data: [modelCompareFlow, completedFlow] });
    }

    if (path === '/agent/task-flows/task_model_compare_json' && method === 'GET') {
      return jsonResponse({ data: modelCompareDetail });
    }

    if (path === '/agent/task-flows/task_model_compare_json/logs' && method === 'GET') {
      return jsonResponse({ data: modelCompareLogs });
    }

    return jsonResponse({ data: {} });
  });
}

function createLog(overrides: Partial<TaskFlowLogDto>): TaskFlowLogDto {
  return {
    id: 'log_default',
    taskId: 'task_model_compare_json',
    round: 1,
    eventType: 'OWNER_PUBLISHED',
    actorRole: 'OWNER',
    actorName: '张满',
    occurredAt: '2026-05-20T09:00:00.000Z',
    message: 'Owner 发布了任务。',
    itemRefs: [],
    rejectedItemRefs: [],
    ...overrides,
  };
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

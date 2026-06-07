import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TaskFlowDetailDto, TaskFlowItemDto, TaskFlowSummaryDto } from '../../api/taskFlows';
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
    expect(within(table).getByText('Reviewer 再次复审中')).toBeInTheDocument();
    expect(within(table).getByText('10 / 10 AI 预审完成')).toBeInTheDocument();
    expect(within(table).getByText('通过 2 · 打回 8')).toBeInTheDocument();
    expect(within(table).getByText('待复核 10 / 10')).toBeInTheDocument();
    expect(within(table).getByText('已决策 0 · 最终完成 0')).toBeInTheDocument();

    await user.click(within(table).getByRole('row', { name: /模型对比 json/ }));

    const dialog = await screen.findByRole('dialog', { name: /任务流转详情 · 模型对比 json/ });
    expect(dialog).toHaveClass('agent-review-batch-sheet');
    expect(within(dialog).getByLabelText('任务内题目流转列表')).toHaveTextContent('10 题');
    expect(within(dialog).getByText('P0001')).toBeInTheDocument();
    expect(within(dialog).getByText('P0010')).toBeInTheDocument();
    expect(within(dialog).getAllByText('AI 建议通过').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('待 Reviewer 复核').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('未最终完成').length).toBeGreaterThan(0);
    expect(within(dialog).queryByText('已完成')).not.toBeInTheDocument();
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
      status: 'RECHECK_REVIEWING',
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
      assignedReviewerId: null,
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

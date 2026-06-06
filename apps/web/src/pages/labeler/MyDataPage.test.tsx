import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LabelerAssignmentDto } from '../../api/assignments';
import type { TaskDto } from '../../api/tasks';
import { MyDataPage } from './MyDataPage';

const assignments = [
  createAssignment({
    assignmentId: 'assignment_1',
    taskId: 'task_qa',
    taskTitle: '问答质量标注',
    taskItemId: 'item_qa_1',
    taskItemSortOrder: 1,
    externalId: 'qa_1',
    datasetKind: 'qa_quality',
    status: 'SUBMITTED',
    round: 1,
    latestSubmissionStatus: 'AI_QUEUED',
    latestSubmittedAt: '2026-05-21T08:40:00.000Z',
    claimedAt: '2026-05-21T08:00:00.000Z',
    templateName: '问答质量官方模板',
    schemaVersion: 'r1',
  }),
  createAssignment({
    assignmentId: 'assignment_2',
    taskId: 'task_qa',
    taskTitle: '问答质量标注',
    taskItemId: 'item_qa_2',
    taskItemSortOrder: 2,
    externalId: 'qa_2',
    datasetKind: 'qa_quality',
    status: 'IN_PROGRESS',
    round: 0,
    latestSubmissionStatus: null,
    latestSubmittedAt: null,
    claimedAt: '2026-05-21T08:30:00.000Z',
    templateName: '问答质量官方模板',
    schemaVersion: 'r1',
  }),
];

const tasks = [
  createTaskDto({
    id: 'task_qa',
    title: '问答质量标注',
    createdAt: '2026-05-20T08:00:00.000Z',
  }),
];

describe('MyDataPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('按任务聚合工作台列表，点击任务后进入第一条未标注题目', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: assignments }))
      .mockResolvedValueOnce(jsonResponse({ data: tasks }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <MyDataPage />
        <LocationProbe />
      </MemoryRouter>,
    );

    const workspaceTitle = await screen.findByRole('heading', { name: '工作台' });
    expect(workspaceTitle).toBeInTheDocument();
    const pageDescription = screen.getByText(
      '汇总已领取任务的标注进度、状态、截止时间和待处理数量，帮助标注员快速回到下一条任务',
    );
    expect(pageDescription).toHaveClass('task-management-table-description');
    expect(pageDescription.closest('.my-data-header')).not.toBeNull();
    expect(screen.queryByLabelText('工作台统计')).not.toBeInTheDocument();
    expect(screen.queryByText('已完成')).not.toBeInTheDocument();
    expect(screen.queryByText('全部类型')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('数据集筛选')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('任务状态筛选')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '筛选' })).not.toBeInTheDocument();
    expect(await screen.findByRole('table', { name: '工作台任务列表' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '已领取任务列表' })).not.toBeInTheDocument();
    expect(screen.getAllByText('问答质量标注')).toHaveLength(1);
    expect(screen.queryByText('qa_2')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('问答质量标注 已领取题目明细')).not.toBeInTheDocument();
    const table = screen.getByRole('table', { name: '工作台任务列表' });
    expect(within(table).getByText('任务ID')).toBeInTheDocument();
    expect(within(table).getByText('任务名')).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: '任务' })).not.toBeInTheDocument();
    expect(within(table).getByText('T-0001')).toBeInTheDocument();
    expect(within(table).getByText('2 条')).toBeInTheDocument();
    expect(within(table).queryByText('问答质量官方模板 · r1')).not.toBeInTheDocument();
    expect(within(table).queryByText(/下一条/)).not.toBeInTheDocument();
    expect(within(table).getAllByText('待标注')).not.toHaveLength(0);
    expect(within(table).queryByText('操作')).not.toBeInTheDocument();
    expect(table.querySelectorAll('tbody tr:first-child .my-data-table__cell')).toHaveLength(7);
    expect(screen.queryByRole('link', { name: '继续标注 问答质量标注' })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('table', { name: '工作台任务列表' })).getByText('问答质量标注'));

    expect(screen.queryByLabelText('问答质量标注 已领取题目明细')).not.toBeInTheDocument();
    expect(screen.getByTestId('location-path')).toHaveTextContent(
      '/labeler/tasks/task_qa/items/item_qa_2?assignmentId=assignment_2',
    );
    expect(screen.getByTestId('location-state')).toHaveTextContent(
      JSON.stringify({ source: 'my-data-table', taskDisplayId: 'T-0001', taskTitle: '问答质量标注' }),
    );
  });

  it('用任务管理样式的状态按钮和表格内搜索筛选工作台任务', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(jsonResponse({ data: assignments }))
        .mockResolvedValueOnce(jsonResponse({ data: tasks })),
    );

    render(
      <MemoryRouter>
        <MyDataPage />
      </MemoryRouter>,
    );

    const statusFilter = await screen.findByLabelText('工作台状态筛选');
    const tableCard = statusFilter.closest('.task-management-table-card');
    expect(statusFilter.querySelectorAll('.task-summary-card')).toHaveLength(4);
    expect(screen.getByRole('button', { name: /全部状态\s+1/ })).toHaveClass(
      'task-summary-card--total',
      'is-active',
    );
    expect(screen.getByRole('button', { name: /待标注\s+1/ })).toHaveClass('task-summary-card--running');
    expect(screen.getByRole('button', { name: /已提交\s+1/ })).toHaveClass('task-summary-card--done');
    expect(screen.getByRole('button', { name: /待修改\s+0/ })).toHaveClass('task-summary-card--paused');
    expect(screen.queryByRole('button', { name: /待完成/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '筛选' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('搜索任务').closest('.task-management-table-card')).toBe(tableCard);

    await user.click(screen.getByRole('button', { name: /已提交\s+1/ }));

    const table = screen.getByRole('table', { name: '工作台任务列表' });
    expect(within(table).getByText('1 条')).toBeInTheDocument();
    expect(within(table).queryByText(/下一条/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /已提交\s+1/ })).toHaveClass('is-active');

    await user.type(screen.getByLabelText('搜索任务'), '不存在');

    expect(within(table).getByText('暂无领取任务')).toBeInTheDocument();
  });

  it('没有领取记录时仍保留工作台表格结构', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(jsonResponse({ data: [] }))
        .mockResolvedValueOnce(jsonResponse({ data: [] })),
    );

    render(
      <MemoryRouter>
        <MyDataPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('table', { name: '工作台任务列表' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '已领取任务列表' })).not.toBeInTheDocument();
    expect(screen.queryByText('0 个任务')).not.toBeInTheDocument();
    expect(screen.queryByText('0 条题目')).not.toBeInTheDocument();
    expect(screen.queryByText('0 条任务')).not.toBeInTheDocument();
    const table = screen.getByRole('table', { name: '工作台任务列表' });
    expect(within(table).getByRole('img', { name: '空工作台任务列表插画' })).toHaveAttribute(
      'src',
      expect.stringContaining('empty-table-illustration.svg'),
    );
    expect(within(table).getByText('暂无领取任务')).toBeInTheDocument();
    expect(within(table).getByText('领取任务后会在这里查看待标注题目、提交进度和返回标注页入口')).toBeInTheDocument();
    expect(screen.getByLabelText('工作台任务列表分页')).toBeInTheDocument();
    expect(screen.getByLabelText('当前页码')).toHaveTextContent('第 1 / 1 页');
  });

  it('已领取任务列表在底部展示分页并通过上一页下一页切换任务', async () => {
    const user = userEvent.setup();
    const manyTaskAssignments = Array.from({ length: 8 }, (_, index) => {
      const taskNumber = index + 1;

      return createAssignment({
        assignmentId: `assignment_${taskNumber}`,
        taskId: `task_${taskNumber}`,
        taskTitle: `任务 ${taskNumber}`,
        taskItemId: `item_${taskNumber}`,
        taskItemSortOrder: 1,
        externalId: `item_${taskNumber}`,
        claimedAt: `2026-05-21T08:${String(taskNumber).padStart(2, '0')}:00.000Z`,
      });
    });

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(jsonResponse({ data: manyTaskAssignments }))
        .mockResolvedValueOnce(jsonResponse({
          data: manyTaskAssignments.map((assignment) =>
            createTaskDto({
              id: assignment.taskId,
              title: assignment.taskTitle,
              createdAt: assignment.claimedAt,
            }),
          ),
        })),
    );

    render(
      <MemoryRouter>
        <MyDataPage />
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText('工作台任务列表分页')).toBeInTheDocument();
    expect(screen.getByLabelText('当前页码')).toHaveTextContent('第 1 / 2 页');
    expect(screen.getByText('任务 8')).toBeInTheDocument();
    expect(screen.queryByText('任务 1')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '下一页' }));

    expect(screen.getByLabelText('当前页码')).toHaveTextContent('第 2 / 2 页');
    expect(screen.getByText('任务 1')).toBeInTheDocument();
    expect(screen.queryByText('任务 8')).not.toBeInTheDocument();
  });
});

const LocationProbe = () => {
  const location = useLocation();

  return (
    <>
      <output data-testid="location-path">{`${location.pathname}${location.search}`}</output>
      <output data-testid="location-state">{JSON.stringify(location.state ?? null)}</output>
    </>
  );
};

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

function createAssignment(overrides: Partial<LabelerAssignmentDto> = {}): LabelerAssignmentDto {
  return {
    assignmentId: 'assignment_default',
    taskId: 'task_default',
    taskTitle: '默认任务',
    taskItemId: 'item_default',
    taskItemSortOrder: 1,
    externalId: 'item_default',
    datasetKind: 'qa_quality',
    status: 'IN_PROGRESS',
    round: 0,
    latestSubmissionStatus: null,
    latestSubmittedAt: null,
    claimedAt: '2026-05-21T08:00:00.000Z',
    templateName: '问答质量官方模板',
    schemaVersion: 'r1',
    ...overrides,
  };
}

function createTaskDto(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: 'task_default',
    title: '默认任务',
    description: null,
    richTextInstruction: null,
    tags: [],
    rewardRule: null,
    rewardPerItem: null,
    perUserLimit: null,
    quota: null,
    deadline: null,
    distributionStrategy: 'FIRST_COME_FIRST_SERVE',
    aiPreReviewEnabled: false,
    aiRuleName: null,
    status: 'PUBLISHED',
    templateId: 'template_default',
    template: {
      id: 'template_default',
      name: '默认模板',
      datasetKind: 'qa_quality',
      schemaVersion: 'r1',
      status: 'PUBLISHED',
    },
    createdById: 'user_owner_001',
    itemCount: 1,
    assignedItemCount: 1,
    submittedItemCount: 0,
    completedItemCount: 0,
    exportableItemCount: 0,
    workflowProgress: [],
    datasetImportSummary: null,
    createdAt: '2026-05-21T08:00:00.000Z',
    updatedAt: '2026-05-21T08:00:00.000Z',
    ...overrides,
  };
}

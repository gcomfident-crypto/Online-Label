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
    expect(within(table).getByRole('button', { name: '按任务ID排序' })).toHaveClass('task-table__sortable-header');
    expect(within(table).getByRole('button', { name: '按最近提交排序' })).toHaveClass(
      'task-table__sortable-header',
    );
    expect(within(table).getByRole('button', { name: '按领取时间排序' })).toHaveClass(
      'task-table__sortable-header',
    );
    expect(within(table).getByRole('button', { name: '按任务ID排序' })).toHaveTextContent('任务ID⇅');
    expect(within(table).getByRole('button', { name: '按最近提交排序' })).toHaveTextContent('最近提交⇅');
    expect(within(table).getByRole('button', { name: '按领取时间排序' })).toHaveTextContent('领取时间⇅');
    expect(within(table).queryByRole('columnheader', { name: '任务' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: '按任务名排序' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: '按类型排序' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: '按进度排序' })).not.toBeInTheDocument();
    expect(within(table).getByText('T-001')).toBeInTheDocument();
    expect(within(table).getByText('2 条')).toBeInTheDocument();
    expect(within(table).getByText('0/2')).toBeInTheDocument();
    expect(within(table).queryByText('问答质量官方模板 · r1')).not.toBeInTheDocument();
    expect(within(table).queryByText(/下一条/)).not.toBeInTheDocument();
    expect(within(table).queryByText('待标注')).not.toBeInTheDocument();
    expect(within(table).queryByText('操作')).not.toBeInTheDocument();
    expect(table.querySelectorAll('tbody tr:first-child .my-data-table__cell')).toHaveLength(7);
    expect(screen.queryByRole('link', { name: '继续标注 问答质量标注' })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('table', { name: '工作台任务列表' })).getByText('问答质量标注'));

    expect(screen.queryByLabelText('问答质量标注 已领取题目明细')).not.toBeInTheDocument();
    expect(screen.getByTestId('location-path')).toHaveTextContent(
      '/labeler/tasks/task_qa/items/item_qa_2?assignmentId=assignment_2',
    );
    expect(screen.getByTestId('location-state')).toHaveTextContent(
      JSON.stringify({ source: 'my-data-table', taskDisplayId: 'T-001', taskTitle: '问答质量标注' }),
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

  it('进度列未完成任务显示完成数，全完成任务只显示绿色已完成气泡', async () => {
    const progressAssignments = [
      createAssignment({
        assignmentId: 'partial_1',
        taskId: 'task_partial',
        taskTitle: '部分完成任务',
        taskItemId: 'partial_item_1',
        taskItemSortOrder: 1,
        externalId: 'partial_1',
        status: 'FINAL_APPROVED',
        latestSubmissionStatus: 'FINAL_APPROVED',
        latestSubmittedAt: '2026-05-21T08:10:00.000Z',
        claimedAt: '2026-05-21T08:00:00.000Z',
      }),
      createAssignment({
        assignmentId: 'partial_2',
        taskId: 'task_partial',
        taskTitle: '部分完成任务',
        taskItemId: 'partial_item_2',
        taskItemSortOrder: 2,
        externalId: 'partial_2',
        status: 'IN_PROGRESS',
        claimedAt: '2026-05-21T08:05:00.000Z',
      }),
      createAssignment({
        assignmentId: 'completed_1',
        taskId: 'task_completed',
        taskTitle: '全部完成任务',
        taskItemId: 'completed_item_1',
        taskItemSortOrder: 1,
        externalId: 'completed_1',
        status: 'FINAL_APPROVED',
        latestSubmissionStatus: 'FINAL_APPROVED',
        latestSubmittedAt: '2026-05-21T09:10:00.000Z',
        claimedAt: '2026-05-21T09:00:00.000Z',
      }),
      createAssignment({
        assignmentId: 'completed_2',
        taskId: 'task_completed',
        taskTitle: '全部完成任务',
        taskItemId: 'completed_item_2',
        taskItemSortOrder: 2,
        externalId: 'completed_2',
        status: 'FINAL_APPROVED',
        latestSubmissionStatus: 'FINAL_APPROVED',
        latestSubmittedAt: '2026-05-21T09:20:00.000Z',
        claimedAt: '2026-05-21T09:05:00.000Z',
      }),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(jsonResponse({ data: progressAssignments }))
        .mockResolvedValueOnce(jsonResponse({
          data: [
            createTaskDto({ id: 'task_partial', title: '部分完成任务', createdAt: '2026-05-21T08:00:00.000Z' }),
            createTaskDto({ id: 'task_completed', title: '全部完成任务', createdAt: '2026-05-21T09:00:00.000Z' }),
          ],
        })),
    );

    render(
      <MemoryRouter>
        <MyDataPage />
      </MemoryRouter>,
    );

    const table = await screen.findByRole('table', { name: '工作台任务列表' });
    const partialRow = within(table).getByText('部分完成任务').closest('tr') as HTMLElement;
    const completedRow = within(table).getByText('全部完成任务').closest('tr') as HTMLElement;

    expect(within(partialRow).getByText('1/2')).toBeInTheDocument();
    expect(within(partialRow).queryByText('已完成')).not.toBeInTheDocument();
    expect(within(completedRow).queryByText('2/2')).not.toBeInTheDocument();
    expect(within(completedRow).getByText('已完成')).toHaveClass(
      'labeler-assignment-status',
      'labeler-assignment-status--final_approved',
    );
  });

  it('进度列在任务已提交并等待 AI 预审时显示 AI预审胶囊', async () => {
    const aiReviewAssignments = [
      createAssignment({
        assignmentId: 'ai_review_1',
        taskId: 'task_ai_review',
        taskTitle: '等待 AI 预审任务',
        taskItemId: 'ai_review_item_1',
        taskItemSortOrder: 1,
        externalId: 'ai_review_1',
        status: 'SUBMITTED',
        latestSubmissionStatus: 'AI_QUEUED',
        latestSubmittedAt: '2026-05-21T10:10:00.000Z',
        claimedAt: '2026-05-21T10:00:00.000Z',
      }),
      createAssignment({
        assignmentId: 'ai_review_2',
        taskId: 'task_ai_review',
        taskTitle: '等待 AI 预审任务',
        taskItemId: 'ai_review_item_2',
        taskItemSortOrder: 2,
        externalId: 'ai_review_2',
        status: 'SUBMITTED',
        latestSubmissionStatus: 'AI_REVIEWING',
        latestSubmittedAt: '2026-05-21T10:10:05.000Z',
        claimedAt: '2026-05-21T10:01:00.000Z',
      }),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(jsonResponse({ data: aiReviewAssignments }))
        .mockResolvedValueOnce(jsonResponse({
          data: [
            createTaskDto({ id: 'task_ai_review', title: '等待 AI 预审任务', createdAt: '2026-05-21T10:00:00.000Z' }),
          ],
        })),
    );

    render(
      <MemoryRouter>
        <MyDataPage />
      </MemoryRouter>,
    );

    const table = await screen.findByRole('table', { name: '工作台任务列表' });
    const row = within(table).getByText('等待 AI 预审任务').closest('tr') as HTMLElement;
    const aiReviewPill = within(row).getByText('AI预审');

    expect(within(row).queryByText('0/2')).not.toBeInTheDocument();
    expect(aiReviewPill).toHaveClass(
      'labeler-assignment-status',
      'labeler-assignment-status--ai_review',
    );
  });

  it('工作台仅允许任务ID、最近提交和领取时间按指定方向排序', async () => {
    const user = userEvent.setup();
    const sortableAssignments = [
      createAssignment({
        assignmentId: 'assignment_c',
        taskId: 'task_c',
        taskTitle: '工作台任务 C',
        taskItemId: 'item_c',
        externalId: 'item_c',
        claimedAt: '2026-06-03T09:00:00.000Z',
        latestSubmittedAt: '2026-06-12T09:00:00.000Z',
        status: 'SUBMITTED',
      }),
      createAssignment({
        assignmentId: 'assignment_a',
        taskId: 'task_a',
        taskTitle: '工作台任务 A',
        taskItemId: 'item_a',
        externalId: 'item_a',
        claimedAt: '2026-06-01T09:00:00.000Z',
        latestSubmittedAt: null,
      }),
      createAssignment({
        assignmentId: 'assignment_b',
        taskId: 'task_b',
        taskTitle: '工作台任务 B',
        taskItemId: 'item_b',
        externalId: 'item_b',
        claimedAt: '2026-06-02T09:00:00.000Z',
        latestSubmittedAt: '2026-06-11T09:00:00.000Z',
        status: 'SUBMITTED',
      }),
    ];
    const sortableTasks = [
      createTaskDto({
        id: 'task_a',
        title: '工作台任务 A',
        createdAt: '2026-05-01T00:00:00.000Z',
      }),
      createTaskDto({
        id: 'task_b',
        title: '工作台任务 B',
        createdAt: '2026-05-02T00:00:00.000Z',
      }),
      createTaskDto({
        id: 'task_c',
        title: '工作台任务 C',
        createdAt: '2026-05-03T00:00:00.000Z',
      }),
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(jsonResponse({ data: sortableAssignments }))
        .mockResolvedValueOnce(jsonResponse({ data: sortableTasks })),
    );

    render(
      <MemoryRouter>
        <MyDataPage />
      </MemoryRouter>,
    );

    const table = await screen.findByRole('table', { name: '工作台任务列表' });
    const getTaskTitles = () =>
      Array.from(table.querySelectorAll('tbody tr:not(.task-table__empty-row)')).map(
        (row) => row.querySelector('td:nth-child(2) strong')?.textContent?.trim() ?? '',
      );

    expect(getTaskTitles()).toEqual(['工作台任务 C', '工作台任务 B', '工作台任务 A']);

    const taskIdSortButton = within(table).getByRole('button', { name: '按任务ID排序' });
    const latestSubmittedAtSortButton = within(table).getByRole('button', { name: '按最近提交排序' });
    const claimedAtSortButton = within(table).getByRole('button', { name: '按领取时间排序' });

    expect(taskIdSortButton).toHaveTextContent('任务ID⇅');
    expect(latestSubmittedAtSortButton).toHaveTextContent('最近提交⇅');
    expect(claimedAtSortButton).toHaveTextContent('领取时间⇅');

    await user.click(taskIdSortButton);
    expect(getTaskTitles()).toEqual(['工作台任务 A', '工作台任务 B', '工作台任务 C']);
    expect(taskIdSortButton).toHaveTextContent('任务ID↑');

    await user.click(taskIdSortButton);
    expect(getTaskTitles()).toEqual(['工作台任务 C', '工作台任务 B', '工作台任务 A']);
    expect(taskIdSortButton).toHaveTextContent('任务ID↓');

    await user.click(latestSubmittedAtSortButton);
    expect(getTaskTitles()).toEqual(['工作台任务 B', '工作台任务 C', '工作台任务 A']);
    expect(taskIdSortButton).toHaveTextContent('任务ID⇅');
    expect(latestSubmittedAtSortButton).toHaveTextContent('最近提交↑');

    await user.click(latestSubmittedAtSortButton);
    expect(getTaskTitles()).toEqual(['工作台任务 C', '工作台任务 B', '工作台任务 A']);
    expect(latestSubmittedAtSortButton).toHaveTextContent('最近提交↓');

    await user.click(claimedAtSortButton);
    expect(getTaskTitles()).toEqual(['工作台任务 A', '工作台任务 B', '工作台任务 C']);
    expect(latestSubmittedAtSortButton).toHaveTextContent('最近提交⇅');
    expect(claimedAtSortButton).toHaveTextContent('领取时间↑');

    await user.click(claimedAtSortButton);
    expect(getTaskTitles()).toEqual(['工作台任务 C', '工作台任务 B', '工作台任务 A']);
    expect(claimedAtSortButton).toHaveTextContent('领取时间↓');
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

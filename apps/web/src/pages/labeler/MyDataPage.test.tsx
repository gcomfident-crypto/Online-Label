import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LabelerAssignmentDto } from '../../api/assignments';
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

describe('MyDataPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('按任务聚合工作台列表，点击任务后进入第一条未标注题目', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: assignments }))
      .mockResolvedValueOnce(jsonResponse({ data: assignments }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <MyDataPage />
        <LocationProbe />
      </MemoryRouter>,
    );

    const workspaceTitle = await screen.findByRole('heading', { name: '工作台' });
    expect(workspaceTitle).toBeInTheDocument();
    expect(workspaceTitle.closest('.my-data-header')?.querySelector('p')).toBeNull();
    expect(screen.queryByLabelText('工作台统计')).not.toBeInTheDocument();
    expect(screen.queryByText('已完成')).not.toBeInTheDocument();
    expect(screen.queryByText('全部类型')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('数据集筛选')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '已领取任务列表' })).toBeInTheDocument();
    expect(screen.getAllByText('问答质量标注')).toHaveLength(1);
    expect(screen.queryByText('qa_2')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('问答质量标注 已领取题目明细')).not.toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: '工作台任务列表' })).getByText('2 条')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: '工作台任务列表' })).getAllByText('待标注')).not.toHaveLength(0);
    expect(screen.getByRole('link', { name: '继续标注 问答质量标注' })).toHaveAttribute(
      'href',
      '/labeler/tasks/task_qa/items/item_qa_2?assignmentId=assignment_2',
    );
    await user.click(within(screen.getByRole('table', { name: '工作台任务列表' })).getByText('问答质量标注'));

    expect(screen.queryByLabelText('问答质量标注 已领取题目明细')).not.toBeInTheDocument();
    expect(screen.getByTestId('location-path')).toHaveTextContent(
      '/labeler/tasks/task_qa/items/item_qa_2?assignmentId=assignment_2',
    );
  });

  it('没有领取记录时仍保留工作台表格结构', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ data: [] })));

    render(
      <MemoryRouter>
        <MyDataPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '已领取任务列表' })).toBeInTheDocument();
    expect(screen.queryByText('0 个任务')).not.toBeInTheDocument();
    expect(screen.queryByText('0 条题目')).not.toBeInTheDocument();
    expect(screen.getByText('0 条任务')).toBeInTheDocument();
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

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ data: manyTaskAssignments })));

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

  return <output data-testid="location-path">{`${location.pathname}${location.search}`}</output>;
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

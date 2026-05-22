import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MyDataPage } from './MyDataPage';

const stats = {
  labelerId: 'user_labeler_li_lei',
  totalAssignments: 3,
  submittedCount: 3,
  aiQueuedCount: 1,
  approvedCount: 1,
  rejectedCount: 1,
  needsRevisionCount: 1,
};

const submissions = [
  {
    submissionId: 'submission_1',
    assignmentId: 'assignment_1',
    taskId: 'task_qa',
    taskTitle: '问答质量标注',
    taskItemId: 'item_qa_1',
    externalId: 'qa_1',
    datasetKind: 'qa_quality',
    status: 'NEEDS_REVISION',
    round: 1,
    answers: { quality: 'pass' },
    submittedAt: '2026-05-21T08:00:00.000Z',
  },
];

describe('MyDataPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('展示我的数据统计、列表并支持筛选', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: stats }))
      .mockResolvedValueOnce(jsonResponse({ data: submissions }))
      .mockResolvedValueOnce(jsonResponse({ data: stats }))
      .mockResolvedValueOnce(jsonResponse({ data: submissions }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <MyDataPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '我的数据' })).toBeInTheDocument();
    expect(screen.getByText('问答质量标注')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: '我的数据列表' })).getByText('待修改')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回标注台' })).toHaveAttribute(
      'href',
      '/labeler/tasks/task_qa/items/item_qa_1?assignmentId=assignment_1',
    );

    await user.selectOptions(screen.getByLabelText('提交状态筛选'), 'NEEDS_REVISION');
    await user.selectOptions(screen.getByLabelText('数据集筛选'), 'qa_quality');
    await user.type(screen.getByLabelText('题目 ID 筛选'), 'qa_1');
    await user.click(screen.getByRole('button', { name: '筛选' }));

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/labeler/submissions?labelerId=user_labeler_li_lei&status=NEEDS_REVISION&datasetKind=qa_quality&itemId=qa_1',
      expect.objectContaining({ method: 'GET' }),
    );
    const summary = screen.getByText('已提交').closest('.my-data-summary');
    expect(summary).not.toBeNull();
    expect(within(summary as HTMLElement).getByText('3')).toBeInTheDocument();
  });
});

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

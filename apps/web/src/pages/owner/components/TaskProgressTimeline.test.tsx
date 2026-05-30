import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { TaskDto } from '../../../api/tasks';
import { TaskProgressTimeline } from './TaskProgressTimeline';

const baseTask: TaskDto = {
  id: 'task_1',
  title: '问答质量标注',
  description: null,
  richTextInstruction: null,
  tags: [],
  rewardRule: null,
  rewardPerItem: null,
  perUserLimit: null,
  quota: 12,
  deadline: '2026-06-01T15:59:00.000Z',
  distributionStrategy: 'FIRST_COME_FIRST_SERVE',
  aiPreReviewEnabled: true,
  aiRuleName: null,
  status: 'PUBLISHED',
  templateId: 'template_1',
  template: {
    id: 'template_1',
    name: '问答模板',
    datasetKind: 'qa_quality',
    schemaVersion: 'r1',
    status: 'PUBLISHED',
  },
  createdById: 'owner_1',
  itemCount: 12,
  completedItemCount: 0,
  exportableItemCount: 0,
  createdAt: '2026-05-30T00:00:00.000Z',
  updatedAt: '2026-05-30T00:00:00.000Z',
};

describe('TaskProgressTimeline', () => {
  it('已发布但无人领取时高亮已发布阶段', () => {
    render(<TaskProgressTimeline task={{ ...baseTask, assignedItemCount: 0, submittedItemCount: 0 }} />);

    const timeline = screen.getByRole('region', { name: '当前进度' });
    expect(within(timeline).getByText('已发布').closest('li')).toHaveClass('is-current');
    expect(within(timeline).getByText('待领取').closest('li')).toHaveClass('is-pending');
  });

  it('已领取但未提交时高亮领取阶段', () => {
    render(<TaskProgressTimeline task={{ ...baseTask, assignedItemCount: 3, submittedItemCount: 0 }} />);

    const timeline = screen.getByRole('region', { name: '当前进度' });
    expect(within(timeline).getByText('已领取 3 题').closest('li')).toHaveClass('is-current');
    expect(within(timeline).getByText('待提交 AI 预审').closest('li')).toHaveClass('is-pending');
  });

  it('未启用 AI 预审时不展示 AI 预审节点，提交后直接进入复审链路', () => {
    const { container } = render(
      <TaskProgressTimeline
        task={{
          ...baseTask,
          aiPreReviewEnabled: false,
          assignedItemCount: 3,
          submittedItemCount: 3,
          workflowProgress: [
            { id: 'published', type: 'published', createdAt: '2026-05-30T09:00:00.000Z' },
            { id: 'claimed', type: 'claimed', actorName: '李雷', itemCount: 3, createdAt: '2026-05-30T09:05:00.000Z' },
            { id: 'submit-1', type: 'submitted', actorName: '李雷', createdAt: '2026-05-30T09:20:00.000Z' },
            { id: 'final', type: 'reviewer_final', status: 'pending', createdAt: '2026-05-30T09:50:00.000Z' },
          ],
        }}
      />,
    );

    expect(progressLabels(container)).toEqual([
      '已发布',
      '李雷已领取 3 题',
      '李雷提交复审',
      '待终审',
    ]);
    expect(screen.queryByText(/AI 预审/)).not.toBeInTheDocument();
    expect(getProgressItemByLabel(container, '李雷提交复审')).toHaveClass('is-current');
  });

  it('未启用 AI 预审且没有事件数据时 fallback 也不展示 AI 预审', () => {
    render(
      <TaskProgressTimeline
        task={{
          ...baseTask,
          aiPreReviewEnabled: false,
          assignedItemCount: 3,
          submittedItemCount: 0,
          workflowProgress: undefined,
        }}
      />,
    );

    expect(screen.getByText('待提交复审')).toBeInTheDocument();
    expect(screen.getByText('待终审')).toBeInTheDocument();
    expect(screen.queryByText(/AI 预审/)).not.toBeInTheDocument();
  });

  it('AI 预审打回后再次提交时按时间顺序展示打回和再次提交', () => {
    const { container } = render(
      <TaskProgressTimeline
        task={{
          ...baseTask,
          workflowProgress: [
            { id: 'published', type: 'published', createdAt: '2026-05-30T09:00:00.000Z' },
            { id: 'claimed', type: 'claimed', actorName: '张三', itemCount: 3, createdAt: '2026-05-30T09:05:00.000Z' },
            { id: 'submit-1', type: 'ai_review_submitted', actorName: '张三', createdAt: '2026-05-30T09:20:00.000Z' },
            { id: 'reject-1', type: 'ai_review_rejected', createdAt: '2026-05-30T09:30:00.000Z' },
            {
              id: 'submit-2',
              type: 'ai_review_submitted',
              actorName: '张三',
              createdAt: '2026-05-30T09:45:00.000Z',
              status: 'current',
            },
          ],
        }}
      />,
    );

    expect(progressLabels(container)).toEqual([
      '已发布',
      '张三已领取 3 题',
      '张三提交 AI 预审',
      'AI 预审打回',
      '张三再次提交 AI 预审',
    ]);
    expect(screen.getByText('AI 预审打回').closest('li')).toHaveClass('is-warning');
    expect(getProgressItemByLabel(container, '张三再次提交 AI 预审')).toHaveClass('is-current');
  });

  it('AI 预审打回后未再次提交时高亮打回节点', () => {
    const { container } = render(
      <TaskProgressTimeline
        task={{
          ...baseTask,
          workflowProgress: [
            { id: 'published', type: 'published', createdAt: '2026-05-30T09:00:00.000Z' },
            { id: 'claimed', type: 'claimed', actorName: '张三', itemCount: 3, createdAt: '2026-05-30T09:05:00.000Z' },
            { id: 'submit-1', type: 'ai_review_submitted', actorName: '张三', createdAt: '2026-05-30T09:20:00.000Z' },
            { id: 'reject-1', type: 'ai_review_rejected', createdAt: '2026-05-30T09:30:00.000Z' },
            { id: 'final', type: 'reviewer_final', status: 'pending', createdAt: '2026-05-30T09:50:00.000Z' },
          ],
        }}
      />,
    );

    expect(getProgressItemByLabel(container, 'AI 预审打回')).toHaveClass('is-current');
    expect(screen.getByText('待终审')).toBeInTheDocument();
  });

  it('AI 预审通过并进入终审时展示真实人名', () => {
    const { container } = render(
      <TaskProgressTimeline
        task={{
          ...baseTask,
          workflowProgress: [
            { id: 'published', type: 'published', createdAt: '2026-05-30T09:00:00.000Z' },
            { id: 'claimed', type: 'claimed', actorName: '李雷', createdAt: '2026-05-30T09:05:00.000Z' },
            { id: 'submit-1', type: 'ai_review_submitted', actorName: '李雷', createdAt: '2026-05-30T09:20:00.000Z' },
            { id: 'pass-1', type: 'ai_review_passed', createdAt: '2026-05-30T09:30:00.000Z' },
            { id: 'final-1', type: 'reviewer_final', actorName: '王敏', createdAt: '2026-05-30T09:50:00.000Z' },
          ],
        }}
      />,
    );

    expect(screen.getByText('AI 预审通过').closest('li')).toHaveClass('is-completed');
    expect(getProgressItemByLabel(container, '王敏终审')).toHaveClass('is-current');
    expect(screen.queryByText(/Reviewer|标注员/)).not.toBeInTheDocument();
  });

  it('超过一行时按蛇形折返布局并在行尾绘制垂直连接线', () => {
    const { container } = render(
      <TaskProgressTimeline
        task={{
          ...baseTask,
          workflowProgress: [
            { id: 'published', type: 'published', createdAt: '2026-05-30T09:00:00.000Z' },
            { id: 'claimed', type: 'claimed', actorName: '张三', itemCount: 3, createdAt: '2026-05-30T09:05:00.000Z' },
            { id: 'submit-1', type: 'ai_review_submitted', actorName: '张三', createdAt: '2026-05-30T09:20:00.000Z' },
            { id: 'reject-1', type: 'ai_review_rejected', createdAt: '2026-05-30T09:30:00.000Z' },
            { id: 'submit-2', type: 'ai_review_submitted', actorName: '张三', createdAt: '2026-05-30T09:45:00.000Z' },
            { id: 'pass-1', type: 'ai_review_passed', createdAt: '2026-05-30T10:00:00.000Z' },
            { id: 'final-1', type: 'reviewer_final', actorName: '王敏', createdAt: '2026-05-30T10:20:00.000Z' },
          ],
        }}
      />,
    );

    const nodes = Array.from(container.querySelectorAll('.task-progress-timeline__node'));
    expect(nodes[0]).toHaveStyle({ gridColumn: '1', gridRow: '1' });
    expect(nodes[4]).toHaveStyle({ gridColumn: '5', gridRow: '1' });
    expect(nodes[5]).toHaveStyle({ gridColumn: '5', gridRow: '3' });
    expect(nodes[6]).toHaveStyle({ gridColumn: '4', gridRow: '3' });
    expect(nodes[5]).toHaveClass('is-row-reverse');
    expect(container.querySelector('.task-progress-timeline__turn')).toHaveClass('is-connector-complete');
  });

  it('事件缺少人员时展示待处理文案，不回退为角色泛称', () => {
    render(
      <TaskProgressTimeline
        task={{
          ...baseTask,
          workflowProgress: [
            { id: 'published', type: 'published', createdAt: '2026-05-30T09:00:00.000Z' },
            { id: 'claimed', type: 'claimed', status: 'pending', createdAt: '2026-05-30T09:05:00.000Z' },
            { id: 'submit', type: 'ai_review_submitted', status: 'pending', createdAt: '2026-05-30T09:20:00.000Z' },
            { id: 'final', type: 'reviewer_final', status: 'pending', createdAt: '2026-05-30T09:50:00.000Z' },
          ],
        }}
      />,
    );

    expect(screen.getByText('待领取')).toBeInTheDocument();
    expect(screen.getByText('待提交 AI 预审')).toBeInTheDocument();
    expect(screen.getByText('待终审')).toBeInTheDocument();
    expect(screen.queryByText(/Reviewer|标注员/)).not.toBeInTheDocument();
  });
});

const progressLabels = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('.task-progress-timeline__label')).map(
    (node) => node.textContent ?? '',
  );

const getProgressItemByLabel = (container: HTMLElement, label: string): Element => {
  const labelNode = Array.from(container.querySelectorAll('.task-progress-timeline__label')).find(
    (node) => node.textContent === label,
  );

  expect(labelNode).toBeTruthy();

  return labelNode!.closest('.task-progress-timeline__node')!;
};

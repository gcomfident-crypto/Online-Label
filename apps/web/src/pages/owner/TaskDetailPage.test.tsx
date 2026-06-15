import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TaskDetailPage } from './TaskDetailPage';

const task = {
  id: 'task_1',
  title: '商品标题清洗 v3 · 抖音电商',
  description: '清洗商品标题并补充关键词。',
  richTextInstruction: '请保留核心商品信息。',
  tags: ['电商', '文本清洗', '中文'],
  rewardRule: '0.30 元 / 条',
  quota: 5000,
  deadline: '2026-06-01T15:59:00.000Z',
  distributionStrategy: 'FIRST_COME_FIRST_SERVE',
  aiPreReviewEnabled: true,
  aiRuleName: '电商相关性 v2',
  status: 'PUBLISHED',
  templateId: 'template_1',
  template: {
    id: 'template_1',
    name: '商品清洗 · v3',
    schemaVersion: 'r12',
    status: 'PUBLISHED',
  },
  createdById: 'user_owner_zhang_man',
  itemCount: 2340,
  createdAt: '2026-05-10T00:00:00.000Z',
  updatedAt: '2026-05-10T00:00:00.000Z',
};

describe('TaskDetailPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('读取任务详情和审计日志', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: task }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              taskId: 'task_1',
              fromStatus: 'DRAFT',
              toStatus: 'PUBLISHED',
              actorId: 'user_owner_zhang_man',
              metadata: { action: 'TASK_PUBLISHED' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: 'report_1',
              taskId: 'task_1',
              taskItemId: 'item_1',
              assignmentId: 'assignment_1',
              reporterId: 'user_labeler_li_lei',
              status: 'PENDING',
              reason: '回答 B 缺失，无法判断偏好。',
              ownerComment: null,
              resolution: null,
              resolvedById: null,
              resolvedAt: null,
              createdAt: '2026-05-21T10:00:00.000Z',
              updatedAt: '2026-05-21T10:00:00.000Z',
              taskItem: {
                id: 'item_1',
                externalId: 'P0001',
                rawData: {},
                status: 'ASSIGNED',
              },
              reporter: { id: 'user_labeler_li_lei', name: 'Labeler 演示账号' },
              resolvedBy: null,
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/owner/tasks/task_1']}>
        <Routes>
          <Route path="/owner/tasks/:taskId" element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '商品标题清洗 v3 · 抖音电商' })).toBeInTheDocument();
    expect(screen.getByText('进行中')).toBeInTheDocument();
    expect(screen.getByText('商品清洗 · v3 (Schema r12)')).toBeInTheDocument();
    expect(screen.getByText('0 / 2,340')).toBeInTheDocument();

    const auditRegion = screen.getByRole('region', { name: '审计日志' });
    expect(within(auditRegion).getByText('TASK_PUBLISHED')).toBeInTheDocument();
    expect(within(auditRegion).getByText('草稿 → 进行中')).toBeInTheDocument();
    const reportRegion = screen.getByRole('region', { name: '题目上报处理' });
    expect(within(reportRegion).getByText('P0001')).toBeInTheDocument();
    expect(within(reportRegion).getByText('回答 B 缺失，无法判断偏好。')).toBeInTheDocument();
    expect(within(reportRegion).getByRole('button', { name: '确认作废' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/tasks/task_1', expect.objectContaining({ method: 'GET' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/tasks/task_1/audit-logs',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/tasks/task_1/item-reports',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

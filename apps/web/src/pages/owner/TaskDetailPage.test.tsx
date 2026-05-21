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
    expect(screen.getByText('发布中')).toBeInTheDocument();
    expect(screen.getByText('商品清洗 · v3 (Schema r12)')).toBeInTheDocument();

    const auditRegion = screen.getByRole('region', { name: '审计日志' });
    expect(within(auditRegion).getByText('TASK_PUBLISHED')).toBeInTheDocument();
    expect(within(auditRegion).getByText('草稿 → 发布中')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/tasks/task_1', expect.objectContaining({ method: 'GET' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/tasks/task_1/audit-logs',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

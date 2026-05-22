import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkbenchPage } from './WorkbenchPage';

const qaWorkbench = {
  assignment: {
    id: 'assignment_1',
    taskId: 'task_qa',
    taskItemId: 'item_qa_1',
    assigneeId: 'user_labeler_li_lei',
    status: 'IN_PROGRESS',
    claimedAt: '2026-05-21T00:00:00.000Z',
  },
  task: {
    id: 'task_qa',
    title: '问答质量标注',
    description: '检查回答是否解决核心诉求。',
    richTextInstruction: '请补充判断依据。',
    tags: ['问答'],
    rewardRule: '0.30 元 / 条',
    quota: 30,
    deadline: '2026-06-01T15:59:00.000Z',
    templateId: 'template_qa',
    templateName: '问答质量官方模板',
    datasetKind: 'qa_quality',
    schemaVersion: 'r1',
    schema: {
      schemaVersion: 'r1',
      datasetKind: 'qa_quality',
      fields: [
        {
          key: 'quality_field',
          fieldKey: 'quality',
          type: 'radio',
          label: '整体质量',
          validation: { required: true },
          options: [
            { label: '合格', value: 'pass' },
            { label: '优秀', value: 'excellent' },
          ],
        },
        {
          key: 'comment_field',
          fieldKey: 'comment',
          type: 'textarea',
          label: '审核意见',
        },
      ],
    },
  },
  taskItem: {
    id: 'item_qa_1',
    externalId: 'qa_1',
    datasetKind: 'qa_quality',
    rawData: {
      prompt: '如何判断回答质量？',
      model_answer: '检查事实性、完整性和表达清晰度。',
      reference: '应覆盖核心判断依据。',
      expected_dimensions: ['事实性', '完整性'],
      media_type: 'text',
    },
    status: 'ASSIGNED',
    sortOrder: 8,
  },
  draft: null,
  rejectionNotice: {
    submissionId: 'submission_0',
    round: 1,
    reason: '请补充判断依据。',
    createdAt: '2026-05-21T03:00:00.000Z',
  },
  submissionHistory: [],
};

const stats = {
  labelerId: 'user_labeler_li_lei',
  taskId: 'task_qa',
  totalAssignments: 1,
  submittedCount: 0,
  aiQueuedCount: 0,
  approvedCount: 0,
  rejectedCount: 1,
  needsRevisionCount: 1,
};

describe('WorkbenchPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('渲染图 3 工作台结构并提交合法答案', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { ...qaWorkbench, draft: { answers: { quality: 'pass' } } } }))
      .mockResolvedValueOnce(jsonResponse({ data: stats }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 'draft_1',
            assignmentId: 'assignment_1',
            answers: { quality: 'pass' },
            schemaVersion: 'r1',
            createdAt: '2026-05-21T00:00:00.000Z',
            updatedAt: '2026-05-21T08:02:31.000Z',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 'submission_1',
            assignmentId: 'assignment_1',
            status: 'AI_QUEUED',
            round: 2,
            answers: { quality: 'pass' },
            schemaVersion: 'r1',
            submittedAt: '2026-05-21T08:03:00.000Z',
            createdAt: '2026-05-21T08:03:00.000Z',
            updatedAt: '2026-05-21T08:03:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { ...stats, submittedCount: 1, aiQueuedCount: 1 } }));
    vi.stubGlobal('fetch', fetchMock);

    renderWorkbenchPage();

    expect(await screen.findByRole('heading', { name: /问答质量标注/ })).toBeInTheDocument();
    expect(screen.getByLabelText('题目导航')).toBeInTheDocument();
    expect(screen.getByLabelText('贡献、历史和快捷键')).toBeInTheDocument();
    expect(screen.getByLabelText('上一轮打回原因')).toHaveTextContent('请补充判断依据。');
    expect(screen.getByLabelText('问答质量材料')).toHaveTextContent('如何判断回答质量？');

    await user.click(screen.getByRole('button', { name: '提交本题 →' }));

    expect(await screen.findByText('提交成功，已进入 AI 预审队列。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/submissions',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"assignmentId":"assignment_1"'),
      }),
    );
  });

  it('提交前会展示前端必填校验错误', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ data: qaWorkbench }))
        .mockResolvedValueOnce(jsonResponse({ data: stats })),
    );

    renderWorkbenchPage();

    await screen.findByRole('heading', { name: /问答质量标注/ });
    await user.click(screen.getByRole('button', { name: '提交本题 →' }));

    await screen.findByText('提交前请修正以下内容');
    const summary = screen.getByText('提交前请修正以下内容').closest('.submission-validation-summary');
    expect(summary).not.toBeNull();
    expect(within(summary as HTMLElement).getByText('整体质量为必填项。')).toBeInTheDocument();
  });

  it('支持保存、切题和报告快捷键', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { ...qaWorkbench, draft: { answers: { quality: 'pass' } } } }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...stats, totalAssignments: 2 } }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 'draft_1',
            assignmentId: 'assignment_1',
            answers: { quality: 'pass' },
            schemaVersion: 'r1',
            createdAt: '2026-05-21T00:00:00.000Z',
            updatedAt: '2026-05-21T08:04:00.000Z',
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderWorkbenchPage();

    await screen.findByRole('heading', { name: /问答质量标注/ });
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByText('草稿已保存。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/drafts/assignment_1',
      expect.objectContaining({ method: 'PUT' }),
    );

    await user.keyboard('j');
    expect(await screen.findByText('当前演示仅加载本题，请从任务广场进入下一题。')).toBeInTheDocument();

    await user.keyboard('k');
    expect(await screen.findByText('已经是当前加载范围的第一题。')).toBeInTheDocument();

    await user.keyboard('r');
    expect(await screen.findByText('请在本题备注中说明异常，提交后会随答案进入审核。')).toBeInTheDocument();
  });
});

const renderWorkbenchPage = () => {
  render(
    <MemoryRouter initialEntries={['/labeler/tasks/task_qa/items/item_qa_1?assignmentId=assignment_1']}>
      <Routes>
        <Route path="/labeler/tasks/:taskId/items/:itemId" element={<WorkbenchPage />} />
      </Routes>
    </MemoryRouter>,
  );
};

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

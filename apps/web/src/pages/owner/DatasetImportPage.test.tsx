import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DatasetImportPage } from './DatasetImportPage';

const task = {
  id: 'task_1',
  title: '问答质量标注',
  description: '检查回答是否解决核心诉求。',
  richTextInstruction: '请按标准评估回答质量。',
  tags: ['问答', '官方数据'],
  rewardRule: '0.30 元 / 条',
  quota: 30,
  deadline: '2026-06-01T15:59:00.000Z',
  distributionStrategy: 'FIRST_COME_FIRST_SERVE',
  aiPreReviewEnabled: true,
  aiRuleName: '问答质量 v1',
  status: 'DRAFT',
  templateId: 'template_qa',
  template: {
    id: 'template_qa',
    name: '问答质量官方模板',
    schemaVersion: 'r1',
    status: 'PUBLISHED',
  },
  createdById: 'user_owner_zhang_man',
  itemCount: 1,
  createdAt: '2026-05-21T00:00:00.000Z',
  updatedAt: '2026-05-21T00:00:00.000Z',
};

const taskItem = {
  id: 'item_qa_1',
  taskId: 'task_1',
  externalId: 'qa_1',
  datasetKind: 'qa_quality',
  rawData: {
    id: 'qa_1',
    prompt: '如何判断回答质量？',
    model_answer: '需要检查事实性、完整性和表达清晰度。',
  },
  status: 'UNASSIGNED',
  sortOrder: 1,
  createdAt: '2026-05-21T00:00:00.000Z',
  updatedAt: '2026-05-21T00:00:00.000Z',
};

describe('DatasetImportPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('导入 JSONL 后显示导入统计并刷新题目预览', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: task }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            taskId: 'task_1',
            datasetKind: 'qa_quality',
            importedCount: 1,
            errorCount: 0,
            skippedFiles: [],
            fields: ['id', 'prompt', 'model_answer'],
            errors: [],
            preview: [taskItem],
            files: [
              {
                datasetKind: 'qa_quality',
                format: 'jsonl',
                fileName: 'dataset.jsonl',
                fields: ['id', 'prompt', 'model_answer'],
                importedCount: 1,
                errorCount: 0,
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [taskItem] }));
    vi.stubGlobal('fetch', fetchMock);

    renderDatasetImportPage();

    expect(await screen.findByRole('heading', { name: '题目数据导入' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('文本内容'), {
      target: {
        value: '{"id":"qa_1","prompt":"如何判断回答质量？","model_answer":"需要检查事实性。"}',
      },
    });
    await user.click(screen.getByRole('button', { name: '导入数据' }));

    expect(await screen.findByText('已导入 1 条题目。')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '题目预览' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/tasks/task_1/items/import',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"format":"jsonl"'),
      }),
    );
  });

  it('支持选择未领取题目并批量写入 rawData 字段', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: task }))
      .mockResolvedValueOnce(jsonResponse({ data: [taskItem] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            ...taskItem,
            rawData: {
              ...taskItem.rawData,
              tags: ['官方数据'],
            },
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderDatasetImportPage();

    await screen.findByRole('table', { name: '题目预览' });
    await user.click(screen.getByLabelText('选择 qa_1'));
    await user.type(screen.getByLabelText('批量字段名'), 'tags');
    fireEvent.change(screen.getByLabelText('批量字段值'), {
      target: { value: '["官方数据"]' },
    });
    await user.click(screen.getByRole('button', { name: '批量写入字段' }));

    expect(await screen.findByText('已批量更新 1 条题目。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/task-items/item_qa_1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ rawDataPatch: { tags: ['官方数据'] } }),
      }),
    );
  });
});

const renderDatasetImportPage = () => {
  render(
    <MemoryRouter initialEntries={['/owner/tasks/task_1/dataset']}>
      <Routes>
        <Route path="/owner/tasks/:taskId/dataset" element={<DatasetImportPage />} />
      </Routes>
    </MemoryRouter>,
  );
};

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

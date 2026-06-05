import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiRuleConfigPage } from './AiRuleConfigPage';

describe('AiRuleConfigPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('加载任务 AI 审核规则并保存新版本', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [task] }))
      .mockResolvedValueOnce(jsonResponse({ data: rule }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...rule, promptVersion: 2, name: '问答质量 AI 预审 v2' } }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <AiRuleConfigPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'AI 规则配置' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('问答质量 AI 预审 v1')).toBeInTheDocument();
    expect(screen.getByText('Prompt v1 · 维度 v1')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'mock' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'deepseek' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'custom' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('规则名称'));
    await user.type(screen.getByLabelText('规则名称'), '问答质量 AI 预审 v2');
    await user.click(screen.getByRole('button', { name: '保存规则新版本' }));

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/tasks/task_qa/review-rule',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('问答质量 AI 预审 v2'),
      }),
    );
    expect(await screen.findByText('规则已保存为新版本')).toBeInTheDocument();
  });
});

const task = {
  id: 'task_qa',
  title: '问答质量标注',
  description: '演示任务',
  richTextInstruction: '',
  tags: ['问答'],
  rewardRule: '0.30 元 / 条',
  quota: 30,
  deadline: '2026-06-01T15:59:00.000Z',
  distributionStrategy: 'FIRST_COME_FIRST_SERVE',
  aiPreReviewEnabled: true,
  aiRuleName: '问答质量 AI 预审 v1',
  status: 'PUBLISHED',
  templateId: 'template_qa',
  template: { id: 'template_qa', name: '问答质量官方模板', schemaVersion: 'r1', status: 'PUBLISHED' },
  createdById: 'user_owner_zhang_man',
  itemCount: 30,
  createdAt: '2026-05-21T00:00:00.000Z',
  updatedAt: '2026-05-21T00:00:00.000Z',
};

const rule = {
  id: 'rule_1',
  taskId: 'task_qa',
  stage: 'AI_PRECHECK',
  name: '问答质量 AI 预审 v1',
  promptTemplate: '请根据 prompt、model_answer、reference、expected_dimensions 和 answers 输出结构化结果。',
  promptVersion: 1,
  dimensions: [
    { key: 'relevance', label: '相关性', maxScore: 100 },
    { key: 'overall', label: '综合', maxScore: 100 },
  ],
  dimensionVersion: 1,
  passThreshold: 80,
  manualThreshold: 60,
  provider: 'deepseek',
  model: 'deepseek-chat',
  temperature: 0,
  structuredOutputMode: 'json_schema',
  enabled: true,
  createdById: null,
  createdAt: '2026-05-21T00:00:00.000Z',
  updatedAt: '2026-05-21T00:00:00.000Z',
};

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

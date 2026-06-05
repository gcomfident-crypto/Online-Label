import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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

const taskAssignments = [
  {
    assignmentId: 'assignment_1',
    taskId: 'task_qa',
    taskTitle: '问答质量标注',
    taskItemId: 'item_qa_1',
    taskItemSortOrder: 8,
    externalId: 'qa_1',
    datasetKind: 'qa_quality',
    status: 'IN_PROGRESS',
    round: 0,
    latestSubmissionStatus: null,
    latestSubmittedAt: null,
    claimedAt: '2026-05-21T00:00:00.000Z',
    templateName: '问答质量官方模板',
    schemaVersion: 'r1',
  },
  {
    assignmentId: 'assignment_2',
    taskId: 'task_qa',
    taskTitle: '问答质量标注',
    taskItemId: 'item_qa_2',
    taskItemSortOrder: 9,
    externalId: 'qa_2',
    datasetKind: 'qa_quality',
    status: 'ASSIGNED',
    round: 0,
    latestSubmissionStatus: null,
    latestSubmittedAt: null,
    claimedAt: '2026-05-21T00:05:00.000Z',
    templateName: '问答质量官方模板',
    schemaVersion: 'r1',
  },
];

const aiRejectedWorkbench = {
  ...qaWorkbench,
  assignment: { ...qaWorkbench.assignment, status: 'NEEDS_REVISION' },
  task: {
    ...qaWorkbench.task,
    schema: {
      ...qaWorkbench.task.schema,
      fields: [
        {
          key: 'qa_show_item',
          type: 'show_item',
          label: '展示项',
          displayConfig: {
            layout: 'table',
            fields: [
              { sourceKey: 'prompt', label: 'Prompt', format: 'long_text' },
              { sourceKey: 'model_answer', label: '模型回答', format: 'long_text' },
            ],
          },
        },
        {
          ...qaWorkbench.task.schema.fields[0],
          aiReview: {
            enabled: true,
            requirement: '判断整体质量是否与题目材料和任务要求一致。',
          },
        },
        {
          ...qaWorkbench.task.schema.fields[1],
          aiReview: {
            enabled: true,
            requirement: '审核意见需说明关键事实依据。',
          },
        },
      ],
    },
  },
  rejectionNotice: {
    submissionId: 'submission_ai_reject',
    round: 2,
    reason: '关键词字段过于稀疏，未覆盖商品核心卖点。',
    createdAt: '2026-05-21T08:10:00.000Z',
  },
  submissionHistory: [
    {
      id: 'submission_ai_reject',
      status: 'NEEDS_REVISION',
      round: 2,
      answers: {
        quality: 'pass',
        comment: '可以通过。',
      },
      schemaVersion: 'r1',
      submittedAt: '2026-05-21T08:09:00.000Z',
      reviewRecords: [
        {
          decision: 'reject',
          comment: '关键词字段过于稀疏，建议补充至少 4 个关键词。',
          scores: {
            relevance: 78,
            accuracy: 55,
            format: 70,
            safety: 99,
            overall: 62,
            reason: '关键词字段过于稀疏，未覆盖商品核心卖点。',
          },
          structuredOutput: {
            verdict: 'reject',
            overallScore: 62,
            fieldReviews: [
              {
                fieldKey: 'quality',
                label: '整体质量',
                score: 91,
                decision: 'pass',
                comment: '整体质量选择符合题目要求。',
                suggestions: [],
              },
              {
                fieldKey: 'comment',
                label: '审核意见',
                score: 48,
                decision: 'reject',
                comment: '审核意见过短，未解释核心判断依据。',
                suggestions: ['补充事实性、完整性和表达清晰度的判断依据。'],
              },
            ],
            overallComment: '审核意见未通过 AI 预审，建议打回给标注员修改。',
          },
          createdAt: '2026-05-21T08:10:00.000Z',
        },
      ],
    },
  ],
};

const aiPassedWorkbench = {
  ...aiRejectedWorkbench,
  assignment: { ...aiRejectedWorkbench.assignment, status: 'SUBMITTED' },
  rejectionNotice: null,
  submissionHistory: [
    {
      ...aiRejectedWorkbench.submissionHistory[0],
      status: 'HUMAN_PENDING',
      reviewRecords: [
        {
          ...aiRejectedWorkbench.submissionHistory[0].reviewRecords[0],
          decision: 'pass',
          comment: '所有字段均通过 AI 预审。',
          scores: {
            overall: 92,
          },
          structuredOutput: {
            verdict: 'pass',
            overallScore: 92,
            fieldReviews: [
              {
                fieldKey: 'quality',
                label: '整体质量',
                score: 91,
                decision: 'pass',
                comment: '整体质量选择符合题目要求。',
                suggestions: [],
              },
              {
                fieldKey: 'comment',
                label: '审核意见',
                score: 93,
                decision: 'pass',
                comment: '审核意见已说明关键判断依据。',
                suggestions: [],
              },
            ],
            overallComment: '所有开启 AI 预审的字段均通过。',
          },
        },
      ],
    },
  ],
};

const historyWorkbench = {
  ...qaWorkbench,
  assignment: { ...qaWorkbench.assignment, status: 'NEEDS_REVISION' },
  rejectionNotice: {
    submissionId: 'submission_history',
    round: 1,
    reason: '请根据复审意见修改。',
    createdAt: '2026-05-16T15:08:00.000Z',
  },
  submissionHistory: [
    {
      id: 'submission_history',
      status: 'NEEDS_REVISION',
      round: 1,
      answers: { quality: 'pass' },
      schemaVersion: 'r1',
      submittedAt: '2026-05-16T14:22:00.000Z',
      reviewRecords: [
        {
          stage: 'AI_PRECHECK',
          reviewerType: 'AI',
          assignedReviewerId: null,
          decision: 'reject',
          comment: 'AI 预审打回。',
          scores: { overall: 62 },
          createdAt: '2026-05-16T14:22:30.000Z',
        },
        {
          stage: 'RECHECK',
          reviewerType: 'HUMAN',
          assignedReviewerId: 'user_reviewer_wang_fang',
          decision: 'reject',
          comment: '复审打回。',
          scores: {},
          createdAt: '2026-05-16T15:08:00.000Z',
        },
      ],
    },
  ],
};

describe('WorkbenchPage', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('渲染图 3 工作台结构并按任务统一提交合法答案', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { ...qaWorkbench, draft: { answers: { quality: 'pass' } } } }))
      .mockResolvedValueOnce(jsonResponse({ data: stats }))
      .mockResolvedValueOnce(jsonResponse({ data: taskAssignments }))
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
            taskId: 'task_qa',
            labelerId: 'user_labeler_li_lei',
            submittedCount: 2,
            submissions: [
              {
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
              {
                id: 'submission_2',
                assignmentId: 'assignment_2',
                status: 'AI_QUEUED',
                round: 1,
                answers: { quality: 'excellent' },
                schemaVersion: 'r1',
                submittedAt: '2026-05-21T08:03:00.000Z',
                createdAt: '2026-05-21T08:03:00.000Z',
                updatedAt: '2026-05-21T08:03:00.000Z',
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { ...stats, submittedCount: 1, aiQueuedCount: 1 } }));
    vi.stubGlobal('fetch', fetchMock);

    renderWorkbenchPage();

    expect(await screen.findByRole('heading', { name: '问答质量标注' })).toBeInTheDocument();
    const pageDescription = screen.getByText(
      '围绕当前题目展示原始数据、标注表单、审核反馈和任务进度，支持逐题完成并提交标注结果',
    );
    expect(pageDescription).toHaveClass('task-management-table-description');
    expect(pageDescription.closest('.workbench-topline')).not.toBeNull();
    expect(screen.getByRole('button', { name: '返回我的工作台' })).toBeInTheDocument();
    expect(screen.queryByText(/模板 r1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/题目 ID/)).not.toBeInTheDocument();
    const navigationPanel = screen.getByRole('complementary', { name: '题目导航' });
    expect(within(navigationPanel).getByRole('heading', { name: '题目导航' })).toBeInTheDocument();
    expect(navigationPanel).toHaveTextContent('已完成 50% · 当前第 1 题');
    expect(navigationPanel).not.toHaveTextContent('1 / 2');
    expect(navigationPanel).not.toHaveTextContent('当前题 qa_1');
    expect(navigationPanel).toHaveTextContent('qa_1');
    expect(within(navigationPanel).getByRole('button', { name: /qa_1/ })).toHaveTextContent('已完成');
    expect(within(navigationPanel).queryByRole('button', { name: /上一题/ })).not.toBeInTheDocument();
    expect(within(navigationPanel).queryByRole('button', { name: /下一题/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: '物料' })).not.toBeInTheDocument();
    expect(screen.queryByText('题目数据')).not.toBeInTheDocument();
    expect(screen.queryByText('模板字段')).not.toBeInTheDocument();
    expect(screen.getByRole('main', { name: '标注画布' })).toBeInTheDocument();
    expect(screen.queryByLabelText('属性配置')).not.toBeInTheDocument();
    expect(screen.queryByText(/属性配置/)).not.toBeInTheDocument();
    expect(screen.queryByText('任务信息')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '基础信息' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '标注信息' })).toBeInTheDocument();
    const workbenchActions = screen.getByLabelText('标注操作');
    expect(screen.queryByLabelText('标注操作栏')).not.toBeInTheDocument();
    expect(within(workbenchActions).queryByText('基础信息')).not.toBeInTheDocument();
    expect(within(workbenchActions).getByText('0.30 元 / 条')).toHaveClass('workbench-reward-pill');
    expect(within(workbenchActions).queryByRole('button', { name: '报告题目' })).not.toBeInTheDocument();
    const annotationCanvas = screen.getByRole('main', { name: '标注画布' });
    const submitActionButtons = within(annotationCanvas)
      .getAllByRole('button')
      .filter((button) =>
        ['报告题目', '保存草稿', '提交任务'].includes(button.textContent?.trim() ?? ''),
      );
    expect(submitActionButtons.map((button) => button.textContent?.trim())).toEqual([
      '报告题目',
      '保存草稿',
      '提交任务',
    ]);
    expect(screen.queryByRole('tab', { name: '标注' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '+ 新 Tab' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '基础信息' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '跳过' })).not.toBeInTheDocument();
    expect(screen.queryByText('⌘/Ctrl + Enter 提交任务 · ⌘/Ctrl + S 保存 · J/K 切题 · R 报告')).not.toBeInTheDocument();
    expect(screen.getByLabelText('上一轮打回原因')).toHaveTextContent('请补充判断依据。');
    expect(screen.getByLabelText('问答质量材料')).toHaveTextContent('如何判断回答质量？');
    await user.click(screen.getByLabelText('优秀'));
    expect(screen.queryByText('草稿待自动保存')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '提交任务' }));

    expect(await screen.findByText('提交任务成功，2 条标注已进入 AI 预审队列')).toBeInTheDocument();
    const submitButton = screen.getByRole('button', { name: '提交任务' });
    expect(submitButton).toBeDisabled();
    await user.click(submitButton);
    await user.keyboard('{Control>}Enter{/Control}');
    expect(fetchMock.mock.calls.filter(([url]) => url === '/submissions/task')).toHaveLength(1);
    const itemHistory = screen.getByLabelText('本题历史列表');
    expect(itemHistory.textContent?.match(/李雷 · 提交/g)).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/submissions/task',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"currentAssignmentId":"assignment_1"'),
      }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith('/submissions', expect.anything());
  });

  it('提交任务后当前题目进入只读态，禁止草稿保存', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            ...qaWorkbench,
            draft: {
              answers: { quality: 'pass' },
            },
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: stats }))
      .mockResolvedValueOnce(jsonResponse({ data: taskAssignments }))
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
            taskId: 'task_qa',
            labelerId: 'user_labeler_li_lei',
            submittedCount: 1,
            submissions: [
              {
                id: 'submission_locked',
                assignmentId: 'assignment_1',
                status: 'AI_QUEUED',
                round: 1,
                answers: { quality: 'pass' },
                schemaVersion: 'r1',
                submittedAt: '2026-05-21T08:03:00.000Z',
                createdAt: '2026-05-21T08:03:00.000Z',
                updatedAt: '2026-05-21T08:03:00.000Z',
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            ...stats,
            submittedCount: 1,
            aiQueuedCount: 1,
          },
        }),
      );

    vi.stubGlobal('fetch', fetchMock);
    renderWorkbenchPage();

    await screen.findByRole('heading', { name: /问答质量标注/ });
    await user.click(screen.getByRole('button', { name: '提交任务' }));
    expect(await screen.findByText('提交任务成功，1 条标注已进入 AI 预审队列')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: '保存草稿' })).toBeDisabled();
    expect(screen.getByLabelText('审核意见')).toBeDisabled();
    expect(screen.getByRole('radio', { name: '优秀' })).toBeDisabled();
  });

  it('题目导航在切题后保留已填写题目的已完成状态', async () => {
    const user = userEvent.setup();
    const secondWorkbench = {
      ...qaWorkbench,
      assignment: {
        ...qaWorkbench.assignment,
        id: 'assignment_2',
        taskItemId: 'item_qa_2',
        status: 'ASSIGNED',
      },
      taskItem: {
        ...qaWorkbench.taskItem,
        id: 'item_qa_2',
        externalId: 'qa_2',
        rawData: {
          ...qaWorkbench.taskItem.rawData,
          prompt: '第二道题如何判断回答质量？',
        },
        sortOrder: 9,
      },
      draft: null,
      rejectionNotice: null,
      submissionHistory: [],
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/assignments/assignment_1/workbench') {
        return jsonResponse({ data: qaWorkbench });
      }

      if (url === '/assignments/assignment_2/workbench') {
        return jsonResponse({ data: secondWorkbench });
      }

      if (url.startsWith('/labeler/stats')) {
        return jsonResponse({ data: { ...stats, totalAssignments: 2 } });
      }

      if (url.startsWith('/labeler/assignments')) {
        return jsonResponse({ data: taskAssignments });
      }

      if (url.startsWith('/drafts/')) {
        const assignmentIdFromPath = url.split('/')[2] ?? 'assignment_1';
        return jsonResponse({
          data: {
            id: `draft_${assignmentIdFromPath}`,
            assignmentId: assignmentIdFromPath,
            answers: { quality: 'excellent' },
            schemaVersion: 'r1',
            createdAt: '2026-05-21T00:00:00.000Z',
            updatedAt: '2026-05-21T08:04:00.000Z',
          },
        });
      }

      return jsonResponse({ data: null });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWorkbenchPage();

    const navigationPanel = await screen.findByRole('complementary', { name: '题目导航' });
    await user.type(screen.getByLabelText('审核意见'), '先补充备注');
    const firstQuestionButton = within(navigationPanel).getByRole('button', { name: /qa_1/ });
    expect(firstQuestionButton).toHaveTextContent('进行中');
    expect(within(firstQuestionButton).getByText('进行中').closest('.question-navigator__status')).toHaveClass(
      'question-navigator__status--in-progress',
    );

    await user.click(screen.getByLabelText('优秀'));
    expect(within(navigationPanel).getByRole('button', { name: /qa_1/ })).toHaveTextContent('已完成');

    await user.click(screen.getByRole('button', { name: '下一题 →' }));
    expect(await screen.findByRole('heading', { name: '问答质量标注' })).toBeInTheDocument();

    const refreshedNavigationPanel = screen.getByRole('complementary', { name: '题目导航' });
    const completedQuestionButton = within(refreshedNavigationPanel).getByRole('button', { name: /qa_1/ });
    const pendingQuestionButton = within(refreshedNavigationPanel).getByRole('button', { name: /qa_2/ });
    expect(completedQuestionButton).toHaveTextContent('已完成');
    expect(within(completedQuestionButton).getByText('已完成').closest('.question-navigator__status')).toHaveClass(
      'question-navigator__status--complete',
    );
    expect(pendingQuestionButton).toHaveTextContent('待标注');
    expect(within(pendingQuestionButton).getByText('待标注').closest('.question-navigator__status')).toHaveClass(
      'question-navigator__status--pending',
    );
  });

  it('题目导航根据非当前题草稿答案直接显示已完成状态', async () => {
    const assignmentsWithCompletedDraft = taskAssignments.map((assignment) =>
      assignment.assignmentId === 'assignment_2'
        ? {
            ...assignment,
            status: 'IN_PROGRESS',
            draftAnswers: { quality: 'excellent' },
            draftUpdatedAt: '2026-05-21T08:04:00.000Z',
          }
        : assignment,
    );
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/assignments/assignment_1/workbench') {
        return jsonResponse({ data: qaWorkbench });
      }

      if (url.startsWith('/labeler/stats')) {
        return jsonResponse({ data: { ...stats, totalAssignments: 2 } });
      }

      if (url.startsWith('/labeler/assignments')) {
        return jsonResponse({ data: assignmentsWithCompletedDraft });
      }

      return jsonResponse({ data: null });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWorkbenchPage();

    const navigationPanel = await screen.findByRole('complementary', { name: '题目导航' });
    const currentQuestionButton = within(navigationPanel).getByRole('button', { name: /qa_1/ });
    const completedDraftQuestionButton = within(navigationPanel).getByRole('button', { name: /qa_2/ });

    expect(navigationPanel).toHaveTextContent('已完成 50% · 当前第 1 题');
    expect(currentQuestionButton).toHaveTextContent('进行中');
    expect(completedDraftQuestionButton).toHaveTextContent('已完成');
    expect(
      within(completedDraftQuestionButton).getByText('已完成').closest('.question-navigator__status'),
    ).toHaveClass('question-navigator__status--complete');
  });

  it('点击题目导航切题时保留当前标注台，避免整页加载闪烁', async () => {
    const user = userEvent.setup();
    const secondWorkbench = {
      ...qaWorkbench,
      assignment: {
        ...qaWorkbench.assignment,
        id: 'assignment_2',
        taskItemId: 'item_qa_2',
        status: 'ASSIGNED',
      },
      taskItem: {
        ...qaWorkbench.taskItem,
        id: 'item_qa_2',
        externalId: 'qa_2',
        rawData: {
          ...qaWorkbench.taskItem.rawData,
          prompt: '第二道题如何判断回答质量？',
        },
        sortOrder: 9,
      },
      draft: null,
      rejectionNotice: null,
      submissionHistory: [],
    };
    let resolveSecondWorkbench: (response: Response) => void = () => undefined;
    const secondWorkbenchResponse = new Promise<Response>((resolve) => {
      resolveSecondWorkbench = resolve;
    });
    const fetchMock = vi.fn((url: string) => {
      if (url === '/assignments/assignment_1/workbench') {
        return Promise.resolve(jsonResponse({ data: qaWorkbench }));
      }

      if (url === '/assignments/assignment_2/workbench') {
        return secondWorkbenchResponse;
      }

      if (url.startsWith('/labeler/stats')) {
        return Promise.resolve(jsonResponse({ data: { ...stats, totalAssignments: 2 } }));
      }

      if (url.startsWith('/labeler/assignments')) {
        return Promise.resolve(jsonResponse({ data: taskAssignments }));
      }

      return Promise.resolve(jsonResponse({ data: null }));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWorkbenchPage();

    await screen.findByRole('heading', { name: /问答质量标注/ });
    expect(screen.getByRole('button', { name: '返回我的工作台' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /qa_2/ }));
    await waitFor(() => {
      expect(screen.getByTestId('location-path')).toHaveTextContent(
        '/labeler/tasks/task_qa/items/item_qa_2?assignmentId=assignment_2',
      );
    });

    expect(screen.queryByText('正在加载题目')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回我的工作台' })).toBeInTheDocument();

    resolveSecondWorkbench(jsonResponse({ data: secondWorkbench }));

    expect(await screen.findByRole('heading', { name: '问答质量标注' })).toBeInTheDocument();
    expect(screen.queryByText('正在加载题目')).not.toBeInTheDocument();
  });

  it('右侧信息面板展示贡献、本题历史和快捷键，不展示模板属性配置', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ data: historyWorkbench }))
        .mockResolvedValueOnce(
          jsonResponse({
            data: {
              ...stats,
              submittedCount: 62,
              approvedCount: 54,
              rejectedCount: 5,
              needsRevisionCount: 5,
            },
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ data: taskAssignments })),
    );

    renderWorkbenchPage();

    const infoPanel = await screen.findByRole('complementary', { name: '标注信息' });
    expect(within(infoPanel).getByRole('heading', { name: '我的贡献（本任务）' })).toBeInTheDocument();
    expect(within(infoPanel).getByRole('heading', { name: '本题历史' })).toBeInTheDocument();
    expect(within(infoPanel).getByRole('heading', { name: '快捷键' })).toBeInTheDocument();

    const contribution = within(infoPanel).getByLabelText('我的贡献统计');
    expect(within(contribution).getByText('已提交')).toBeInTheDocument();
    expect(within(contribution).getByText('通过')).toBeInTheDocument();
    expect(within(contribution).getByText('打回')).toBeInTheDocument();
    expect(within(contribution).getByText('62')).toHaveClass('labeler-info-stat__value--submitted');
    expect(within(contribution).getByText('54')).toHaveClass('labeler-info-stat__value--approved');
    expect(within(contribution).getByText('5')).toHaveClass('labeler-info-stat__value--rejected');

    const history = within(infoPanel).getByLabelText('本题历史列表');
    expect(history).toHaveTextContent('李雷 · 提交');
    expect(history).toHaveTextContent('AI 预审 · 打回');
    expect(history).toHaveTextContent('王芳 · 复审打回');
    expect(history).toHaveTextContent('李雷 · 修改中');
    expect(history).toHaveTextContent('05-16 14:22');
    expect(history).toHaveTextContent('05-16 15:08');
    expect(history).toHaveTextContent('当前');

    expect(within(infoPanel).getByText('⌘+Enter 提交本题')).toBeInTheDocument();
    expect(within(infoPanel).getByText('⌘+S 保存草稿')).toBeInTheDocument();
    expect(within(infoPanel).getByText('← / → 上一题 / 下一题')).toBeInTheDocument();
    expect(within(infoPanel).getByText('J 跳题 · R 报告题目')).toBeInTheDocument();
    expect(screen.queryByText(/属性配置/)).not.toBeInTheDocument();
    expect(screen.queryByText('任务信息')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '基础信息' })).not.toBeInTheDocument();
  });

  it('未启用 AI 预审时提交后直接提示进入人工复审且不启动 AI 轮询', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            ...qaWorkbench,
            task: { ...qaWorkbench.task, aiPreReviewEnabled: false },
            draft: { answers: { quality: 'pass' } },
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: stats }))
      .mockResolvedValueOnce(jsonResponse({ data: taskAssignments }))
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
            taskId: 'task_qa',
            labelerId: 'user_labeler_li_lei',
            submittedCount: 1,
            submissions: [
              {
                id: 'submission_human_pending',
                assignmentId: 'assignment_1',
                status: 'HUMAN_PENDING',
                round: 1,
                answers: { quality: 'pass' },
                schemaVersion: 'r1',
                submittedAt: '2026-05-21T08:03:00.000Z',
                createdAt: '2026-05-21T08:03:00.000Z',
                updatedAt: '2026-05-21T08:03:00.000Z',
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { ...stats, submittedCount: 1, aiQueuedCount: 0 } }));
    vi.stubGlobal('fetch', fetchMock);

    renderWorkbenchPage();

    await screen.findByRole('heading', { name: /问答质量标注/ });
    await user.click(screen.getByRole('button', { name: '提交任务' }));

    expect(await screen.findByText('提交任务成功，1 条标注已提交至人工复审')).toBeInTheDocument();
    expect(screen.queryByText('草稿已保存')).not.toBeInTheDocument();
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('提交后轮询 AI 预审结果并在打回时刷新报告', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { ...qaWorkbench, draft: { answers: { quality: 'pass' } } } }))
      .mockResolvedValueOnce(jsonResponse({ data: stats }))
      .mockResolvedValueOnce(jsonResponse({ data: taskAssignments }))
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
            taskId: 'task_qa',
            labelerId: 'user_labeler_li_lei',
            submittedCount: 1,
            submissions: [
              {
                id: 'submission_ai_reject',
                assignmentId: 'assignment_1',
                status: 'AI_QUEUED',
                round: 2,
                answers: { quality: 'pass' },
                schemaVersion: 'r1',
                submittedAt: '2026-05-21T08:03:00.000Z',
                createdAt: '2026-05-21T08:03:00.000Z',
                updatedAt: '2026-05-21T08:03:00.000Z',
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { ...stats, submittedCount: 1, aiQueuedCount: 1 } }))
      .mockResolvedValueOnce(jsonResponse({ data: aiRejectedWorkbench }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...stats, needsRevisionCount: 1 } }))
      .mockResolvedValueOnce(jsonResponse({ data: taskAssignments }));
    vi.stubGlobal('fetch', fetchMock);

    renderWorkbenchPage();

    await screen.findByRole('heading', { name: /问答质量标注/ });
    await user.click(screen.getByRole('button', { name: '提交任务' }));
    expect(await screen.findByText('提交任务成功，1 条标注已进入 AI 预审队列')).toBeInTheDocument();
    expect(screen.queryByText('草稿已保存')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('tab', { name: /AI 预审/ }));
    const reviewResult = await screen.findByRole('region', { name: 'AI 预审结果' });
    expect(reviewResult).toHaveTextContent('建议打回');
    expect(reviewResult).not.toHaveTextContent(/综合\s*\d+/);
    expect(reviewResult).toHaveTextContent('审核意见未通过 AI 预审，建议打回给标注员修改。');
    expect(screen.queryByRole('region', { name: 'AI 预审报告' })).not.toBeInTheDocument();
  });

  it('提交前会展示前端必填校验错误', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ data: qaWorkbench }))
        .mockResolvedValueOnce(jsonResponse({ data: stats }))
        .mockResolvedValueOnce(jsonResponse({ data: taskAssignments })),
    );

    renderWorkbenchPage();

    await screen.findByRole('heading', { name: /问答质量标注/ });
    await user.click(screen.getByRole('button', { name: '提交任务' }));

    const alerts = await screen.findAllByRole('alert');
    const toast = alerts.find((alert) => alert.classList.contains('toast')) as HTMLElement;
    expect(toast).toHaveClass('toast');
    expect(toast).toHaveTextContent('提交前请修正 1 项内容：整体质量为必填项');
    expect(document.querySelector('.submission-validation-summary')).toBeNull();
  });

  it('AI 预审打回时展示字段级评估结果和重新标注入口', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ data: aiRejectedWorkbench }))
        .mockResolvedValueOnce(jsonResponse({ data: { ...stats, needsRevisionCount: 1 } }))
        .mockResolvedValueOnce(jsonResponse({ data: taskAssignments })),
    );

    renderWorkbenchPage();

    const tablist = await screen.findByRole('tablist', { name: '标注画布视图' });
    expect(within(tablist).getByRole('tab', { name: '标注内容' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: 'AI 预审报告' })).not.toBeInTheDocument();

    await user.click(within(tablist).getByRole('tab', { name: /AI 预审/ }));

    const context = await screen.findByRole('region', { name: 'AI 预审结果' });
    expect(context).toHaveTextContent('建议打回');
    expect(context).not.toHaveTextContent(/综合\s*\d+/);
    expect(context).toHaveTextContent('第 2 轮');
    expect(context).toHaveTextContent('审核意见未通过 AI 预审，建议打回给标注员修改。');
    expect(within(context).getByRole('button', { name: '重新标注' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'AI 预审报告' })).not.toBeInTheDocument();
    expect(context).toHaveTextContent('展示项 ShowItem');
    const showItemRegion = within(context).getByRole('region', { name: '展示项 ShowItem' });
    expect(within(showItemRegion).getByRole('table', { name: '展示项展示字段' })).toBeInTheDocument();
    expect(showItemRegion.querySelector('.schema-field--show-item')).not.toBeNull();
    expect(showItemRegion.querySelector('.ai-review-context__show-items')).toBeNull();
    expect(context).toHaveTextContent('Prompt');
    expect(context).toHaveTextContent('如何判断回答质量？');
    expect(context).toHaveTextContent('模型回答');
    expect(context).toHaveTextContent('检查事实性、完整性和表达清晰度。');
    expect(context).toHaveTextContent('需要 AI 预审的字段');
    expect(context).toHaveTextContent('整体质量');
    expect(context).toHaveTextContent('合格');
    expect(context).toHaveTextContent('AI 预审标准');
    expect(context).toHaveTextContent('判断整体质量是否与题目材料和任务要求一致。');
    expect(context).toHaveTextContent('AI 对当前字段的评语');
    expect(context).toHaveTextContent('整体质量选择符合题目要求。');
    expect(context).toHaveTextContent('审核意见');
    expect(context).toHaveTextContent('可以通过。');
    expect(context).toHaveTextContent('审核意见需说明关键事实依据。');
    expect(context).toHaveTextContent('审核意见过短，未解释核心判断依据。');
    expect(context).toHaveTextContent('补充事实性、完整性和表达清晰度的判断依据。');
    expect(context).toHaveTextContent('通过');
    expect(context).toHaveTextContent('未通过');
    expect(context).not.toHaveTextContent('91');
    expect(context).not.toHaveTextContent('48');
    const passedFieldCard = within(context).getByText('整体质量').closest('.ai-review-context__field-card');
    const rejectedFieldCard = within(context).getByText('审核意见').closest('.ai-review-context__field-card');
    expect(passedFieldCard).toHaveClass('is-pass');
    expect(rejectedFieldCard).toHaveClass('is-reject');
    expect(rejectedFieldCard?.querySelector('.ai-review-context__field-header')).not.toBeNull();
    expect(rejectedFieldCard?.querySelector('.ai-review-context__field-title')).toHaveTextContent('审核意见');
    expect(rejectedFieldCard?.querySelector('.ai-review-context__field-key')).toHaveTextContent('comment');
    expect(rejectedFieldCard?.querySelector('.ai-review-context__field-details')).not.toBeNull();
    expect(rejectedFieldCard?.querySelector('.ai-review-context__field-row--answer')).toHaveTextContent('可以通过。');
    expect(rejectedFieldCard?.querySelector('.ai-review-context__field-row--standard')).toHaveTextContent(
      '审核意见需说明关键事实依据。',
    );
    expect(rejectedFieldCard?.querySelector('.ai-review-context__field-row--comment')).toHaveTextContent(
      '审核意见过短，未解释核心判断依据。',
    );
    expect(context).not.toHaveTextContent('相关性');
    expect(context).not.toHaveTextContent('准确性');
    expect(context).not.toHaveTextContent('格式合规');
    expect(context).not.toHaveTextContent('安全性');
  });

  it('AI 预审字段全部通过时不展示重新标注按钮', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ data: aiPassedWorkbench }))
        .mockResolvedValueOnce(jsonResponse({ data: stats }))
        .mockResolvedValueOnce(jsonResponse({ data: taskAssignments })),
    );

    renderWorkbenchPage();

    const tablist = await screen.findByRole('tablist', { name: '标注画布视图' });
    await user.click(within(tablist).getByRole('tab', { name: /AI 预审/ }));

    const context = await screen.findByRole('region', { name: 'AI 预审结果' });
    expect(context).toHaveTextContent('所有开启 AI 预审的字段均通过。');
    expect(within(context).getAllByText('通过')).toHaveLength(2);
    expect(within(context).queryByRole('button', { name: '重新标注' })).not.toBeInTheDocument();
  });

  it('支持保存、切题和报告快捷键', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { ...qaWorkbench, draft: { answers: { quality: 'pass' } } } }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...stats, totalAssignments: 2 } }))
      .mockResolvedValueOnce(jsonResponse({ data: taskAssignments }))
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
    expect(await screen.findByText('草稿已保存')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/drafts/assignment_1',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(fetchMock.mock.calls.some(([url]) => url === '/submissions' || url === '/submissions/task')).toBe(false);

    await user.keyboard('j');
    expect(screen.getByTestId('location-path')).toHaveTextContent(
      '/labeler/tasks/task_qa/items/item_qa_2?assignmentId=assignment_2',
    );

    await user.keyboard('k');
    expect(screen.getByTestId('location-path')).toHaveTextContent(
      '/labeler/tasks/task_qa/items/item_qa_1?assignmentId=assignment_1',
    );

    await user.keyboard('r');
    expect(await screen.findByText('请在本题备注中说明异常，提交任务后会随答案进入审核')).toBeInTheDocument();
  });

  it('通用 JSON 任务不展示通用题目数据面板，也不回退成问答质量占位', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({
          data: {
            ...qaWorkbench,
            task: {
              ...qaWorkbench.task,
              datasetKind: 'generic_json',
              schema: {
                schemaVersion: 'r1',
                datasetKind: 'generic_json',
                fields: [
                  {
                    key: 'cleaned_title_field',
                    fieldKey: 'cleaned_title',
                    type: 'text',
                    label: '商品标题清洗结果',
                  },
                ],
              },
            },
            taskItem: {
              ...qaWorkbench.taskItem,
              datasetKind: 'generic_json',
              rawData: {
                raw_title: '超柔软纯棉男女款居家服套装',
                seller_category: '服饰内衣 / 家居服',
              },
            },
          },
        }))
        .mockResolvedValueOnce(jsonResponse({ data: stats }))
        .mockResolvedValueOnce(jsonResponse({ data: taskAssignments })),
    );

    renderWorkbenchPage();

    expect(await screen.findByRole('heading', { name: /问答质量标注/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('通用题目数据')).not.toBeInTheDocument();
    expect(screen.queryByText('超柔软纯棉男女款居家服套装')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('问答质量材料')).not.toBeInTheDocument();
    expect(screen.queryByText('未提供')).not.toBeInTheDocument();
  });
});

const renderWorkbenchPage = () => {
  render(
    <MemoryRouter initialEntries={['/labeler/tasks/task_qa/items/item_qa_1?assignmentId=assignment_1']}>
      <Routes>
        <Route path="/labeler/tasks/:taskId/items/:itemId" element={<WorkbenchPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
};

const LocationProbe = () => {
  const location = useLocation();

  return <output data-testid="location-path">{`${location.pathname}${location.search}`}</output>;
};

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

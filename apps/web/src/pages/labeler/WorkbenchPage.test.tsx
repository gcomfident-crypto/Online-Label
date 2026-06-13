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
    taskDisplayId: 'T-001',
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
    taskDisplayId: 'T-001',
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

const taskAssignmentsWithCompletedSecondDraft = taskAssignments.map((assignment) =>
  assignment.assignmentId === 'assignment_2'
    ? {
        ...assignment,
        status: 'IN_PROGRESS',
        draftAnswers: { quality: 'excellent' },
        draftUpdatedAt: '2026-05-21T08:04:00.000Z',
      }
    : assignment,
);

const currentOnlySubmittableTaskAssignments = taskAssignments.map((assignment) =>
  assignment.assignmentId === 'assignment_2'
    ? {
        ...assignment,
        status: 'SUBMITTED',
        latestSubmissionStatus: 'AI_QUEUED',
        latestSubmittedAt: '2026-05-21T08:03:00.000Z',
        draftAnswers: { quality: 'excellent' },
        draftUpdatedAt: '2026-05-21T08:04:00.000Z',
      }
    : assignment,
);

const taskList = [
  {
    id: 'task_qa',
    title: '问答质量标注',
    createdAt: '2026-05-20T08:00:00.000Z',
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

const reviewerReviewingHistoryWorkbench = {
  ...qaWorkbench,
  assignment: { ...qaWorkbench.assignment, status: 'SUBMITTED' },
  rejectionNotice: null,
  submissionHistory: [
    {
      id: 'submission_round_1',
      status: 'NEEDS_REVISION',
      round: 1,
      answers: { quality: 'pass' },
      schemaVersion: 'r1',
      submittedAt: '2026-06-06T09:57:00.000Z',
      reviewRecords: [
        {
          stage: 'AI_PRECHECK',
          reviewerType: 'AI',
          assignedReviewerId: null,
          decision: 'reject',
          comment: 'AI 预审打回。',
          scores: { overall: 62 },
          createdAt: '2026-06-06T12:30:00.000Z',
        },
      ],
    },
    {
      id: 'submission_round_2',
      status: 'NEEDS_REVISION',
      round: 2,
      answers: { quality: 'pass' },
      schemaVersion: 'r1',
      submittedAt: '2026-06-06T12:33:00.000Z',
      reviewRecords: [
        {
          stage: 'AI_PRECHECK',
          reviewerType: 'AI',
          assignedReviewerId: null,
          decision: 'reject',
          comment: 'AI 预审打回。',
          scores: { overall: 64 },
          createdAt: '2026-06-06T12:48:00.000Z',
        },
      ],
    },
    {
      id: 'submission_round_3',
      status: 'HUMAN_PENDING',
      round: 3,
      answers: { quality: 'excellent', comment: '已补充完整说明。' },
      schemaVersion: 'r1',
      submittedAt: '2026-06-06T13:16:00.000Z',
      reviewRecords: [
        {
          stage: 'AI_PRECHECK',
          reviewerType: 'AI',
          assignedReviewerId: null,
          decision: 'pass',
          comment: 'AI 预审通过。',
          scores: { overall: 90 },
          createdAt: '2026-06-06T13:23:00.000Z',
        },
        {
          stage: 'AI_PRECHECK',
          reviewerType: 'AI',
          assignedReviewerId: null,
          decision: 'pass',
          comment: 'AI 预审通过。',
          scores: { overall: 92 },
          createdAt: '2026-06-06T13:39:00.000Z',
        },
      ],
    },
  ],
};

const finalApprovedWorkbench = {
  ...qaWorkbench,
  assignment: { ...qaWorkbench.assignment, status: 'FINAL_APPROVED' },
  taskItem: { ...qaWorkbench.taskItem, status: 'COMPLETED' },
  rejectionNotice: null,
  submissionHistory: [
    {
      id: 'submission_final',
      status: 'FINAL_APPROVED',
      round: 1,
      answers: { quality: 'excellent', comment: '回答完整且依据充分。' },
      schemaVersion: 'r1',
      submittedAt: '2026-05-16T14:22:00.000Z',
      reviewRecords: [
        {
          stage: 'AI_PRECHECK',
          reviewerType: 'AI',
          assignedReviewerId: null,
          decision: 'pass',
          comment: 'AI 预审通过。',
          scores: { overall: 92 },
          createdAt: '2026-05-16T14:22:30.000Z',
        },
        {
          stage: 'RECHECK',
          reviewerType: 'HUMAN',
          assignedReviewerId: 'user_reviewer_wang_fang',
          decision: 'pass',
          comment: '复审通过。',
          scores: {},
          createdAt: '2026-05-16T15:08:00.000Z',
        },
      ],
    },
  ],
};

const mixedStatusTaskAssignments = taskAssignments.map((assignment) =>
  assignment.assignmentId === 'assignment_1'
    ? { ...assignment, status: 'NEEDS_REVISION' as const }
    : { ...assignment, status: 'FINAL_APPROVED' as const, latestSubmissionStatus: 'FINAL_APPROVED', latestSubmittedAt: '2026-05-21T13:00:00.000Z' },
);

describe('WorkbenchPage', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('渲染图 3 工作台结构并按任务统一提交合法答案', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-05-31T15:59:00.000Z'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          ...qaWorkbench,
          task: { ...qaWorkbench.task, title: 'ZMPZO-001-题目编号' },
          draft: { answers: { quality: 'pass' } },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ data: stats }))
      .mockResolvedValueOnce(jsonResponse({ data: taskAssignmentsWithCompletedSecondDraft }))
      .mockResolvedValueOnce(jsonResponse({ data: taskList }))
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
    expect(screen.queryByText('ZMPZO-001-题目编号')).not.toBeInTheDocument();
    expect(screen.queryByText(
      '围绕当前题目展示原始数据、标注表单、审核反馈和任务进度，支持逐题完成并提交标注结果',
    )).not.toBeInTheDocument();
    const workbenchSummary = document.querySelector('.workbench-topline__identity') as HTMLElement;
    const taskNameField = within(workbenchSummary).getByLabelText('任务名称');
    const taskIdField = within(workbenchSummary).getByLabelText('任务ID');
    expect(taskNameField).toHaveTextContent('问答质量标注');
    expect(within(workbenchSummary).queryByText('任务名称')).not.toBeInTheDocument();
    expect(taskIdField).toHaveTextContent('T-001');
    expect(within(workbenchSummary).queryByText('任务ID')).not.toBeInTheDocument();
    const titleRow = workbenchSummary.querySelector('.workbench-topline__title-row') as HTMLElement;
    expect([...titleRow.children].map((element) => element.textContent?.trim())).toEqual([
      'T-001',
      '问答质量标注',
    ]);
    expect(within(workbenchSummary).getByText('T-001')).toHaveClass('workbench-task-id');
    expect(within(workbenchSummary).getByText('剩余 1 天 0 小时 0 分 0 秒')).toHaveClass(
      'workbench-deadline-countdown',
    );
    const statusMeta = within(workbenchSummary).getByLabelText('任务状态');
    const closeButton = screen.getByRole('button', { name: '返回我的工作台' });
    expect(closeButton.closest('.workbench-topline')).not.toBeNull();
    expect(closeButton.closest('.workbench-topline__actions')).toBeNull();
    const workbenchActions = screen.getByLabelText('标注操作');
    expect(workbenchActions.closest('.workbench-topline__meta')).toBe(statusMeta);
    expect(within(workbenchActions).getByText('0.30 元 / 条')).toHaveClass('workbench-reward-pill');
    expect(within(workbenchActions).getByText('草稿已载入')).toHaveClass('autosave-indicator__text');
    expect([...statusMeta.children].map((element) => element.textContent?.trim())).toEqual([
      '剩余 1 天 0 小时 0 分 0 秒',
      '0.30 元 / 条草稿已载入',
    ]);
    expect([...workbenchActions.children].map((element) => element.textContent?.trim())).toEqual([
      '0.30 元 / 条',
      '草稿已载入',
    ]);
    expect(screen.queryByText(/模板 r1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/题目 ID/)).not.toBeInTheDocument();
    const navigationPanel = screen.getByRole('complementary', { name: '题目导航' });
    expect(within(navigationPanel).getByRole('heading', { name: '题目导航' })).toBeInTheDocument();
    expect(navigationPanel).not.toHaveTextContent(/已完成 \d+%/);
    expect(navigationPanel).not.toHaveTextContent('1 / 2');
    expect(navigationPanel).not.toHaveTextContent('当前题 qa_1');
    expect(navigationPanel).toHaveTextContent('qa_1');
    expect(within(navigationPanel).getByRole('button', { name: /qa_1/ })).toHaveTextContent('待提交');
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
    expect(screen.queryByLabelText('标注操作栏')).not.toBeInTheDocument();
    expect(within(workbenchActions).queryByText('基础信息')).not.toBeInTheDocument();
    expect(within(workbenchActions).queryByRole('button', { name: '报告题目' })).not.toBeInTheDocument();
    const annotationCanvas = screen.getByRole('main', { name: '标注画布' });
    const submitActionButtons = within(annotationCanvas)
      .getAllByRole('button')
      .filter((button) =>
        ['保存草稿', '提交任务'].includes(button.textContent?.trim() ?? ''),
      );
    expect(submitActionButtons.map((button) => button.textContent?.trim())).toEqual([
      '保存草稿',
      '提交任务',
    ]);
    expect(screen.queryByRole('tab', { name: '标注' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '+ 新 Tab' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '基础信息' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '跳过' })).not.toBeInTheDocument();
    expect(screen.queryByText('⌘/Ctrl + Enter 提交任务 · ⌘/Ctrl + S 保存 · J/K 切题 · R 报告')).not.toBeInTheDocument();
    expect(screen.getByLabelText('上一轮打回原因')).toHaveTextContent('请补充判断依据。');
    expect(screen.queryByLabelText('问答质量材料')).not.toBeInTheDocument();
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
    expect(itemHistory.textContent?.match(/标注员 王昱阳 · 提交/g)).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/submissions/task',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"currentAssignmentId":"assignment_1"'),
      }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith('/submissions', expect.anything());
  });

  it('直接打开标注台时也从任务列表恢复任务名和任务ID', async () => {
    const rawTaskIdTitle = 'cmpzo8u7h0002v6peylj249qy';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({
          data: {
            ...qaWorkbench,
            task: { ...qaWorkbench.task, title: rawTaskIdTitle },
          },
        }))
        .mockResolvedValueOnce(jsonResponse({ data: stats }))
        .mockResolvedValueOnce(jsonResponse({ data: taskAssignments }))
        .mockResolvedValueOnce(jsonResponse({ data: taskList })),
    );

    renderWorkbenchPage({ withState: false });

    expect(await screen.findByRole('heading', { name: '问答质量标注' })).toBeInTheDocument();
    expect(screen.getByText('T-001')).toHaveClass('workbench-task-id');
    expect(screen.queryByText(rawTaskIdTitle)).not.toBeInTheDocument();
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
      .mockResolvedValueOnce(jsonResponse({ data: currentOnlySubmittableTaskAssignments }))
      .mockResolvedValueOnce(jsonResponse({ data: taskList }))
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

      if (url === '/tasks') {
        return jsonResponse({ data: taskList });
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
    expect(firstQuestionButton).toHaveTextContent('待标注');
    expect(within(firstQuestionButton).getByText('待标注').closest('.question-navigator__status')).toHaveClass(
      'question-navigator__status--draft',
    );

    await user.click(screen.getByLabelText('优秀'));
    expect(within(navigationPanel).getByRole('button', { name: /qa_1/ })).toHaveTextContent('待提交');

    await user.click(screen.getByRole('button', { name: '下一题 →' }));
    expect(await screen.findByRole('heading', { name: '问答质量标注' })).toBeInTheDocument();

    const refreshedNavigationPanel = screen.getByRole('complementary', { name: '题目导航' });
    const completedQuestionButton = within(refreshedNavigationPanel).getByRole('button', { name: /qa_1/ });
    const pendingQuestionButton = within(refreshedNavigationPanel).getByRole('button', { name: /qa_2/ });
    expect(completedQuestionButton).toHaveTextContent('待提交');
    expect(
      within(completedQuestionButton).getByText('待提交').closest('.question-navigator__status'),
    ).toHaveClass('question-navigator__status--submitted');
    expect(pendingQuestionButton).toHaveTextContent('待标注');
    expect(within(pendingQuestionButton).getByText('待标注').closest('.question-navigator__status')).toHaveClass(
      'question-navigator__status--draft',
    );
  });

  it('题目导航根据非当前题草稿答案直接显示待提交状态', async () => {
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

      if (url === '/tasks') {
        return jsonResponse({ data: taskList });
      }

      return jsonResponse({ data: null });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWorkbenchPage();

    const navigationPanel = await screen.findByRole('complementary', { name: '题目导航' });
    const currentQuestionButton = within(navigationPanel).getByRole('button', { name: /qa_1/ });
    const completedDraftQuestionButton = within(navigationPanel).getByRole('button', { name: /qa_2/ });

    expect(navigationPanel).not.toHaveTextContent(/已完成 \d+%/);
    expect(currentQuestionButton).toHaveTextContent('待标注');
    expect(completedDraftQuestionButton).toHaveTextContent('待提交');
    expect(
      within(completedDraftQuestionButton).getByText('待提交').closest('.question-navigator__status'),
    ).toHaveClass('question-navigator__status--submitted');
  });

  it('题目导航使用待标注、待提交、AI 和 reviewer 的题目级状态', async () => {
    const navigationAssignments = [
      {
        ...taskAssignments[0],
        assignmentId: 'assignment_pending',
        taskItemId: 'item_pending',
        taskItemSortOrder: 1,
        externalId: 'P0001',
        status: 'ASSIGNED',
        latestSubmissionStatus: null,
        latestSubmittedAt: null,
        draftAnswers: null,
      },
      {
        ...taskAssignments[0],
        assignmentId: 'assignment_annotated',
        taskItemId: 'item_annotated',
        taskItemSortOrder: 2,
        externalId: 'P0002',
        status: 'IN_PROGRESS',
        latestSubmissionStatus: null,
        latestSubmittedAt: null,
        draftAnswers: { quality: 'excellent' },
      },
      {
        ...taskAssignments[0],
        assignmentId: 'assignment_ai_reviewing',
        taskItemId: 'item_ai_reviewing',
        taskItemSortOrder: 3,
        externalId: 'P0003',
        status: 'SUBMITTED',
        latestSubmissionStatus: 'AI_REVIEWING',
        latestSubmittedAt: '2026-05-21T08:10:00.000Z',
      },
      {
        ...taskAssignments[0],
        assignmentId: 'assignment_ai_rejected',
        taskItemId: 'item_ai_rejected',
        taskItemSortOrder: 4,
        externalId: 'P0004',
        status: 'NEEDS_REVISION',
        latestSubmissionStatus: 'NEEDS_REVISION',
        latestReviewStage: 'AI_PRECHECK',
        latestReviewerType: 'AI',
        latestReviewDecision: 'reject',
      },
      {
        ...taskAssignments[0],
        assignmentId: 'assignment_reviewer_reviewing',
        taskItemId: 'item_reviewer_reviewing',
        taskItemSortOrder: 5,
        externalId: 'P0005',
        status: 'UNDER_RECHECK',
        latestSubmissionStatus: 'RECHECK_REVIEWING',
      },
      {
        ...taskAssignments[0],
        assignmentId: 'assignment_reviewer_rejected',
        taskItemId: 'item_reviewer_rejected',
        taskItemSortOrder: 6,
        externalId: 'P0006',
        status: 'NEEDS_REVISION',
        latestSubmissionStatus: 'NEEDS_REVISION',
        latestReviewStage: 'RECHECK',
        latestReviewerType: 'HUMAN',
        latestReviewDecision: 'reject',
      },
      {
        ...taskAssignments[0],
        assignmentId: 'assignment_completed',
        taskItemId: 'item_completed',
        taskItemSortOrder: 8,
        externalId: 'P0007',
        status: 'FINAL_APPROVED',
        latestSubmissionStatus: 'FINAL_APPROVED',
        latestSubmittedAt: '2026-05-21T08:20:00.000Z',
      },
      {
        ...taskAssignments[0],
        assignmentId: 'assignment_reviewer_rejected_snapshot',
        taskItemId: 'item_reviewer_rejected_snapshot',
        taskItemSortOrder: 7,
        externalId: 'P0008',
        status: 'UNDER_RECHECK',
        latestSubmissionStatus: 'RECHECK_REJECTED',
        latestReviewStage: 'RECHECK',
        latestReviewerType: 'HUMAN',
        latestReviewDecision: 'reject',
      },
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/assignments/assignment_pending/workbench') {
        return jsonResponse({
          data: {
            ...qaWorkbench,
            assignment: {
              ...qaWorkbench.assignment,
              id: 'assignment_pending',
              taskItemId: 'item_pending',
              status: 'ASSIGNED',
            },
            taskItem: {
              ...qaWorkbench.taskItem,
              id: 'item_pending',
              externalId: 'P0001',
              sortOrder: 1,
            },
            draft: null,
            rejectionNotice: null,
            submissionHistory: [],
          },
        });
      }

      if (url.startsWith('/labeler/stats')) {
        return jsonResponse({ data: { ...stats, totalAssignments: navigationAssignments.length } });
      }

      if (url.startsWith('/labeler/assignments')) {
        return jsonResponse({ data: navigationAssignments });
      }

      if (url === '/tasks') {
        return jsonResponse({ data: taskList });
      }

      return jsonResponse({ data: null });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWorkbenchPage({ assignmentId: 'assignment_pending', itemId: 'item_pending' });

    const navigationPanel = await screen.findByRole('complementary', { name: '题目导航' });

    expect(within(navigationPanel).getByRole('button', { name: /P0001/ })).toHaveTextContent('待标注');
    expect(within(navigationPanel).getByRole('button', { name: /P0002/ })).toHaveTextContent('待提交');
    expect(within(navigationPanel).getByRole('button', { name: /P0003/ })).toHaveTextContent('AI处理中');
    expect(within(navigationPanel).getByRole('button', { name: /P0004/ })).toHaveTextContent('待修改');
    expect(within(navigationPanel).getByRole('button', { name: /P0005/ })).toHaveTextContent('待审核');
    expect(within(navigationPanel).getByRole('button', { name: /P0006/ })).toHaveTextContent('待修改');
    expect(within(navigationPanel).getByRole('button', { name: /P0008/ })).toHaveTextContent('待修改');
    expect(within(navigationPanel).getByRole('button', { name: /P0007/ })).toHaveTextContent('已完成');
    expect(
      within(within(navigationPanel).getByRole('button', { name: /P0002/ }))
        .getByText('待提交')
        .closest('.question-navigator__status'),
    ).toHaveClass('question-navigator__status--submitted');
    expect(
      within(within(navigationPanel).getByRole('button', { name: /P0003/ }))
        .getByText('AI处理中')
        .closest('.question-navigator__status'),
    ).toHaveClass('question-navigator__status--ai-review');
    expect(
      within(within(navigationPanel).getByRole('button', { name: /P0004/ }))
        .getByText('待修改')
        .closest('.question-navigator__status'),
    ).toHaveClass('question-navigator__status--rejected');
    expect(
      within(within(navigationPanel).getByRole('button', { name: /P0005/ }))
        .getByText('待审核')
        .closest('.question-navigator__status'),
    ).toHaveClass('question-navigator__status--reviewer-reviewing');
    expect(
      within(within(navigationPanel).getByRole('button', { name: /P0006/ }))
        .getByText('待修改')
        .closest('.question-navigator__status'),
    ).toHaveClass('question-navigator__status--rejected');
    expect(
      within(within(navigationPanel).getByRole('button', { name: /P0008/ }))
        .getByText('待修改')
        .closest('.question-navigator__status'),
    ).toHaveClass('question-navigator__status--rejected');
  });

  it('混合复审结果下仅允许编辑打回题，其他题保持只读', async () => {
    const user = userEvent.setup();
    const passedQuestionWorkbench = {
      ...finalApprovedWorkbench,
      assignment: {
        ...finalApprovedWorkbench.assignment,
        id: 'assignment_2',
        taskItemId: 'item_qa_2',
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
    };

    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/assignments/assignment_1/workbench') {
        return jsonResponse({
          data: {
            ...aiRejectedWorkbench,
            assignment: { ...aiRejectedWorkbench.assignment, id: 'assignment_1', taskItemId: 'item_qa_1' },
            taskItem: {
              ...aiRejectedWorkbench.taskItem,
              id: 'item_qa_1',
              externalId: 'qa_1',
              sortOrder: 8,
            },
          },
        });
      }

      if (url === '/assignments/assignment_2/workbench') {
        return jsonResponse({ data: passedQuestionWorkbench });
      }

      if (url.startsWith('/labeler/stats')) {
        return jsonResponse({ data: { ...stats, totalAssignments: 2 } });
      }

      if (url.startsWith('/labeler/assignments')) {
        return jsonResponse({ data: mixedStatusTaskAssignments });
      }

      if (url === '/tasks') {
        return jsonResponse({ data: taskList });
      }

      return jsonResponse({ data: null });
    });

    vi.stubGlobal('fetch', fetchMock);
    renderWorkbenchPage({ assignmentId: 'assignment_1', itemId: 'item_qa_1' });

    await screen.findByRole('heading', { name: '问答质量标注' });
    expect(screen.getByRole('button', { name: '保存草稿' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: '优秀' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '提交任务' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '下一题 →' }));
    expect(await screen.findByRole('heading', { name: '问答质量标注' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存草稿' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: '优秀' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '提交任务' })).toBeDisabled();
  });

  it('题目导航对当前 AI 打回题修改完成后仍显示待修改状态', async () => {
    const rejectedTaskAssignments = taskAssignments.map((assignment) => ({
      ...assignment,
      status: 'NEEDS_REVISION',
      latestSubmissionStatus: 'NEEDS_REVISION',
      latestSubmittedAt: '2026-05-21T08:10:00.000Z',
      draftAnswers: { quality: 'excellent' },
      draftUpdatedAt: '2026-05-21T08:12:00.000Z',
    }));
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/assignments/assignment_1/workbench') {
        return jsonResponse({
          data: {
            ...aiRejectedWorkbench,
            draft: {
              id: 'draft_ai_rejected',
              assignmentId: 'assignment_1',
              answers: { quality: 'excellent' },
              schemaVersion: 'r1',
              createdAt: '2026-05-21T08:11:00.000Z',
              updatedAt: '2026-05-21T08:12:00.000Z',
            },
          },
        });
      }

      if (url.startsWith('/labeler/stats')) {
        return jsonResponse({ data: { ...stats, totalAssignments: 2, needsRevisionCount: 2 } });
      }

      if (url.startsWith('/labeler/assignments')) {
        return jsonResponse({ data: rejectedTaskAssignments });
      }

      if (url === '/tasks') {
        return jsonResponse({ data: taskList });
      }

      return jsonResponse({ data: null });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWorkbenchPage();

    const navigationPanel = await screen.findByRole('complementary', { name: '题目导航' });
    const currentQuestionButton = within(navigationPanel).getByRole('button', { name: /qa_1/ });
    const secondQuestionButton = within(navigationPanel).getByRole('button', { name: /qa_2/ });

    expect(currentQuestionButton).toHaveTextContent('待修改');
    expect(secondQuestionButton).toHaveTextContent('待修改');
    expect(within(currentQuestionButton).getByText('待修改').closest('.question-navigator__status')).toHaveClass(
      'question-navigator__status--rejected',
    );
    expect(within(secondQuestionButton).getByText('待修改').closest('.question-navigator__status')).toHaveClass(
      'question-navigator__status--rejected',
    );
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

      if (url === '/tasks') {
        return Promise.resolve(jsonResponse({ data: taskList }));
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
        '/labeler/tasks/T-001/items/qa_2',
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
        .mockResolvedValueOnce(jsonResponse({ data: taskAssignments }))
        .mockResolvedValueOnce(jsonResponse({ data: taskList })),
    );

    renderWorkbenchPage();

    const infoPanel = await screen.findByRole('complementary', { name: '标注信息' });
    expect(within(infoPanel).queryByRole('heading', { name: '我的贡献（本任务）' })).not.toBeInTheDocument();
    expect(within(infoPanel).queryByLabelText('我的贡献统计')).not.toBeInTheDocument();
    expect(within(infoPanel).getByRole('heading', { name: '本题历史' })).toBeInTheDocument();
    expect(within(infoPanel).getByRole('heading', { name: '快捷键' })).toBeInTheDocument();

    const history = within(infoPanel).getByLabelText('本题历史列表');
    expect(history).toHaveTextContent('第 1 轮');
    expect(history).toHaveTextContent('标注员 王昱阳 · 提交');
    expect(history).toHaveTextContent('AI 预审 · 打回');
    expect(history).toHaveTextContent('复审员 鑫泽张 · 复审打回');
    expect(history).toHaveTextContent('05-16 14:22');
    expect(history).toHaveTextContent('05-16 15:08');
    expect(within(infoPanel).queryByLabelText('当前状态')).not.toBeInTheDocument();

    expect(within(infoPanel).queryByText('⌘+Enter 提交本题')).not.toBeInTheDocument();
    expect(within(infoPanel).getByText('⌘+S 保存草稿')).toBeInTheDocument();
    expect(within(infoPanel).getByText('← / → 上一题 / 下一题')).toBeInTheDocument();
    expect(within(infoPanel).getByText('J / K 下一题 / 上一题')).toBeInTheDocument();
    expect(screen.queryByText(/属性配置/)).not.toBeInTheDocument();
    expect(screen.queryByText('任务信息')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '基础信息' })).not.toBeInTheDocument();
  });

  it('本题历史按轮次分组，合并重复 AI 结论，并单独展示当前 reviewer 审核状态', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ data: reviewerReviewingHistoryWorkbench }))
        .mockResolvedValueOnce(jsonResponse({ data: stats }))
        .mockResolvedValueOnce(
          jsonResponse({
            data: taskAssignments.map((assignment) =>
              assignment.assignmentId === 'assignment_1'
                ? { ...assignment, status: 'SUBMITTED', latestSubmissionStatus: 'HUMAN_PENDING' }
                : assignment,
            ),
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ data: taskList })),
    );

    renderWorkbenchPage();

    const infoPanel = await screen.findByRole('complementary', { name: '标注信息' });
    const history = within(infoPanel).getByLabelText('本题历史列表');

    expect(history).toHaveTextContent('第 1 轮');
    expect(history).toHaveTextContent('第 2 轮');
    expect(history).toHaveTextContent('第 3 轮');
    expect(history.textContent?.match(/标注员 王昱阳 · 提交/g)).toHaveLength(3);
    expect(history.textContent?.match(/AI 预审 · 打回/g)).toHaveLength(2);
    expect(history.textContent?.match(/AI 预审 · 通过/g)).toHaveLength(1);
    expect(history).not.toHaveTextContent('06-06 13:23');
    expect(history).toHaveTextContent('06-06 13:39');
    expect(history).not.toHaveTextContent('标注员 王昱阳 · 已提交');

    expect(within(infoPanel).queryByLabelText('当前状态')).not.toBeInTheDocument();
  });

  it('完成后的题目历史不追加当前行，并将倒计时和报告入口置为完成态', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ data: finalApprovedWorkbench }))
        .mockResolvedValueOnce(jsonResponse({ data: { ...stats, submittedCount: 1, approvedCount: 1 } }))
        .mockResolvedValueOnce(
          jsonResponse({
            data: taskAssignments.map((assignment) => ({
              ...assignment,
              status: 'FINAL_APPROVED',
              latestSubmissionStatus: 'FINAL_APPROVED',
            })),
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ data: taskList })),
    );

    renderWorkbenchPage();

    const workbenchSummary = await screen.findByLabelText('任务状态');
    expect(within(workbenchSummary).getByText('已完成')).toHaveClass('workbench-deadline-countdown');
    expect(within(workbenchSummary).queryByText(/剩余/)).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: '报告题目' })).not.toBeInTheDocument();
    await user.keyboard('r');
    expect(screen.queryByText('请在本题备注中说明异常，提交任务后会随答案进入审核。')).not.toBeInTheDocument();

    const history = screen.getByLabelText('本题历史列表');
    expect(history).toHaveTextContent('标注员 王昱阳 · 提交');
    expect(history).toHaveTextContent('AI 预审 · 通过');
    expect(history).toHaveTextContent('复审员 鑫泽张 · 复审通过');
    expect(history).not.toHaveTextContent('当前');
    expect(history).not.toHaveTextContent('标注员 王昱阳 · 已完成');
  });

  it('当前题已完成但同任务仍有返工题时，顶部任务状态显示待修改而不是已完成', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ data: finalApprovedWorkbench }))
        .mockResolvedValueOnce(jsonResponse({ data: { ...stats, submittedCount: 2, approvedCount: 1, needsRevisionCount: 1 } }))
        .mockResolvedValueOnce(
          jsonResponse({
            data: [
              { ...taskAssignments[0], status: 'FINAL_APPROVED', latestSubmissionStatus: 'FINAL_APPROVED' },
              { ...taskAssignments[1], status: 'NEEDS_REVISION', latestSubmissionStatus: 'NEEDS_REVISION' },
            ],
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ data: taskList })),
    );

    renderWorkbenchPage();

    const workbenchSummary = await screen.findByLabelText('任务状态');
    expect(within(workbenchSummary).getByText('待修改')).toHaveClass('workbench-deadline-countdown');
    expect(within(workbenchSummary).queryByText('已完成')).not.toBeInTheDocument();
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
      .mockResolvedValueOnce(jsonResponse({ data: currentOnlySubmittableTaskAssignments }))
      .mockResolvedValueOnce(jsonResponse({ data: taskList }))
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
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it('提交后轮询 AI 预审结果并在打回时刷新报告', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { ...qaWorkbench, draft: { answers: { quality: 'pass' } } } }))
      .mockResolvedValueOnce(jsonResponse({ data: stats }))
      .mockResolvedValueOnce(jsonResponse({ data: currentOnlySubmittableTaskAssignments }))
      .mockResolvedValueOnce(jsonResponse({ data: taskList }))
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
        .mockResolvedValueOnce(jsonResponse({ data: taskAssignments }))
        .mockResolvedValueOnce(jsonResponse({ data: taskList })),
    );

    renderWorkbenchPage();

    await screen.findByRole('heading', { name: /问答质量标注/ });
    await user.click(screen.getByRole('button', { name: '提交任务' }));

    const alerts = await screen.findAllByRole('alert');
    const toast = alerts.find((alert) => alert.classList.contains('toast')) as HTMLElement;
    expect(toast).toHaveClass('toast');
    expect(toast).toHaveTextContent('题目 qa_1：整体质量为必填项');
    expect(within(toast).getByRole('button', { name: '去修正' })).toBeInTheDocument();
    expect(screen.getByText('整体质量为必填项。').closest('.schema-field__errors')).not.toBeNull();
    expect(document.querySelector('[data-field-key="quality"]')).toHaveClass('is-active');
    await waitFor(() => {
      expect(document.querySelector('[data-field-key="quality"]')).toHaveClass('is-validation-focus-pulse');
    });
    expect(document.querySelector('.submission-validation-summary')).toBeNull();
  });

  it('多项提交错误时 toast 只显示首项，字段旁展示完整错误', async () => {
    const user = userEvent.setup();
    const workbenchWithTwoRequiredFields = {
      ...qaWorkbench,
      task: {
        ...qaWorkbench.task,
        schema: {
          ...qaWorkbench.task.schema,
          fields: qaWorkbench.task.schema.fields.map((field) =>
            field.fieldKey === 'comment'
              ? { ...field, validation: { required: true } }
              : field,
          ),
        },
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: workbenchWithTwoRequiredFields }))
      .mockResolvedValueOnce(jsonResponse({ data: stats }))
      .mockResolvedValueOnce(jsonResponse({ data: currentOnlySubmittableTaskAssignments }))
      .mockResolvedValueOnce(jsonResponse({ data: taskList }));
    vi.stubGlobal('fetch', fetchMock);

    renderWorkbenchPage();

    await screen.findByRole('heading', { name: /问答质量标注/ });
    await user.click(screen.getByRole('button', { name: '提交任务' }));

    const alerts = await screen.findAllByRole('alert');
    const toast = alerts.find((alert) => alert.classList.contains('toast')) as HTMLElement;
    expect(toast).toHaveTextContent('题目 qa_1：整体质量为必填项');
    expect(toast).not.toHaveTextContent('提交前请修正');
    expect(toast).not.toHaveTextContent('首项');
    expect(toast).not.toHaveTextContent('审核意见为必填项');
    expect(within(toast).getByRole('button', { name: '去修正' })).toBeInTheDocument();
    expect(screen.getByText('整体质量为必填项。').closest('.schema-field__errors')).not.toBeNull();
    expect(screen.getByText('审核意见为必填项。').closest('.schema-field__errors')).not.toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url === '/submissions/task')).toBe(false);

    await user.click(screen.getByRole('button', { name: '提交任务' }));
    const repeatedToast = latestToast();
    expect(repeatedToast).toHaveTextContent('题目 qa_1：整体质量为必填项');
    expect(repeatedToast).not.toHaveTextContent('审核意见为必填项');

    await user.click(screen.getByLabelText('优秀'));
    await user.click(screen.getByRole('button', { name: '提交任务' }));
    const nextToast = latestToast();
    expect(nextToast).toHaveTextContent('题目 qa_1：审核意见为必填项');
    expect(nextToast).not.toHaveTextContent('整体质量为必填项');
  });

  it('后端兜底 schema 校验错误不会直接暴露工程文案', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { ...qaWorkbench, draft: { answers: { quality: 'pass' } } } }))
      .mockResolvedValueOnce(jsonResponse({ data: stats }))
      .mockResolvedValueOnce(jsonResponse({ data: currentOnlySubmittableTaskAssignments }))
      .mockResolvedValueOnce(jsonResponse({ data: taskList }))
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
      .mockResolvedValueOnce(errorResponse({
        error: { message: '题目 qa_1 的答案未通过 Schema 校验。' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    renderWorkbenchPage();

    await screen.findByRole('heading', { name: /问答质量标注/ });
    await user.click(screen.getByRole('button', { name: '提交任务' }));

    const alerts = await screen.findAllByRole('alert');
    const toast = alerts.find((alert) => alert.classList.contains('toast')) as HTMLElement;
    expect(toast).toHaveTextContent('题目 qa_1：答案填写有误');
    expect(toast).not.toHaveTextContent('Schema 校验');
  });

  it('AI 预审模型未配置时直接展示后端提交错误', async () => {
    const user = userEvent.setup();
    const message = '当前无法提交：AI 预审模型未配置，请检查 DEEPSEEK_API_KEY、OPENAI_API_KEY、LLM_API_KEY 或 LLM_PROVIDER。';
    const visibleMessage = message.replace(/。$/g, '');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { ...qaWorkbench, draft: { answers: { quality: 'pass' } } } }))
      .mockResolvedValueOnce(jsonResponse({ data: stats }))
      .mockResolvedValueOnce(jsonResponse({ data: currentOnlySubmittableTaskAssignments }))
      .mockResolvedValueOnce(jsonResponse({ data: taskList }))
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
      .mockResolvedValueOnce(errorResponse({
        error: {
          code: 'AI_REVIEW_MODEL_NOT_CONFIGURED',
          message,
        },
      }));
    vi.stubGlobal('fetch', fetchMock);

    renderWorkbenchPage();

    await screen.findByRole('heading', { name: /问答质量标注/ });
    await user.click(screen.getByRole('button', { name: '提交任务' }));

    const alerts = await screen.findAllByRole('alert');
    const toast = alerts.find((alert) => alert.classList.contains('toast')) as HTMLElement;
    expect(toast).toHaveTextContent(visibleMessage);
    expect(toast).not.toHaveTextContent('答案填写有误');
    expect(fetchMock.mock.calls.filter(([url]) => url === '/submissions/task')).toHaveLength(1);
  });

  it('在非错误题提交时会跳到第一道错误题并使用同一种字段级错误格式', async () => {
    const user = userEvent.setup();
    const firstWorkbench = {
      ...qaWorkbench,
      taskItem: {
        ...qaWorkbench.taskItem,
        externalId: 'P0001',
      },
    };
    const secondWorkbench = {
      ...qaWorkbench,
      assignment: {
        ...qaWorkbench.assignment,
        id: 'assignment_2',
        taskItemId: 'item_qa_2',
        status: 'IN_PROGRESS',
      },
      taskItem: {
        ...qaWorkbench.taskItem,
        id: 'item_qa_2',
        externalId: 'P0002',
        rawData: {
          ...qaWorkbench.taskItem.rawData,
          prompt: '第二道题如何判断回答质量？',
        },
        sortOrder: 9,
      },
      draft: { answers: { quality: 'pass' } },
      rejectionNotice: null,
      submissionHistory: [],
    };
    const assignmentsWithQuestionCodes = taskAssignments.map((assignment) => {
      if (assignment.assignmentId === 'assignment_1') {
        return { ...assignment, externalId: 'P0001', status: 'IN_PROGRESS' };
      }

      return {
        ...assignment,
        externalId: 'P0002',
        status: 'IN_PROGRESS',
        draftAnswers: { quality: 'pass' },
        draftUpdatedAt: '2026-05-21T08:04:00.000Z',
      };
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/assignments/assignment_1/workbench') {
        return jsonResponse({ data: firstWorkbench });
      }

      if (url === '/assignments/assignment_2/workbench') {
        return jsonResponse({ data: secondWorkbench });
      }

      if (url.startsWith('/labeler/stats')) {
        return jsonResponse({ data: { ...stats, totalAssignments: 2 } });
      }

      if (url.startsWith('/labeler/assignments')) {
        return jsonResponse({ data: assignmentsWithQuestionCodes });
      }

      if (url === '/tasks') {
        return jsonResponse({ data: taskList });
      }

      if (url === '/submissions/task') {
        return errorResponse({
          error: { message: '题目 P0001 的答案未通过 Schema 校验。' },
        });
      }

      return jsonResponse({ data: null });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWorkbenchPage({ assignmentId: 'assignment_2', itemId: 'item_qa_2' });

    await screen.findByRole('heading', { name: /问答质量标注/ });
    expect(screen.getByTestId('location-path')).toHaveTextContent(
      '/labeler/tasks/task_qa/items/item_qa_2?assignmentId=assignment_2',
    );

    await user.click(screen.getByRole('button', { name: '提交任务' }));

    const alerts = await screen.findAllByRole('alert');
    const toast = alerts.find((alert) => alert.classList.contains('toast')) as HTMLElement;
    expect(toast).toHaveClass('toast');
    expect(toast).toHaveTextContent('题目 P0001：整体质量为必填项');
    expect(within(toast).getByRole('button', { name: '去修正' })).toBeInTheDocument();
    expect(toast).not.toHaveTextContent('Schema 校验');
    expect(fetchMock.mock.calls.some(([url]) => url === '/submissions/task')).toBe(false);
    expect(screen.getByTestId('location-path')).toHaveTextContent(
      '/labeler/tasks/task_qa/items/item_qa_2?assignmentId=assignment_2',
    );

    await user.click(within(toast).getByRole('button', { name: '去修正' }));

    await waitFor(() => {
      expect(screen.getByTestId('location-path')).toHaveTextContent(
        '/labeler/tasks/T-001/items/P0001',
      );
    });
    expect(await screen.findByText('整体质量为必填项。')).toBeInTheDocument();
    expect(screen.getByText('整体质量为必填项。').closest('.schema-field__errors')).not.toBeNull();
    expect(document.querySelector('[data-field-key="quality"]')).toHaveClass('is-active');
    expect(document.querySelector('[data-field-key="quality"]')).toHaveClass('is-validation-focus-pulse');
  });

  it('AI 预审打回时展示字段级评估结果和重新标注入口', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ data: aiRejectedWorkbench }))
        .mockResolvedValueOnce(jsonResponse({ data: { ...stats, needsRevisionCount: 1 } }))
        .mockResolvedValueOnce(jsonResponse({ data: taskAssignments }))
        .mockResolvedValueOnce(jsonResponse({ data: taskList })),
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

  it('AI 预审打回题在标注内容中高亮未通过字段，编辑后清除高亮', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({
          data: {
            ...aiRejectedWorkbench,
            draft: {
              id: 'draft_ai_reject',
              assignmentId: 'assignment_1',
              answers: {
                quality: 'pass',
                comment: '可以通过。',
              },
              schemaVersion: 'r1',
              createdAt: '2026-05-21T08:09:30.000Z',
              updatedAt: '2026-05-21T08:09:30.000Z',
            },
          },
        }))
        .mockResolvedValueOnce(jsonResponse({ data: { ...stats, needsRevisionCount: 1 } }))
        .mockResolvedValueOnce(jsonResponse({ data: taskAssignments }))
        .mockResolvedValueOnce(jsonResponse({ data: taskList })),
    );

    renderWorkbenchPage();

    await screen.findByRole('heading', { name: /问答质量标注/ });
    const passedFieldNode = document.querySelector('[data-field-key="quality"]');
    const rejectedFieldNode = document.querySelector('[data-field-key="comment"]');

    expect(passedFieldNode).not.toHaveClass('schema-renderer__field-node--diff-rejected');
    expect(passedFieldNode).not.toHaveAttribute('data-diff-state', 'rejected');
    expect(rejectedFieldNode).toHaveClass('schema-renderer__field-node--diff-rejected');
    expect(rejectedFieldNode).toHaveAttribute('data-diff-state', 'rejected');
    expect(rejectedFieldNode).toHaveTextContent('待修改');
    expect(rejectedFieldNode).toHaveTextContent('修改建议：补充事实性、完整性和表达清晰度的判断依据。');

    await user.clear(screen.getByLabelText('审核意见'));
    await user.type(screen.getByLabelText('审核意见'), '补充事实性、完整性和表达清晰度的判断依据。');

    expect(document.querySelector('[data-field-key="comment"]')).not.toHaveClass(
      'schema-renderer__field-node--diff-rejected',
    );
    expect(document.querySelector('[data-field-key="comment"]')).not.toHaveAttribute('data-diff-state', 'rejected');
    expect(document.querySelector('[data-field-key="comment"]')).not.toHaveTextContent('待修改');
    expect(document.querySelector('[data-field-key="comment"]')).not.toHaveTextContent('修改建议：');
  });

  it('reviewer 打回时在顶部展示整体修改建议', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ data: historyWorkbench }))
        .mockResolvedValueOnce(jsonResponse({ data: { ...stats, needsRevisionCount: 1 } }))
        .mockResolvedValueOnce(jsonResponse({ data: taskAssignments }))
        .mockResolvedValueOnce(jsonResponse({ data: taskList })),
    );

    renderWorkbenchPage();

    const rejectNotice = await screen.findByRole('region', { name: '上一轮打回原因' });
    expect(rejectNotice).toHaveTextContent('上一轮被打回');
    expect(rejectNotice).toHaveTextContent('修改建议');
    expect(rejectNotice).toHaveTextContent('复审打回。');
  });

  it('reviewer 字段级打回评论展示在对应字段', async () => {
    const reviewerFieldWorkbench = {
      ...historyWorkbench,
      submissionHistory: [
        {
          ...historyWorkbench.submissionHistory[0],
          answers: {
            quality: 'pass',
            comment: '可以通过。',
          },
          reviewRecords: [
            historyWorkbench.submissionHistory[0].reviewRecords[0],
            {
              ...historyWorkbench.submissionHistory[0].reviewRecords[1],
              structuredOutput: {
                verdict: 'reject',
                fieldReviews: [
                  {
                    fieldKey: 'quality',
                    label: '整体质量',
                    decision: 'pass',
                    comment: '整体质量无需修改。',
                    suggestions: [],
                  },
                  {
                    fieldKey: 'comment',
                    label: '审核意见',
                    decision: 'reject',
                    comment: '请补充完整判断依据。',
                    suggestions: [],
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ data: reviewerFieldWorkbench }))
        .mockResolvedValueOnce(jsonResponse({ data: { ...stats, needsRevisionCount: 1 } }))
        .mockResolvedValueOnce(jsonResponse({ data: taskAssignments }))
        .mockResolvedValueOnce(jsonResponse({ data: taskList })),
    );

    renderWorkbenchPage();

    await screen.findByRole('heading', { name: /问答质量标注/ });
    const passedFieldNode = document.querySelector('[data-field-key="quality"]');
    const rejectedFieldNode = document.querySelector('[data-field-key="comment"]');

    expect(passedFieldNode).not.toHaveClass('schema-renderer__field-node--diff-rejected');
    expect(passedFieldNode).not.toHaveTextContent('修改建议：');
    expect(rejectedFieldNode).toHaveClass('schema-renderer__field-node--diff-rejected');
    expect(rejectedFieldNode).toHaveAttribute('data-diff-state', 'rejected');
    expect(rejectedFieldNode).toHaveTextContent('待修改');
    expect(rejectedFieldNode).toHaveTextContent('修改建议：请补充完整判断依据。');
  });

  it('AI 预审字段全部通过时不展示重新标注按钮', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ data: aiPassedWorkbench }))
        .mockResolvedValueOnce(jsonResponse({ data: stats }))
        .mockResolvedValueOnce(jsonResponse({ data: taskAssignments }))
        .mockResolvedValueOnce(jsonResponse({ data: taskList })),
    );

    renderWorkbenchPage();

    const tablist = await screen.findByRole('tablist', { name: '标注画布视图' });
    await user.click(within(tablist).getByRole('tab', { name: /AI 预审/ }));

    const context = await screen.findByRole('region', { name: 'AI 预审结果' });
    expect(context).toHaveTextContent('所有开启 AI 预审的字段均通过。');
    expect(within(context).getAllByText('通过')).toHaveLength(2);
    expect(within(context).queryByRole('button', { name: '重新标注' })).not.toBeInTheDocument();
  });

  it('支持保存和切题快捷键', async () => {
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
        sortOrder: 9,
      },
      draft: { answers: { quality: 'pass' } },
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/assignments/assignment_1/workbench') {
        return jsonResponse({ data: { ...qaWorkbench, draft: { answers: { quality: 'pass' } } } });
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

      if (url === '/tasks') {
        return jsonResponse({ data: taskList });
      }

      if (url === '/drafts/assignment_1' && init?.method === 'PUT') {
        return jsonResponse({
          data: {
            id: 'draft_1',
            assignmentId: 'assignment_1',
            answers: { quality: 'pass' },
            schemaVersion: 'r1',
            createdAt: '2026-05-21T00:00:00.000Z',
            updatedAt: '2026-05-21T08:04:00.000Z',
          },
        });
      }

      if (url.startsWith('/drafts/')) {
        return jsonResponse({
          data: {
            id: 'draft_read',
            assignmentId: url.split('/')[2] ?? 'assignment_1',
            answers: { quality: 'pass' },
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

    await screen.findByRole('heading', { name: /问答质量标注/ });
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByText('草稿已保存')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/drafts/assignment_1',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(fetchMock.mock.calls.some(([url]) => url === '/submissions' || url === '/submissions/task')).toBe(false);

    await user.keyboard('{Control>}Enter{/Control}');
    expect(fetchMock.mock.calls.some(([url]) => url === '/submissions' || url === '/submissions/task')).toBe(false);

    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('location-path')).toHaveTextContent(
      '/labeler/tasks/T-001/items/qa_2',
    );

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByTestId('location-path')).toHaveTextContent(
      '/labeler/tasks/T-001/items/qa_1',
    );

    await user.keyboard('j');
    expect(screen.getByTestId('location-path')).toHaveTextContent(
      '/labeler/tasks/T-001/items/qa_2',
    );

    await user.keyboard('k');
    expect(screen.getByTestId('location-path')).toHaveTextContent(
      '/labeler/tasks/T-001/items/qa_1',
    );

    await user.keyboard('r');
    expect(screen.queryByText('请在本题备注中说明异常，提交任务后会随答案进入审核')).not.toBeInTheDocument();
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
        .mockResolvedValueOnce(jsonResponse({ data: taskAssignments }))
        .mockResolvedValueOnce(jsonResponse({ data: taskList })),
    );

    renderWorkbenchPage();

    expect(await screen.findByRole('heading', { name: /问答质量标注/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('通用题目数据')).not.toBeInTheDocument();
    expect(screen.queryByText('超柔软纯棉男女款居家服套装')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('问答质量材料')).not.toBeInTheDocument();
    expect(screen.queryByText('未提供')).not.toBeInTheDocument();
  });
});

const renderWorkbenchPage = (options: {
  assignmentId?: string;
  itemId?: string;
  withState?: boolean;
} = {}) => {
  const assignmentId = options.assignmentId ?? 'assignment_1';
  const itemId = options.itemId ?? 'item_qa_1';
  const routeEntry = {
    pathname: `/labeler/tasks/task_qa/items/${itemId}`,
    search: `?assignmentId=${assignmentId}`,
    state: { source: 'my-data-table', taskDisplayId: 'T-001', taskTitle: '问答质量标注' },
  };

  render(
    <MemoryRouter
      initialEntries={[
        options.withState === false
          ? `/labeler/tasks/task_qa/items/${itemId}?assignmentId=${assignmentId}`
          : routeEntry,
      ]}
    >
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

const latestToast = (): HTMLElement => {
  const toasts = screen.getAllByRole('alert').filter((alert) => alert.classList.contains('toast'));

  return toasts[toasts.length - 1] as HTMLElement;
};

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

const errorResponse = (body: unknown): Response =>
  ({
    ok: false,
    status: 400,
    json: async () => body,
  }) as Response;

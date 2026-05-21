import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FinalReviewPage } from './FinalReviewPage';

const finalReviews = [
  {
    submissionId: 'submission_final',
    assignmentId: 'assignment_final',
    taskId: 'task_qa',
    taskTitle: '问答质量标注',
    taskItemId: 'item_qa_final',
    externalId: 'qa_final',
    datasetKind: 'qa_quality',
    status: 'FINAL_PENDING',
    round: 2,
    aiDecision: 'pass',
    aiComment: 'AI 预审通过，建议人工确认。',
    aiScores: { overall: 92 },
    assignedReviewerId: 'user_reviewer_wang_fang',
    submittedAt: '2026-05-21T09:00:00.000Z',
    updatedAt: '2026-05-21T09:20:00.000Z',
  },
];

const finalDetail = {
  submission: {
    id: 'submission_final',
    assignmentId: 'assignment_final',
    status: 'FINAL_PENDING',
    round: 2,
    answers: { quality: 'pass', reason: '第二轮补充后覆盖关键点。', added: '补充事实依据。' },
    schemaVersion: 'qa-r1',
    submittedAt: '2026-05-21T09:00:00.000Z',
  },
  assignment: {
    id: 'assignment_final',
    assigneeId: 'user_labeler_li_lei',
    status: 'FINAL_PENDING',
  },
  task: {
    id: 'task_qa',
    title: '问答质量标注',
    datasetKind: 'qa_quality',
    templateName: '问答质量官方模板',
  },
  taskItem: {
    id: 'item_qa_final',
    externalId: 'qa_final',
    datasetKind: 'qa_quality',
    rawData: { prompt: '如何判断回答质量？', model_answer: '检查事实性、相关性和表达完整度。' },
  },
  aiReview: {
    id: 'ai_record_2',
    submissionId: 'submission_final',
    ruleId: 'rule_qa',
    stage: 'AI_PRECHECK',
    reviewerId: null,
    assignedReviewerId: null,
    reviewerType: 'AI',
    scores: { overall: 92 },
    decision: 'pass',
    comment: 'AI 预审通过，建议人工确认。',
    revisedAnswers: null,
    rawPrompt: null,
    rawOutput: null,
    structuredOutput: null,
    modelMetadata: { provider: 'mock', model: 'mock-stable-reviewer' },
    retryCount: 0,
    idempotencyKey: 'submission_final:2:ai-review',
    createdAt: '2026-05-21T09:03:00.000Z',
    updatedAt: '2026-05-21T09:03:00.000Z',
  },
  humanReview: {
    id: 'recheck_record_1',
    submissionId: 'submission_final',
    ruleId: null,
    stage: 'RECHECK',
    reviewerId: 'user_reviewer_wang_fang',
    assignedReviewerId: 'user_reviewer_wang_fang',
    reviewerType: 'HUMAN',
    scores: {},
    decision: 'recheck_pass',
    comment: '复审通过。',
    revisedAnswers: null,
    rawPrompt: null,
    rawOutput: null,
    structuredOutput: null,
    modelMetadata: null,
    retryCount: 0,
    idempotencyKey: null,
    createdAt: '2026-05-21T09:10:00.000Z',
    updatedAt: '2026-05-21T09:10:00.000Z',
  },
  reviewRecords: [],
  timeline: [
    {
      id: 'audit_final',
      kind: 'audit',
      label: '人工复审通过',
      actorId: 'user_reviewer_wang_fang',
      fromStatus: 'RECHECK_REVIEWING',
      toStatus: 'FINAL_PENDING',
      reason: '复审通过。',
      metadata: { action: 'HUMAN_REVIEW_APPROVED' },
      createdAt: '2026-05-21T09:12:00.000Z',
    },
  ],
};

const rounds = [
  {
    submissionId: 'submission_round_1',
    assignmentId: 'assignment_final',
    status: 'NEEDS_REVISION',
    round: 1,
    answers: { quality: 'manual', reason: '依据不足。' },
    schemaVersion: 'qa-r1',
    submittedAt: '2026-05-21T08:00:00.000Z',
    createdAt: '2026-05-21T08:00:00.000Z',
    updatedAt: '2026-05-21T08:00:00.000Z',
  },
  {
    submissionId: 'submission_final',
    assignmentId: 'assignment_final',
    status: 'FINAL_PENDING',
    round: 2,
    answers: { quality: 'pass', reason: '第二轮补充后覆盖关键点。', added: '补充事实依据。' },
    schemaVersion: 'qa-r1',
    submittedAt: '2026-05-21T09:00:00.000Z',
    createdAt: '2026-05-21T09:00:00.000Z',
    updatedAt: '2026-05-21T09:00:00.000Z',
  },
];

describe('FinalReviewPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('展示待终审队列、第 1 / 2 轮 Diff，并支持终审通过', async () => {
    const user = userEvent.setup();
    const fetchMock = createFinalReviewFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <FinalReviewPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '终审工作台' })).toBeInTheDocument();
    expect(await screen.findByText('AI 预审通过，建议人工确认。')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '第 1 / 2 轮 Diff' })).toBeInTheDocument();
    expect(await screen.findByText('字段：reason')).toBeInTheDocument();
    expect(await screen.findByText('字段：added')).toBeInTheDocument();

    await user.type(screen.getByLabelText('终审意见'), '终审确认通过。');
    await user.click(screen.getByRole('button', { name: '终审通过' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/reviews/submission_final/final-pass',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          actorId: 'user_reviewer_wang_fang',
          comment: '终审确认通过。',
        }),
      }),
    );
  });
});

function createFinalReviewFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = input.toString();
    const method = init?.method ?? 'GET';

    if (path === '/reviews/final-pending' && method === 'GET') {
      return jsonResponse({ data: finalReviews });
    }
    if (path === '/reviews/submission_final' && method === 'GET') {
      return jsonResponse({ data: finalDetail });
    }
    if (path === '/reviews/assignment_final/rounds' && method === 'GET') {
      return jsonResponse({ data: rounds });
    }
    if (path === '/reviews/assignment_final/diff?fromRound=1&toRound=2' && method === 'GET') {
      return jsonResponse({
        data: {
          assignmentId: 'assignment_final',
          fromRound: 1,
          toRound: 2,
          fromSubmissionId: 'submission_round_1',
          toSubmissionId: 'submission_final',
          changes: [
            {
              fieldKey: 'added',
              type: 'added',
              before: null,
              after: '补充事实依据。',
            },
            {
              fieldKey: 'reason',
              type: 'changed',
              before: '依据不足。',
              after: '第二轮补充后覆盖关键点。',
            },
          ],
        },
      });
    }
    if (path === '/reviews/submission_final/final-pass' && method === 'POST') {
      return jsonResponse({
        data: {
          ...finalDetail,
          submission: { ...finalDetail.submission, status: 'FINAL_APPROVED' },
        },
      });
    }

    return jsonResponse({ data: [] });
  });
}

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

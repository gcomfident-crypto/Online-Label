import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReviewDetailPage } from './ReviewDetailPage';

const detail = {
  submission: {
    id: 'submission_1',
    assignmentId: 'assignment_1',
    status: 'RECHECK_REVIEWING',
    round: 1,
    answers: { quality: 'pass', reason: '覆盖关键点。' },
    schemaVersion: 'qa-r1',
    submittedAt: '2026-05-21T08:00:00.000Z',
  },
  assignment: {
    id: 'assignment_1',
    assigneeId: 'user_labeler_li_lei',
    status: 'UNDER_RECHECK',
  },
  task: {
    id: 'task_qa',
    title: '问答质量标注',
    datasetKind: 'qa_quality',
    templateName: '问答质量官方模板',
  },
  taskItem: {
    id: 'item_qa_1',
    externalId: 'qa_1',
    datasetKind: 'qa_quality',
    rawData: { prompt: '如何判断回答质量？' },
  },
  aiReview: {
    id: 'ai_record_1',
    submissionId: 'submission_1',
    ruleId: 'rule_qa',
    stage: 'AI_PRECHECK',
    reviewerId: null,
    assignedReviewerId: null,
    reviewerType: 'AI',
    scores: { overall: 90 },
    decision: 'pass',
    comment: '建议进入人工复审。',
    revisedAnswers: null,
    rawPrompt: null,
    rawOutput: null,
    structuredOutput: null,
    modelMetadata: null,
    retryCount: 0,
    idempotencyKey: 'submission_1:1:ai-review',
    createdAt: '2026-05-21T08:02:00.000Z',
    updatedAt: '2026-05-21T08:02:00.000Z',
  },
  humanReview: null,
  reviewRecords: [],
  timeline: [],
};

describe('ReviewDetailPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('按路由 submissionId 加载单条复审详情，并支持打回', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      if (path === '/reviews/submission_1' && (init?.method ?? 'GET') === 'GET') {
        return jsonResponse({ data: detail });
      }
      if (path === '/reviews/submission_1/reject' && init?.method === 'POST') {
        return jsonResponse({
          data: {
            ...detail,
            submission: { ...detail.submission, status: 'NEEDS_REVISION' },
          },
        });
      }

      return jsonResponse({ data: {} });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/reviewer/reviews/submission_1']}>
        <Routes>
          <Route path="/reviewer/reviews/:submissionId" element={<ReviewDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '复审详情' })).toBeInTheDocument();
    expect(screen.getByText('问答质量标注')).toBeInTheDocument();

    await user.type(screen.getByLabelText('打回理由'), '事实性依据不足。');
    await user.click(screen.getByRole('button', { name: '打回' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/reviews/submission_1/reject',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          actorId: 'user_reviewer_wang_fang',
          reason: '事实性依据不足。',
        }),
      }),
    );
  });
});

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

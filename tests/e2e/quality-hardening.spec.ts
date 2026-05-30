import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';

const NOW = '2026-05-21T10:00:00.000Z';
const SESSION_KEY = 'labelhub.session.v1';
const BANNED_ENGLISH_COPY = /\b(Submit|Cancel|Retry|Loading|Error|Download|Export|Delete|Edit)\b/;

test.beforeEach(async ({ page }) => {
  await installQualityMocks(page);
});

test('四端路由隔离和无权限拦截稳定', async ({ page }) => {
  await page.goto('/owner/tasks');
  await expect(page.getByRole('heading', { name: '登录 LabelHub' })).toBeVisible();

  await setSession(page, 'LABELER');
  await page.goto('/owner/tasks');
  await expect(page.getByRole('heading', { name: '无权限访问' })).toBeVisible();

  await setSession(page, 'OWNER');
  await page.goto('/owner/tasks');
  await expect(page.getByRole('navigation', { name: 'Owner 端导航' })).toBeVisible();

  await setSession(page, 'LABELER');
  await page.goto('/labeler/market');
  await expect(page.getByRole('navigation', { name: 'Labeler 端导航' })).toBeVisible();

  await setSession(page, 'AI_AGENT');
  await page.goto('/agent/ai-review');
  await expect(page.getByRole('navigation', { name: 'AI Agent 端导航' })).toBeVisible();

  await setSession(page, 'REVIEWER');
  await page.goto('/reviewer/reviews');
  await expect(page.getByRole('navigation', { name: 'Reviewer 端导航' })).toBeVisible();
});

test('Owner 创建 qa_quality 任务、导入题目并发布', async ({ page }) => {
  await setSession(page, 'OWNER');
  await page.goto('/owner/tasks');

  await page.getByRole('button', { name: '新建任务' }).click();
  await expect(page.getByRole('complementary', { name: '发布任务抽屉' })).toBeVisible();
  await expect(page.getByRole('button', { name: '关闭发布抽屉' })).toHaveCount(0);
  await expect(page.getByLabel('关联模板')).toHaveValue('问答质量官方模板 (Schema qa-r1)');
  await page.getByLabel('任务标题').fill('问答质量标注');
  await page.getByLabel('题目数据文件').setInputFiles({
    name: 'qa.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"id":"qa_1","prompt":"如何判断回答质量？","model_answer":"检查事实性。"}'),
  });
  await page.getByRole('button', { name: '立即发布 →' }).click();
  await expect(page.getByText('任务已发布。')).toBeVisible();
});

test('主链路覆盖领取、草稿、提交、AI 转人工、打回、二次提交、终审和四格式导出', async ({ page }) => {
  await setSession(page, 'LABELER');
  await page.goto('/labeler/market');
  await page.getByRole('button', { name: '领取题目' }).click();
  await expect(page.getByText('已领取题目 qa_1。')).toBeVisible();
  await page.getByRole('link', { name: '进入标注台' }).click();

  await page.getByLabel('通过').click();
  await page.getByLabel('补充说明').fill('回答覆盖关键事实，可以进入审核。');
  await page.getByRole('button', { name: '保存草稿' }).click();
  await expect(page.getByText('草稿已保存。')).toBeVisible();
  await page.getByRole('button', { name: '提交本题 →' }).click();
  await expect(page.getByText('提交成功，已进入 AI 预审队列。')).toBeVisible();

  await setSession(page, 'AI_AGENT');
  await page.goto('/agent/ai-review');
  await expect(page.getByText('转人工处理').first()).toBeVisible();
  await expect(page.getByText('3/3')).toBeVisible();
  await expect(page.getByText('连续失败后转人工兜底。').first()).toBeVisible();

  await setSession(page, 'REVIEWER');
  await page.goto('/reviewer/reviews');
  await expect(page.getByRole('table', { name: '待审提交表格' }).getByText('问答质量标注')).toBeVisible();
  await page.getByLabel('人工复审决策').getByLabel('打回理由').fill('事实性依据不足，需要补充说明。');
  await page.getByLabel('人工复审决策').getByRole('button', { name: '打回', exact: true }).click();
  await expect(page.getByText('已打回给标注员。')).toBeVisible();

  await setSession(page, 'LABELER');
  await page.goto('/labeler/tasks/task_qa/items/item_qa_1?assignmentId=assignment_1');
  await expect(page.getByText('事实性依据不足，需要补充说明。')).toBeVisible();
  await page.getByLabel('通过').click();
  await page.getByLabel('补充说明').fill('已补充事实性依据和验收口径。');
  await page.getByRole('button', { name: '提交本题 →' }).click();
  await expect(page.getByText('提交成功，已进入 AI 预审队列。')).toBeVisible();

  await setSession(page, 'REVIEWER');
  await page.goto('/reviewer/reviews');
  await page.getByLabel('人工复审决策').getByLabel('复审意见').fill('二次提交已满足要求。');
  await page.getByRole('button', { name: '通过 · 入库' }).click();
  await expect(page.getByText('已通过复审，进入终审待办。')).toBeVisible();

  await page.goto('/reviewer/final-reviews');
  await expect(page.getByText('第 1 / 2 轮 Diff')).toBeVisible();
  await page.getByRole('button', { name: '终审通过' }).click();
  await expect(page.getByText('已终审通过，可进入导出。')).toBeVisible();

  await setSession(page, 'OWNER');
  await page.goto('/owner/exports');
  for (const format of ['json', 'jsonl', 'csv', 'xlsx']) {
    await page.getByLabel('导出格式').selectOption(format);
    await page.getByRole('button', { name: '创建导出任务' }).click();
    await expect(page.getByText('导出任务已创建。')).toBeVisible();
  }

  await expect(page.getByRole('table', { name: '导出历史' })).toHaveCount(0);
  await expect(page.getByText('暂无导出任务。')).toHaveCount(0);
});

test('关键页面四视口截图、中文文案和无横向溢出验收', async ({ page }, testInfo) => {
  const targets = [
    { name: 'login', role: null, path: '/login', readyRole: 'heading', readyName: '登录 LabelHub', skipCopyCheck: true },
    { name: 'owner-tasks', role: 'OWNER', path: '/owner/tasks', readyRole: 'table', readyName: '任务列表' },
    { name: 'owner-template', role: 'OWNER', path: '/owner/templates', readyRole: 'table', readyName: '模板列表' },
    { name: 'owner-exports', role: 'OWNER', path: '/owner/exports', readyRole: 'table', readyName: '导出记录列表' },
    { name: 'agent-ai-review', role: 'AI_AGENT', path: '/agent/ai-review', readyRole: 'table', readyName: 'Agent 自动预审队列表格' },
    { name: 'labeler-market', role: 'LABELER', path: '/labeler/market', readyRole: 'table', readyName: '任务广场列表' },
    {
      name: 'labeler-workbench',
      role: 'LABELER',
      path: '/labeler/my-data',
      readyRole: 'table',
      readyName: '工作台任务列表',
    },
  ] as const;

  for (const target of targets) {
    if (target.role) {
      await setSession(page, target.role);
    } else {
      await clearSession(page);
    }
    await page.goto(target.path);
    await expect(page.getByRole(target.readyRole, { name: target.readyName })).toBeVisible();
    if (!('skipCopyCheck' in target)) {
      await assertNoUnmanagedEnglishCopy(page);
    }
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`${testInfo.project.name}-${target.name}.png`),
      fullPage: true,
    });
  }
});

async function installQualityMocks(page: Page) {
  const state = createQualityState();

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();

    if (path === '/templates' && method === 'GET') {
      return fulfill(route, [createTemplate()]);
    }
    if (path === '/tasks' && method === 'GET') {
      return fulfill(route, [state.ownerTask]);
    }
    if (path === '/tasks' && method === 'POST') {
      state.ownerTask = { ...state.ownerTask, ...parseBody(request.postData()), status: 'DRAFT' };
      return fulfill(route, state.ownerTask);
    }
    if (path === '/tasks/task_qa' && method === 'GET') {
      return fulfill(route, state.ownerTask);
    }
    if (path === '/tasks/task_qa' && method === 'PATCH') {
      state.ownerTask = { ...state.ownerTask, ...parseBody(request.postData()) };
      return fulfill(route, state.ownerTask);
    }
    if (path === '/tasks/task_qa/status' && method === 'PATCH') {
      const body = parseBody(request.postData()) as { status?: string };
      state.ownerTask = { ...state.ownerTask, status: body.status ?? state.ownerTask.status };
      return fulfill(route, state.ownerTask);
    }
    if (path === '/tasks/task_qa/items' && method === 'GET') {
      return fulfill(route, state.importedItems);
    }
    if (path === '/tasks/task_qa/items/import' && method === 'POST') {
      state.importedItems = [createTaskItem()];
      return fulfill(route, createImportSummary(state.importedItems));
    }
    if (path === '/labeler/tasks' && method === 'GET') {
      return fulfill(route, [createMarketTask(state.claimed)]);
    }
    if (path === '/labeler/assignments' && method === 'GET') {
      return fulfill(route, [createLabelerAssignment()]);
    }
    if (path === '/assignments/claim' && method === 'POST') {
      state.claimed = true;
      return fulfill(route, createClaimAssignment());
    }
    if (path === '/assignments/assignment_1/workbench' && method === 'GET') {
      return fulfill(route, createWorkbench(state));
    }
    if (path === '/drafts/assignment_1' && method === 'PUT') {
      state.draftAnswers = (parseBody(request.postData()) as { answers?: Record<string, unknown> }).answers ?? {};
      return fulfill(route, createDraft(state.draftAnswers));
    }
    if (path === '/labeler/stats' && method === 'GET') {
      return fulfill(route, createLabelerStats(state));
    }
    if (path === '/submissions' && method === 'POST') {
      state.submitted = true;
      state.reviewStatus = 'HUMAN_PENDING';
      state.rejectionVisible = false;
      return fulfill(route, createSubmission(state.currentRound));
    }
    if (path === '/ai-review/jobs' && method === 'GET') {
      return fulfill(route, [createAiReviewJob(state)]);
    }
    if (path === '/submissions/submission_1/ai-review' && method === 'GET') {
      return fulfill(route, createAiReviewDetail(state));
    }
    if (path === '/reviews/pending' && method === 'GET') {
      return fulfill(route, state.reviewStatus === 'HUMAN_PENDING' ? [createReviewQueueItem(state)] : []);
    }
    if (path === '/reviews/final-pending' && method === 'GET') {
      return fulfill(route, state.finalPending ? [createReviewQueueItem(state, 'FINAL_PENDING')] : []);
    }
    if (path === '/reviews/assignment_1/rounds' && method === 'GET') {
      return fulfill(route, createReviewRounds(state));
    }
    if (path === '/reviews/assignment_1/diff' && method === 'GET') {
      return fulfill(route, createReviewDiff());
    }
    if (path.startsWith('/reviews/submission_1') && method === 'GET') {
      return fulfill(route, createReviewDetail(state, state.finalPending ? 'FINAL_PENDING' : state.reviewStatus));
    }
    if (path === '/reviews/submission_1/reject' && method === 'POST') {
      state.rejectionVisible = true;
      state.reviewStatus = 'NEEDS_REVISION';
      state.currentRound = 2;
      return fulfill(route, createReviewDetail(state, 'NEEDS_REVISION'));
    }
    if (path === '/reviews/submission_1/pass' && method === 'POST') {
      state.reviewStatus = 'FINAL_PENDING';
      state.finalPending = true;
      return fulfill(route, createReviewDetail(state, 'FINAL_PENDING'));
    }
    if (path === '/reviews/submission_1/final-pass' && method === 'POST') {
      state.finalPending = false;
      state.finalApproved = true;
      return fulfill(route, createReviewDetail(state, 'FINAL_APPROVED'));
    }
    if (path === '/tasks/task_qa/export-preview' && method === 'GET') {
      return fulfill(route, createExportPreview(state.finalApproved));
    }
    if (path === '/exports' && method === 'GET') {
      return fulfill(route, state.exportJobs);
    }
    if (path === '/exports' && method === 'POST') {
      const body = parseBody(request.postData()) as { format?: string };
      const job = createExportJob(body.format ?? 'json');
      state.exportJobs.unshift(job);
      return fulfill(route, job);
    }

    return route.continue();
  });
}

function createQualityState() {
  return {
    ownerTask: createOwnerTask('DRAFT'),
    importedItems: [] as Array<ReturnType<typeof createTaskItem>>,
    claimed: false,
    submitted: false,
    rejectionVisible: false,
    currentRound: 1,
    reviewStatus: 'HUMAN_PENDING',
    finalPending: false,
    finalApproved: true,
    draftAnswers: {} as Record<string, unknown>,
    exportJobs: [] as Array<ReturnType<typeof createExportJob>>,
  };
}

function createOwnerTask(status: string) {
  return {
    id: 'task_qa',
    title: '问答质量标注',
    description: '评估回答事实性、完整性和安全性。',
    richTextInstruction: '请按官方 qa_quality 模板完成验收。',
    tags: ['问答质量', '官方数据'],
    rewardRule: '0.50 元 / 条',
    rewardPerItem: 0.5,
    quota: 100,
    deadline: '2026-06-01T15:59:00.000Z',
    distributionStrategy: 'FIRST_COME_FIRST_SERVE',
    aiPreReviewEnabled: true,
    aiRuleName: '问答质量 AI 预审 v2',
    status,
    templateId: 'template_qa',
    template: {
      id: 'template_qa',
      name: '问答质量官方模板',
      datasetKind: 'qa_quality',
      schemaVersion: 'qa-r1',
      status: 'PUBLISHED',
    },
    createdById: 'user_owner_zhang_man',
    itemCount: 1,
    exportableItemCount: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createTemplate() {
  return {
    id: 'template_qa',
    name: '问答质量官方模板',
    description: '评估回答事实性、完整性和安全性。',
    datasetKind: 'qa_quality',
    schemaVersion: 'qa-r1',
    schema: createWorkbenchSchema(),
    status: 'PUBLISHED',
    version: 1,
    parentTemplateId: null,
    createdById: 'user_owner_zhang_man',
    publishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createMarketTask(claimed: boolean) {
  return {
    id: 'task_qa',
    title: '问答质量标注',
    description: '评估回答事实性、完整性和安全性。',
    ownerId: 'user_owner_zhang_man',
    ownerName: '张满',
    tags: ['问答质量', '官方数据'],
    rewardRule: '0.50 元 / 条',
    rewardPerItem: 0.5,
    perUserLimit: null,
    quota: 100,
    deadline: '2026-06-01T15:59:00.000Z',
    datasetKind: 'qa_quality',
    templateId: 'template_qa',
    templateName: '问答质量官方模板',
    itemCount: 1,
    assignedCount: claimed ? 1 : 0,
    claimedByMeCount: claimed ? 1 : 0,
    remainingCount: claimed ? 0 : 1,
    claimedByMe: claimed,
    claimStatus: claimed ? 'claimed' : 'available',
    previewItems: [createTaskItem()],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createLabelerAssignment() {
  return {
    assignmentId: 'assignment_1',
    taskId: 'task_qa',
    taskTitle: '问答质量标注',
    taskItemId: 'item_qa_1',
    taskItemSortOrder: 1,
    externalId: 'qa_1',
    datasetKind: 'qa_quality',
    status: 'IN_PROGRESS',
    claimedAt: NOW,
    templateName: '问答质量官方模板',
    schemaVersion: 'qa-r1',
    latestSubmissionStatus: null,
    latestSubmittedAt: null,
    round: 1,
  };
}

function createWorkbench(state: ReturnType<typeof createQualityState>) {
  return {
    assignment: {
      id: 'assignment_1',
      taskId: 'task_qa',
      taskItemId: 'item_qa_1',
      assigneeId: 'user_labeler_li_lei',
      status: state.rejectionVisible ? 'NEEDS_REVISION' : 'IN_PROGRESS',
      claimedAt: NOW,
    },
    task: {
      id: 'task_qa',
      title: '问答质量标注',
      description: '评估回答事实性、完整性和安全性。',
      richTextInstruction: '请按官方 qa_quality 模板完成验收。',
      tags: ['问答质量'],
      rewardRule: '0.50 元 / 条',
      rewardPerItem: 0.5,
      quota: 100,
      deadline: '2026-06-01T15:59:00.000Z',
      templateId: 'template_qa',
      templateName: '问答质量官方模板',
      datasetKind: 'qa_quality',
      schemaVersion: 'qa-r1',
      schema: createWorkbenchSchema(),
    },
    taskItem: createTaskItem(),
    draft: state.draftAnswers.quality ? createDraft(state.draftAnswers) : null,
    rejectionNotice: state.rejectionVisible
      ? {
          submissionId: 'submission_1',
          round: 1,
          reason: '事实性依据不足，需要补充说明。',
          createdAt: NOW,
        }
      : null,
    submissionHistory: state.rejectionVisible
      ? [
          {
            id: 'submission_1',
            status: 'NEEDS_REVISION',
            round: 1,
            answers: { quality: 'pass', comment: '回答覆盖关键事实。' },
            schemaVersion: 'qa-r1',
            submittedAt: NOW,
            reviewRecords: [{ decision: 'reject', scores: {}, createdAt: NOW }],
          },
        ]
      : [],
  };
}

function createWorkbenchSchema() {
  return {
    schemaVersion: 'qa-r1',
    datasetKind: 'qa_quality',
    fields: [
      { key: 'prompt', type: 'show_item', label: '用户问题', sourceKey: 'prompt' },
      {
        key: 'quality',
        type: 'radio',
        label: '整体质量',
        required: true,
        options: [
          { label: '通过', value: 'pass' },
          { label: '打回', value: 'reject' },
        ],
      },
      { key: 'comment', type: 'textarea', label: '补充说明', required: true },
    ],
  };
}

function createTaskItem() {
  return {
    id: 'item_qa_1',
    taskId: 'task_qa',
    externalId: 'qa_1',
    datasetKind: 'qa_quality',
    rawData: {
      id: 'qa_1',
      prompt: '如何判断回答质量？',
      model_answer: '检查事实性。',
      expected_dimensions: ['事实性', '完整性'],
    },
    status: 'UNASSIGNED',
    sortOrder: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createClaimAssignment() {
  return {
    assignmentId: 'assignment_1',
    taskId: 'task_qa',
    taskItemId: 'item_qa_1',
    labelerId: 'user_labeler_li_lei',
    status: 'ASSIGNED',
    claimedAt: NOW,
    claimedCount: 1,
    taskItem: createTaskItem(),
  };
}

function createDraft(answers: Record<string, unknown>) {
  return {
    id: 'draft_1',
    assignmentId: 'assignment_1',
    answers,
    schemaVersion: 'qa-r1',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createSubmission(round: number) {
  return {
    id: 'submission_1',
    assignmentId: 'assignment_1',
    status: 'AI_QUEUED',
    round,
    answers: { quality: 'pass', comment: round > 1 ? '已补充事实性依据。' : '回答覆盖关键事实。' },
    schemaVersion: 'qa-r1',
    submittedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createLabelerStats(state: ReturnType<typeof createQualityState>) {
  return {
    labelerId: 'user_labeler_li_lei',
    taskId: 'task_qa',
    totalAssignments: state.claimed ? 1 : 0,
    submittedCount: state.submitted ? 1 : 0,
    aiQueuedCount: state.submitted ? 1 : 0,
    approvedCount: state.finalApproved ? 1 : 0,
    rejectedCount: state.rejectionVisible ? 1 : 0,
    needsRevisionCount: state.rejectionVisible ? 1 : 0,
  };
}

function createAiReviewJob(state: ReturnType<typeof createQualityState>) {
  return {
    id: 'ai_job_1',
    submissionId: 'submission_1',
    taskId: 'task_qa',
    taskTitle: '问答质量标注',
    externalId: 'qa_1',
    datasetKind: 'qa_quality',
    submissionStatus: state.reviewStatus,
    round: state.currentRound,
    status: 'MANUAL_FALLBACK',
    attempts: 3,
    maxAttempts: 3,
    idempotencyKey: 'submission_1:1:ai-review',
    structuredOutputMode: 'function_calling',
    provider: 'mock',
    model: 'mock-stable-reviewer',
    lastError: '模型连续三次返回格式异常，已转人工兜底。',
    queuedAt: NOW,
    startedAt: NOW,
    finishedAt: NOW,
    updatedAt: NOW,
  };
}

function createAiReviewDetail(state: ReturnType<typeof createQualityState>) {
  return {
    submission: createSubmission(state.currentRound),
    task: { id: 'task_qa', title: '问答质量标注', datasetKind: 'qa_quality' },
    taskItem: createTaskItem(),
    reviewRecord: createReviewRecord('AI_PRECHECK', 'AI', 'manual', '连续失败后转人工兜底。'),
    jobs: [createAiReviewJob(state)],
  };
}

function createReviewQueueItem(state: ReturnType<typeof createQualityState>, status = state.reviewStatus) {
  return {
    submissionId: 'submission_1',
    assignmentId: 'assignment_1',
    taskId: 'task_qa',
    taskTitle: '问答质量标注',
    taskItemId: 'item_qa_1',
    externalId: 'qa_1',
    datasetKind: 'qa_quality',
    status,
    round: state.currentRound,
    aiDecision: 'manual',
    aiComment: '连续失败后转人工兜底。',
    aiScores: { overall: 60 },
    assignedReviewerId: 'user_reviewer_wang_fang',
    submittedAt: NOW,
    updatedAt: NOW,
  };
}

function createReviewDetail(state: ReturnType<typeof createQualityState>, status: string) {
  return {
    submission: {
      id: 'submission_1',
      assignmentId: 'assignment_1',
      status,
      round: state.currentRound,
      answers: { quality: 'pass', comment: state.currentRound > 1 ? '已补充事实性依据。' : '回答覆盖关键事实。' },
      schemaVersion: 'qa-r1',
      submittedAt: NOW,
    },
    assignment: { id: 'assignment_1', assigneeId: 'user_labeler_li_lei', status },
    task: { id: 'task_qa', title: '问答质量标注', datasetKind: 'qa_quality', templateName: '问答质量官方模板' },
    taskItem: createTaskItem(),
    aiReview: createReviewRecord('AI_PRECHECK', 'AI', 'manual', '连续失败后转人工兜底。'),
    humanReview:
      status === 'FINAL_PENDING' || status === 'FINAL_APPROVED'
        ? createReviewRecord('RECHECK', 'HUMAN', 'recheck_pass', '二次提交已满足要求。')
        : null,
    reviewRecords: [
      createReviewRecord('AI_PRECHECK', 'AI', 'manual', '连续失败后转人工兜底。'),
      ...(status === 'FINAL_PENDING' || status === 'FINAL_APPROVED'
        ? [createReviewRecord('RECHECK', 'HUMAN', 'recheck_pass', '二次提交已满足要求。')]
        : []),
    ],
    timeline: [
      {
        id: 'audit_1',
        kind: 'audit',
        label: 'AI 自动预审',
        actorId: 'user_ai_agent_system',
        fromStatus: null,
        toStatus: 'HUMAN_PENDING',
        reason: '连续失败后转人工兜底。',
        metadata: { action: 'AI_REVIEW_MANUAL_FALLBACK' },
        createdAt: NOW,
      },
    ],
  };
}

function createReviewRecord(stage: string, reviewerType: string, decision: string, comment: string) {
  return {
    id: `${stage}_${reviewerType}_${decision}`,
    submissionId: 'submission_1',
    ruleId: null,
    stage,
    reviewerId: reviewerType === 'HUMAN' ? 'user_reviewer_wang_fang' : null,
    assignedReviewerId: 'user_reviewer_wang_fang',
    reviewerType,
    scores: { overall: 60 },
    decision,
    comment,
    revisedAnswers: null,
    rawPrompt: '请根据规则完成审核。',
    rawOutput: '{"verdict":"manual"}',
    structuredOutput: { verdict: decision },
    modelMetadata: { provider: 'mock', model: 'mock-stable-reviewer', totalTokens: 120 },
    retryCount: 2,
    idempotencyKey: 'submission_1:1:ai-review',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createReviewRounds(state: ReturnType<typeof createQualityState>) {
  return [
    {
      submissionId: 'submission_round_1',
      assignmentId: 'assignment_1',
      status: 'NEEDS_REVISION',
      round: 1,
      answers: { quality: 'pass', comment: '回答覆盖关键事实。' },
      schemaVersion: 'qa-r1',
      submittedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      submissionId: 'submission_1',
      assignmentId: 'assignment_1',
      status: state.finalPending ? 'FINAL_PENDING' : state.reviewStatus,
      round: 2,
      answers: { quality: 'pass', comment: '已补充事实性依据。' },
      schemaVersion: 'qa-r1',
      submittedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];
}

function createReviewDiff() {
  return {
    assignmentId: 'assignment_1',
    fromRound: 1,
    toRound: 2,
    fromSubmissionId: 'submission_round_1',
    toSubmissionId: 'submission_1',
    changes: [
      {
        fieldKey: 'comment',
        type: 'changed',
        before: '回答覆盖关键事实。',
        after: '已补充事实性依据。',
      },
    ],
  };
}

function createImportSummary(items: Array<ReturnType<typeof createTaskItem>>) {
  return {
    taskId: 'task_qa',
    datasetKind: 'qa_quality',
    importedCount: 1,
    errorCount: 0,
    skippedFiles: [],
    fields: ['id', 'prompt', 'model_answer'],
    errors: [],
    preview: items,
    files: [
      {
        datasetKind: 'qa_quality',
        format: 'jsonl',
        fileName: 'qa_quality.jsonl',
        fields: ['id', 'prompt', 'model_answer'],
        importedCount: 1,
        errorCount: 0,
      },
    ],
  };
}

function createExportPreview(finalApproved: boolean) {
  return {
    taskId: 'task_qa',
    datasetKind: 'qa_quality',
    fieldMapping: [
      { source: 'rawData.id', target: 'id', enabled: true },
      { source: 'rawData.prompt', target: 'prompt', enabled: true },
      { source: 'answers.comment', target: 'comment', enabled: true },
      { source: 'review.ai_overall', target: 'ai_overall', enabled: true },
      { source: 'review.human_verdict', target: 'human_verdict', enabled: true },
    ],
    rows: finalApproved
      ? [
          {
            id: 'qa_1',
            prompt: '如何判断回答质量？',
            comment: '已补充事实性依据。',
            ai_overall: 60,
            human_verdict: 'final_pass',
          },
        ]
      : [],
    totalFinalApproved: finalApproved ? 1 : 0,
  };
}

function createExportJob(format: string) {
  const labels: Record<string, string> = {
    json: 'JSON',
    jsonl: 'JSONL',
    csv: 'CSV',
    xlsx: 'Excel',
  };

  return {
    id: `export_${format}`,
    taskId: 'task_qa',
    requestedById: 'user_owner_001',
    status: 'SUCCEEDED',
    format,
    idempotencyKey: `export:${format}`,
    fieldMapping: createExportPreview(true).fieldMapping,
    includeReviews: true,
    filters: null,
    filePath: `storage/exports/export_${format}.${format}`,
    resultUrl: null,
    errorMessage: null,
    finishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    displayName: labels[format],
  };
}

async function setSession(page: Page, role: 'OWNER' | 'LABELER' | 'AI_AGENT' | 'REVIEWER') {
  await page.goto('/login');
  await page.evaluate(
    ({ key, nextRole }) => {
      const names = {
        OWNER: 'Owner 演示账号',
        LABELER: 'Labeler 演示账号',
        AI_AGENT: 'AI Agent 演示账号',
        REVIEWER: 'Reviewer 演示账号',
      } as const;
      window.localStorage.setItem(
        key,
        JSON.stringify({
          token: `mock-token-${nextRole.toLowerCase()}`,
          user: {
            id: `demo-${nextRole.toLowerCase()}`,
            name: names[nextRole],
            role: nextRole,
          },
        }),
      );
    },
    { key: SESSION_KEY, nextRole: role },
  );
}

async function clearSession(page: Page) {
  await page.goto('/login');
  await page.evaluate((key) => {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }, SESSION_KEY);
}

async function assertNoUnmanagedEnglishCopy(page: Page) {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(BANNED_ENGLISH_COPY);
}

async function assertNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const width = root.clientWidth;
    const scrollWidth = root.scrollWidth;
    const overflowingControls = Array.from(document.querySelectorAll('button, a'))
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.textContent?.trim() ?? element.tagName);

    return { width, scrollWidth, overflowingControls };
  });

  expect(result.scrollWidth).toBeLessThanOrEqual(result.width + 1);
  expect(result.overflowingControls).toEqual([]);
}

async function fulfill(route: Route, data: unknown) {
  await route.fulfill({
    contentType: 'application/json',
    json: {
      data,
      requestId: 'req_e2e_quality',
    },
  });
}

function parseBody(raw: string | null): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  return JSON.parse(raw) as Record<string, unknown>;
}

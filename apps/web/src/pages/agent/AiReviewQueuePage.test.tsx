import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiReviewBatchDetailDto, AiReviewBatchDto } from '../../api/aiReview';
import type { TaskDto } from '../../api/tasks';
import { AiReviewQueuePage } from './AiReviewQueuePage';

const pendingBatch = {
  batchId: 'task-submit:task_qa:user_labeler_li_lei:round1',
  displayId: 'SUB-2041-00607',
  taskId: 'task_qa',
  taskTitle: '问答质量标注',
  taskCreatedAt: '2026-05-21T09:30:00.000Z',
  templateName: '问答质量官方模板',
  ownerId: 'user_owner_zhang_man',
  ownerName: '张满',
  labelerId: 'user_labeler_li_lei',
  labelerName: '李雷',
  submittedAt: '2026-05-21T10:01:02.000Z',
  itemCount: 3,
  externalIds: ['qa_1', 'qa_2', 'qa_3'],
  status: 'PENDING',
  aggregateDecision: 'pending',
  aggregateScore: null,
  failureReason: null,
  aiSuggestionLabel: '等待预审',
  templateVersion: 'r12',
  provider: 'mock',
  model: 'mock-stable-reviewer',
  updatedAt: '2026-05-21T10:01:02.000Z',
} satisfies AiReviewBatchDto;

const rejectedBatch = {
  ...pendingBatch,
  batchId: 'task-submit:task_pref:user_labeler_li_lei:round1',
  displayId: 'SUB-2041-00608',
  taskId: 'task_pref',
  taskTitle: '偏好安全评测',
  itemCount: 2,
  externalIds: ['pref_1', 'pref_2'],
  status: 'REJECTED',
  aggregateDecision: 'reject',
  aggregateScore: 62,
  aiSuggestionLabel: '建议打回',
  updatedAt: '2026-05-21T11:01:02.000Z',
} satisfies AiReviewBatchDto;

const passedBatch = {
  ...pendingBatch,
  batchId: 'task-submit:task_pass:user_labeler_li_lei:round1',
  displayId: 'SUB-2041-00609',
  taskId: 'task_pass',
  taskTitle: '通过结果抽检',
  itemCount: 1,
  externalIds: ['pass_1'],
  status: 'PASSED',
  aggregateDecision: 'pass',
  aggregateScore: 94,
  aiSuggestionLabel: '建议通过',
  updatedAt: '2026-05-21T12:01:02.000Z',
} satisfies AiReviewBatchDto;

const batches = [pendingBatch, rejectedBatch] satisfies AiReviewBatchDto[];

const tasks = [
  createTaskDto({
    id: 'task_qa',
    title: '问答质量标注',
    createdAt: '2026-05-20T08:00:00.000Z',
  }),
  createTaskDto({
    id: 'task_pref',
    title: '偏好安全评测',
    createdAt: '2026-05-21T08:00:00.000Z',
  }),
  createTaskDto({
    id: 'task_pass',
    title: '通过结果抽检',
    createdAt: '2026-05-22T08:00:00.000Z',
  }),
] satisfies TaskDto[];

const pendingDetail = {
  ...pendingBatch,
  aggregateDecision: 'pass',
  aggregateScore: 91,
  aiSuggestionLabel: '建议通过',
  status: 'PASSED',
  items: [
    createDetailItem(1, 'qa_1', 'pass', 96),
    createDetailItem(2, 'qa_2', 'pass', 88),
    createDetailItem(3, 'qa_3', 'pass', 90),
  ],
} satisfies AiReviewBatchDetailDto;

const longNoteText = [
  '答案完整。第一句说明选择依据。',
  '第二句补充事实背景。',
  '第三句对比两个候选回答。',
  '第四句说明为什么另一个回答不合适。',
  '第五句说明安全风险判断。',
  '第六句用于验证展开后可以看到完整提交内容。',
].join('\n');

const rejectedDetail = {
  ...rejectedBatch,
  items: [
    createDetailItem(1, 'pref_1', 'reject', 64, { longNote: true, rejectedFieldKey: 'note' }),
    createDetailItem(2, 'pref_2', 'pass', 90),
  ],
} satisfies AiReviewBatchDetailDto;

describe('AiReviewQueuePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('按任务提交批次展示 AI 预审队列，而不是逐题展示', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', createFetchMock());

    render(<AiReviewQueuePage />);

    expect(await screen.findByRole('heading', { name: 'AI 自动预审队列' })).toBeInTheDocument();
    const pageDescription = screen.getByText(
      '集中查看待 AI 预审的任务提交批次、标注员、题目数量和审核结论，支持快速定位预审结果',
    );
    expect(pageDescription).toHaveClass('task-management-table-description');
    expect(pageDescription.closest('.agent-review-page__header')).not.toBeNull();
    const searchInput = screen.getByPlaceholderText('搜索任务名 / 标注员 / 题目ID');
    expect(searchInput.closest('.task-management-table-card')).toHaveClass('agent-review-table-panel');
    expect(searchInput.closest('.task-management-table-toolbar')).toHaveClass('agent-review-table-toolbar');
    const statusSummaryRegion = screen.getByRole('region', { name: 'AI 预审状态筛选' });
    expect(statusSummaryRegion).toHaveClass('task-summary-grid', 'template-summary-grid');
    expect(within(statusSummaryRegion).getByRole('button', { name: /总任务/ })).toHaveTextContent('总任务2');
    expect(within(statusSummaryRegion).getByRole('button', { name: /总任务/ })).toHaveClass(
      'task-summary-card--total',
      'is-active',
    );
    expect(getComputedStyle(within(statusSummaryRegion).getByRole('button', { name: /总任务/ })).boxShadow).not.toBe('none');
    expect(within(statusSummaryRegion).getByRole('button', { name: /进行中/ })).toHaveTextContent('进行中1');
    expect(within(statusSummaryRegion).getByRole('button', { name: /进行中/ })).toHaveClass('task-summary-card--running');
    expect(within(statusSummaryRegion).getByRole('button', { name: /已完成/ })).toHaveTextContent('已完成1');
    expect(within(statusSummaryRegion).getByRole('button', { name: /已完成/ })).toHaveClass('task-summary-card--done');
    expect(screen.queryByRole('button', { name: '刷新任务级 AI 预审队列' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '刷新' })).not.toBeInTheDocument();

    const table = screen.getByRole('table', { name: '任务级 AI 预审队列表格' });
    ['任务ID', '任务名称', '标注员', '提交时间', '题目数', 'AI 建议']
      .forEach((header) => expect(within(table).getByText(header)).toBeInTheDocument());
    ['当前状态', '综合分 / 失败原因', '操作']
      .forEach((header) => expect(within(table).queryByText(header)).not.toBeInTheDocument());
    expect(within(table).queryByText('批次 ID')).not.toBeInTheDocument();
    expect(within(table).queryByText(/SUB-/)).not.toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    const qaRow = within(table).getByRole('row', { name: /问答质量标注/ });
    const qaCells = within(qaRow).getAllByRole('cell');
    expect(qaCells[0]).toHaveClass('task-table__id');
    expect(within(qaCells[0]).getByText('T-0001').tagName).toBe('CODE');
    expect(qaCells[0]).toHaveTextContent('T-0001');
    const qaTitleCell = qaCells[1];
    expect(within(qaTitleCell).getByText('问答质量标注')).toBeInTheDocument();
    expect(qaTitleCell).not.toHaveTextContent('T-0001');
    expect(within(table).getByText('T-0002').closest('td')).toHaveClass('task-table__id');
    expect(within(table).getByText('偏好安全评测')).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: '问答质量标注' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: '查看详情' })).not.toBeInTheDocument();
    expect(within(table).getByText('3 题')).toBeInTheDocument();
    expect(within(table).queryByText('qa_1')).not.toBeInTheDocument();

    await user.click(within(statusSummaryRegion).getByRole('button', { name: /进行中/ }));
    expect(within(statusSummaryRegion).getByRole('button', { name: /进行中/ })).toHaveClass('is-active');
    expect(getComputedStyle(within(statusSummaryRegion).getByRole('button', { name: /进行中/ })).boxShadow).not.toBe('none');
    expect(within(table).getByText('问答质量标注')).toBeInTheDocument();
    expect(within(table).queryByText('偏好安全评测')).not.toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(2);

    await user.click(within(statusSummaryRegion).getByRole('button', { name: /已完成/ }));
    expect(within(statusSummaryRegion).getByRole('button', { name: /已完成/ })).toHaveClass('is-active');
    expect(getComputedStyle(within(statusSummaryRegion).getByRole('button', { name: /已完成/ })).boxShadow).not.toBe('none');
    expect(within(table).getByText('偏好安全评测')).toBeInTheDocument();
    expect(within(table).queryByText('问答质量标注')).not.toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(2);

    await user.click(within(statusSummaryRegion).getByRole('button', { name: /总任务/ }));
    expect(within(statusSummaryRegion).getByRole('button', { name: /总任务/ })).toHaveClass('is-active');
    expect(getComputedStyle(within(statusSummaryRegion).getByRole('button', { name: /总任务/ })).boxShadow).not.toBe('none');
    expect(within(table).getByText('问答质量标注')).toBeInTheDocument();
    expect(within(table).getByText('偏好安全评测')).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });

  it('机审队列仅允许任务ID和提交时间按指定方向排序', async () => {
    const user = userEvent.setup();
    const customBatches = [
      { ...passedBatch, taskTitle: '通过结果抽检', batchId: 'task-submit:task_pass:user_labeler_li_lei:round3', submittedAt: '2026-06-03T10:00:00.000Z' },
      { ...pendingBatch, taskTitle: '问答质量标注', batchId: 'task-submit:task_qa:user_labeler_li_lei:round1', submittedAt: '2026-06-01T10:00:00.000Z' },
      { ...rejectedBatch, taskTitle: '偏好安全评测', batchId: 'task-submit:task_pref:user_labeler_li_lei:round2', submittedAt: '2026-06-02T10:00:00.000Z' },
    ] satisfies AiReviewBatchDto[];
    vi.stubGlobal('fetch', createFetchMock(customBatches));

    render(<AiReviewQueuePage />);

    const table = await screen.findByRole('table', { name: '任务级 AI 预审队列表格' });
    const taskIdSortButton = within(table).getByRole('button', { name: '按任务ID排序' });
    const submitTimeSortButton = within(table).getByRole('button', { name: '按提交时间排序' });
    expect(taskIdSortButton).toHaveClass(
      'task-table__sortable-header',
      'agent-review-batch-table__sortable-header',
    );
    expect(submitTimeSortButton).toHaveClass(
      'task-table__sortable-header',
      'agent-review-batch-table__sortable-header',
    );
    expect(taskIdSortButton).toHaveTextContent('任务ID⇅');
    expect(submitTimeSortButton).toHaveTextContent('提交时间⇅');
    expect(within(table).queryByRole('button', { name: '按任务名称排序' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: '按标注员排序' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: '按题目数排序' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: '按AI 建议排序' })).not.toBeInTheDocument();

    const allRows = () => within(table).getAllByRole('row').slice(1);
    expect(allRows()[0]).toHaveTextContent('通过结果抽检');
    expect(allRows()[1]).toHaveTextContent('问答质量标注');
    expect(allRows()[2]).toHaveTextContent('偏好安全评测');

    await user.click(taskIdSortButton);
    expect(taskIdSortButton).toHaveTextContent('任务ID↑');
    expect(submitTimeSortButton).toHaveTextContent('提交时间⇅');
    expect(allRows()[0]).toHaveTextContent('问答质量标注');
    expect(allRows()[1]).toHaveTextContent('偏好安全评测');
    expect(allRows()[2]).toHaveTextContent('通过结果抽检');

    await user.click(taskIdSortButton);
    expect(taskIdSortButton).toHaveTextContent('任务ID↓');
    expect(submitTimeSortButton).toHaveTextContent('提交时间⇅');
    expect(allRows()[0]).toHaveTextContent('通过结果抽检');
    expect(allRows()[1]).toHaveTextContent('偏好安全评测');
    expect(allRows()[2]).toHaveTextContent('问答质量标注');

    await user.click(submitTimeSortButton);
    expect(taskIdSortButton).toHaveTextContent('任务ID⇅');
    expect(submitTimeSortButton).toHaveTextContent('提交时间↑');
    expect(allRows()[0]).toHaveTextContent('问答质量标注');
    expect(allRows()[1]).toHaveTextContent('偏好安全评测');
    expect(allRows()[2]).toHaveTextContent('通过结果抽检');

    await user.click(submitTimeSortButton);
    expect(taskIdSortButton).toHaveTextContent('任务ID⇅');
    expect(submitTimeSortButton).toHaveTextContent('提交时间↓');
    expect(allRows()[0]).toHaveTextContent('通过结果抽检');
    expect(allRows()[1]).toHaveTextContent('偏好安全评测');
    expect(allRows()[2]).toHaveTextContent('问答质量标注');
  });

  it('AI 建议通过气泡带有任务管理同款绿点', async () => {
    vi.stubGlobal('fetch', createFetchMock([passedBatch]));

    render(<AiReviewQueuePage />);

    const table = await screen.findByRole('table', { name: '任务级 AI 预审队列表格' });
    const passPill = within(table).getByText('建议通过');
    expect(passPill).toHaveClass('agent-review-decision-pill', 'is-pass');
    const dot = passPill.querySelector('.status-tag__dot');
    expect(dot).not.toBeNull();
    expect(dot).toHaveAttribute('aria-hidden', 'true');
  });

  it('搜索作用于聚合后的任务级记录', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', createFetchMock());

    render(<AiReviewQueuePage />);

    const table = await screen.findByRole('table', { name: '任务级 AI 预审队列表格' });
    expect(within(table).getByText('问答质量标注')).toBeInTheDocument();
    expect(within(table).getByText('偏好安全评测')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('搜索任务名 / 标注员 / 题目ID'), 'pref_2');
    expect(within(table).getByText('偏好安全评测')).toBeInTheDocument();
    expect(within(table).queryByText('问答质量标注')).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('搜索任务名 / 标注员 / 题目ID'));
    await user.type(screen.getByPlaceholderText('搜索任务名 / 标注员 / 题目ID'), 'T-0001');
    expect(within(table).getByText('问答质量标注')).toBeInTheDocument();
    expect(within(table).queryByText('偏好安全评测')).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('搜索任务名 / 标注员 / 题目ID'));
    await user.type(screen.getByPlaceholderText('搜索任务名 / 标注员 / 题目ID'), '不存在');
    expect(within(table).getByText('暂无任务级 AI 预审记录')).toBeInTheDocument();
  });

  it('点击任务级表格行后从底部打开全页面详情层，并展示多题切换和详情模块', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', createFetchMock());

    render(<AiReviewQueuePage />);

    const table = await screen.findByRole('table', { name: '任务级 AI 预审队列表格' });
    await user.click(within(table).getByRole('row', { name: /问答质量标注/ }));

    const dialog = await screen.findByRole('dialog', { name: /AI 预审详情 · 问答质量标注/ });
    expect(dialog).toHaveClass('agent-review-batch-sheet');
    expect(dialog.closest('.agent-review-sheet-overlay')?.parentElement).toBe(document.body);
    const summaryCard = within(dialog).getByRole('region', { name: 'AI 预审详情摘要' });
    expect(summaryCard).toHaveClass('agent-review-detail-summary-card');
    expect(within(summaryCard).queryByText(/SUB-/)).not.toBeInTheDocument();
    const summaryTitle = within(summaryCard).getByRole('heading', { name: 'AI 预审详情 · 问答质量标注' });
    expect(summaryTitle).toHaveClass('agent-review-detail-summary-card__title');
    const summarySubline = summaryCard.querySelector('.agent-review-detail-summary-subline') as HTMLElement;
    const summarySubtitle = summaryCard.querySelector('.agent-review-detail-summary-card__subtitle') as HTMLElement;
    expect(summarySubtitle).toHaveTextContent('问答质量官方模板 · r12');
    expect(summarySubline).toHaveTextContent('任务 Owner张满');
    expect(summarySubline).toHaveTextContent('标注员李雷');
    const summaryStatus = summaryCard.querySelector('.agent-review-detail-summary-status') as HTMLElement;
    expect(summaryStatus).toHaveTextContent('建议通过');
    expect(summaryStatus).toHaveClass('agent-review-detail-summary-status', 'is-pass');
    const summaryTitleRow = summaryCard.querySelector('.agent-review-detail-summary-title-row') as HTMLElement;
    expect(summaryTitleRow).toHaveTextContent('3 题');
    const summaryHeading = summaryCard.querySelector('.agent-review-detail-summary-heading') as HTMLElement;
    expect(summaryHeading).toContainElement(summaryTitle);
    expect(summaryHeading).toContainElement(summaryStatus);
    const closeButton = within(dialog).getByRole('button', { name: '关闭 AI 预审详情' });
    expect(summaryCard).toContainElement(closeButton);
    expect(within(summaryCard).queryByRole('list', { name: '批次摘要信息' })).not.toBeInTheDocument();
    const taskTimeline = within(summaryCard).getByRole('list', { name: '当前任务时间线' });
    expect(taskTimeline).toHaveClass('agent-review-task-timeline');
    expect(within(taskTimeline).getAllByRole('listitem')).toHaveLength(7);
    ['Owner 发起任务', 'Labeler 提交', 'AI 预审入队', '开始预审', '生成结论', '预审完成', '当前状态']
      .forEach((label) => expect(taskTimeline).toHaveTextContent(label));
    expect(taskTimeline).toHaveTextContent('张满');
    expect(taskTimeline).toHaveTextContent('李雷');
    expect(taskTimeline).toHaveTextContent('AI Agent');
    expect(taskTimeline).toHaveTextContent('建议通过');
    expect(taskTimeline).toHaveTextContent('2026');
    expect(taskTimeline).not.toHaveTextContent('提交时间');
    expect(taskTimeline).not.toHaveTextContent('更新时间');
    expect(taskTimeline).not.toHaveTextContent('预审模型');
    expect(taskTimeline).not.toHaveTextContent('mock-stable-reviewer');
    expect(within(dialog).queryByText('AI 建议：通过')).not.toBeInTheDocument();
    expect(closeButton).toHaveTextContent('×');
    expect(dialog.querySelector('.agent-review-question-tabs')).not.toBeInTheDocument();
    expect(dialog.querySelector('.agent-review-question-list')).toBeInTheDocument();
    expect(within(dialog).getByRole('tablist', { name: '题目审核状态统计' })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: /待审核\s*0/ })).toHaveClass('is-pending');
    expect(within(dialog).getByRole('tab', { name: /已通过\s*3/ })).toHaveClass('is-pass', 'is-active');
    expect(within(dialog).getByRole('tab', { name: /已打回\s*0/ })).toHaveClass('is-reject');
    expect(within(dialog).queryByRole('tab', { name: /失败\s*0/ })).not.toBeInTheDocument();
    expect(within(dialog).getByText('已通过题目')).toBeInTheDocument();
    const questionTabList = within(dialog).getByRole('tablist', { name: '批次内题目切换' });
    expect(within(questionTabList).getByRole('tab', { name: /Q1/ })).toBeInTheDocument();
    expect(within(questionTabList).getByRole('tab', { name: /Q2/ })).toBeInTheDocument();
    expect(within(questionTabList).getByRole('tab', { name: /Q3/ })).toBeInTheDocument();
    within(questionTabList)
      .getAllByText('建议通过')
      .forEach((label) => expect(label).toHaveClass('is-pass'));
    await user.click(within(dialog).getByRole('tab', { name: /待审核\s*0/ }));
    expect(within(dialog).getByText('待审核题目')).toBeInTheDocument();
    expect(within(questionTabList).queryByRole('tab', { name: /Q1/ })).not.toBeInTheDocument();
    expect(within(questionTabList).getByText('暂无待审核题目。')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('tab', { name: /已通过\s*3/ }));
    expect(within(dialog).getByText('已通过题目')).toBeInTheDocument();
    expect(within(questionTabList).getAllByRole('tab')).toHaveLength(3);

    ['字段预审结果', 'AI 总评']
      .forEach((title) => expect(within(dialog).getByText(title)).toBeInTheDocument());
    expect(within(dialog).queryByText('当前题概览')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('AI 总建议')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('审核字段')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('字段通过情况')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('整体分')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('需要AI预审的字段')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('维度评分（共 100）')).not.toBeInTheDocument();
    expect(within(dialog).getAllByText('qa_1').length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/2 个字段/)).toBeInTheDocument();
    expect(within(dialog).getByText(/本题建议通过/)).toBeInTheDocument();
    expect(within(dialog).getByText(/AI 预审字段 2 个 · 通过 2 · 打回 0/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('table', { name: '字段预审结果' })).not.toBeInTheDocument();
    const fieldReviewList = within(dialog).getByRole('list', { name: '字段预审结果列表' });
    expect(within(fieldReviewList).getAllByRole('listitem')).toHaveLength(2);
    expect(within(fieldReviewList).getAllByText('Labeler 提交内容').length).toBeGreaterThan(0);
    expect(within(fieldReviewList).getAllByText('预审规则').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('选择更优回答 · preferred').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('备注说明 · note').length).toBeGreaterThan(0);
    expect(within(dialog).queryByText('preferred')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('note')).not.toBeInTheDocument();
    expect(within(fieldReviewList).getByText(/必须选择与题目事实一致的更优回答/)).toBeInTheDocument();
    expect(within(dialog).getAllByText('通过').length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/查看未参与 AI 预审的提交字段/)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('table', { name: '未参与 AI 预审的提交字段' })).not.toBeInTheDocument();
    expect(within(fieldReviewList).queryByText('internal_note')).not.toBeInTheDocument();
    expect(within(fieldReviewList).getByText(/答案完整/)).toBeInTheDocument();
    expect(within(dialog).getByText(/所有开启 AI 预审的字段均通过/)).toBeInTheDocument();
    const traceSidebar = within(dialog).getByRole('complementary', { name: '当前题追溯' });
    expect(traceSidebar).toHaveClass('agent-review-trace-sidebar');
    const traceTab = within(traceSidebar).getByRole('tab', { name: '当前题' });
    expect(traceTab).toHaveClass('is-active');
    expect(traceTab).toHaveAttribute('aria-selected', 'true');
    let currentQuestionTrace = within(traceSidebar).getByRole('region', { name: /当前题追溯/ });
    expect(currentQuestionTrace).toHaveTextContent('Q1 · qa_1');
    expect(currentQuestionTrace).toHaveTextContent('第1轮');
    expect(currentQuestionTrace).toHaveTextContent('待人工复审');
    expect(currentQuestionTrace).toHaveTextContent('AI 状态AI 预审通过');
    ['Schema', '数据集', '通用 JSON', '问答质量', '尝试次数', '重试次数', '提交时间', '完成时间', '1 / 3']
      .forEach((text) => expect(currentQuestionTrace).not.toHaveTextContent(text));
    expect(traceSidebar).not.toHaveTextContent(/问答质量标注|张满|task_qa|SUB-|submission_|assignment_|item_|job_|mock-stable-reviewer/);
    expect(within(traceSidebar).queryByText('服务商')).not.toBeInTheDocument();
    expect(within(traceSidebar).queryByText('模型')).not.toBeInTheDocument();
    ['任务概要', '任务ID', '批次ID', '任务 Owner', '模板名称', '标注员', '提交记录', '题目记录', 'AI Job', '幂等键', '审核记录']
      .forEach((label) => expect(within(traceSidebar).queryByText(label)).not.toBeInTheDocument());
    const traceNodes = within(currentQuestionTrace).getAllByRole('listitem');
    expect(traceNodes.length).toBeGreaterThanOrEqual(6);
    ['Labeler 提交', 'AI 预审入队', 'AI 开始处理', '处理日志：执行预审', 'AI 预审结论', 'AI 预审完成']
      .forEach((title) => expect(within(currentQuestionTrace).getByText(title)).toBeInTheDocument());
    expect(within(dialog).getByText('查看审核 Prompt')).toBeInTheDocument();
    expect(within(dialog).queryByText('查看模型原始输出')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('模型原始输出')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('查看处理日志')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('处理日志 / 审计')).not.toBeInTheDocument();
    expect(within(dialog).getByText(/真实运行 Prompt：请只审核开启 AI 预审的字段/)).toBeInTheDocument();
    await user.click(within(dialog).getByText('查看审核 Prompt'));
    expect(within(dialog).getByRole('region', { name: 'AI Prompt 预览' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Prompt 组成部分' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: '1. 角色设定' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: '2. 题目展示信息 Show Item' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('查看角色设定')).toHaveValue(
      '真实运行 Prompt：请只审核开启 AI 预审的字段。',
    );
    await user.click(within(dialog).getByRole('button', { name: '查看完整 Prompt' }));
    expect(within(dialog).getAllByRole('heading', { name: '完整 Prompt' })).toHaveLength(2);
    expect((within(dialog).getByLabelText('查看完整 AI Prompt') as HTMLTextAreaElement).value).toContain(
      '# 2. 题目展示信息 Show Item',
    );
    expect(within(dialog).queryByLabelText('查看角色设定')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '查看分段' }));
    await user.click(within(dialog).getAllByRole('button', { name: '收起' })[0]);
    expect(within(dialog).getByLabelText('查看角色设定')).toHaveAttribute('tabindex', '-1');
    expect((within(dialog).getByLabelText('查看题目展示信息 Show Item') as HTMLTextAreaElement).value).toContain(
      '解释什么是过拟合',
    );
    expect(within(dialog).queryByText(/敏感 \/ 违规词/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/function_calling · 结构化/)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: /Q2/ }));
    currentQuestionTrace = within(traceSidebar).getByRole('region', { name: /当前题追溯/ });
    expect(currentQuestionTrace).toHaveTextContent('Q2 · qa_2');
    expect(traceSidebar).not.toHaveTextContent(/submission_qa_2|job_qa_2/);
    expect(within(dialog).getAllByText(/第二题答案/).length).toBeGreaterThan(0);
    expect((within(dialog).getByLabelText('查看题目展示信息 Show Item') as HTMLTextAreaElement).value).toContain(
      '第二题 prompt',
    );

    await user.click(within(dialog).getByRole('tab', { name: /Q3/ }));
    expect(within(dialog).getByText('本题暂未记录真实审核 Prompt。')).toBeInTheDocument();
    expect(within(dialog).queryByText(/你是电商商品标题审核员/)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '关闭 AI 预审详情' }));
    expect(dialog).toHaveClass('is-closing');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('table', { name: '任务级 AI 预审队列表格' })).toBeInTheDocument();
  });

  it('字段级审核结果中任意字段打回时，当前题结果条和字段行突出显示打回字段', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', createFetchMock());

    render(<AiReviewQueuePage />);

    const table = await screen.findByRole('table', { name: '任务级 AI 预审队列表格' });
    await user.click(within(table).getByRole('row', { name: /偏好安全评测/ }));

    const dialog = await screen.findByRole('dialog', { name: /AI 预审详情 · 偏好安全评测/ });
    const questionTabList = within(dialog).getByRole('tablist', { name: '批次内题目切换' });
    expect(within(questionTabList).getByText('建议打回')).toHaveClass('is-reject');
    expect(within(dialog).getByText(/本题建议打回/)).toBeInTheDocument();
    expect(within(dialog).getByText(/AI 预审字段 2 个 · 通过 1 · 打回 1/)).toBeInTheDocument();
    expect(within(dialog).getByText(/打回字段：/)).toHaveTextContent('备注说明');

    expect(within(dialog).queryByRole('table', { name: '字段预审结果' })).not.toBeInTheDocument();
    const fieldReviewList = within(dialog).getByRole('list', { name: '字段预审结果列表' });
    const rejectedBlock = within(fieldReviewList).getByRole('listitem', { name: /备注说明 · note AI 预审结果/ });
    expect(rejectedBlock).toHaveClass('is-reject');
    expect(within(rejectedBlock).getByText('打回')).toBeInTheDocument();
    expect(within(rejectedBlock).getByText(/缺少判断依据/)).toBeInTheDocument();
    expect(within(rejectedBlock).getByText(/第六句用于验证展开/)).toBeInTheDocument();
    expect(within(rejectedBlock).queryByRole('button', { name: '展开' })).not.toBeInTheDocument();
  });

  it('点击弹层主体以外区域时关闭详情层并播放退出动画', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', createFetchMock());

    render(<AiReviewQueuePage />);

    const table = await screen.findByRole('table', { name: '任务级 AI 预审队列表格' });
    await user.click(within(table).getByRole('row', { name: /问答质量标注/ }));

    const dialog = await screen.findByRole('dialog', { name: /AI 预审详情 · 问答质量标注/ });
    await user.click(document.body);

    expect(dialog).toHaveClass('is-closing');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('空数据时显示统一空状态 SVG', async () => {
    vi.stubGlobal('fetch', createFetchMock([]));

    render(<AiReviewQueuePage />);

    const table = await screen.findByRole('table', { name: '任务级 AI 预审队列表格' });
    expect(within(table).getByRole('img', { name: '空预审队列插画' })).toHaveAttribute(
      'src',
      expect.stringContaining('empty-table-illustration.svg'),
    );
    expect(within(table).getByText('暂无任务级 AI 预审记录')).toBeInTheDocument();
  });

  it('接口 500 时使用友好提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { message: 'server exploded' } }, 500)),
    );

    render(<AiReviewQueuePage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('AI 预审队列加载失败，请稍后重试');
    expect(screen.queryByText(/HTTP 500/)).not.toBeInTheDocument();
  });
});

function createDetailItem(
  index: number,
  externalId: string,
  decision: AiReviewBatchDetailDto['items'][number]['decision'],
  overall: number,
  options: { longNote?: boolean; rejectedFieldKey?: string } = {},
): AiReviewBatchDetailDto['items'][number] {
  const noteDecision = options.rejectedFieldKey === 'note' ? 'reject' : 'pass';
  const preferredDecision = options.rejectedFieldKey === 'preferred' ? 'reject' : 'pass';

  return {
    index,
    decision,
    overallScore: overall,
    job: {
      id: `job_${externalId}`,
      submissionId: `submission_${externalId}`,
      taskId: 'task_qa',
      taskTitle: '问答质量标注',
      externalId,
      datasetKind: 'qa_quality',
      submissionStatus: 'HUMAN_PENDING',
      round: 1,
      status: 'SUCCEEDED',
      attempts: 1,
      maxAttempts: 3,
      idempotencyKey: `submission_${externalId}:1:ai-review`,
      structuredOutputMode: 'function_calling',
      provider: 'mock',
      model: 'mock-stable-reviewer',
      lastError: null,
      queuedAt: '2026-05-21T10:01:02.000Z',
      startedAt: '2026-05-21T10:01:03.000Z',
      finishedAt: '2026-05-21T10:01:04.000Z',
      updatedAt: '2026-05-21T10:01:04.000Z',
    },
    submission: {
      id: `submission_${externalId}`,
      assignmentId: `assignment_${externalId}`,
      status: 'HUMAN_PENDING',
      round: 1,
      answers: {
        preferred: 'response_a',
        note: options.longNote ? longNoteText : index === 2 ? '第二题答案' : '答案完整',
        internal_note: '这只是未参与 AI 预审的人工补充',
      },
      schemaVersion: 'r12',
      submittedAt: '2026-05-21T10:01:02.000Z',
    },
    reviewFields: [
      {
        fieldKey: 'preferred',
        label: '选择更优回答',
        type: 'radio',
        required: true,
        requirement: '必须选择与题目事实一致的更优回答。',
      },
      {
        fieldKey: 'note',
        label: '备注说明',
        type: 'textarea',
        required: false,
        requirement: '必须说明选择理由，不能只给结论。',
      },
    ],
    taskItem: {
      id: `item_${externalId}`,
      externalId,
      datasetKind: 'qa_quality',
      rawData: {
        prompt: index === 2 ? '第二题 prompt' : '解释什么是过拟合',
        response_a: '模型在训练集表现很好但泛化差。',
      },
    },
    reviewRecord: {
      id: `record_${externalId}`,
      ruleId: '电商相关性 v2',
      stage: 'AI_PRECHECK',
      reviewerType: 'AI',
      scores: { relevance: 94, accuracy: 92, format: 90, safety: 98, overall },
      decision,
      comment: 'AI 预审通过，进入人工复审。',
      rawPrompt:
        index === 3
          ? null
          : createRawPromptFixture({
              note: index === 2 ? '第二题答案' : '答案完整',
              prompt: index === 2 ? '第二题 prompt' : '解释什么是过拟合',
            }),
      rawOutput: '{"verdict":"pass"}',
      structuredOutput: {
        verdict: 'pass',
        overallScore: overall,
        fieldReviews: [
          {
            fieldKey: 'preferred',
            label: '选择更优回答',
            score: 92,
            decision: preferredDecision,
            comment: preferredDecision === 'reject' ? '选择与题目事实不一致。' : '选择与证据一致。',
            suggestions: preferredDecision === 'reject' ? ['重新核对两个回答的事实依据。'] : [],
          },
          {
            fieldKey: 'note',
            label: '备注说明',
            score: overall,
            decision: noteDecision,
            comment: noteDecision === 'reject' ? '缺少判断依据，不能支撑选择结果。' : index === 2 ? '第二题答案说明充分。' : '备注说明充分。',
            suggestions: noteDecision === 'reject' ? ['补充具体事实依据和比较理由。'] : [],
          },
        ],
        overallComment: options.rejectedFieldKey ? '存在开启 AI 预审的字段未通过，建议打回。' : '所有开启 AI 预审的字段均通过。',
      },
      modelMetadata: { provider: 'mock', model: 'mock-stable-reviewer' },
      retryCount: 1,
      idempotencyKey: `submission_${externalId}:1:ai-review`,
      createdAt: '2026-05-21T10:01:04.000Z',
    },
    logs: [
      { id: `log_${externalId}_queue`, type: 'queue', time: '2026-05-21T10:01:02.000Z', message: '进入队列' },
      { id: `log_${externalId}_llm`, type: 'llm', time: '2026-05-21T10:01:03.000Z', message: '调用模型' },
      { id: `log_${externalId}_verdict`, type: 'verdict', time: '2026-05-21T10:01:04.000Z', message: '结构化输出：pass' },
    ],
  };
}

function createRawPromptFixture({ note, prompt }: { note: string; prompt: string }): string {
  return [
    '# 1. 角色设定',
    '真实运行 Prompt：请只审核开启 AI 预审的字段。',
    '',
    '# 2. 题目展示信息 Show Item',
    `[{"sourceKey":"prompt","label":"问题","value":"${prompt}"}]`,
    '',
    '# 3. 需要AI预审的字段',
    `{"preferred":"response_a","note":"${note}"}`,
    '',
    '# 4. 字段审核标准',
    '[{"fieldKey":"preferred","requirement":"必须选择与题目事实一致的更优回答。"}]',
    '',
    '# 5. 输出格式约束',
    '你必须只输出合法 JSON。',
  ].join('\n');
}

function createFetchMock(initialBatches: AiReviewBatchDto[] = batches, taskList: TaskDto[] = tasks) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { method, path } = requestInfo(input, init);

    if (path === '/ai-review/batches' && method === 'GET') {
      return jsonResponse({ data: initialBatches });
    }

    if (path === '/tasks' && method === 'GET') {
      return jsonResponse({ data: taskList });
    }

    if (path.startsWith('/ai-review/batches/') && method === 'GET') {
      const batchId = decodeURIComponent(path.replace('/ai-review/batches/', ''));
      if (batchId === pendingBatch.batchId) {
        return jsonResponse({ data: pendingDetail });
      }
      if (batchId === rejectedBatch.batchId) {
        return jsonResponse({ data: rejectedDetail });
      }
    }

    return jsonResponse({ data: {} });
  });
}

function requestInfo(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input.toString(), 'http://localhost');
  const path = url.pathname.replace(/^\/api/, '');

  return {
    method: init?.method ?? 'GET',
    path,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createTaskDto(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: 'task_default',
    title: '默认任务',
    description: null,
    richTextInstruction: null,
    tags: [],
    rewardRule: null,
    rewardPerItem: null,
    perUserLimit: null,
    quota: null,
    deadline: null,
    distributionStrategy: 'FIRST_COME_FIRST_SERVE',
    aiPreReviewEnabled: false,
    aiRuleName: null,
    status: 'PUBLISHED',
    templateId: 'template_default',
    template: {
      id: 'template_default',
      name: '默认模板',
      datasetKind: 'qa_quality',
      schemaVersion: 'r1',
      status: 'PUBLISHED',
    },
    createdById: 'user_owner_001',
    itemCount: 1,
    assignedItemCount: 1,
    submittedItemCount: 0,
    completedItemCount: 0,
    exportableItemCount: 0,
    workflowProgress: [],
    datasetImportSummary: null,
    createdAt: '2026-05-21T08:00:00.000Z',
    updatedAt: '2026-05-21T08:00:00.000Z',
    ...overrides,
  };
}

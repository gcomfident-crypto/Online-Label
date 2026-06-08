import type { AiReviewBatchDto } from '../../api/aiReview';
import { listAiReviewBatches } from '../../api/aiReview';
import { listTaskSummaries, type TaskDto } from '../../api/tasks';

export type DashboardRange = '7d' | '30d';

export type DashboardRangeOption = {
  label: string;
  value: DashboardRange;
};

export type KpiMetric = {
  change: string;
  icon: 'batch' | 'items' | 'pass' | 'reject' | 'duration';
  label: string;
  sparkline: number[];
  trendTone: 'positive' | 'negative';
  value: string;
};

export type TrendPoint = {
  label: string;
  passRate: number;
  processed: number;
};

export type QualityDistributionItem = {
  color: string;
  count: number;
  label: string;
  percent: number;
};

export type ProblemReasonItem = {
  count: number;
  label: string;
  percent: number;
};

export type HighRiskTask = {
  name: string;
  owner: string;
  rejectRate: string;
  risk: '高' | '中' | '低';
  volume: string;
};

export type AbnormalBatch = {
  duration: string;
  reason: string;
  taskName: string;
  time: string;
};

export type TaskStatusItem = {
  color: string;
  count: number;
  label: string;
  percent: number;
};

export type AgentDashboardData = {
  abnormalBatches: AbnormalBatch[];
  highRiskTasks: HighRiskTask[];
  kpis: KpiMetric[];
  problemReasons: ProblemReasonItem[];
  qualityDistribution: QualityDistributionItem[];
  qualityTotal: string;
  rangeSubtitle: string;
  taskStatus: TaskStatusItem[];
  totalTasks: string;
  trend: TrendPoint[];
  updatedAt: string;
};

export const DASHBOARD_RANGE_OPTIONS: DashboardRangeOption[] = [
  { label: '近 7 天', value: '7d' },
  { label: '近 30 天', value: '30d' },
];

type DashboardSource = {
  batches: AiReviewBatchDto[];
  tasks: TaskDto[];
};

const RANGE_DAYS: Record<DashboardRange, number> = {
  '7d': 7,
  '30d': 30,
};

const RANGE_LABELS: Record<DashboardRange, string> = {
  '7d': '近 7 天',
  '30d': '近 30 天',
};

const EMPTY_SPARKLINE = [0, 0, 0, 0, 0, 0, 0];

export async function loadAgentDashboardData(
  range: DashboardRange,
  now = new Date(),
): Promise<AgentDashboardData> {
  const [batches, tasks] = await Promise.all([
    listAiReviewBatches(),
    listTaskSummaries(),
  ]);

  return buildAgentDashboardData({ batches, tasks }, range, now);
}

export function emptyAgentDashboardData(range: DashboardRange, now = new Date()): AgentDashboardData {
  return buildAgentDashboardData({ batches: [], tasks: [] }, range, now);
}

export function buildAgentDashboardData(source: DashboardSource, range: DashboardRange, now = new Date()): AgentDashboardData {
  const selectedBatches = filterBatchesByRange(source.batches, range, now);
  const todayBatches = filterBatchesByDay(source.batches, now);
  const yesterdayBatches = filterBatchesByDay(source.batches, addDays(startOfDay(now), -1));
  const todayAverageDuration = averageBatchItemDurationSeconds(todayBatches);
  const yesterdayAverageDuration = averageBatchItemDurationSeconds(yesterdayBatches);
  const trend = buildTrendPoints(selectedBatches, range, now);
  const dailyRejectRates = trend.map((point) => dailyRejectRate(selectedBatches, point.label, now));
  const dailyDurations = trend.map((point) => averageBatchItemDurationSeconds(filterBatchesByLabel(selectedBatches, point.label, now)));
  const qualityDistribution = buildQualityDistribution(selectedBatches);
  const qualityTotal = qualityDistribution.reduce((total, item) => total + item.count, 0);
  const problemReasons = buildProblemReasons(selectedBatches);
  const highRiskTasks = buildHighRiskTasks(selectedBatches, source.tasks);
  const abnormalBatches = buildAbnormalBatches(selectedBatches);
  const taskStatus = buildTaskStatus(source.tasks, selectedBatches);

  return {
    abnormalBatches,
    highRiskTasks,
    kpis: [
      {
        label: '今日预审批次',
        value: formatInteger(todayBatches.length),
        change: formatNumberChange(todayBatches.length, yesterdayBatches.length),
        trendTone: todayBatches.length >= yesterdayBatches.length ? 'positive' : 'negative',
        icon: 'batch',
        sparkline: trend.map((point) => point.processed),
      },
      {
        label: '今日处理题目数',
        value: formatInteger(sumItems(todayBatches)),
        change: formatNumberChange(sumItems(todayBatches), sumItems(yesterdayBatches)),
        trendTone: sumItems(todayBatches) >= sumItems(yesterdayBatches) ? 'positive' : 'negative',
        icon: 'items',
        sparkline: trend.map((point) => point.processed),
      },
      {
        label: '通过率',
        value: formatPercent(resultRate(todayBatches, 'pass')),
        change: formatPointChange(resultRate(todayBatches, 'pass') - resultRate(yesterdayBatches, 'pass')),
        trendTone: resultRate(todayBatches, 'pass') >= resultRate(yesterdayBatches, 'pass') ? 'positive' : 'negative',
        icon: 'pass',
        sparkline: trend.map((point) => point.passRate),
      },
      {
        label: '打回率',
        value: formatPercent(resultRate(todayBatches, 'reject')),
        change: formatPointChange(resultRate(todayBatches, 'reject') - resultRate(yesterdayBatches, 'reject')),
        trendTone: resultRate(todayBatches, 'reject') <= resultRate(yesterdayBatches, 'reject') ? 'positive' : 'negative',
        icon: 'reject',
        sparkline: dailyRejectRates,
      },
      {
        label: '平均处理时长',
        value: formatDuration(todayAverageDuration),
        change: formatDurationChange(todayAverageDuration, yesterdayAverageDuration),
        trendTone: todayAverageDuration <= yesterdayAverageDuration ? 'positive' : 'negative',
        icon: 'duration',
        sparkline: dailyDurations.some((value) => value > 0) ? dailyDurations : EMPTY_SPARKLINE,
      },
    ],
    problemReasons,
    qualityDistribution,
    qualityTotal: formatInteger(qualityTotal),
    rangeSubtitle: `${RANGE_LABELS[range]}处理量与通过率变化`,
    taskStatus,
    totalTasks: formatInteger(source.tasks.length),
    trend,
    updatedAt: formatDateTime(latestSourceDate(source, now)),
  };
}

function filterBatchesByRange(batches: AiReviewBatchDto[], range: DashboardRange, now: Date): AiReviewBatchDto[] {
  const start = addDays(startOfDay(now), -(RANGE_DAYS[range] - 1));
  const end = endOfDay(now);

  return batches.filter((batch) => {
    const date = dateValue(batch.submittedAt) ?? dateValue(batch.updatedAt);
    return date ? date >= start && date <= end : false;
  });
}

function filterBatchesByDay(batches: AiReviewBatchDto[], day: Date): AiReviewBatchDto[] {
  const start = startOfDay(day);
  const end = endOfDay(day);

  return batches.filter((batch) => {
    const date = dateValue(batch.submittedAt) ?? dateValue(batch.updatedAt);
    return date ? date >= start && date <= end : false;
  });
}

function filterBatchesByLabel(batches: AiReviewBatchDto[], label: string, now: Date): AiReviewBatchDto[] {
  const year = now.getFullYear();

  return batches.filter((batch) => {
    const date = dateValue(batch.submittedAt) ?? dateValue(batch.updatedAt);
    return date ? formatDayLabel(date, year) === label : false;
  });
}

function buildTrendPoints(batches: AiReviewBatchDto[], range: DashboardRange, now: Date): TrendPoint[] {
  const days = RANGE_DAYS[range];
  const start = addDays(startOfDay(now), -(days - 1));

  return Array.from({ length: days }).map((_, index) => {
    const day = addDays(start, index);
    const dayBatches = filterBatchesByDay(batches, day);

    return {
      label: formatDayLabel(day, now.getFullYear()),
      processed: sumItems(dayBatches),
      passRate: roundOne(resultRate(dayBatches, 'pass')),
    };
  });
}

function buildQualityDistribution(batches: AiReviewBatchDto[]): QualityDistributionItem[] {
  const total = sumItems(batches);
  const passCount = decisionItemCount(batches, 'pass');
  const rejectCount = decisionItemCount(batches, 'reject');
  const pendingCount = decisionItemCount(batches, 'pending');
  const failedCount = decisionItemCount(batches, 'failed');

  return [
    { label: '建议通过', count: passCount, percent: share(passCount, total), color: '#22C55E' },
    { label: '建议打回', count: rejectCount, percent: share(rejectCount, total), color: '#306DF8' },
    { label: '待人工复核', count: pendingCount, percent: share(pendingCount, total), color: '#F97316' },
    { label: '失败', count: failedCount, percent: share(failedCount, total), color: '#EF4444' },
  ];
}

function buildProblemReasons(batches: AiReviewBatchDto[]): ProblemReasonItem[] {
  const reasonCounts = new Map<string, number>();
  for (const batch of batches.filter((item) => isAbnormalDecision(item.aggregateDecision))) {
    const reason = reasonForBatch(batch);
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + batch.itemCount);
  }
  const total = [...reasonCounts.values()].reduce((sum, count) => sum + count, 0);

  return [...reasonCounts.entries()]
    .map(([label, count]) => ({ label, count, percent: share(count, total) }))
    .sort((first, second) => second.count - first.count)
    .slice(0, 5);
}

function buildHighRiskTasks(batches: AiReviewBatchDto[], tasks: TaskDto[]): HighRiskTask[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const grouped = new Map<string, AiReviewBatchDto[]>();
  for (const batch of batches) {
    grouped.set(batch.taskId, [...(grouped.get(batch.taskId) ?? []), batch]);
  }

  return [...grouped.entries()]
    .map(([taskId, taskBatches]) => {
      const volume = sumItems(taskBatches);
      const rejectRateValue = volume > 0
        ? (decisionItemCount(taskBatches, 'reject') / volume) * 100
        : 0;
      const task = taskById.get(taskId);

      return {
        name: task?.title ?? taskBatches[0]?.taskTitle ?? '未知任务',
        owner: readableUserName(task?.createdById) ?? mostCommonLabeler(taskBatches),
        volume: formatInteger(volume),
        rejectRate: formatPercent(rejectRateValue),
        risk: riskLevel(rejectRateValue),
        riskScore: rejectRateValue,
        rawVolume: volume,
      };
    })
    .sort((first, second) => second.riskScore - first.riskScore || second.rawVolume - first.rawVolume)
    .slice(0, 5)
    .map(({ rawVolume: _rawVolume, riskScore: _riskScore, ...task }) => task);
}

function buildAbnormalBatches(batches: AiReviewBatchDto[]): AbnormalBatch[] {
  return batches
    .filter((batch) => isAbnormalDecision(batch.aggregateDecision))
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    .slice(0, 5)
    .map((batch) => {
      return {
        taskName: batch.taskTitle,
        reason: reasonForBatch(batch),
        duration: formatDuration(batchDurationSeconds(batch)),
        time: formatMonthDayTime(dateValue(batch.updatedAt) ?? dateValue(batch.submittedAt) ?? new Date()),
      };
    });
}

function buildTaskStatus(tasks: TaskDto[], batches: AiReviewBatchDto[]): TaskStatusItem[] {
  const abnormalTaskIds = new Set(batches.filter((batch) => batch.aggregateDecision === 'failed').map((batch) => batch.taskId));
  const draft = tasks.filter((task) => task.status === 'DRAFT').length;
  const processing = tasks.filter((task) => task.status === 'PUBLISHED').length;
  const completed = tasks.filter((task) => task.status === 'ENDED').length;
  const review = tasks.filter((task) => task.status === 'PAUSED').length;
  const abnormal = abnormalTaskIds.size;
  const total = tasks.length;

  return [
    { label: '待处理', count: draft, percent: share(draft, total), color: '#306DF8' },
    { label: '处理中', count: processing, percent: share(processing, total), color: '#19D3D3' },
    { label: '已完成', count: completed, percent: share(completed, total), color: '#16A34A' },
    { label: '需复核', count: review, percent: share(review, total), color: '#F97316' },
    { label: '异常', count: abnormal, percent: share(abnormal, total), color: '#EF4444' },
  ];
}

function reasonForBatch(batch: AiReviewBatchDto): string {
  const reason = stringValue(batch.failureReason);
  if (reason) {
    return compactReason(reason);
  }
  if (batch.aggregateDecision === 'failed') {
    return '任务处理失败';
  }
  if (batch.aggregateDecision === 'reject') {
    return 'AI 建议打回';
  }

  return '待人工复核';
}

function compactReason(value: string): string {
  return value.replace(/^AI\s*预审(打回|失败)?[：:，,\s]*/i, '').trim().slice(0, 24) || '未填写原因';
}

function resultRate(batches: AiReviewBatchDto[], decision: 'pass' | 'reject'): number {
  const denominator = batches
    .filter((batch) => batch.aggregateDecision === 'pass' || batch.aggregateDecision === 'reject' || batch.aggregateDecision === 'failed')
    .reduce((total, batch) => total + batch.itemCount, 0);
  if (denominator === 0) {
    return 0;
  }

  return (decisionItemCount(batches, decision) / denominator) * 100;
}

function dailyRejectRate(batches: AiReviewBatchDto[], label: string, now: Date): number {
  const year = now.getFullYear();
  const dayBatches = batches.filter((batch) => {
    const date = dateValue(batch.submittedAt) ?? dateValue(batch.updatedAt);
    return date ? formatDayLabel(date, year) === label : false;
  });

  return roundOne(resultRate(dayBatches, 'reject'));
}

function decisionItemCount(batches: AiReviewBatchDto[], decision: AiReviewBatchDto['aggregateDecision']): number {
  return batches
    .filter((batch) => batch.aggregateDecision === decision)
    .reduce((total, batch) => total + batch.itemCount, 0);
}

function sumItems(batches: AiReviewBatchDto[]): number {
  return batches.reduce((total, batch) => total + batch.itemCount, 0);
}

function averageBatchItemDurationSeconds(batches: AiReviewBatchDto[]): number {
  const totalItems = sumItems(batches);
  if (totalItems === 0) {
    return 0;
  }

  const totalSeconds = batches.reduce((total, batch) => total + batchDurationSeconds(batch), 0);
  return Math.round(totalSeconds / totalItems);
}

function batchDurationSeconds(batch: AiReviewBatchDto): number {
  const submitted = dateValue(batch.submittedAt);
  const updated = dateValue(batch.updatedAt);
  return submitted && updated ? Math.round(Math.max(0, (updated.getTime() - submitted.getTime()) / 1000)) : 0;
}

function latestSourceDate(source: DashboardSource, now: Date): Date {
  const dates = [
    ...source.batches.flatMap((batch) => [dateValue(batch.updatedAt), dateValue(batch.submittedAt)]),
    ...source.tasks.map((task) => dateValue(task.updatedAt)),
  ].filter((value): value is Date => Boolean(value));

  return dates.reduce((latest, date) => (date > latest ? date : latest), dates[0] ?? now);
}

function isAbnormalDecision(decision: AiReviewBatchDto['aggregateDecision']): boolean {
  return decision === 'reject' || decision === 'failed';
}

function riskLevel(value: number): HighRiskTask['risk'] {
  if (value >= 15) {
    return '高';
  }
  if (value >= 8) {
    return '中';
  }

  return '低';
}

function mostCommonLabeler(batches: AiReviewBatchDto[]): string {
  const counts = new Map<string, number>();
  for (const batch of batches) {
    counts.set(batch.labelerName, (counts.get(batch.labelerName) ?? 0) + batch.itemCount);
  }

  return [...counts.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] ?? '未记录';
}

function readableUserName(userId?: string | null): string | null {
  if (!userId) {
    return null;
  }

  return userId.replace(/^user_/, '').replaceAll('_', ' ');
}

function share(count: number, total: number): number {
  return total > 0 ? roundOne((count / total) * 100) : 0;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatNumberChange(current: number, previous: number): string {
  const diff = current - previous;
  const percent = previous > 0 ? Math.abs((diff / previous) * 100) : current > 0 ? 100 : 0;

  return `较昨日 ${formatSignedInteger(diff)}，${roundOne(percent).toFixed(1)}% ${diff >= 0 ? '↑' : '↓'}`;
}

function formatPointChange(diff: number): string {
  return `较昨日 ${formatSignedDecimal(diff)}% ${diff >= 0 ? '↑' : '↓'}`;
}

function formatDurationChange(current: number, previous: number): string {
  const diff = current - previous;
  const percent = previous > 0 ? Math.abs((diff / previous) * 100) : current > 0 ? 100 : 0;

  return `较昨日 ${diff >= 0 ? '+' : '-'}${formatDuration(Math.abs(diff))}，${roundOne(percent).toFixed(1)}% ${diff <= 0 ? '↓' : '↑'}`;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function formatPercent(value: number): string {
  return `${roundOne(value).toFixed(1)}%`;
}

function formatSignedInteger(value: number): string {
  return `${value >= 0 ? '+' : '-'}${formatInteger(Math.abs(value))}`;
}

function formatSignedDecimal(value: number): string {
  return `${value >= 0 ? '+' : '-'}${roundOne(Math.abs(value)).toFixed(1)}`;
}

function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded >= 60) {
    const minutes = Math.floor(rounded / 60);
    const restSeconds = rounded % 60;

    return `${minutes}m${String(restSeconds).padStart(2, '0')}s`;
  }

  return `${rounded}s`;
}

function formatDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatMonthDayTime(date: Date): string {
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDayLabel(date: Date, year: number): string {
  const normalized = date.getFullYear() === year ? date : new Date(year, date.getMonth(), date.getDate());

  return `${pad(normalized.getMonth() + 1)}/${pad(normalized.getDate())}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  const start = startOfDay(date);
  start.setHours(23, 59, 59, 999);

  return start;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);

  return next;
}

function dateValue(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

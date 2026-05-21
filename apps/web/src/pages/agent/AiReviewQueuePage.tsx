import { useEffect, useMemo, useState } from 'react';

import {
  AI_REVIEW_STATUS_LABELS,
  SUBMISSION_STATUS_LABELS,
  type AiReviewStatus,
} from '@labelhub/shared';
import {
  getSubmissionAiReview,
  listAiReviewJobs,
  retryAiReviewJob,
  type AiReviewDetailDto,
  type AiReviewJobDto,
} from '../../api/aiReview';

const STATUS_TABS: Array<{ label: string; value: AiReviewStatus | '' }> = [
  { label: '全部', value: '' },
  { label: '待审核', value: 'QUEUED' },
  { label: '处理中', value: 'RUNNING' },
  { label: '已通过', value: 'SUCCEEDED' },
  { label: '失败', value: 'FAILED_FINAL' },
  { label: '转人工', value: 'MANUAL_FALLBACK' },
];

const RETRYABLE_STATUSES = new Set<AiReviewStatus>([
  'FAILED_RETRYING',
  'FAILED_FINAL',
  'MANUAL_FALLBACK',
]);

export const AiReviewQueuePage = () => {
  const [jobs, setJobs] = useState<AiReviewJobDto[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AiReviewDetailDto | null>(null);
  const [activeStatus, setActiveStatus] = useState<AiReviewStatus | ''>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null,
    [jobs, selectedJobId],
  );
  const summary = useMemo(
    () => ({
      queued: jobs.filter((job) => job.status === 'QUEUED').length,
      running: jobs.filter((job) => job.status === 'RUNNING').length,
      failed: jobs.filter((job) => job.status === 'FAILED_FINAL' || job.status === 'FAILED_RETRYING').length,
      manual: jobs.filter((job) => job.status === 'MANUAL_FALLBACK').length,
    }),
    [jobs],
  );

  useEffect(() => {
    void loadJobs('');
  }, []);

  const loadJobs = async (status: AiReviewStatus | '') => {
    setIsLoading(true);
    try {
      const nextJobs = await listAiReviewJobs({ ...(status ? { status } : {}) });
      const nextJob = nextJobs.find((job) => job.id === selectedJobId) ?? nextJobs[0] ?? null;
      setJobs(nextJobs);
      setSelectedJobId(nextJob?.id ?? null);

      if (nextJob && detail?.submission.id !== nextJob.submissionId) {
        setDetail(await getSubmissionAiReview(nextJob.submissionId));
      }

      if (!nextJob) {
        setDetail(null);
      }

      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'AI 预审队列加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (status: AiReviewStatus | '') => {
    setActiveStatus(status);
    await loadJobs(status);
  };

  const handleSelectJob = async (job: AiReviewJobDto) => {
    setSelectedJobId(job.id);
    if (detail?.submission.id === job.submissionId) {
      return;
    }

    setIsDetailLoading(true);
    try {
      setDetail(await getSubmissionAiReview(job.submissionId));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '提交详情加载失败。');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleRetry = async () => {
    if (!selectedJob) {
      return;
    }

    setIsRetrying(true);
    try {
      await retryAiReviewJob(selectedJob.id);
      setStatusMessage('AI 预审任务已重新排队。');
      setErrorMessage(null);
      await loadJobs(activeStatus);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'AI 预审任务重试失败。');
    } finally {
      setIsRetrying(false);
    }
  };

  if (isLoading && jobs.length === 0) {
    return (
      <section className="ai-review-page">
        <p>正在加载 AI 预审队列。</p>
      </section>
    );
  }

  return (
    <section className="ai-review-page" aria-labelledby="ai-review-title">
      <div className="ai-review-header">
        <div>
          <p className="eyebrow">AI Agent / 自动预审</p>
          <h1 id="ai-review-title">AI 自动预审队列</h1>
          <p>处理提交入队、结构化模型输出、失败重试和人工兜底状态。</p>
        </div>
        <dl>
          <SummaryMetric label="待审核" value={summary.queued} />
          <SummaryMetric label="处理中" value={summary.running} />
          <SummaryMetric label="失败" value={summary.failed} />
          <SummaryMetric label="转人工" value={summary.manual} />
        </dl>
      </div>

      {statusMessage || errorMessage ? (
        <div className="task-status-message" aria-live="polite">
          {statusMessage ? <span>{statusMessage}</span> : null}
          {errorMessage ? <span role="alert">{errorMessage}</span> : null}
        </div>
      ) : null}

      <div className="ai-review-layout">
        <aside className="ai-review-queue" aria-label="AI 预审任务队列">
          <div className="ai-review-tabs" role="group" aria-label="AI 预审状态筛选">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.label}
                type="button"
                className={activeStatus === tab.value ? 'is-active' : ''}
                aria-pressed={activeStatus === tab.value}
                onClick={() => void handleStatusChange(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="ai-review-list">
            {jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                className={job.id === selectedJob?.id ? 'is-active' : ''}
                onClick={() => void handleSelectJob(job)}
              >
                <span>
                  <strong>任务：{job.taskTitle}</strong>
                  <small>{job.externalId} · 第 {job.round} 轮</small>
                </span>
                <StatusPill status={job.status} />
              </button>
            ))}
          </div>

          {jobs.length === 0 ? (
            <div className="ai-review-empty">
              <strong>暂无队列任务</strong>
              <span>切换状态或等待标注员提交后再查看。</span>
            </div>
          ) : null}
        </aside>

        <main className="ai-review-detail">
          {selectedJob ? (
            <>
              <div className="ai-review-detail__topline">
                <div>
                  <span className="ai-review-chip">{structuredOutputLabel(selectedJob.structuredOutputMode)}</span>
                  <h2>{selectedJob.taskTitle}</h2>
                  <p>
                    {selectedJob.externalId} · {DATASET_KIND_LABELS[selectedJob.datasetKind]} ·{' '}
                    {submissionStatusLabel(selectedJob.submissionStatus)}
                  </p>
                </div>
                {RETRYABLE_STATUSES.has(selectedJob.status) ? (
                  <button
                    className="primary-action"
                    type="button"
                    disabled={isRetrying}
                    onClick={() => void handleRetry()}
                  >
                    重试任务
                  </button>
                ) : null}
              </div>

              <div className="ai-review-panels">
                <JsonFieldView detail={detail} isLoading={isDetailLoading} />
                <ScorePanel detail={detail} />
                <CommentPanel detail={detail} job={selectedJob} />
                <PromptPanel detail={detail} />
                <AuditPanel detail={detail} job={selectedJob} />
              </div>
            </>
          ) : (
            <div className="ai-review-empty">
              <strong>请选择 AI 预审任务</strong>
              <span>左侧队列会展示待处理、失败和转人工兜底的提交。</span>
            </div>
          )}
        </main>
      </div>
    </section>
  );
};

const SummaryMetric = ({ label, value }: { label: string; value: number }) => (
  <div>
    <dt>{label}</dt>
    <dd>{value.toLocaleString()}</dd>
  </div>
);

const StatusPill = ({ status }: { status: AiReviewStatus }) => (
  <span className={`ai-review-status ai-review-status--${status.toLowerCase().replaceAll('_', '-')}`}>
    {AI_REVIEW_STATUS_LABELS[status]}
  </span>
);

const JsonFieldView = ({ detail, isLoading }: { detail: AiReviewDetailDto | null; isLoading: boolean }) => (
  <section className="ai-review-panel ai-review-panel--json" aria-label="JSON 字段视图">
    <PanelHeading title="JSON 字段视图" note={detail?.taskItem.externalId ?? '等待提交详情'} />
    {isLoading ? <p>正在加载提交字段。</p> : null}
    {detail ? (
      <div className="json-field-grid">
        <JsonBlock title="题目 rawData" value={detail.taskItem.rawData} />
        <JsonBlock title="标注 answers" value={detail.submission.answers} />
        <JsonBlock title="结构化输出" value={detail.reviewRecord?.structuredOutput ?? {}} />
      </div>
    ) : null}
  </section>
);

const ScorePanel = ({ detail }: { detail: AiReviewDetailDto | null }) => {
  const scores = scoreEntries(detail?.reviewRecord?.scores);

  return (
    <section className="ai-review-panel" aria-label="维度评分">
      <PanelHeading title="维度评分" note={detail?.reviewRecord?.decision ?? '暂无 verdict'} />
      {scores.length > 0 ? (
        <div className="score-list">
          {scores.map(([key, score]) => (
            <div key={key} className="score-row">
              <div>
                <strong>{key}</strong>
                <span>{score}/100</span>
              </div>
              <span className="score-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p>暂无评分。</p>
      )}
    </section>
  );
};

const CommentPanel = ({ detail, job }: { detail: AiReviewDetailDto | null; job: AiReviewJobDto }) => (
  <section className="ai-review-panel">
    <PanelHeading title="AI 评语" note={AI_REVIEW_STATUS_LABELS[job.status]} />
    <p className="ai-review-comment">{detail?.reviewRecord?.comment ?? job.lastError ?? '等待模型输出。'}</p>
    <dl className="ai-review-meta-grid">
      <div>
        <dt>服务商</dt>
        <dd>{detail?.reviewRecord?.modelMetadata?.provider?.toString() ?? job.provider ?? '未记录'}</dd>
      </div>
      <div>
        <dt>模型</dt>
        <dd>{detail?.reviewRecord?.modelMetadata?.model?.toString() ?? job.model ?? '未记录'}</dd>
      </div>
      <div>
        <dt>耗时</dt>
        <dd>{metadataValue(detail?.reviewRecord?.modelMetadata, 'latencyMs') ?? '未记录'}</dd>
      </div>
      <div>
        <dt>温度</dt>
        <dd>{metadataValue(detail?.reviewRecord?.modelMetadata, 'temperature') ?? '未记录'}</dd>
      </div>
      <div>
        <dt>输入令牌</dt>
        <dd>{metadataValue(detail?.reviewRecord?.modelMetadata, 'promptTokens') ?? '未记录'}</dd>
      </div>
      <div>
        <dt>输出令牌</dt>
        <dd>{metadataValue(detail?.reviewRecord?.modelMetadata, 'completionTokens') ?? '未记录'}</dd>
      </div>
      <div>
        <dt>总令牌</dt>
        <dd>{metadataValue(detail?.reviewRecord?.modelMetadata, 'totalTokens') ?? '未记录'}</dd>
      </div>
    </dl>
  </section>
);

const PromptPanel = ({ detail }: { detail: AiReviewDetailDto | null }) => (
  <section className="ai-review-panel ai-review-panel--code">
    <PanelHeading title="审核 Prompt 模板" note={detail?.reviewRecord?.stage ?? 'AI_PRECHECK'} />
    <pre>{detail?.reviewRecord?.rawPrompt ?? '暂无 Prompt。'}</pre>
  </section>
);

const AuditPanel = ({ detail, job }: { detail: AiReviewDetailDto | null; job: AiReviewJobDto }) => (
  <section className="ai-review-panel ai-review-panel--audit">
    <PanelHeading title="处理日志 / 审计" note={job.idempotencyKey} />
    <ol>
      <AuditItem label="任务入队" value={formatDateTime(job.queuedAt)} />
      <AuditItem label="开始处理" value={formatDateTime(job.startedAt)} />
      <AuditItem label="完成处理" value={formatDateTime(job.finishedAt)} />
      <AuditItem label="尝试次数" value={`${job.attempts}/${job.maxAttempts}`} />
      <AuditItem label="幂等键" value={detail?.reviewRecord?.idempotencyKey ?? job.idempotencyKey} />
    </ol>
    {detail?.reviewRecord?.rawOutput ? <pre>{detail.reviewRecord.rawOutput}</pre> : null}
  </section>
);

const PanelHeading = ({ title, note }: { title: string; note: string }) => (
  <header className="ai-review-panel__heading">
    <h3>{title}</h3>
    <span>{note}</span>
  </header>
);

const JsonBlock = ({ title, value }: { title: string; value: unknown }) => (
  <article>
    <strong>{title}</strong>
    <pre>{stringifyJson(value)}</pre>
  </article>
);

const AuditItem = ({ label, value }: { label: string; value: string }) => (
  <li>
    <strong>{label}</strong>
    <span>{value}</span>
  </li>
);

const scoreEntries = (scores: Record<string, unknown> | undefined): Array<[string, number]> => {
  if (!scores) {
    return [];
  }

  return Object.entries(scores).filter((entry): entry is [string, number] => typeof entry[1] === 'number');
};

const stringifyJson = (value: unknown): string => JSON.stringify(value, null, 2);

const metadataValue = (metadata: Record<string, unknown> | null | undefined, key: string): string | null => {
  const value = metadata?.[key];
  return value === undefined || value === null ? null : value.toString();
};

const structuredOutputLabel = (mode: string | null): string => {
  if (mode === 'json_schema') {
    return 'json_schema · 结构化';
  }

  return 'function_calling · 结构化';
};

const submissionStatusLabel = (status: string): string => {
  return SUBMISSION_STATUS_LABELS[status as keyof typeof SUBMISSION_STATUS_LABELS] ?? status;
};

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return '未记录';
  }

  return value.slice(0, 19).replace('T', ' ');
};

const DATASET_KIND_LABELS: Record<AiReviewJobDto['datasetKind'], string> = {
  qa_quality: '问答质量',
  preference_compare: '偏好对比',
  generic_json: '通用 JSON',
};

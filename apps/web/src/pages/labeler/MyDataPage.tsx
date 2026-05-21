import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { DatasetKind } from '@labelhub/shared';
import {
  getLabelerStats,
  listLabelerSubmissions,
  type LabelerStatsDto,
  type LabelerSubmissionDto,
} from '../../api/submissions';
import { EmptyState } from '../../components/EmptyState';
import { PageLoading } from '../../components/PageLoading';

const LABELER_ID = 'user_labeler_li_lei';

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: 'AI 预审排队中', value: 'AI_QUEUED' },
  { label: '已通过', value: 'AI_PASSED' },
  { label: '待修改', value: 'NEEDS_REVISION' },
  { label: '终审通过', value: 'FINAL_APPROVED' },
];

const DATASET_KIND_OPTIONS: Array<{ label: string; value: DatasetKind | 'ALL' }> = [
  { label: '全部类型', value: 'ALL' },
  { label: '问答质量', value: 'qa_quality' },
  { label: '偏好对比', value: 'preference_compare' },
  { label: '通用 JSON', value: 'generic_json' },
];

export const MyDataPage = () => {
  const [stats, setStats] = useState<LabelerStatsDto | null>(null);
  const [submissions, setSubmissions] = useState<LabelerSubmissionDto[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [datasetKind, setDatasetKind] = useState<DatasetKind | 'ALL'>('ALL');
  const [itemId, setItemId] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadMyData();
  }, []);

  const statusSummary = useMemo(
    () => ({
      submitted: stats?.submittedCount ?? 0,
      approved: stats?.approvedCount ?? 0,
      rejected: stats?.rejectedCount ?? 0,
      needsRevision: stats?.needsRevisionCount ?? 0,
    }),
    [stats],
  );

  const loadMyData = async () => {
    setIsLoading(true);
    try {
      const [nextStats, nextSubmissions] = await Promise.all([
        getLabelerStats({ labelerId: LABELER_ID }),
        listLabelerSubmissions({
          labelerId: LABELER_ID,
          status: statusFilter || undefined,
          datasetKind,
          itemId: itemId.trim() || undefined,
        }),
      ]);
      setStats(nextStats);
      setSubmissions(nextSubmissions);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '我的数据加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="my-data-page" aria-labelledby="my-data-title">
      <div className="my-data-header">
        <div>
          <p className="eyebrow">Labeler / 我的数据</p>
          <h1 id="my-data-title">我的数据</h1>
          <p>查看已提交、通过、打回和待修改数据，并返回标注台处理。</p>
        </div>
        <div className="my-data-summary">
          <SummaryCard label="已提交" value={statusSummary.submitted} />
          <SummaryCard label="通过" value={statusSummary.approved} />
          <SummaryCard label="打回" value={statusSummary.rejected} />
          <SummaryCard label="待修改" value={statusSummary.needsRevision} />
        </div>
      </div>

      {errorMessage ? (
        <div className="task-status-message" role="alert">
          {errorMessage}
        </div>
      ) : null}

      <div className="my-data-filter">
        <select
          aria-label="提交状态筛选"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="数据集筛选"
          value={datasetKind}
          onChange={(event) => setDatasetKind(event.target.value as DatasetKind | 'ALL')}
        >
          {DATASET_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          aria-label="题目 ID 筛选"
          placeholder="题目 ID 或外部 ID"
          value={itemId}
          onChange={(event) => setItemId(event.target.value)}
        />
        <button type="button" onClick={() => void loadMyData()}>
          筛选
        </button>
      </div>

      {isLoading ? (
        <PageLoading title="正在加载我的数据" description="正在同步提交记录、状态和打回信息。" />
      ) : submissions.length > 0 ? (
        <div className="my-data-table-scroll">
          <table className="my-data-table" aria-label="我的数据列表">
            <thead>
              <tr>
                <th>任务</th>
                <th>题目</th>
                <th>类型</th>
                <th>状态</th>
                <th>轮次</th>
                <th>提交时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr key={submission.submissionId}>
                  <td>{submission.taskTitle}</td>
                  <td>
                    <strong>{submission.externalId}</strong>
                    <small>{submission.taskItemId}</small>
                  </td>
                  <td>{DATASET_KIND_LABELS[submission.datasetKind]}</td>
                  <td>{SUBMISSION_STATUS_LABELS[submission.status] ?? submission.status}</td>
                  <td>第 {submission.round} 轮</td>
                  <td>{submission.submittedAt.slice(0, 16).replace('T', ' ')}</td>
                  <td>
                    <Link
                      className="primary-link"
                      to={`/labeler/tasks/${submission.taskId}/items/${submission.taskItemId}?assignmentId=${submission.assignmentId}`}
                    >
                      返回标注台
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="暂无提交数据"
          description="提交题目后会在这里查看审核状态、轮次和返回标注台入口。"
        />
      )}
    </section>
  );
};

const SummaryCard = ({ label, value }: { label: string; value: number }) => (
  <article>
    <span>{label}</span>
    <strong>{value.toLocaleString()}</strong>
  </article>
);

const DATASET_KIND_LABELS: Record<DatasetKind, string> = {
  qa_quality: '问答质量',
  preference_compare: '偏好对比',
  generic_json: '通用 JSON',
};

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  AI_QUEUED: 'AI 预审排队中',
  AI_PASSED: '已通过',
  NEEDS_REVISION: '待修改',
  FINAL_APPROVED: '终审通过',
  FINAL_REJECTED: '终审打回',
};

import { EXPORT_STATUS_LABELS } from '@labelhub/shared';

import type { ExportJobDto } from '../../api/exports';

type ExportHistoryTableProps = {
  jobs: ExportJobDto[];
  isBusy?: boolean;
  onRetry: (exportJobId: string) => void;
};

export const ExportHistoryTable = ({ jobs, isBusy, onRetry }: ExportHistoryTableProps) => (
  <section className="export-history-panel" aria-label="导出历史">
    <header className="export-section-heading">
      <div>
        <span>历史</span>
        <h2>导出历史</h2>
      </div>
      <strong>{jobs.length.toLocaleString()} 个任务</strong>
    </header>
    <div className="export-history-table">
      <table aria-label="导出历史">
        <thead>
          <tr>
            <th>任务 ID</th>
            <th>格式</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>完成时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>{job.id}</td>
              <td>{formatLabel(job.format)}</td>
              <td>{EXPORT_STATUS_LABELS[job.status] ?? job.status}</td>
              <td>{formatDateTime(job.createdAt)}</td>
              <td>{job.finishedAt ? formatDateTime(job.finishedAt) : '未完成'}</td>
              <td>
                {job.status === 'SUCCEEDED' ? (
                  <a className="primary-link" href={`/exports/${job.id}/download`}>
                    下载
                  </a>
                ) : null}
                {job.status === 'FAILED' ? (
                  <button type="button" disabled={isBusy} onClick={() => onRetry(job.id)}>
                    重试 {job.id}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {jobs.length === 0 ? <p>暂无导出任务。</p> : null}
  </section>
);

function formatLabel(format: string): string {
  if (format === 'xlsx') {
    return 'Excel';
  }

  return format.toUpperCase();
}

function formatDateTime(value: string): string {
  return value.slice(0, 16).replace('T', ' ');
}

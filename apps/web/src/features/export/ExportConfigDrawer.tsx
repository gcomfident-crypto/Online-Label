import type { ExportFormat } from '@labelhub/shared';

import type { ExportFieldMapping, ExportPreviewDto } from '../../api/exports';
import type { TaskDto } from '../../api/tasks';

type ExportConfigDrawerProps = {
  tasks: TaskDto[];
  selectedTaskId: string;
  format: ExportFormat;
  includeReviews: boolean;
  preview: ExportPreviewDto | null;
  isBusy?: boolean;
  onTaskChange: (taskId: string) => void;
  onFormatChange: (format: ExportFormat) => void;
  onIncludeReviewsChange: (includeReviews: boolean) => void;
  onCreate: () => void;
};

const EXPORT_FORMAT_OPTIONS: Array<{ label: string; value: ExportFormat }> = [
  { label: 'JSON', value: 'json' },
  { label: 'JSONL', value: 'jsonl' },
  { label: 'CSV', value: 'csv' },
  { label: 'Excel', value: 'xlsx' },
];

export const ExportConfigDrawer = ({
  tasks,
  selectedTaskId,
  format,
  includeReviews,
  preview,
  isBusy,
  onTaskChange,
  onFormatChange,
  onIncludeReviewsChange,
  onCreate,
}: ExportConfigDrawerProps) => (
  <section className="export-config-panel" aria-label="导出配置">
    <header className="export-section-heading">
      <div>
        <span>配置</span>
        <h2>创建导出任务</h2>
      </div>
      <strong>{preview?.totalFinalApproved.toLocaleString() ?? 0} 条可导出</strong>
    </header>

    <div className="export-form-grid">
      <label>
        选择任务
        <select value={selectedTaskId} onChange={(event) => onTaskChange(event.target.value)}>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        导出格式
        <select
          aria-label="导出格式"
          value={format}
          onChange={(event) => onFormatChange(event.target.value as ExportFormat)}
        >
          {EXPORT_FORMAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="export-toggle">
        <input
          type="checkbox"
          checked={includeReviews}
          onChange={(event) => onIncludeReviewsChange(event.target.checked)}
        />
        包含审核记录
      </label>
    </div>

    <FieldMappingPreview mapping={preview?.fieldMapping ?? []} includeReviews={includeReviews} />
    <FieldPreviewTable preview={preview} includeReviews={includeReviews} />

    <button type="button" className="primary-action" disabled={isBusy || !selectedTaskId} onClick={onCreate}>
      创建导出任务
    </button>
  </section>
);

const FieldMappingPreview = ({
  mapping,
  includeReviews,
}: {
  mapping: ExportFieldMapping[];
  includeReviews: boolean;
}) => {
  const visibleMapping = mapping.filter((field) => includeReviews || !field.source.startsWith('review.'));

  return (
    <section className="export-subpanel" aria-label="字段映射预设">
      <header className="export-section-heading">
        <div>
          <span>字段映射</span>
          <h3>{includeReviews ? '官方映射预设' : '审核字段已隐藏'}</h3>
        </div>
        <small>{visibleMapping.length.toLocaleString()} 个字段</small>
      </header>
      <div className="export-mapping-grid">
        {visibleMapping.map((field) => (
          <div key={`${field.source}:${field.target}`}>
            <span>{field.source}</span>
            <strong>{field.target}</strong>
          </div>
        ))}
      </div>
    </section>
  );
};

const FieldPreviewTable = ({
  preview,
  includeReviews,
}: {
  preview: ExportPreviewDto | null;
  includeReviews: boolean;
}) => {
  const rows = preview?.rows ?? [];
  const headers = rows[0] ? Object.keys(rows[0]) : [];

  return (
    <section className="export-subpanel" aria-label="导出预览">
      <header className="export-section-heading">
        <div>
          <span>预览</span>
          <h3>{includeReviews ? '包含审核记录' : '仅标注字段'}</h3>
        </div>
        <small>前 5 行</small>
      </header>
      {headers.length > 0 ? (
        <div className="export-preview-table">
          <table aria-label="导出预览">
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.id?.toString() ?? 'row'}-${index}`}>
                  {headers.map((header) => (
                    <td key={header}>{formatValue(row[header])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>暂无可预览数据。</p>
      )}
    </section>
  );
};

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' | ');
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

import { useEffect, useMemo, useState } from 'react';

import type { ExportFormat } from '@labelhub/shared';
import {
  createExport,
  getExportPreview,
  listExports,
  retryExport,
  type ExportFieldMapping,
  type ExportJobDto,
  type ExportPreviewDto,
} from '../../api/exports';
import { listTasks, type TaskDto } from '../../api/tasks';
import { EmptyState } from '../../components/EmptyState';
import { PageLoading } from '../../components/PageLoading';
import { ExportConfigDrawer } from '../../features/export/ExportConfigDrawer';
import { ExportHistoryTable } from '../../features/export/ExportHistoryTable';

const OWNER_ID = 'user_owner_001';

export const ExportCenterPage = () => {
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [exports, setExports] = useState<ExportJobDto[]>([]);
  const [preview, setPreview] = useState<ExportPreviewDto | null>(null);
  const [fieldMapping, setFieldMapping] = useState<ExportFieldMapping[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [format, setFormat] = useState<ExportFormat>('json');
  const [includeReviews, setIncludeReviews] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );
  const summary = useMemo(
    () => ({
      queued: exports.filter((job) => job.status === 'QUEUED').length,
      succeeded: exports.filter((job) => job.status === 'SUCCEEDED').length,
      failed: exports.filter((job) => job.status === 'FAILED').length,
      downloadable: exports.filter((job) => job.status === 'SUCCEEDED').length,
    }),
    [exports],
  );

  useEffect(() => {
    void loadInitialData();
  }, []);

  useEffect(() => {
    if (!selectedTaskId) {
      setPreview(null);
      return;
    }

    void loadPreview(selectedTaskId, includeReviews, fieldMapping);
  }, [selectedTaskId, includeReviews, fieldMapping]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const [nextTasks, nextExports] = await Promise.all([listTasks(), listExports()]);
      setTasks(nextTasks);
      setExports(nextExports);
      setSelectedTaskId((current) => current || nextTasks[0]?.id || '');
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '导出中心加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPreview = async (
    taskId: string,
    nextIncludeReviews: boolean,
    nextFieldMapping: ExportFieldMapping[],
  ) => {
    try {
      const nextPreview = await getExportPreview({
        taskId,
        includeReviews: nextIncludeReviews,
        fieldMapping: nextFieldMapping.length > 0 ? nextFieldMapping : undefined,
      });
      setPreview(nextPreview);
      setFieldMapping((current) => (current.length > 0 ? current : nextPreview.fieldMapping));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '导出预览加载失败。');
    }
  };

  const refreshExports = async () => {
    setExports(await listExports());
  };

  const handleCreate = async () => {
    if (!selectedTaskId || !preview) {
      setErrorMessage('请选择任务并等待预览加载完成。');
      return;
    }

    setIsBusy(true);
    try {
      await createExport({
        taskId: selectedTaskId,
        requestedById: OWNER_ID,
        format,
        includeReviews,
        fieldMapping: fieldMapping.length > 0 ? fieldMapping : preview.fieldMapping,
        idempotencyKey: createExportIdempotencyKey(
          selectedTaskId,
          format,
          includeReviews,
          fieldMapping.length > 0 ? fieldMapping : preview.fieldMapping,
        ),
      });
      setStatusMessage('导出任务已创建。');
      setErrorMessage(null);
      await refreshExports();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '创建导出任务失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRetry = async (exportJobId: string) => {
    setIsBusy(true);
    try {
      await retryExport(exportJobId);
      setStatusMessage('导出任务已重新排队。');
      setErrorMessage(null);
      await refreshExports();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '重试导出任务失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const handleTaskChange = (taskId: string) => {
    setSelectedTaskId(taskId);
    setFieldMapping([]);
    setPreview(null);
  };

  return (
    <section className="export-center-page" aria-labelledby="export-center-title">
      <div className="export-center-header">
        <div>
          <p className="eyebrow">Owner / 导出中心</p>
          <h1 id="export-center-title">导出中心</h1>
          <p>导出终审通过数据，保留字段映射和审核记录配置快照。</p>
        </div>
        <dl>
          <SummaryMetric label="排队中" value={summary.queued} />
          <SummaryMetric label="已成功" value={summary.succeeded} />
          <SummaryMetric label="失败" value={summary.failed} />
          <SummaryMetric label="可下载" value={summary.downloadable} />
        </dl>
      </div>

      {statusMessage || errorMessage ? (
        <div className="task-status-message" role={errorMessage ? 'alert' : undefined} aria-live="polite">
          {statusMessage ? <span>{statusMessage}</span> : null}
          {errorMessage ? <span>{errorMessage}</span> : null}
        </div>
      ) : null}

      {isLoading ? (
        <PageLoading title="正在加载导出中心" description="正在同步任务、导出历史和预览字段映射。" />
      ) : null}

      {!isLoading && tasks.length === 0 ? (
        <EmptyState title="暂无可导出任务" description="创建并发布任务后，终审通过数据会在这里生成导出任务。" />
      ) : null}

      {!isLoading && tasks.length > 0 ? (
        <div className="export-center-layout">
          <ExportConfigDrawer
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            format={format}
            includeReviews={includeReviews}
            fieldMapping={fieldMapping.length > 0 ? fieldMapping : preview?.fieldMapping ?? []}
            preview={preview}
            isBusy={isBusy}
            onTaskChange={handleTaskChange}
            onFormatChange={setFormat}
            onIncludeReviewsChange={setIncludeReviews}
            onFieldMappingChange={setFieldMapping}
            onCreate={() => void handleCreate()}
          />
          <aside className="export-center-side">
            <section className="export-summary-panel">
              <span>当前任务</span>
              <h2>{selectedTask?.title ?? '未选择任务'}</h2>
              <p>{preview?.totalFinalApproved.toLocaleString() ?? 0} 条终审通过数据可导出。</p>
            </section>
            <ExportHistoryTable
              jobs={exports}
              isBusy={isBusy}
              onRetry={(exportJobId) => void handleRetry(exportJobId)}
            />
          </aside>
        </div>
      ) : null}
    </section>
  );
};

const SummaryMetric = ({ label, value }: { label: string; value: number }) => (
  <div>
    <dt>{label}</dt>
    <dd>{value.toLocaleString()}</dd>
  </div>
);

function createExportIdempotencyKey(
  taskId: string,
  format: ExportFormat,
  includeReviews: boolean,
  fieldMapping: ExportFieldMapping[],
): string {
  return `export:${taskId}:${format}:${includeReviews ? 'reviews' : 'rows'}:${stableHash(JSON.stringify(fieldMapping))}`;
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}

import { useEffect, useMemo, useState, type Ref } from 'react';

import type { ExportFormat } from '@labelhub/shared';
import {
  createExport,
  getExportDownloadUrl,
  getExportPreview,
  type ExportJobDto,
  type ExportFieldMapping,
} from '../../api/exports';
import { listTasks, type TaskDto } from '../../api/tasks';
import { PageLoading } from '../../components/PageLoading';
import { TableEmptyState } from '../../components/TableEmptyState';
import { ToastViewport, useToastController } from '../../components/ToastViewport';
import { useAdaptiveTablePageSize } from '../../hooks/useAdaptiveTablePageSize';
import { createTaskDisplayIdMap } from './taskDisplayId';

const OWNER_ID = 'user_owner_zhang_man';
const EXPORT_TASKS_FALLBACK_PAGE_SIZE = 8;
const EXPORT_TASK_TABLE_ROW_HEIGHT = 66;
const EXPORT_FORMAT_OPTIONS: Array<{ label: string; value: ExportFormat }> = [
  { label: 'XLSX', value: 'xlsx' },
  { label: 'CSV', value: 'csv' },
  { label: 'JSON', value: 'json' },
];

export const ExportCenterPage = () => {
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [pendingExportTaskIds, setPendingExportTaskIds] = useState<string[]>([]);
  const [selectedExportFormat, setSelectedExportFormat] = useState<ExportFormat>('xlsx');
  const [exportSearchKeyword, setExportSearchKeyword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [currentExportTaskPage, setCurrentExportTaskPage] = useState(1);
  const { dismissToast, messages, showErrorToast, showStatusToast } = useToastController();
  const { containerRef: exportTaskTableContainerRef, pageSize: exportTaskPageSize } = useAdaptiveTablePageSize({
    fallbackPageSize: EXPORT_TASKS_FALLBACK_PAGE_SIZE,
    rowHeight: EXPORT_TASK_TABLE_ROW_HEIGHT,
  });

  const taskDisplayIdMap = useMemo(() => createTaskDisplayIdMap(tasks), [tasks]);
  const exportableTasks = useMemo(() => {
    const keyword = exportSearchKeyword.trim().toLowerCase();

    return [...tasks]
      .filter((task) => {
        if ((task.exportableItemCount ?? 0) <= 0) {
          return false;
        }

        if (!keyword) {
          return true;
        }

        const taskDisplayId = taskDisplayIdMap.get(task.id) ?? task.id;

        return (
          task.title.toLowerCase().includes(keyword) ||
          task.id.toLowerCase().includes(keyword) ||
          taskDisplayId.toLowerCase().includes(keyword) ||
          task.template.name.toLowerCase().includes(keyword)
        );
      })
      .sort((firstTask, secondTask) => secondTask.createdAt.localeCompare(firstTask.createdAt));
  }, [exportSearchKeyword, taskDisplayIdMap, tasks]);
  const exportableItemTotal = useMemo(
    () => exportableTasks.reduce((total, task) => total + (task.exportableItemCount ?? 0), 0),
    [exportableTasks],
  );
  const totalExportTaskPages = Math.max(1, Math.ceil(exportableTasks.length / exportTaskPageSize));
  const paginatedExportableTasks = useMemo(() => {
    const startIndex = (currentExportTaskPage - 1) * exportTaskPageSize;

    return exportableTasks.slice(startIndex, startIndex + exportTaskPageSize);
  }, [currentExportTaskPage, exportTaskPageSize, exportableTasks]);

  useEffect(() => {
    void loadInitialData();
  }, []);

  useEffect(() => {
    setCurrentExportTaskPage((current) => Math.min(current, totalExportTaskPages));
  }, [totalExportTaskPages]);

  useEffect(() => {
    setCurrentExportTaskPage(1);
  }, [exportSearchKeyword]);

  useEffect(() => {
    const exportableTaskIds = new Set(exportableTasks.map((task) => task.id));
    setSelectedTaskIds((current) => current.filter((taskId) => exportableTaskIds.has(taskId)));
  }, [exportableTasks]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const nextTasks = await listTasks();
      setTasks(nextTasks);
    } catch {
      setTasks([]);
      showErrorToast('导出中心加载失败，请稍后重试。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenFormatDialog = (taskIds: string[]) => {
    const exportableTaskIds = new Set(exportableTasks.map((task) => task.id));
    const nextTaskIds = Array.from(new Set(taskIds)).filter((taskId) => exportableTaskIds.has(taskId));

    if (nextTaskIds.length === 0) {
      showErrorToast('请选择需要导出的记录。');
      return;
    }

    setSelectedExportFormat('xlsx');
    setPendingExportTaskIds(nextTaskIds);
  };

  const handleConfirmExport = async () => {
    if (pendingExportTaskIds.length === 0) {
      return;
    }

    setIsBusy(true);
    try {
      const exportJobs = await Promise.all(
        pendingExportTaskIds.map((taskId) => createExportForTask(taskId, selectedExportFormat)),
      );
      const downloadableJobs = exportJobs.filter((job) => job.status === 'SUCCEEDED');
      downloadableJobs.forEach(triggerExportDownload);
      showStatusToast(
        downloadableJobs.length === exportJobs.length
          ? downloadableJobs.length > 1
            ? `已生成 ${downloadableJobs.length} 个导出文件，正在下载。`
            : '导出文件已生成，正在下载。'
          : '导出任务已创建。',
      );
      setPendingExportTaskIds([]);
      setSelectedTaskIds([]);
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '创建导出任务失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const createExportForTask = async (taskId: string, nextFormat: ExportFormat) => {
    const preview = await getExportPreview({ taskId, includeReviews: true });

    return createExport({
      taskId,
      requestedById: OWNER_ID,
      format: nextFormat,
      includeReviews: true,
      fieldMapping: preview.fieldMapping,
      idempotencyKey: createExportIdempotencyKey(taskId, nextFormat, true, preview.fieldMapping),
    });
  };

  const handleToggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((current) =>
      current.includes(taskId) ? current.filter((selectedTaskId) => selectedTaskId !== taskId) : [...current, taskId],
    );
  };

  const handleToggleCurrentPageSelection = () => {
    const currentPageTaskIds = paginatedExportableTasks.map((task) => task.id);
    const hasSelectedAllCurrentPageTasks =
      currentPageTaskIds.length > 0 && currentPageTaskIds.every((taskId) => selectedTaskIds.includes(taskId));

    setSelectedTaskIds((current) => {
      if (hasSelectedAllCurrentPageTasks) {
        return current.filter((taskId) => !currentPageTaskIds.includes(taskId));
      }

      return Array.from(new Set([...current, ...currentPageTaskIds]));
    });
  };

  return (
    <section className="export-center-page" aria-labelledby="export-center-title">
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <div className="export-center-header">
        <div>
          <h1 id="export-center-title">导出中心</h1>
        </div>
        <p className="task-management-table-description">
          本页面支持导出已标注任务的数据，格式涵盖 JSON、JSONL、CSV 及 XLSX
        </p>
      </div>

      {isLoading ? (
        <PageLoading title="正在加载导出中心" description="正在同步可导出任务和预览字段映射。" />
      ) : null}

      {!isLoading ? (
        <div className="export-center-workspace export-center-workspace--table-only">
          <section className="export-records-section" aria-label="导出记录">
            <ExportableTaskTable
              currentPage={currentExportTaskPage}
              exportableItemTotal={exportableItemTotal}
              exportSearchKeyword={exportSearchKeyword}
              isBusy={isBusy}
              selectedTaskIds={selectedTaskIds}
              tablePanelRef={exportTaskTableContainerRef}
              taskDisplayIdMap={taskDisplayIdMap}
              tasks={paginatedExportableTasks}
              totalPages={totalExportTaskPages}
              onBatchExport={() => handleOpenFormatDialog(selectedTaskIds)}
              onExportTask={(taskId) => handleOpenFormatDialog([taskId])}
              onPageChange={setCurrentExportTaskPage}
              onSearchChange={setExportSearchKeyword}
              onToggleCurrentPageSelection={handleToggleCurrentPageSelection}
              onToggleTaskSelection={handleToggleTaskSelection}
            />
          </section>
        </div>
      ) : null}

      <ExportFormatDialog
        format={selectedExportFormat}
        isBusy={isBusy}
        isOpen={pendingExportTaskIds.length > 0}
        taskCount={pendingExportTaskIds.length}
        onCancel={() => setPendingExportTaskIds([])}
        onConfirm={() => void handleConfirmExport()}
        onFormatChange={setSelectedExportFormat}
      />
    </section>
  );
};

type ExportableTaskTableProps = {
  currentPage: number;
  exportableItemTotal: number;
  exportSearchKeyword: string;
  isBusy: boolean;
  selectedTaskIds: string[];
  tablePanelRef?: Ref<HTMLDivElement>;
  taskDisplayIdMap: Map<string, string>;
  tasks: TaskDto[];
  totalPages: number;
  onBatchExport: () => void;
  onExportTask: (taskId: string) => void;
  onPageChange: (page: number) => void;
  onSearchChange: (keyword: string) => void;
  onToggleCurrentPageSelection: () => void;
  onToggleTaskSelection: (taskId: string) => void;
};

const ExportableTaskTable = ({
  currentPage,
  exportableItemTotal,
  exportSearchKeyword,
  isBusy,
  selectedTaskIds,
  tablePanelRef,
  taskDisplayIdMap,
  tasks,
  totalPages,
  onBatchExport,
  onExportTask,
  onPageChange,
  onSearchChange,
  onToggleCurrentPageSelection,
  onToggleTaskSelection,
}: ExportableTaskTableProps) => {
  const hasSelectedAllCurrentPageTasks =
    tasks.length > 0 && tasks.every((task) => selectedTaskIds.includes(task.id));

  return (
    <div className="task-management-table-card export-task-table-panel" ref={tablePanelRef}>
      <div className="task-management-table-toolbar export-task-table-toolbar" aria-label="导出记录列表概览">
        <div className="task-summary-grid export-summary-grid" aria-label="导出数据概览">
          <div className="task-summary-card task-summary-card--total export-summary-card" aria-label="可导出数据总数">
            <span>可导出</span>
            <strong>{exportableItemTotal.toLocaleString()}</strong>
          </div>
        </div>

        <div className="task-filter-bar export-task-filter-bar">
          <input
            aria-label="搜索导出任务"
            placeholder="搜索任务名 / ID / 模板"
            value={exportSearchKeyword}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <button
            type="button"
            className="primary-action create-action task-filter-bar__create export-batch-action"
            disabled={selectedTaskIds.length === 0 || isBusy}
            onClick={onBatchExport}
          >
            {selectedTaskIds.length > 0 ? `批量导出 ${selectedTaskIds.length} 项` : '批量导出'}
          </button>
        </div>
      </div>
      <div className="task-table-scroll" data-adaptive-table-viewport="true">
        <table className="task-table export-task-table" aria-label="导出记录列表">
          <colgroup>
            <col className="export-task-table__col-select" />
            <col className="export-task-table__col-id" />
            <col className="export-task-table__col-title" />
            <col className="export-task-table__col-created" />
            <col className="export-task-table__col-ended" />
            <col className="export-task-table__col-actions" />
          </colgroup>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                aria-label="选择当前页导出记录"
                checked={hasSelectedAllCurrentPageTasks}
                disabled={tasks.length === 0}
                onChange={onToggleCurrentPageSelection}
              />
            </th>
            <th>任务ID</th>
            <th>任务</th>
            <th>创建时间</th>
            <th>结束时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {tasks.length > 0 ? (
            tasks.map((task) => {
              const taskDisplayId = taskDisplayIdMap.get(task.id) ?? task.id;

              return (
                <tr key={task.id} className={selectedTaskIds.includes(task.id) ? 'is-selected' : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`选择导出任务 ${taskDisplayId}`}
                      checked={selectedTaskIds.includes(task.id)}
                      onChange={() => onToggleTaskSelection(task.id)}
                    />
                  </td>
                  <td className="task-table__id">
                    <code>{taskDisplayId}</code>
                  </td>
                  <td>
                    <strong>{task.title}</strong>
                    <small>Owner：张满</small>
                  </td>
                  <td>{formatDateTimeMinute(task.createdAt)}</td>
                  <td>{task.deadline ? formatDateTimeMinute(task.deadline) : '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="export-row-action"
                      onClick={() => onExportTask(task.id)}
                      aria-label={`导出 ${taskDisplayId}`}
                    >
                      导出
                    </button>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr className="task-table__empty-row">
              <td colSpan={6}>
                <TableEmptyState title="暂无可导出任务" illustrationAlt="空导出记录列表插画" />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    <div className="task-table-pagination" aria-label="可导出任务分页">
      <button
        type="button"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        上一页
      </button>
      <span aria-label="当前页码">
        第 {currentPage} / {totalPages} 页
      </span>
      <button
        type="button"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        下一页
      </button>
    </div>
  </div>
  );
};

type ExportFormatDialogProps = {
  format: ExportFormat;
  isBusy: boolean;
  isOpen: boolean;
  taskCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  onFormatChange: (format: ExportFormat) => void;
};

const ExportFormatDialog = ({
  format,
  isBusy,
  isOpen,
  taskCount,
  onCancel,
  onConfirm,
  onFormatChange,
}: ExportFormatDialogProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="export-format-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onCancel()}>
      <section
        className="export-format-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-format-title"
      >
        <header>
          <h2 id="export-format-title">选择导出格式</h2>
          <p>{taskCount.toLocaleString()} 条导出记录</p>
        </header>
        <div className="export-format-options" role="radiogroup" aria-label="导出文件格式">
          {EXPORT_FORMAT_OPTIONS.map((option) => (
            <label key={option.value} className={option.value === format ? 'is-selected' : undefined}>
              <input
                type="radio"
                name="export-format"
                value={option.value}
                checked={option.value === format}
                onChange={() => onFormatChange(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <footer>
          <button type="button" className="secondary-action" disabled={isBusy} onClick={onCancel}>
            取消
          </button>
          <button type="button" className="primary-action" disabled={isBusy} onClick={onConfirm}>
            确认导出
          </button>
        </footer>
      </section>
    </div>
  );
};

function createExportIdempotencyKey(
  taskId: string,
  format: ExportFormat,
  includeReviews: boolean,
  fieldMapping: ExportFieldMapping[],
): string {
  return `export:${taskId}:${format}:${includeReviews ? 'reviews' : 'rows'}:${stableHash(JSON.stringify(fieldMapping))}`;
}

function triggerExportDownload(job: ExportJobDto): void {
  const link = document.createElement('a');
  link.href = getExportDownloadUrl(job.id);
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function formatDateTimeMinute(value: string): string {
  return value.slice(0, 16).replace('T', ' ');
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}

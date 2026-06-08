import { useEffect, useMemo, useState, type Ref } from 'react';

import type { DatasetRecord, ExportFormat } from '@labelhub/shared';
import {
  createExport,
  getExportDownloadUrl,
  getExportPreview,
  type ExportJobDto,
  type ExportFieldMapping,
  type ExportPreviewDto,
} from '../../api/exports';
import type { TaskItemDto } from '../../api/datasets';
import { listTasks, type TaskDto } from '../../api/tasks';
import exportIcon from '../../assets/export.svg';
import eyeIcon from '../../assets/eye.svg';
import { PageLoading } from '../../components/PageLoading';
import { TableEmptyState } from '../../components/TableEmptyState';
import { ToastViewport, useToastController } from '../../components/ToastViewport';
import { useAdaptiveTablePageSize } from '../../hooks/useAdaptiveTablePageSize';
import { DatasetPreviewModal } from './components/DatasetPreviewModal';
import { createTaskDisplayIdMap, taskCreatedAtTimestamp } from './taskDisplayId';

const OWNER_ID = 'user_owner_zhang_man';
const EXPORT_TASKS_FALLBACK_PAGE_SIZE = 8;
const EXPORT_TASK_TABLE_ROW_HEIGHT = 66;
const EXPORT_FORMAT_OPTIONS: Array<{ label: string; value: ExportFormat }> = [
  { label: 'XLSX', value: 'xlsx' },
  { label: 'CSV', value: 'csv' },
  { label: 'JSON', value: 'json' },
  { label: 'JSONL', value: 'jsonl' },
];

type ExportTaskSortField = 'taskId' | 'createdAt' | 'endedAt';
type ExportTaskSortDirection = 'asc' | 'desc';

export const ExportCenterPage = () => {
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [pendingExportTaskIds, setPendingExportTaskIds] = useState<string[]>([]);
  const [selectedExportFormat, setSelectedExportFormat] = useState<ExportFormat>('xlsx');
  const [exportSearchKeyword, setExportSearchKeyword] = useState('');
  const [exportTaskSortField, setExportTaskSortField] = useState<ExportTaskSortField | null>(null);
  const [exportTaskSortDirection, setExportTaskSortDirection] = useState<ExportTaskSortDirection>('asc');
  const [previewDialog, setPreviewDialog] = useState<ExportPreviewDialogState | null>(null);
  const [previewingTaskId, setPreviewingTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [currentExportTaskPage, setCurrentExportTaskPage] = useState(1);
  const { dismissToast, messages, showErrorToast, showStatusToast } = useToastController();
  const { containerRef: exportTaskTableContainerRef, pageSize: exportTaskPageSize } = useAdaptiveTablePageSize({
    fallbackPageSize: EXPORT_TASKS_FALLBACK_PAGE_SIZE,
    rowHeight: EXPORT_TASK_TABLE_ROW_HEIGHT,
  });

  const taskDisplayIdMap = useMemo(() => createTaskDisplayIdMap(tasks), [tasks]);
  const pendingExportTasks = useMemo(
    () =>
      pendingExportTaskIds
        .map((taskId) => tasks.find((task) => task.id === taskId))
        .filter((task): task is TaskDto => Boolean(task)),
    [pendingExportTaskIds, tasks],
  );
  const exportableTasks = useMemo(() => {
    const keyword = exportSearchKeyword.trim().toLowerCase();

    const defaultOrderedTasks = tasks
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
      .sort((firstTask, secondTask) => taskCreatedAtTimestamp(secondTask) - taskCreatedAtTimestamp(firstTask));

    if (!exportTaskSortField) {
      return defaultOrderedTasks;
    }

    return [...defaultOrderedTasks].sort((firstTask, secondTask) =>
      compareExportTasksBySortField(
        firstTask,
        secondTask,
        exportTaskSortField,
        exportTaskSortDirection,
        (task) => taskDisplayIdMap.get(task.id) ?? task.id,
      ),
    );
  }, [exportSearchKeyword, exportTaskSortDirection, exportTaskSortField, taskDisplayIdMap, tasks]);
  const exportableTaskTotal = exportableTasks.length;
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
  }, [exportSearchKeyword, exportTaskSortDirection, exportTaskSortField]);

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

  const handlePreviewTask = async (taskId: string) => {
    const task = exportableTasks.find((item) => item.id === taskId);
    if (!task) {
      showErrorToast('请选择需要预览的导出记录。');
      return;
    }

    setPreviewingTaskId(taskId);
    try {
      const preview = await getExportPreview({ taskId, includeReviews: true });
      setPreviewDialog({
        items: createExportPreviewItems(preview),
        task,
        taskDisplayId: taskDisplayIdMap.get(task.id) ?? task.id,
        totalFinalApproved: preview.totalFinalApproved,
      });
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '导出预览加载失败。');
    } finally {
      setPreviewingTaskId(null);
    }
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

  const handleExportTaskSort = (field: ExportTaskSortField) => {
    if (exportTaskSortField === field) {
      setExportTaskSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setExportTaskSortField(field);
    setExportTaskSortDirection('asc');
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
              exportableTaskTotal={exportableTaskTotal}
              exportSearchKeyword={exportSearchKeyword}
              isBusy={isBusy}
              previewingTaskId={previewingTaskId}
              selectedTaskIds={selectedTaskIds}
              sortDirection={exportTaskSortDirection}
              sortField={exportTaskSortField}
              tablePanelRef={exportTaskTableContainerRef}
              taskDisplayIdMap={taskDisplayIdMap}
              tasks={paginatedExportableTasks}
              totalPages={totalExportTaskPages}
              onBatchExport={() => handleOpenFormatDialog(selectedTaskIds)}
              onExportTask={(taskId) => handleOpenFormatDialog([taskId])}
              onPageChange={setCurrentExportTaskPage}
              onPreviewTask={(taskId) => void handlePreviewTask(taskId)}
              onSearchChange={setExportSearchKeyword}
              onSort={handleExportTaskSort}
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
        taskDisplayIdMap={taskDisplayIdMap}
        tasks={pendingExportTasks}
        onCancel={() => setPendingExportTaskIds([])}
        onConfirm={() => void handleConfirmExport()}
        onFormatChange={setSelectedExportFormat}
      />
      {previewDialog ? (
        <DatasetPreviewModal
          title={`任务内容预览 · ${previewDialog.task.title}`}
          description={formatExportPreviewDescription(previewDialog)}
          items={previewDialog.items}
          isLoading={false}
          errorMessage={null}
          showItemMeta={false}
          showCloseButton
          tableLabel="任务内容预览表格"
          onClose={() => setPreviewDialog(null)}
        />
      ) : null}
    </section>
  );
};

type ExportPreviewDialogState = {
  items: TaskItemDto[];
  task: TaskDto;
  taskDisplayId: string;
  totalFinalApproved: number;
};

const formatExportPreviewDescription = (previewDialog: ExportPreviewDialogState): string => {
  const previewCount = previewDialog.items.length;
  const previewScope =
    previewCount < previewDialog.totalFinalApproved
      ? `当前仅预览前 ${previewCount.toLocaleString()} 条`
      : `当前预览 ${previewCount.toLocaleString()} 条`;

  return `${previewDialog.taskDisplayId} · 完整可导出 ${previewDialog.totalFinalApproved.toLocaleString()} 条 · ${previewScope}`;
};

type ExportableTaskTableProps = {
  currentPage: number;
  exportableTaskTotal: number;
  exportSearchKeyword: string;
  isBusy: boolean;
  previewingTaskId: string | null;
  selectedTaskIds: string[];
  sortDirection: ExportTaskSortDirection;
  sortField: ExportTaskSortField | null;
  tablePanelRef?: Ref<HTMLDivElement>;
  taskDisplayIdMap: Map<string, string>;
  tasks: TaskDto[];
  totalPages: number;
  onBatchExport: () => void;
  onExportTask: (taskId: string) => void;
  onPageChange: (page: number) => void;
  onPreviewTask: (taskId: string) => void;
  onSearchChange: (keyword: string) => void;
  onSort: (field: ExportTaskSortField) => void;
  onToggleCurrentPageSelection: () => void;
  onToggleTaskSelection: (taskId: string) => void;
};

const ExportableTaskTable = ({
  currentPage,
  exportableTaskTotal,
  exportSearchKeyword,
  isBusy,
  previewingTaskId,
  selectedTaskIds,
  sortDirection,
  sortField,
  tablePanelRef,
  taskDisplayIdMap,
  tasks,
  totalPages,
  onBatchExport,
  onExportTask,
  onPageChange,
  onPreviewTask,
  onSearchChange,
  onSort,
  onToggleCurrentPageSelection,
  onToggleTaskSelection,
}: ExportableTaskTableProps) => {
  const hasSelectedAllCurrentPageTasks =
    tasks.length > 0 && tasks.every((task) => selectedTaskIds.includes(task.id));

  return (
    <div className="task-management-table-card export-task-table-panel" ref={tablePanelRef}>
      <div className="task-management-table-toolbar export-task-table-toolbar" aria-label="导出记录列表概览">
        <div className="task-summary-grid export-summary-grid" aria-label="导出数据概览">
          <div className="task-summary-card task-summary-card--total export-summary-card" aria-label="可导出任务总数">
            <span>可导出</span>
            <strong>{exportableTaskTotal.toLocaleString()}</strong>
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
            <th>
              <SortableExportHeader
                field="taskId"
                label="任务ID"
                sortDirection={sortDirection}
                sortField={sortField}
                onSort={onSort}
              />
            </th>
            <th>任务</th>
            <th>
              <SortableExportHeader
                field="createdAt"
                label="创建时间"
                sortDirection={sortDirection}
                sortField={sortField}
                onSort={onSort}
              />
            </th>
            <th>
              <SortableExportHeader
                field="endedAt"
                label="结束时间"
                sortDirection={sortDirection}
                sortField={sortField}
                onSort={onSort}
              />
            </th>
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
                  </td>
                  <td>{formatDateTimeMinute(task.createdAt)}</td>
                  <td>{task.deadline ? formatDateTimeMinute(task.deadline) : '—'}</td>
                  <td>
                    <div className="task-table__actions">
                      <ExportTaskActionButton
                        disabled={isBusy || previewingTaskId === task.id}
                        icon={eyeIcon}
                        iconClassName="task-table-action__icon--preview"
                        label={`预览 ${taskDisplayId}`}
                        modifier="preview"
                        onClick={() => onPreviewTask(task.id)}
                      />
                      <ExportTaskActionButton
                        disabled={isBusy}
                        icon={exportIcon}
                        iconClassName="task-table-action__icon--export"
                        label={`导出 ${taskDisplayId}`}
                        modifier="export"
                        onClick={() => onExportTask(task.id)}
                      />
                    </div>
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

const SortableExportHeader = ({
  field,
  label,
  sortDirection,
  sortField,
  onSort,
}: {
  field: ExportTaskSortField;
  label: string;
  sortDirection: ExportTaskSortDirection;
  sortField: ExportTaskSortField | null;
  onSort: (field: ExportTaskSortField) => void;
}) => {
  const isActive = sortField === field;
  const icon = isActive ? (sortDirection === 'asc' ? '↑' : '↓') : '⇅';

  return (
    <button
      aria-label={`按${label}排序`}
      aria-pressed={isActive}
      className={`task-table__sortable-header${isActive ? ' is-active' : ''}`}
      type="button"
      onClick={() => onSort(field)}
    >
      <span>{label}</span>
      <span aria-hidden="true" className="task-table__sort-icon">
        {icon}
      </span>
    </button>
  );
};

const ExportTaskActionButton = ({
  disabled,
  icon,
  iconClassName,
  label,
  modifier,
  onClick,
}: {
  disabled: boolean;
  icon: string;
  iconClassName: string;
  label: string;
  modifier: 'export' | 'preview';
  onClick: () => void;
}) => (
  <button
    className={`task-table-action task-table-action--icon task-table-action--${modifier}`}
    type="button"
    disabled={disabled}
    onClick={onClick}
    aria-label={label}
    title={label}
  >
    <img
      aria-hidden="true"
      alt=""
      className={`task-table-action__icon ${iconClassName}`}
      src={icon}
    />
  </button>
);

type ExportFormatDialogProps = {
  format: ExportFormat;
  isBusy: boolean;
  isOpen: boolean;
  taskCount: number;
  taskDisplayIdMap: Map<string, string>;
  tasks: TaskDto[];
  onCancel: () => void;
  onConfirm: () => void;
  onFormatChange: (format: ExportFormat) => void;
};

const ExportFormatDialog = ({
  format,
  isBusy,
  isOpen,
  taskCount,
  taskDisplayIdMap,
  tasks,
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
        <section className="export-format-task-list" aria-label="本次导出任务">
          <h3>本次导出任务</h3>
          <ul>
            {tasks.map((task) => (
              <li key={task.id}>
                <code>{taskDisplayIdMap.get(task.id) ?? task.id}</code>
                <span>{task.title}</span>
              </li>
            ))}
          </ul>
        </section>
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
          <button
            type="button"
            className="secondary-action export-format-dialog__action"
            disabled={isBusy}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="primary-action export-format-dialog__action"
            disabled={isBusy}
            onClick={onConfirm}
          >
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

function compareExportTasksBySortField(
  firstTask: TaskDto,
  secondTask: TaskDto,
  field: ExportTaskSortField,
  direction: ExportTaskSortDirection,
  getTaskDisplayId: (task: TaskDto) => string,
): number {
  const multiplier = direction === 'asc' ? 1 : -1;

  if (field === 'taskId') {
    const firstIdNumber = parseExportTaskSortIdNumber(getTaskDisplayId(firstTask));
    const secondIdNumber = parseExportTaskSortIdNumber(getTaskDisplayId(secondTask));

    if (firstIdNumber !== null && secondIdNumber !== null && firstIdNumber !== secondIdNumber) {
      return (firstIdNumber - secondIdNumber) * multiplier;
    }

    const displayIdDiff = getTaskDisplayId(firstTask).localeCompare(getTaskDisplayId(secondTask));

    return displayIdDiff === 0 ? firstTask.id.localeCompare(secondTask.id) : displayIdDiff * multiplier;
  }

  if (field === 'endedAt') {
    const firstEndedAt = parseExportTaskSortTimestamp(firstTask.deadline);
    const secondEndedAt = parseExportTaskSortTimestamp(secondTask.deadline);

    if (firstEndedAt === null && secondEndedAt === null) {
      return firstTask.id.localeCompare(secondTask.id);
    }

    if (firstEndedAt === null) {
      return 1;
    }

    if (secondEndedAt === null) {
      return -1;
    }

    const endedAtDiff = firstEndedAt - secondEndedAt;

    return endedAtDiff === 0 ? firstTask.id.localeCompare(secondTask.id) : endedAtDiff * multiplier;
  }

  const createdAtDiff = taskCreatedAtTimestamp(firstTask) - taskCreatedAtTimestamp(secondTask);

  return createdAtDiff === 0 ? firstTask.id.localeCompare(secondTask.id) : createdAtDiff * multiplier;
}

function parseExportTaskSortIdNumber(value: string): number | null {
  const numericPart = value.match(/\d+/g)?.at(-1);

  if (!numericPart) {
    return null;
  }

  const parsed = Number.parseInt(numericPart, 10);

  return Number.isNaN(parsed) ? null : parsed;
}

function parseExportTaskSortTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);

  return Number.isNaN(parsed) ? null : parsed;
}

function formatDateTimeMinute(value: string): string {
  return value.slice(0, 16).replace('T', ' ');
}

function createExportPreviewItems(preview: ExportPreviewDto): TaskItemDto[] {
  return preview.rows.map((row, index) => ({
    id: `${preview.taskId}:export-preview:${index}`,
    taskId: preview.taskId,
    externalId: readExportPreviewExternalId(row, index),
    datasetKind: preview.datasetKind,
    rawData: { ...row } as DatasetRecord,
    status: 'COMPLETED',
    sortOrder: index + 1,
    createdAt: '',
    updatedAt: '',
  }));
}

function readExportPreviewExternalId(row: Record<string, unknown>, index: number): string {
  const externalId = row.id ?? row.externalId ?? row.external_id;

  if (typeof externalId === 'string' || typeof externalId === 'number') {
    return String(externalId);
  }

  return `preview-${index + 1}`;
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}

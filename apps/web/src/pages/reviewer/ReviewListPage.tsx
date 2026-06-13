import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { TableEmptyState } from '../../components/TableEmptyState';
import { listPendingReviewTasks, type ReviewTaskQueueDto } from '../../api/reviews';
import { formatDateTimeMinute } from '../../utils/dateTime';
import { ReviewTaskDetailContent } from './ReviewDetailPage';

type ManualReviewTaskStatus = '复审中' | '待人工复审' | '已完成';

type ManualReviewTask = {
  taskId: string;
  taskDisplayId: string;
  taskName: string;
  pendingCount: number;
  status: ManualReviewTaskStatus;
  createdAt: string;
  updatedAt: string;
  deadline: string;
};

const SHEET_EXIT_ANIMATION_MS = 260;
const MANUAL_REVIEW_TABLE_PAGE_SIZE = 10;

export const ReviewListPage = () => {
  const [tasks, setTasks] = useState<ManualReviewTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isSheetClosing, setIsSheetClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    listPendingReviewTasks()
      .then((items) => {
        if (!isMounted) {
          return;
        }

        setTasks(items.map(toManualReviewTask));
        setErrorMessage(null);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setTasks([]);
        setErrorMessage(error instanceof Error ? error.message : '人工审核任务加载失败。');
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(tasks.length / MANUAL_REVIEW_TABLE_PAGE_SIZE));
  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * MANUAL_REVIEW_TABLE_PAGE_SIZE;

    return tasks.slice(startIndex, startIndex + MANUAL_REVIEW_TABLE_PAGE_SIZE);
  }, [currentPage, tasks]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const openTask = (taskId: string) => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setIsSheetClosing(false);
    setSelectedTaskId(taskId);
  };

  const closeTaskSheet = () => {
    if (!selectedTaskId || isSheetClosing || closeTimerRef.current !== null) {
      return;
    }

    setIsSheetClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setSelectedTaskId(null);
      setIsSheetClosing(false);
      closeTimerRef.current = null;
    }, SHEET_EXIT_ANIMATION_MS);
  };

  return (
    <section className="manual-review-list-page" aria-labelledby="manual-review-list-title">
      <header className="manual-review-list-header">
        <div>
          <span>审核任务列表</span>
          <h1 id="manual-review-list-title">人工审核</h1>
          <p className="task-management-table-description">
            汇总进入人工复审的任务、待审数量、状态、最近提交时间和截止时间，支持快速进入处理
          </p>
        </div>
      </header>

      {errorMessage ? <p role="alert">{errorMessage}</p> : null}

      <div className="task-management-table-card manual-review-task-table-panel">
        <div className="task-table-scroll manual-review-task-table-scroll" data-adaptive-table-viewport="true">
          <table className="task-table manual-review-task-table" aria-label="人工审核任务列表">
            <colgroup>
              <col className="manual-review-task-table__col-id" />
              <col className="manual-review-task-table__col-task" />
              <col className="manual-review-task-table__col-count" />
              <col className="manual-review-task-table__col-status" />
              <col className="manual-review-task-table__col-deadline" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">任务ID</th>
                <th scope="col">名称</th>
                <th scope="col">待审核</th>
                <th scope="col">状态</th>
                <th scope="col">截止时间</th>
              </tr>
            </thead>
            <tbody className="task-table__body">
              {!isLoading && paginatedTasks.length > 0 ? (
                paginatedTasks.map((task) => (
                  <tr
                    key={task.taskId}
                    tabIndex={0}
                    aria-label={`人工审核任务 ${task.taskName}`}
                    onClick={(event) => {
                      if (shouldIgnoreRowOpen(event.target) || hasActiveTextSelection()) {
                        return;
                      }
                      openTask(task.taskId);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') {
                        return;
                      }
                      if (shouldIgnoreRowOpen(event.target)) {
                        return;
                      }
                      event.preventDefault();
                      openTask(task.taskId);
                    }}
                    className={selectedTaskId === task.taskId ? 'is-active' : undefined}
                  >
                    <td>
                      <code className="manual-review-task-id">{task.taskDisplayId}</code>
                    </td>
                    <td>
                      <div className="manual-review-task-title">
                        <strong>{task.taskName}</strong>
                      </div>
                    </td>
                    <td>
                      <CountCell value={task.pendingCount} tone="blue" />
                    </td>
                    <td>
                      <TaskStatusPill status={task.status} />
                    </td>
                    <td>
                      <span className="manual-review-task-deadline">{task.deadline}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="task-table__empty-row">
                  <td colSpan={5}>
                    <TableEmptyState
                      title={isLoading ? '正在加载人工审核任务' : '当前没有任务哦'}
                      illustrationAlt="空人工审核任务插画"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && tasks.length > 0 ? (
          <div className="task-table-pagination" aria-label="人工审核任务列表分页">
            <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage(currentPage - 1)}>
              上一页
            </button>
            <span aria-label="当前页码">
              第 {currentPage} / {totalPages} 页
            </span>
            <button type="button" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(currentPage + 1)}>
              下一页
            </button>
          </div>
        ) : null}
      </div>
      <ManualReviewTaskSheetPortal>
        {selectedTaskId ? (
          <ManualReviewTaskSheet isClosing={isSheetClosing} taskId={selectedTaskId} onClose={closeTaskSheet} />
        ) : null}
      </ManualReviewTaskSheetPortal>
    </section>
  );
};

const ManualReviewTaskSheetPortal = ({ children }: { children: ReactNode }) => {
  if (!children) {
    return null;
  }

  if (typeof document === 'undefined') {
    return <>{children}</>;
  }

  return createPortal(children, document.body);
};

const ManualReviewTaskSheet = ({
  isClosing,
  onClose,
  taskId,
}: {
  isClosing: boolean;
  onClose: () => void;
  taskId: string;
}) => {
  const sheetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || sheetRef.current?.contains(target)) {
        return;
      }

      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [onClose]);

  const handleOverlayMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={isClosing ? 'manual-review-sheet-overlay is-closing' : 'manual-review-sheet-overlay'}
      role="presentation"
      onMouseDown={handleOverlayMouseDown}
    >
      <section
        ref={sheetRef}
        className={isClosing ? 'manual-review-task-sheet is-closing' : 'manual-review-task-sheet'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-review-detail-title"
      >
        <ReviewTaskDetailContent taskId={taskId} onClose={onClose} />
      </section>
    </div>
  );
};

const TaskStatusPill = ({ status }: { status: ManualReviewTaskStatus }) => (
  <span className={`manual-review-task-status is-${statusTone(status)}`}>{status}</span>
);

const CountCell = ({ tone, value }: { tone: 'blue'; value: number }) => (
  <strong className={`manual-review-count is-${tone}`}>{value.toLocaleString()}</strong>
);

function toManualReviewTask(item: ReviewTaskQueueDto): ManualReviewTask {
  return {
    taskId: item.taskId,
    taskDisplayId: item.taskDisplayId,
    taskName: item.taskTitle.trim() ? item.taskTitle : `人工审核任务 ${item.taskDisplayId}`,
    pendingCount: item.pendingCount,
    status: normalizeManualReviewTaskStatus(item.status),
    createdAt: formatMinute(item.createdAt),
    updatedAt: formatMinute(item.updatedAt),
    deadline: formatMinute(item.deadline ?? ''),
  };
}

function statusTone(status: ManualReviewTask['status']): 'done' | 'final' | 'reviewing' {
  if (status === '已完成') {
    return 'done';
  }
  if (status === '待人工复审') {
    return 'final';
  }

  return 'reviewing';
}

function normalizeManualReviewTaskStatus(status: ReviewTaskQueueDto['status']): ManualReviewTaskStatus {
  return status === '待复审' ? '待人工复审' : status;
}

function shouldIgnoreRowOpen(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('button, a, input, select, textarea'));
}

function hasActiveTextSelection(): boolean {
  const selection = window.getSelection?.();

  return Boolean(selection && selection.type === 'Range' && selection.toString().trim());
}

function formatMinute(value: string): string {
  return value ? formatDateTimeMinute(value) : '未记录';
}

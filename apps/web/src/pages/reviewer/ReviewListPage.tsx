import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { TableEmptyState } from '../../components/TableEmptyState';
import { listPendingReviews, type ReviewQueueItemDto } from '../../api/reviews';
import { ReviewTaskDetailContent } from './ReviewDetailPage';

type ManualReviewStage = '初审' | '复审' | '终审';
type ManualReviewTaskStatus = '复审中' | '终审中' | '已完成';

type ManualReviewTask = {
  taskId: string;
  taskName: string;
  batchNo: string;
  stage: ManualReviewStage;
  pendingCount: number;
  aiPassCount: number;
  aiRejectCount: number;
  manualCount: number;
  reviewerName: string;
  status: ManualReviewTaskStatus;
  createdAt: string;
  updatedAt: string;
};

const SHEET_EXIT_ANIMATION_MS = 260;

export const ReviewListPage = () => {
  const [queueItems, setQueueItems] = useState<ReviewQueueItemDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isSheetClosing, setIsSheetClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const tasks = useMemo(() => buildManualReviewTasks(queueItems), [queueItems]);

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
    listPendingReviews()
      .then((items) => {
        if (!isMounted) {
          return;
        }

        setQueueItems(items);
        setErrorMessage(null);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setQueueItems([]);
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
            汇总进入人工复审的任务、审核阶段、待审数量、审核员和最近提交时间，支持复审任务分派与进入处理
          </p>
        </div>
      </header>

      {errorMessage ? <p role="alert">{errorMessage}</p> : null}

      <div className="task-management-table-card manual-review-task-table-panel">
        <div className="task-table-scroll manual-review-task-table-scroll" data-adaptive-table-viewport="true">
          <table className="task-table manual-review-task-table" aria-label="人工审核任务列表">
            <colgroup>
              <col className="manual-review-task-table__col-task" />
              <col className="manual-review-task-table__col-stage" />
              <col className="manual-review-task-table__col-count" />
              <col className="manual-review-task-table__col-count" />
              <col className="manual-review-task-table__col-count" />
              <col className="manual-review-task-table__col-count" />
              <col className="manual-review-task-table__col-reviewer" />
              <col className="manual-review-task-table__col-status" />
              <col className="manual-review-task-table__col-time" />
              <col className="manual-review-task-table__col-action" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">任务名称 / 批次</th>
                <th scope="col">审核阶段</th>
                <th scope="col">待审核</th>
                <th scope="col">AI 通过</th>
                <th scope="col">AI 打回</th>
                <th scope="col">转人工</th>
                <th scope="col">处理人</th>
                <th scope="col">状态</th>
                <th scope="col">创建 / 更新</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody className="task-table__body">
              {!isLoading && tasks.length > 0 ? (
                tasks.map((task) => (
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
                      <div className="manual-review-task-title">
                        <strong>{task.taskName}</strong>
                        <small>{task.batchNo}</small>
                      </div>
                    </td>
                    <td>
                      <StagePill stage={task.stage} />
                    </td>
                    <td>
                      <CountCell value={task.pendingCount} tone="blue" />
                    </td>
                    <td>
                      <CountCell value={task.aiPassCount} tone="green" />
                    </td>
                    <td>
                      <CountCell value={task.aiRejectCount} tone="orange" />
                    </td>
                    <td>
                      <CountCell value={task.manualCount} tone="gray" />
                    </td>
                    <td>{task.reviewerName}</td>
                    <td>
                      <TaskStatusPill status={task.status} />
                    </td>
                    <td>
                      <span className="manual-review-task-time">
                        <span>{task.createdAt}</span>
                        <small>{task.updatedAt}</small>
                      </span>
                    </td>
                    <td>
                      <button
                        className="manual-review-enter-button"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openTask(task.taskId);
                        }}
                      >
                        进入审核
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="task-table__empty-row">
                  <td colSpan={10}>
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

const StagePill = ({ stage }: { stage: ManualReviewStage }) => (
  <span className="manual-review-stage-pill">{stage}</span>
);

const TaskStatusPill = ({ status }: { status: ManualReviewTaskStatus }) => (
  <span className={`manual-review-task-status is-${statusTone(status)}`}>{status}</span>
);

const CountCell = ({ tone, value }: { tone: 'blue' | 'gray' | 'green' | 'orange'; value: number }) => (
  <strong className={`manual-review-count is-${tone}`}>{value.toLocaleString()}</strong>
);

function buildManualReviewTasks(queueItems: ReviewQueueItemDto[]): ManualReviewTask[] {
  const groups = new Map<string, ReviewQueueItemDto[]>();

  for (const item of queueItems) {
    groups.set(item.taskId, [...(groups.get(item.taskId) ?? []), item]);
  }

  return [...groups.entries()]
    .map(([taskId, items]) => {
      const orderedItems = [...items].sort((first, second) => first.submittedAt.localeCompare(second.submittedAt));
      const latestItem = orderedItems[orderedItems.length - 1] ?? items[0];
      const createdAt = orderedItems[0]?.submittedAt ?? latestItem?.submittedAt ?? '';
      const updatedAt = latestItem?.updatedAt ?? latestItem?.submittedAt ?? createdAt;
      const batchNo = `TASK-${taskId.slice(-8).toUpperCase()}`;

      return {
        taskId,
        taskName: latestItem?.taskTitle?.trim() ? latestItem.taskTitle : `人工审核任务 ${batchNo}`,
        batchNo,
        stage: '复审',
        pendingCount: items.length,
        aiPassCount: items.filter((item) => item.aiDecision === 'pass').length,
        aiRejectCount: items.filter((item) => item.aiDecision === 'reject').length,
        manualCount: items.filter((item) => item.aiDecision === 'manual' || !item.aiDecision).length,
        reviewerName: resolveReviewerName(latestItem?.assignedReviewerId),
        status: '复审中',
        createdAt: formatMinute(createdAt),
        updatedAt: formatMinute(updatedAt),
      } satisfies ManualReviewTask;
    })
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
}

function resolveReviewerName(reviewerId: string | null | undefined): string {
  if (!reviewerId) {
    return '待处理';
  }

  if (reviewerId === 'user_reviewer_wang_fang' || reviewerId === 'reviewer_1') {
    return '王芳';
  }

  return reviewerId;
}

function statusTone(status: ManualReviewTask['status']): 'done' | 'final' | 'reviewing' {
  if (status === '已完成') {
    return 'done';
  }
  if (status === '终审中') {
    return 'final';
  }

  return 'reviewing';
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
  return value ? value.slice(0, 16).replace('T', ' ') : '未记录';
}

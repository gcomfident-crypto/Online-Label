import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { TableEmptyState } from '../../components/TableEmptyState';
import { listPendingReviews, type ReviewQueueItemDto } from '../../api/reviews';
import { listTasks } from '../../api/tasks';
import { createTaskDisplayIdMap } from '../owner/taskDisplayId';
import { ReviewTaskDetailContent } from './ReviewDetailPage';

type ManualReviewTaskStatus = '复审中' | '待复审' | '已完成';

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

type ManualReviewRoundProgress = {
  totalInRound: number;
  decidedCount: number;
  needsRevisionCount: number;
  pendingCount: number;
};

const SHEET_EXIT_ANIMATION_MS = 260;

export const ReviewListPage = () => {
  const [queueItems, setQueueItems] = useState<ReviewQueueItemDto[]>([]);
  const [taskDisplayIdByTaskId, setTaskDisplayIdByTaskId] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isSheetClosing, setIsSheetClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const tasks = useMemo(
    () => buildManualReviewTasks(queueItems, taskDisplayIdByTaskId),
    [queueItems, taskDisplayIdByTaskId],
  );

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
    Promise.all([
      listPendingReviews(),
      listTasks().catch(() => []),
    ])
      .then(([items, taskItems]) => {
        if (!isMounted) {
          return;
        }

        setQueueItems(items);
        setTaskDisplayIdByTaskId(createTaskDisplayIdMap(taskItems));
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

function buildManualReviewRoundProgress(queueItems: ReviewQueueItemDto[]): ReadonlyMap<string, ManualReviewRoundProgress> {
  const byScope = new Map<string, ManualReviewRoundProgress>();

  for (const item of queueItems) {
    const scope = reviewQueueItemScope(item.taskId, item.round);
    if (item.totalInRound > 0) {
      byScope.set(scope, {
        totalInRound: item.totalInRound,
        decidedCount: item.decidedCount,
        needsRevisionCount: item.needsRevisionCount,
        pendingCount: item.pendingCount,
      });
      continue;
    }

    const current = byScope.get(scope) ?? {
      totalInRound: 0,
      decidedCount: 0,
      needsRevisionCount: 0,
      pendingCount: 0,
    };
    const isDecisionMade = isReviewDecisionMade(item);

    byScope.set(scope, {
      totalInRound: current.totalInRound + 1,
      decidedCount: current.decidedCount + (isDecisionMade ? 1 : 0),
      needsRevisionCount: current.needsRevisionCount + (isReviewRejectedItem(item) ? 1 : 0),
      pendingCount: current.pendingCount + (isDecisionMade ? 0 : 1),
    });
  }

  return byScope;
}

function getLatestTaskRoundProgress(
  taskId: string,
  items: ReviewQueueItemDto[],
  roundProgressByScope: ReadonlyMap<string, ManualReviewRoundProgress>,
): ManualReviewRoundProgress {
  let latestRound = -1;
  let latestProgress: ManualReviewRoundProgress = {
    totalInRound: 0,
    decidedCount: 0,
    needsRevisionCount: 0,
    pendingCount: 0,
  };

  for (const item of items) {
    if (item.round < latestRound) {
      continue;
    }

    if (item.round > latestRound) {
      latestRound = item.round;
      latestProgress = roundProgressByScope.get(reviewQueueItemScope(taskId, item.round)) ?? latestProgress;
    }
  }

  return latestProgress;
}

function resolveManualReviewTaskStatus(progress: ManualReviewRoundProgress): ManualReviewTaskStatus {
  if (progress.pendingCount > 0) {
    return '复审中';
  }

  if (progress.needsRevisionCount > 0) {
    return '待复审';
  }

  return '已完成';
}

function isReviewDecisionSet(humanDecision: string | null): boolean {
  return humanDecision === 'recheck_pass' || humanDecision === 'reject' || humanDecision === 'revise_pass';
}

function isReviewDecisionMade(item: ReviewQueueItemDto): boolean {
  return isReviewDecisionSet(item.humanDecision) || item.status === 'FINAL_APPROVED' || item.status === 'NEEDS_REVISION';
}

function isReviewRejectedItem(item: ReviewQueueItemDto): boolean {
  return item.humanDecision === 'reject' || item.status === 'NEEDS_REVISION';
}

function reviewQueueItemScope(taskId: string, round: number): string {
  return `${taskId}::${round}`;
}

function buildManualReviewTasks(
  queueItems: ReviewQueueItemDto[],
  taskDisplayIdByTaskId: ReadonlyMap<string, string>,
): ManualReviewTask[] {
  const groups = new Map<string, ReviewQueueItemDto[]>();
  const roundProgressByScope = buildManualReviewRoundProgress(queueItems);

  for (const item of queueItems) {
    groups.set(item.taskId, [...(groups.get(item.taskId) ?? []), item]);
  }

  return [...groups.entries()]
    .map(([taskId, items]) => {
      const orderedItems = [...items].sort((first, second) => first.submittedAt.localeCompare(second.submittedAt));
      const latestItem = orderedItems[orderedItems.length - 1] ?? items[0];
      const createdAt = orderedItems[0]?.submittedAt ?? latestItem?.submittedAt ?? '';
      const updatedAt = latestItem?.updatedAt ?? latestItem?.submittedAt ?? createdAt;
      const taskDisplayId = taskDisplayIdByTaskId.get(taskId) ?? taskId;
      const latestRoundProgress = getLatestTaskRoundProgress(taskId, items, roundProgressByScope);
      const status = resolveManualReviewTaskStatus(latestRoundProgress);

      return {
        taskId,
        taskDisplayId,
        taskName: latestItem?.taskTitle?.trim() ? latestItem.taskTitle : `人工审核任务 ${taskDisplayId}`,
        pendingCount: latestRoundProgress.pendingCount,
        status,
        createdAt: formatMinute(createdAt),
        updatedAt: formatMinute(updatedAt),
        deadline: formatMinute(latestItem?.deadline ?? ''),
      } satisfies ManualReviewTask;
    })
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
}

function statusTone(status: ManualReviewTask['status']): 'done' | 'final' | 'reviewing' {
  if (status === '已完成') {
    return 'done';
  }
  if (status === '待复审') {
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

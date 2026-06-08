import type { CSSProperties } from 'react';

import type { TaskDto, TaskWorkflowProgressEvent } from '../../../api/tasks';

type TaskProgressNodeStatus = 'completed' | 'current' | 'pending' | 'warning';

type TaskProgressNode = {
  id: string;
  label: string;
  actorName?: string;
  status: TaskProgressNodeStatus;
};

type TaskProgressLayoutNode = TaskProgressNode & {
  rowIndex: number;
  visualColumn: number;
  rowDirection: 'forward' | 'reverse';
  hasHorizontalNext: boolean;
  connectorComplete: boolean;
};

type TaskProgressTurn = {
  id: string;
  gridColumn: number;
  gridRow: number;
  connectorComplete: boolean;
};

const MAX_NODES_PER_ROW = 5;

export const TaskProgressTimeline = ({ task }: { task: TaskDto }) => {
  const nodes = buildTaskProgressNodes(task);
  const layout = buildTaskProgressLayout(nodes);

  return (
    <section className="task-progress-timeline" aria-label="当前进度">
      <div className="task-progress-timeline__header">
        <h3>当前进度</h3>
      </div>
      <ol
        className="task-progress-timeline__track"
        style={{ '--timeline-columns': String(MAX_NODES_PER_ROW) } as CSSProperties}
      >
        {layout.nodes.map((node) => (
          <li
            key={node.id}
            className={[
              'task-progress-timeline__node',
              `is-${node.status}`,
              node.rowDirection === 'reverse' ? 'is-row-reverse' : null,
              node.hasHorizontalNext ? 'has-next' : null,
              node.connectorComplete ? 'is-connector-complete' : null,
            ].filter(Boolean).join(' ')}
            style={{
              gridColumn: node.visualColumn,
              gridRow: node.rowIndex * 2 + 1,
            }}
            aria-current={node.status === 'current' ? 'step' : undefined}
          >
            <span className="task-progress-timeline__dot" aria-hidden="true" />
            <span className="task-progress-timeline__label">
              {renderProgressLabel(node)}
            </span>
          </li>
        ))}
        {layout.turns.map((turn) => (
          <span
            aria-hidden="true"
            className={[
              'task-progress-timeline__turn',
              turn.connectorComplete ? 'is-connector-complete' : null,
            ].filter(Boolean).join(' ')}
            key={turn.id}
            style={{ gridColumn: turn.gridColumn, gridRow: turn.gridRow }}
          />
        ))}
      </ol>
    </section>
  );
};

const shouldCompleteConnector = (
  node: TaskProgressNode,
  nextNode: TaskProgressNode | undefined,
): boolean =>
  Boolean(
    nextNode &&
      node.status !== 'pending' &&
      nextNode.status !== 'pending',
  );

export const buildTaskProgressNodes = (task: TaskDto): TaskProgressNode[] => {
  const eventNodes = buildNodesFromEvents(task.workflowProgress, task);

  if (eventNodes.length > 0) {
    return ensureCurrentNode(eventNodes);
  }

  return buildFallbackNodes(task);
};

const buildNodesFromEvents = (
  events: readonly TaskWorkflowProgressEvent[] | undefined,
  task: TaskDto,
): TaskProgressNode[] => {
  if (!events || events.length === 0) {
    return [];
  }

  const submitCounts = new Map<string, number>();

  return [...events]
    .sort((first, second) => progressEventTime(first) - progressEventTime(second))
    .map((event, index) => {
      const status = event.status ?? (event.type === 'ai_review_rejected' ? 'warning' : 'completed');
      const actorName = event.actorName?.trim();
      let label: string;
      let labelActorName: string | undefined;

      if (event.type === 'submitted' || event.type === 'ai_review_submitted') {
        const submitter = actorName;
        const hasAiPreReview = task.aiPreReviewEnabled && event.type === 'ai_review_submitted';
        if (submitter) {
          const countKey = `${event.type}:${submitter}`;
          const count = (submitCounts.get(countKey) ?? 0) + 1;
          submitCounts.set(countKey, count);
          const actionLabel = hasAiPreReview ? '提交 AI 预审' : '提交复审';
          label = count > 1 ? `${submitter}再次${actionLabel}` : `${submitter}${actionLabel}`;
          labelActorName = submitter;
        } else {
          label = hasAiPreReview ? '待提交 AI 预审' : '待提交复审';
        }
      } else {
        label = formatProgressEventLabel(event, actorName, task);
        labelActorName = actorName;
      }

      return {
        id: event.id || `${event.type}-${index}`,
        label,
        actorName: labelActorName,
        status,
      };
    });
};

const buildFallbackNodes = (task: TaskDto): TaskProgressNode[] => {
  if (task.status === 'DRAFT') {
    return [
      { id: 'draft', label: '草稿', status: 'current' },
      { id: 'published', label: '已发布', status: 'pending' },
    ];
  }

  const assignedCount = task.assignedItemCount ?? inferAssignedItemCount(task);
  const submittedCount = task.submittedItemCount ?? inferSubmittedItemCount(task);
  const hasFinalReview = (task.exportableItemCount ?? 0) > 0;
  const hasAiPassed = hasFinalReview || (task.completedItemCount ?? 0) > 0;

  const commonNodes: TaskProgressNode[] = [
    { id: 'published', label: '已发布', status: 'completed' },
    {
      id: 'claimed',
      label: assignedCount > 0 ? `已领取 ${assignedCount.toLocaleString()} 题` : '待领取',
      status: assignedCount > 0 ? 'completed' : 'pending',
    },
  ];

  if (!task.aiPreReviewEnabled) {
    return ensureCurrentNode([
      ...commonNodes,
      {
        id: 'submitted',
        label: submittedCount > 0 || hasFinalReview ? '已提交复审' : '待提交复审',
        status: submittedCount > 0 || hasFinalReview ? 'completed' : 'pending',
      },
      {
        id: 'reviewer-final',
        label: hasFinalReview ? '终审完成' : '待终审',
        status: hasFinalReview ? 'completed' : 'pending',
      },
    ]);
  }

  const nodes: TaskProgressNode[] = [
    ...commonNodes,
    {
      id: 'ai-submitted',
      label: submittedCount > 0 || hasAiPassed ? '已提交 AI 预审' : '待提交 AI 预审',
      status: submittedCount > 0 || hasAiPassed ? 'completed' : 'pending',
    },
    {
      id: 'ai-passed',
      label: hasAiPassed ? 'AI 预审通过' : '待 AI 预审',
      status: hasAiPassed ? 'completed' : 'pending',
    },
    {
      id: 'reviewer-final',
      label: hasFinalReview ? '终审完成' : '待终审',
      status: hasFinalReview ? 'completed' : 'pending',
    },
  ];

  return ensureCurrentNode(nodes);
};

const ensureCurrentNode = (nodes: TaskProgressNode[]): TaskProgressNode[] => {
  if (nodes.some((node) => node.status === 'current')) {
    return nodes;
  }

  const firstPendingIndex = nodes.findIndex((node) => node.status === 'pending');
  const currentIndex = firstPendingIndex > 0 ? firstPendingIndex - 1 : nodes.length - 1;

  return nodes.map((node, index) =>
    index === currentIndex && node.status !== 'pending'
      ? { ...node, status: 'current' }
      : node,
  );
};

const formatProgressEventLabel = (
  event: TaskWorkflowProgressEvent,
  actorName: string | undefined,
  task?: TaskDto,
): string => {
  if (event.type === 'published') {
    return '已发布';
  }

  if (event.type === 'claimed') {
    const itemCount = event.itemCount ?? task?.assignedItemCount ?? null;
    const count = itemCount && itemCount > 0 ? ` ${itemCount.toLocaleString()} 题` : '';
    return actorName ? `${actorName}已领取${count}` : '待领取';
  }

  if (event.type === 'submitted') {
    return actorName ? `${actorName}提交复审` : '待提交复审';
  }

  if (event.type === 'ai_review_rejected') {
    return 'AI 预审打回';
  }

  if (event.type === 'ai_review_passed') {
    return event.status === 'pending' ? '待 AI 预审' : 'AI 预审通过';
  }

  return actorName ? `${actorName}终审` : '待终审';
};

const renderProgressLabel = (node: Pick<TaskProgressNode, 'actorName' | 'label'>) => {
  const actorName = node.actorName?.trim();

  if (!actorName || !node.label.startsWith(actorName)) {
    return node.label;
  }

  return (
    <>
      <strong>{actorName}</strong>
      {node.label.slice(actorName.length)}
    </>
  );
};

export const buildTaskProgressLayout = (
  nodes: readonly TaskProgressNode[],
  maxNodesPerRow = MAX_NODES_PER_ROW,
): { nodes: TaskProgressLayoutNode[]; turns: TaskProgressTurn[] } => {
  const layoutNodes: TaskProgressLayoutNode[] = nodes.map((node, index) => {
    const rowIndex = Math.floor(index / maxNodesPerRow);
    const indexInRow = index % maxNodesPerRow;
    const rowDirection = rowIndex % 2 === 0 ? 'forward' : 'reverse';
    const visualColumn =
      rowDirection === 'forward' ? indexInRow + 1 : maxNodesPerRow - indexInRow;
    const nextNode = nodes[index + 1];
    const nextRowIndex = Math.floor((index + 1) / maxNodesPerRow);
    const hasHorizontalNext = Boolean(nextNode && nextRowIndex === rowIndex);

    return {
      ...node,
      rowIndex,
      visualColumn,
      rowDirection,
      hasHorizontalNext,
      connectorComplete: hasHorizontalNext && shouldCompleteConnector(node, nextNode),
    };
  });

  const rowCount = layoutNodes.length > 0 ? layoutNodes.at(-1)!.rowIndex + 1 : 0;
  const turns = Array.from({ length: Math.max(0, rowCount - 1) }, (_, rowIndex) => {
    const rowDirection = rowIndex % 2 === 0 ? 'forward' : 'reverse';
    const rowEndIndex = Math.min(nodes.length - 1, (rowIndex + 1) * maxNodesPerRow - 1);
    const nextRowStartIndex = rowEndIndex + 1;

    return {
      id: `turn-${rowIndex}`,
      gridColumn: rowDirection === 'forward' ? maxNodesPerRow : 1,
      gridRow: rowIndex * 2 + 2,
      connectorComplete: shouldCompleteConnector(nodes[rowEndIndex], nodes[nextRowStartIndex]),
    };
  });

  return { nodes: layoutNodes, turns };
};

const progressEventTime = (event: TaskWorkflowProgressEvent): number => {
  if (!event.createdAt) {
    return 0;
  }

  const time = new Date(event.createdAt).getTime();

  return Number.isFinite(time) ? time : 0;
};

const inferAssignedItemCount = (task: TaskDto): number => {
  const actualItemCount = task.itemCount ?? 0;
  const totalCount = actualItemCount > 0 ? actualItemCount : task.quota ?? 0;
  const remainingCount = Math.max(0, totalCount - (task.completedItemCount ?? 0));

  return task.completedItemCount > 0 ? Math.max(1, totalCount - remainingCount) : 0;
};

const inferSubmittedItemCount = (task: TaskDto): number =>
  (task.completedItemCount ?? 0) + (task.exportableItemCount ?? 0);

import { useEffect, useMemo, useState } from 'react';

import {
  getReviewDiff,
  listReviewRounds,
  type SubmissionDiffDto,
  type SubmissionFieldDiffDto,
  type SubmissionRoundDto,
} from '../../api/reviews';
import { ToastViewport, useToastController } from '../../components/ToastViewport';

type RoundSelectorProps = {
  assignmentId: string;
};

export const RoundSelector = ({ assignmentId }: RoundSelectorProps) => {
  const [rounds, setRounds] = useState<SubmissionRoundDto[]>([]);
  const [fromRound, setFromRound] = useState<number | null>(null);
  const [toRound, setToRound] = useState<number | null>(null);
  const [diff, setDiff] = useState<SubmissionDiffDto | null>(null);
  const [isLoadingRounds, setIsLoadingRounds] = useState(true);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const { dismissToast, messages, showErrorToast } = useToastController();

  const orderedRounds = useMemo(() => [...rounds].sort((left, right) => left.round - right.round), [rounds]);
  const hasComparableRounds = orderedRounds.length >= 2;

  useEffect(() => {
    let isActive = true;
    setIsLoadingRounds(true);
    setDiff(null);

    listReviewRounds(assignmentId)
      .then((nextRounds) => {
        if (!isActive) {
          return;
        }

        const safeRounds = Array.isArray(nextRounds) ? nextRounds : [];
        const nextOrderedRounds = [...safeRounds].sort((left, right) => left.round - right.round);
        setRounds(nextOrderedRounds);
        setFromRound(nextOrderedRounds[0]?.round ?? null);
        setToRound(nextOrderedRounds.at(-1)?.round ?? null);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }
        showErrorToast(error instanceof Error ? error.message : '轮次列表加载失败。');
        setRounds([]);
        setFromRound(null);
        setToRound(null);
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingRounds(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [assignmentId, showErrorToast]);

  useEffect(() => {
    if (!fromRound || !toRound || fromRound === toRound) {
      setDiff(null);
      return;
    }

    let isActive = true;
    setIsLoadingDiff(true);
    getReviewDiff(assignmentId, { fromRound, toRound })
      .then((nextDiff) => {
        if (isActive) {
          setDiff(nextDiff);
        }
      })
      .catch((error) => {
        if (isActive) {
          showErrorToast(error instanceof Error ? error.message : '轮次 Diff 加载失败。');
          setDiff(null);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingDiff(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [assignmentId, fromRound, showErrorToast, toRound]);

  const title = fromRound && toRound && fromRound !== toRound ? `第 ${fromRound} / ${toRound} 轮 Diff` : '轮次 Diff';

  return (
    <section className="review-panel round-diff-panel" aria-label="轮次 Diff">
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <header className="review-panel__heading">
        <div>
          <span>多轮对比</span>
          <h3>{title}</h3>
        </div>
        <small>{orderedRounds.length.toLocaleString()} 轮</small>
      </header>

      {isLoadingRounds ? <p>正在加载提交轮次。</p> : null}

      {!isLoadingRounds && !hasComparableRounds ? (
        <p className="round-diff-empty">暂无可对比轮次。</p>
      ) : null}

      {hasComparableRounds ? (
        <>
          <div className="round-selector-controls">
            <label>
              起始轮次
              <select
                aria-label="起始轮次"
                value={fromRound ?? ''}
                onChange={(event) => setFromRound(Number(event.target.value))}
              >
                {orderedRounds.map((round) => (
                  <option key={round.submissionId} value={round.round}>
                    第 {round.round} 轮 · {statusText(round.status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              目标轮次
              <select
                aria-label="目标轮次"
                value={toRound ?? ''}
                onChange={(event) => setToRound(Number(event.target.value))}
              >
                {orderedRounds.map((round) => (
                  <option key={round.submissionId} value={round.round}>
                    第 {round.round} 轮 · {statusText(round.status)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isLoadingDiff ? <p>正在生成字段级 Diff。</p> : null}

          {diff && diff.changes.length === 0 ? <p className="round-diff-empty">两个轮次答案一致。</p> : null}

          {diff && diff.changes.length > 0 ? (
            <ol className="round-diff-list">
              {diff.changes.map((change) => (
                <DiffItem key={change.fieldKey} change={change} />
              ))}
            </ol>
          ) : null}
        </>
      ) : null}
    </section>
  );
};

const DiffItem = ({ change }: { change: SubmissionFieldDiffDto }) => (
  <li data-change-type={change.type}>
    <header>
      <strong>字段：{change.fieldKey}</strong>
      <span>{changeTypeLabel(change.type)}</span>
    </header>
    <div className="round-diff-values">
      <div>
        <small>上一轮</small>
        <pre>{formatValue(change.before)}</pre>
      </div>
      <div>
        <small>当前轮</small>
        <pre>{formatValue(change.after)}</pre>
      </div>
    </div>
    {change.addedItems?.length || change.removedItems?.length ? (
      <p>
        {change.addedItems?.length ? `新增项：${change.addedItems.map(formatInlineValue).join('、')}` : null}
        {change.addedItems?.length && change.removedItems?.length ? '；' : null}
        {change.removedItems?.length ? `删除项：${change.removedItems.map(formatInlineValue).join('、')}` : null}
      </p>
    ) : null}
  </li>
);

function statusText(status: string): string {
  if (status === 'FINAL_PENDING') {
    return '待完成';
  }
  if (status === 'NEEDS_REVISION') {
    return '需修改';
  }
  if (status === 'FINAL_APPROVED') {
    return '已完成';
  }

  return status;
}

function changeTypeLabel(type: SubmissionFieldDiffDto['type']): string {
  if (type === 'added') {
    return '新增';
  }
  if (type === 'removed') {
    return '删除';
  }

  return '修改';
}

function formatValue(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatInlineValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

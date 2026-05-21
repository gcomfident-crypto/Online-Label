import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  claimAssignment,
  listMarketTasks,
  type MarketClaimStatus,
  type MarketTaskDto,
} from '../../api/assignments';
import { EmptyState } from '../../components/EmptyState';
import { PageLoading } from '../../components/PageLoading';

const LABELER_ID = 'user_labeler_li_lei';

const CLAIM_STATUS_OPTIONS: Array<{ label: string; value: MarketClaimStatus | 'ALL' }> = [
  { label: '领取状态：全部', value: 'ALL' },
  { label: '可领取', value: 'available' },
  { label: '已领取', value: 'claimed' },
  { label: '已满额', value: 'full' },
  { label: '已截止', value: 'expired' },
];

const CLAIM_STATUS_LABELS: Record<MarketClaimStatus, string> = {
  available: '可领取',
  claimed: '已领取',
  full: '已满额',
  expired: '已截止',
};

const DATASET_KIND_LABELS: Record<MarketTaskDto['datasetKind'], string> = {
  qa_quality: '问答质量',
  preference_compare: '偏好对比',
  generic_json: '通用 JSON',
};

export const TaskMarketPage = () => {
  const [tasks, setTasks] = useState<MarketTaskDto[]>([]);
  const [keyword, setKeyword] = useState('');
  const [tag, setTag] = useState('');
  const [claimStatus, setClaimStatus] = useState<MarketClaimStatus | 'ALL'>('ALL');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastWorkbenchLink, setLastWorkbenchLink] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null);

  useEffect(() => {
    void loadTasks();
  }, []);

  const availableCount = useMemo(
    () => tasks.filter((task) => task.claimStatus === 'available').length,
    [tasks],
  );
  const claimedCount = useMemo(
    () => tasks.filter((task) => task.claimedByMe).length,
    [tasks],
  );
  const tagOptions = useMemo(
    () => [...new Set(tasks.flatMap((task) => task.tags))].slice(0, 8),
    [tasks],
  );

  const loadTasks = async (
    overrides: Partial<{
      keyword: string;
      tag: string;
      claimStatus: MarketClaimStatus | 'ALL';
    }> = {},
  ) => {
    const nextKeyword = overrides.keyword ?? keyword;
    const nextTag = overrides.tag ?? tag;
    const nextClaimStatus = overrides.claimStatus ?? claimStatus;

    setIsLoading(true);
    try {
      const nextTasks = await listMarketTasks({
        keyword: nextKeyword.trim() || undefined,
        tag: nextTag.trim() || undefined,
        claimStatus: nextClaimStatus,
        labelerId: LABELER_ID,
      });
      setTasks(nextTasks);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '任务广场加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClaim = async (task: MarketTaskDto) => {
    setClaimingTaskId(task.id);
    try {
      const assignment = await claimAssignment({
        taskId: task.id,
        labelerId: LABELER_ID,
      });
      setStatusMessage(`已领取题目 ${assignment.taskItem.externalId}。`);
      setLastWorkbenchLink(
        `/labeler/tasks/${assignment.taskId}/items/${assignment.taskItemId}?assignmentId=${assignment.assignmentId}`,
      );
      setErrorMessage(null);
      await loadTasks();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '领取任务失败。');
    } finally {
      setClaimingTaskId(null);
    }
  };

  return (
    <section className="task-market-page" aria-labelledby="labeler-market-title">
      <div className="task-market-header">
        <div>
          <p className="eyebrow">Labeler / 任务广场</p>
          <h1 id="labeler-market-title">任务广场</h1>
          <p>搜索发布中的任务，按标签和领取状态筛选后领取题目。</p>
        </div>
        <dl>
          <div>
            <dt>可领取任务</dt>
            <dd>{availableCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>我已领取</dt>
            <dd>{claimedCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>演示标注员</dt>
            <dd>李雷</dd>
          </div>
        </dl>
      </div>

      {statusMessage || errorMessage ? (
        <div className="task-status-message" aria-live="polite">
          {statusMessage ? <span>{statusMessage}</span> : null}
          {lastWorkbenchLink ? (
            <Link className="primary-link" to={lastWorkbenchLink}>
              进入标注台
            </Link>
          ) : null}
          {errorMessage ? <span role="alert">{errorMessage}</span> : null}
        </div>
      ) : null}

      <div className="task-market-filter">
        <input
          aria-label="搜索任务"
          placeholder="搜索任务名、模板或标签"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <select
          aria-label="标签筛选"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
        >
          <option value="">全部标签</option>
          {tagOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          aria-label="领取状态筛选"
          value={claimStatus}
          onChange={(event) => setClaimStatus(event.target.value as MarketClaimStatus | 'ALL')}
        >
          {CLAIM_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void loadTasks()}>
          筛选
        </button>
      </div>

      {isLoading ? (
        <PageLoading title="正在加载任务广场" description="正在获取可领取任务、配额和标签筛选项。" />
      ) : tasks.length > 0 ? (
        <div className="task-market-grid">
          {tasks.map((task) => (
            <article className="task-market-card" key={task.id}>
              <div className="task-market-card__header">
                <div>
                  <span>{DATASET_KIND_LABELS[task.datasetKind]}</span>
                  <h2>{task.title}</h2>
                </div>
                <strong className={`claim-status claim-status--${task.claimStatus}`}>
                  {CLAIM_STATUS_LABELS[task.claimStatus]}
                </strong>
              </div>
              <p>{task.description ?? '暂无任务描述。'}</p>
              <div className="task-market-card__tags">
                {task.tags.map((taskTag) => (
                  <span key={taskTag}>{taskTag}</span>
                ))}
              </div>
              <dl className="task-market-card__meta">
                <div>
                  <dt>奖励规则</dt>
                  <dd>{task.rewardRule ?? '未设置'}</dd>
                </div>
                <div>
                  <dt>剩余题目</dt>
                  <dd>{task.remainingCount.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>进度</dt>
                  <dd>
                    {task.assignedCount.toLocaleString()} /{' '}
                    {(task.quota ?? task.itemCount).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt>截止时间</dt>
                  <dd>{task.deadline ? task.deadline.slice(0, 10) : '未设置'}</dd>
                </div>
              </dl>
              <div className="task-market-progress" aria-hidden="true">
                <span style={{ width: `${progressPercent(task)}%` }} />
              </div>
              <button
                className="primary-action"
                type="button"
                disabled={!canClaim(task) || claimingTaskId === task.id}
                onClick={() => void handleClaim(task)}
              >
                {claimingTaskId === task.id ? '领取中' : task.claimedByMe ? '继续领取' : '领取题目'}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="暂无可领取任务"
          description="调整关键词、标签或领取状态后再试。"
          action={
            <button
              type="button"
              onClick={() => {
                setKeyword('');
                setTag('');
                setClaimStatus('ALL');
                void loadTasks({ keyword: '', tag: '', claimStatus: 'ALL' });
              }}
            >
              清空筛选
            </button>
          }
        />
      )}
    </section>
  );
};

const canClaim = (task: MarketTaskDto): boolean => {
  return task.remainingCount > 0 && task.claimStatus !== 'full' && task.claimStatus !== 'expired';
};

const progressPercent = (task: MarketTaskDto): number => {
  const total = task.quota ?? task.itemCount;
  if (total <= 0) {
    return 0;
  }

  return Math.min(100, (task.assignedCount / total) * 100);
};

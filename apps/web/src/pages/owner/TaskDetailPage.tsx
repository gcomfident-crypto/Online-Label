import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { TASK_STATUS_LABELS } from '@labelhub/shared';
import { getTask, listTaskAuditLogs, type TaskAuditLogDto, type TaskDto } from '../../api/tasks';
import { PageLoading } from '../../components/PageLoading';
import { StatusTag } from '../../components/StatusTag';
import { ToastViewport, useToastController } from '../../components/ToastViewport';
import { DISTRIBUTION_LABELS } from './components/TaskTable';

export const TaskDetailPage = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<TaskDto | null>(null);
  const [auditLogs, setAuditLogs] = useState<TaskAuditLogDto[]>([]);
  const [hasLoadFailed, setHasLoadFailed] = useState(false);
  const { dismissToast, messages, showErrorToast } = useToastController();

  useEffect(() => {
    if (!taskId) {
      showErrorToast('缺少任务 ID，无法加载详情。');
      setHasLoadFailed(true);
      return;
    }

    void loadTaskDetail(taskId);
  }, [taskId]);

  const loadTaskDetail = async (id: string) => {
    try {
      const [nextTask, nextAuditLogs] = await Promise.all([getTask(id), listTaskAuditLogs(id)]);
      setTask(nextTask);
      setAuditLogs(nextAuditLogs);
      setHasLoadFailed(false);
    } catch {
      showErrorToast('任务详情加载失败，请稍后重试。');
      setHasLoadFailed(true);
    }
  };

  if (hasLoadFailed) {
    return (
      <section className="task-detail-page" aria-labelledby="task-detail-title">
        <ToastViewport messages={messages} onDismiss={dismissToast} />
        <Link className="primary-link" to="/owner/tasks">
          返回任务列表
        </Link>
        <h1 id="task-detail-title">任务详情</h1>
        <p>请返回任务列表重新选择任务。</p>
      </section>
    );
  }

  if (!task) {
    return (
      <section className="task-detail-page" aria-labelledby="task-detail-title">
        <ToastViewport messages={messages} onDismiss={dismissToast} />
        <h1 id="task-detail-title">任务详情</h1>
        <PageLoading title="正在加载任务详情" />
      </section>
    );
  }

  return (
    <section className="task-detail-page" aria-labelledby="task-detail-title">
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <Link className="primary-link" to="/owner/tasks">
        返回任务列表
      </Link>
      <div className="task-detail-header">
        <div>
          <h1 id="task-detail-title">{task.title}</h1>
        </div>
        <div className="task-detail-actions">
          <StatusTag group="task" status={task.status} />
          <Link className="primary-action" to={`/owner/tasks/${task.id}/dataset`}>
            导入题目数据
          </Link>
        </div>
      </div>

      <dl className="task-detail-grid">
        <div>
          <dt>关联模板</dt>
          <dd>
            {task.template.name} (Schema {task.template.schemaVersion})
          </dd>
        </div>
        <div>
          <dt>分发策略</dt>
          <dd>{DISTRIBUTION_LABELS[task.distributionStrategy]}</dd>
        </div>
        <div>
          <dt>已完成 / 总题目数</dt>
          <dd>{formatTaskProgress(task)}</dd>
        </div>
        <div>
          <dt>截止时间</dt>
          <dd>{task.deadline ? task.deadline.slice(0, 10) : '未设置截止时间'}</dd>
        </div>
        <div>
          <dt>奖励规则</dt>
          <dd>{task.rewardRule ?? '未设置奖励规则'}</dd>
        </div>
        <div>
          <dt>AI 预审</dt>
          <dd>{task.aiPreReviewEnabled ? `已启用 · ${task.aiRuleName ?? '默认规则'}` : '未启用'}</dd>
        </div>
      </dl>

      <section className="task-detail-audit" aria-labelledby="task-audit-title">
        <h2 id="task-audit-title">审计日志</h2>
        <ol>
          {auditLogs.map((auditLog, index) => (
            <li key={`${auditLog.taskId}-${index}`}>
              <strong>{auditAction(auditLog)}</strong>
              <span>
                {auditLog.fromStatus ? TASK_STATUS_LABELS[auditLog.fromStatus] : '初始状态'} →{' '}
                {TASK_STATUS_LABELS[auditLog.toStatus]}
              </span>
              {auditLog.actorId ? <small>操作人：{auditLog.actorId}</small> : null}
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
};

const auditAction = (auditLog: TaskAuditLogDto): string => {
  if (typeof auditLog.metadata === 'object' && auditLog.metadata !== null && 'action' in auditLog.metadata) {
    const action = (auditLog.metadata as { action?: unknown }).action;

    return typeof action === 'string' ? action : '任务状态变更';
  }

  return '任务状态变更';
};

const formatTaskProgress = (task: TaskDto): string => {
  const totalCount = task.quota ?? task.itemCount;

  if (totalCount <= 0) {
    return '未设置题目数';
  }

  return `${Math.min(task.completedItemCount ?? 0, totalCount).toLocaleString()} / ${totalCount.toLocaleString()}`;
};

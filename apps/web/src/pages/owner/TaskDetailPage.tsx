import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { TASK_STATUS_LABELS } from '@labelhub/shared';
import { getTask, listTaskAuditLogs, type TaskAuditLogDto, type TaskDto } from '../../api/tasks';
import {
  listTaskItemReports,
  resolveTaskItemReport,
  type ResolveTaskItemReportAction,
  type TaskItemReportDto,
} from '../../api/taskItemReports';
import { PageLoading } from '../../components/PageLoading';
import { StatusTag } from '../../components/StatusTag';
import { ToastViewport, useToastController } from '../../components/ToastViewport';
import { DISTRIBUTION_LABELS } from './components/TaskTable';

const OWNER_ID = 'user_owner_zhang_man';

export const TaskDetailPage = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<TaskDto | null>(null);
  const [auditLogs, setAuditLogs] = useState<TaskAuditLogDto[]>([]);
  const [itemReports, setItemReports] = useState<TaskItemReportDto[]>([]);
  const [resolvingReportId, setResolvingReportId] = useState<string | null>(null);
  const [hasLoadFailed, setHasLoadFailed] = useState(false);
  const { dismissToast, messages, showErrorToast, showStatusToast } = useToastController();

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
      const [nextTask, nextAuditLogs, nextItemReports] = await Promise.all([
        getTask(id),
        listTaskAuditLogs(id),
        listTaskItemReports({ taskId: id }),
      ]);
      setTask(nextTask);
      setAuditLogs(nextAuditLogs);
      setItemReports(nextItemReports);
      setHasLoadFailed(false);
    } catch {
      showErrorToast('任务详情加载失败，请稍后重试。');
      setHasLoadFailed(true);
    }
  };

  const handleResolveReport = async (
    report: TaskItemReportDto,
    action: ResolveTaskItemReportAction,
  ) => {
    const ownerComment = window.prompt(resolveReportPromptTitle(action), '')?.trim();
    if (ownerComment === undefined) {
      return;
    }

    let rawDataPatch: Record<string, unknown> | undefined;
    if (action === 'reopen') {
      const rawPatchText = window.prompt('如需修正原始数据，请输入 JSON 对象；不修改则留空。', '')?.trim();
      if (rawPatchText === undefined) {
        return;
      }
      if (rawPatchText) {
        try {
          const parsed = JSON.parse(rawPatchText) as unknown;
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('rawDataPatch 必须是 JSON 对象。');
          }
          rawDataPatch = parsed as Record<string, unknown>;
        } catch (error) {
          showErrorToast(error instanceof Error ? error.message : '原始数据修正内容不是合法 JSON 对象。');
          return;
        }
      }
    }

    setResolvingReportId(report.id);
    try {
      const resolvedReport = await resolveTaskItemReport({
        reportId: report.id,
        action,
        ownerId: OWNER_ID,
        ownerComment,
        rawDataPatch,
      });
      setItemReports((current) =>
        current.map((itemReport) => itemReport.id === resolvedReport.id ? resolvedReport : itemReport),
      );
      if (taskId) {
        const [nextTask, nextAuditLogs] = await Promise.all([getTask(taskId), listTaskAuditLogs(taskId)]);
        setTask(nextTask);
        setAuditLogs(nextAuditLogs);
      }
      showStatusToast(resolveReportSuccessMessage(action));
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '题目上报处理失败。');
    } finally {
      setResolvingReportId(null);
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

      <section className="task-item-report-panel" aria-labelledby="task-item-report-title">
        <div className="task-item-report-panel__header">
          <h2 id="task-item-report-title">题目上报处理</h2>
          <span>{itemReports.filter((report) => report.status === 'PENDING').length} 个待处理</span>
        </div>
        {itemReports.length > 0 ? (
          <div className="task-item-report-list">
            {itemReports.map((report) => (
              <article className="task-item-report-card" key={report.id}>
                <header>
                  <div>
                    <strong>{report.taskItem?.externalId ?? report.taskItemId}</strong>
                    <span>{TASK_ITEM_REPORT_STATUS_LABELS[report.status]}</span>
                  </div>
                  <time dateTime={report.createdAt}>{report.createdAt.slice(0, 16).replace('T', ' ')}</time>
                </header>
                <p>{report.reason}</p>
                {report.ownerComment ? <small>处理意见：{report.ownerComment}</small> : null}
                {report.status === 'PENDING' ? (
                  <div className="task-item-report-card__actions">
                    <button
                      type="button"
                      disabled={resolvingReportId === report.id}
                      onClick={() => void handleResolveReport(report, 'invalidate')}
                    >
                      确认作废
                    </button>
                    <button
                      type="button"
                      disabled={resolvingReportId === report.id}
                      onClick={() => void handleResolveReport(report, 'reopen')}
                    >
                      修复重开
                    </button>
                    <button
                      type="button"
                      disabled={resolvingReportId === report.id}
                      onClick={() => void handleResolveReport(report, 'reject')}
                    >
                      驳回上报
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="task-item-report-panel__empty">暂无题目问题上报。</p>
        )}
      </section>

      <section className="task-detail-audit" aria-labelledby="task-audit-title">
        <h2 id="task-audit-title">审计日志</h2>
        <ol>
          {auditLogs.map((auditLog, index) => (
            <li key={`${auditLog.taskId}-${index}`}>
              <strong>{auditAction(auditLog)}</strong>
              <span>
                {auditLog.fromStatus ? formatAuditStatus(auditLog.fromStatus) : '初始状态'} →{' '}
                {formatAuditStatus(auditLog.toStatus)}
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

const formatAuditStatus = (status: string): string => (TASK_STATUS_LABELS as Record<string, string>)[status] ?? status;

const TASK_ITEM_REPORT_STATUS_LABELS: Record<TaskItemReportDto['status'], string> = {
  PENDING: '待处理',
  INVALIDATED: '已作废',
  REOPENED: '已重开',
  REJECTED: '已驳回',
};

const resolveReportPromptTitle = (action: ResolveTaskItemReportAction): string => {
  if (action === 'invalidate') {
    return '请输入作废原因。';
  }
  if (action === 'reopen') {
    return '请输入修复说明。';
  }
  return '请输入驳回原因。';
};

const resolveReportSuccessMessage = (action: ResolveTaskItemReportAction): string => {
  if (action === 'invalidate') {
    return '题目已确认作废。';
  }
  if (action === 'reopen') {
    return '题目已修复并重新开放。';
  }
  return '题目上报已驳回。';
};

const formatTaskProgress = (task: TaskDto): string => {
  const actualItemCount = task.itemCount ?? 0;
  const totalCount = actualItemCount > 0 ? actualItemCount : task.quota ?? 0;

  if (totalCount <= 0) {
    return '未设置题目数';
  }

  return `${Math.min(task.completedItemCount ?? 0, totalCount).toLocaleString()} / ${totalCount.toLocaleString()}`;
};

import { useEffect, useMemo, useState } from 'react';

import { TASK_STATUS_LABELS, type TaskStatus } from '@labelhub/shared';
import {
  createTask,
  listTasks,
  updateTask,
  updateTaskStatus,
  type DistributionStrategy,
  type TaskDto,
  type TaskFormInput,
} from '../../api/tasks';
import { PublishDrawer } from './components/PublishDrawer';
import { DISTRIBUTION_LABELS, TaskTable } from './components/TaskTable';

const OWNER_ID = 'user_owner_zhang_man';
const STATUS_OPTIONS: Array<{ label: string; value: TaskStatus | 'ALL' }> = [
  { label: '全部状态', value: 'ALL' },
  { label: TASK_STATUS_LABELS.DRAFT, value: 'DRAFT' },
  { label: TASK_STATUS_LABELS.PUBLISHED, value: 'PUBLISHED' },
  { label: TASK_STATUS_LABELS.PAUSED, value: 'PAUSED' },
  { label: TASK_STATUS_LABELS.ENDED, value: 'ENDED' },
];
const DISTRIBUTION_OPTIONS: Array<{ label: string; value: DistributionStrategy | 'ALL' }> = [
  { label: '分发策略：全部', value: 'ALL' },
  { label: DISTRIBUTION_LABELS.FIRST_COME_FIRST_SERVE, value: 'FIRST_COME_FIRST_SERVE' },
  { label: DISTRIBUTION_LABELS.ASSIGNMENT, value: 'ASSIGNMENT' },
  { label: DISTRIBUTION_LABELS.QUOTA_RACE, value: 'QUOTA_RACE' },
];

export const TaskListPage = () => {
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL');
  const [distributionFilter, setDistributionFilter] = useState<DistributionStrategy | 'ALL'>('ALL');
  const [selectedTask, setSelectedTask] = useState<TaskDto | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormInput | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    void loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      setTasks(await listTasks({ ownerId: OWNER_ID }));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '任务列表加载失败。');
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesStatus = statusFilter === 'ALL' || task.status === statusFilter;
      const matchesDistribution =
        distributionFilter === 'ALL' || task.distributionStrategy === distributionFilter;
      const keyword = searchKeyword.trim().toLowerCase();
      const matchesSearch =
        keyword.length === 0 ||
        task.title.toLowerCase().includes(keyword) ||
        task.id.toLowerCase().includes(keyword) ||
        '张满'.includes(keyword);

      return matchesStatus && matchesDistribution && matchesSearch;
    });
  }, [distributionFilter, searchKeyword, statusFilter, tasks]);
  const summary = useMemo(
    () => ({
      published: tasks.filter((task) => task.status === 'PUBLISHED').length,
      draft: tasks.filter((task) => task.status === 'DRAFT').length,
      submitted: tasks.reduce((sum, task) => sum + task.itemCount, 0),
    }),
    [tasks],
  );

  const openPublishDrawer = (task: TaskDto) => {
    setSelectedTask(task);
    setTaskForm(taskToForm(task));
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const handleCreateTask = async () => {
    const templateSource = tasks.find((task) => task.template.status === 'PUBLISHED') ?? tasks[0];

    if (!templateSource) {
      setErrorMessage('暂无可用模板，无法创建任务。');
      return;
    }

    setIsCreating(true);
    try {
      const createdTask = await createTask({
        title: '未命名任务',
        description: '补充任务目标、交付标准和验收口径。',
        richTextInstruction: '请在发布前补齐标注说明。',
        tags: [],
        rewardRule: '按条计费',
        quota: 100,
        deadline: defaultDeadline(),
        distributionStrategy: 'FIRST_COME_FIRST_SERVE',
        aiPreReviewEnabled: false,
        aiRuleName: null,
        templateId: templateSource.templateId,
        actorId: OWNER_ID,
      });
      setTasks((current) => [createdTask, ...current]);
      openPublishDrawer(createdTask);
      setStatusMessage('新任务草稿已创建。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '新建任务失败。');
    } finally {
      setIsCreating(false);
    }
  };

  const saveDraft = async (): Promise<TaskDto | null> => {
    if (!selectedTask || !taskForm) {
      return null;
    }

    const savedTask = await updateTask(selectedTask.id, taskForm);
    replaceTask(savedTask);
    setSelectedTask(savedTask);
    setTaskForm(taskToForm(savedTask));

    return savedTask;
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      await saveDraft();
      setStatusMessage('草稿已保存。');
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '草稿保存失败。');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    setIsSaving(true);
    try {
      const savedTask = await saveDraft();

      if (!savedTask) {
        return;
      }

      const publishedTask = await updateTaskStatus(savedTask.id, {
        status: 'PUBLISHED',
        actorId: OWNER_ID,
        confirm: true,
      });
      replaceTask(publishedTask);
      setSelectedTask(null);
      setTaskForm(null);
      setStatusMessage('任务已发布。');
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '任务发布失败。');
    } finally {
      setIsSaving(false);
    }
  };

  const transitionTask = async (task: TaskDto, status: TaskStatus, successMessage: string) => {
    try {
      const nextTask = await updateTaskStatus(task.id, { status, actorId: OWNER_ID });
      replaceTask(nextTask);
      setStatusMessage(successMessage);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '任务状态更新失败。');
    }
  };

  const replaceTask = (task: TaskDto) => {
    setTasks((current) => current.map((item) => (item.id === task.id ? task : item)));
  };

  return (
    <section className="task-management-page" aria-labelledby="owner-tasks-title">
      <div className="task-management-header">
        <div>
          <p className="eyebrow">任务负责人后台 / 任务管理</p>
          <h1 id="owner-tasks-title">任务管理</h1>
          <p>维护任务全生命周期：草稿 → 发布中 → 已暂停 → 已结束</p>
        </div>
        <button type="button" onClick={() => void handleCreateTask()} disabled={isCreating}>
          新建任务
        </button>
      </div>

      {statusMessage || errorMessage ? (
        <div className="task-status-message" aria-live="polite">
          {statusMessage ? <span>{statusMessage}</span> : null}
          {errorMessage ? <span role="alert">{errorMessage}</span> : null}
        </div>
      ) : null}

      <div className="task-summary-grid">
        <SummaryCard label="发布中任务" value={summary.published.toString()} />
        <SummaryCard label="草稿" value={summary.draft.toString()} />
        <SummaryCard label="本周新增提交" value={summary.submitted.toLocaleString()} />
      </div>

      <div className="task-filter-bar">
        <input
          placeholder="搜索任务名 / ID / 负责人"
          value={searchKeyword}
          onChange={(event) => setSearchKeyword(event.target.value)}
        />
        <select
          aria-label="状态筛选"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as TaskStatus | 'ALL')}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="分发策略筛选"
          value={distributionFilter}
          onChange={(event) => setDistributionFilter(event.target.value as DistributionStrategy | 'ALL')}
        >
          {DISTRIBUTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <TaskTable
        tasks={filteredTasks}
        onPublish={openPublishDrawer}
        onPause={(task) => void transitionTask(task, 'PAUSED', '任务已暂停。')}
        onResume={(task) => void transitionTask(task, 'PUBLISHED', '任务已恢复发布。')}
        onEnd={(task) => void transitionTask(task, 'ENDED', '任务已结束。')}
      />

      {selectedTask && taskForm ? (
        <PublishDrawer
          task={selectedTask}
          form={taskForm}
          isSaving={isSaving}
          onChange={(patch) => setTaskForm((current) => (current ? { ...current, ...patch } : current))}
          onSaveDraft={handleSaveDraft}
          onPublish={handlePublish}
          onClose={() => {
            setSelectedTask(null);
            setTaskForm(null);
          }}
        />
      ) : null}
    </section>
  );
};

const SummaryCard = ({ label, value }: { label: string; value: string }) => (
  <article>
    <span>{label}</span>
    <strong>{value}</strong>
  </article>
);

const taskToForm = (task: TaskDto): TaskFormInput => ({
  title: task.title,
  description: task.description,
  richTextInstruction: task.richTextInstruction,
  tags: task.tags,
  rewardRule: task.rewardRule,
  quota: task.quota,
  deadline: task.deadline,
  distributionStrategy: task.distributionStrategy,
  aiPreReviewEnabled: task.aiPreReviewEnabled,
  aiRuleName: task.aiRuleName,
  templateId: task.templateId,
});

const defaultDeadline = (): string => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(23, 59, 0, 0);

  return date.toISOString();
};

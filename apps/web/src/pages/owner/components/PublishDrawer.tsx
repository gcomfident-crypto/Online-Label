import type { TaskDto, TaskFormInput } from '../../../api/tasks';
import { DISTRIBUTION_LABELS } from './TaskTable';

type PublishDrawerProps = {
  task: TaskDto;
  form: TaskFormInput;
  isSaving: boolean;
  onChange: (patch: Partial<TaskFormInput>) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onClose: () => void;
};

export const PublishDrawer = ({
  task,
  form,
  isSaving,
  onChange,
  onSaveDraft,
  onPublish,
  onClose,
}: PublishDrawerProps) => {
  return (
    <aside className="task-publish-drawer" aria-label="发布任务抽屉">
      <div className="task-publish-drawer__header">
        <div>
          <p className="eyebrow">发布任务</p>
          <h2>发布任务 · {task.title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭发布抽屉">
          ×
        </button>
      </div>
      <div className="task-publish-note">
        发布后将进入「发布中」状态，标注员将在任务广场看到该任务并可领取。
      </div>
      <div className="task-publish-form">
        <label>
          任务标题
          <input
            aria-label="任务标题"
            value={form.title}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </label>
        <label>
          描述
          <textarea
            aria-label="描述"
            value={form.description ?? ''}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </label>
        <label>
          标注说明
          <textarea
            aria-label="标注说明"
            value={form.richTextInstruction ?? ''}
            onChange={(event) => onChange({ richTextInstruction: event.target.value })}
          />
        </label>
        <label>
          标签
          <input
            aria-label="标签"
            value={(form.tags ?? []).join('、')}
            onChange={(event) =>
              onChange({
                tags: event.target.value
                  .split(/[、,]/)
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <label>
          奖励规则
          <input
            aria-label="奖励规则"
            value={form.rewardRule ?? ''}
            onChange={(event) => onChange({ rewardRule: event.target.value })}
          />
        </label>
        <div className="task-publish-form__split">
          <label>
            配额
            <input
              aria-label="配额"
              type="number"
              min="1"
              value={form.quota ?? ''}
              onChange={(event) => onChange({ quota: Number(event.target.value) || null })}
            />
          </label>
          <label>
            截止时间
            <input
              aria-label="截止时间"
              type="datetime-local"
              value={toDatetimeLocal(form.deadline)}
              onChange={(event) =>
                onChange({
                  deadline: event.target.value ? new Date(event.target.value).toISOString() : null,
                })
              }
            />
          </label>
        </div>
        <div>
          <span>分发策略</span>
          <div className="task-distribution-options">
            <button
              className={form.distributionStrategy === 'FIRST_COME_FIRST_SERVE' ? 'is-active' : ''}
              type="button"
              onClick={() => onChange({ distributionStrategy: 'FIRST_COME_FIRST_SERVE' })}
            >
              {DISTRIBUTION_LABELS.FIRST_COME_FIRST_SERVE}
            </button>
            <button type="button" disabled>
              {DISTRIBUTION_LABELS.ASSIGNMENT}
            </button>
            <button type="button" disabled>
              {DISTRIBUTION_LABELS.QUOTA_RACE}
            </button>
          </div>
        </div>
        <label>
          关联模板
          <input
            aria-label="关联模板"
            value={`${task.template.name} (Schema ${task.template.schemaVersion})`}
            readOnly
          />
        </label>
        <label className="task-ai-toggle">
          <input
            aria-label="启用 AI 预审"
            type="checkbox"
            checked={Boolean(form.aiPreReviewEnabled)}
            onChange={(event) => onChange({ aiPreReviewEnabled: event.target.checked })}
          />
          启用 AI 预审
        </label>
        {form.aiPreReviewEnabled ? <small>规则：{form.aiRuleName ?? '电商相关性 v2'}</small> : null}
      </div>
      <ul className="task-publish-checklist" aria-label="发布前校验">
        <li>任务标题</li>
        <li>配额</li>
        <li>截止时间</li>
        <li>分发策略</li>
        <li>关联模板</li>
        <li>题目数据</li>
      </ul>
      <div className="task-publish-drawer__footer">
        <button type="button" disabled={isSaving} onClick={onSaveDraft}>
          存为草稿
        </button>
        <button className="primary-action" type="button" disabled={isSaving} onClick={onPublish}>
          立即发布 →
        </button>
      </div>
    </aside>
  );
};

const toDatetimeLocal = (value?: string | null): string => {
  return value ? value.slice(0, 16) : '';
};

import { useEffect, useMemo, useState } from 'react';

import { listTasks, type TaskDto } from '../../api/tasks';
import {
  getReviewRule,
  saveReviewRule,
  type ReviewDimensionDto,
  type ReviewRuleDto,
} from '../../api/reviewRules';
import { PageLoading } from '../../components/PageLoading';
import { ToastViewport, useToastController } from '../../components/ToastViewport';

const OWNER_ID = 'user_owner_zhang_man';

type RuleForm = {
  name: string;
  promptTemplate: string;
  promptVersion: number;
  dimensions: ReviewDimensionDto[];
  dimensionVersion: number;
  passThreshold: number;
  manualThreshold: number;
  provider: string;
  model: string;
  temperature: number;
  structuredOutputMode: 'function_calling' | 'json_schema';
};

export const AiRuleConfigPage = () => {
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [form, setForm] = useState<RuleForm | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { dismissToast, messages, showErrorToast, showStatusToast } = useToastController();

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );
  const enabledCount = useMemo(
    () => tasks.filter((task) => task.aiPreReviewEnabled).length,
    [tasks],
  );

  useEffect(() => {
    void loadInitialRule();
  }, []);

  const loadInitialRule = async () => {
    setIsLoading(true);
    try {
      const nextTasks = await listTasks({ ownerId: OWNER_ID });
      const firstTask = nextTasks[0] ?? null;
      setTasks(nextTasks);
      setSelectedTaskId(firstTask?.id ?? '');

      if (firstTask) {
        setForm(ruleToForm(await getReviewRule(firstTask.id)));
      }

    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'AI 规则配置加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTask = async (taskId: string) => {
    setSelectedTaskId(taskId);
    try {
      setForm(ruleToForm(await getReviewRule(taskId)));
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'AI 规则加载失败。');
    }
  };

  const handleSave = async () => {
    if (!selectedTaskId || !form) {
      showErrorToast('请选择任务并填写 AI 审核规则。');
      return;
    }

    setIsSaving(true);
    try {
      const savedRule = await saveReviewRule(selectedTaskId, {
        name: form.name,
        promptTemplate: form.promptTemplate,
        dimensions: form.dimensions,
        passThreshold: form.passThreshold,
        manualThreshold: form.manualThreshold,
        provider: form.provider,
        model: form.model,
        temperature: form.temperature,
        actorId: OWNER_ID,
      });
      setForm(ruleToForm(savedRule));
      setTasks((current) =>
        current.map((task) =>
          task.id === selectedTaskId
            ? { ...task, aiPreReviewEnabled: true, aiRuleName: savedRule.name }
            : task,
        ),
      );
      showStatusToast('规则已保存为新版本。');
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'AI 规则保存失败。');
    } finally {
      setIsSaving(false);
    }
  };

  const updateDimension = (index: number, patch: Partial<ReviewDimensionDto>) => {
    setForm((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        dimensions: current.dimensions.map((dimension, dimensionIndex) =>
          dimensionIndex === index ? { ...dimension, ...patch } : dimension,
        ),
      };
    });
  };

  const addDimension = () => {
    setForm((current) =>
      current
        ? {
            ...current,
            dimensions: [
              ...current.dimensions,
              { key: `dimension_${current.dimensions.length + 1}`, label: '新维度', maxScore: 100 },
            ],
          }
        : current,
    );
  };

  const removeDimension = (index: number) => {
    setForm((current) =>
      current
        ? {
            ...current,
            dimensions: current.dimensions.filter((_, dimensionIndex) => dimensionIndex !== index),
          }
        : current,
    );
  };

  if (isLoading) {
    return (
      <section className="ai-rule-page">
        <PageLoading title="正在加载 AI 规则配置" />
      </section>
    );
  }

  return (
    <section className="ai-rule-page" aria-labelledby="ai-rule-title">
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <div className="ai-rule-header">
        <div>
          <h1 id="ai-rule-title">AI 规则配置</h1>
        </div>
        <dl>
          <SummaryMetric label="任务数" value={tasks.length} />
          <SummaryMetric label="已启用 AI" value={enabledCount} />
          <SummaryMetric label="当前维度" value={form?.dimensions.length ?? 0} />
        </dl>
      </div>

      {form ? (
        <form
          className="ai-rule-layout"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <aside className="ai-rule-sidebar">
            <label>
              任务
              <select
                aria-label="任务"
                value={selectedTaskId}
                onChange={(event) => void handleSelectTask(event.target.value)}
              >
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
            <section>
              <h2>任务状态</h2>
              <dl>
                <div>
                  <dt>任务</dt>
                  <dd>{selectedTask?.title ?? '未选择'}</dd>
                </div>
                <div>
                  <dt>模板</dt>
                  <dd>{selectedTask?.template.name ?? '未记录'}</dd>
                </div>
                <div>
                  <dt>AI 规则</dt>
                  <dd>{selectedTask?.aiRuleName ?? form.name}</dd>
                </div>
              </dl>
            </section>
          </aside>

          <main className="ai-rule-main">
            <div className="ai-rule-main__topline">
              <div>
                <span className="ai-review-chip">{modeLabel(form.structuredOutputMode)}</span>
                <h2>{form.name}</h2>
                <p>Prompt v{form.promptVersion} · 维度 v{form.dimensionVersion}</p>
              </div>
              <button className="primary-action" type="submit" disabled={isSaving}>
                {isSaving ? '保存中' : '保存规则新版本'}
              </button>
            </div>

            <div className="ai-rule-form-grid">
              <label>
                规则名称
                <input
                  aria-label="规则名称"
                  value={form.name}
                  onChange={(event) => setForm((current) => current && { ...current, name: event.target.value })}
                />
              </label>
              <label>
                服务商
                <select
                  aria-label="服务商"
                  value={form.provider}
                  onChange={(event) => setForm((current) => current && { ...current, provider: event.target.value })}
                >
                  <option value="deepseek">deepseek</option>
                  <option value="openai">openai</option>
                  <option value="custom">custom</option>
                </select>
              </label>
              <label>
                模型
                <input
                  aria-label="模型"
                  value={form.model}
                  onChange={(event) => setForm((current) => current && { ...current, model: event.target.value })}
                />
              </label>
              <label>
                通过阈值
                <input
                  aria-label="通过阈值"
                  type="number"
                  min="0"
                  max="100"
                  value={form.passThreshold}
                  onChange={(event) =>
                    setForm((current) => current && { ...current, passThreshold: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                人工阈值
                <input
                  aria-label="人工阈值"
                  type="number"
                  min="0"
                  max="100"
                  value={form.manualThreshold}
                  onChange={(event) =>
                    setForm((current) => current && { ...current, manualThreshold: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                温度
                <input
                  aria-label="温度"
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={form.temperature}
                  onChange={(event) =>
                    setForm((current) => current && { ...current, temperature: Number(event.target.value) })
                  }
                />
              </label>
            </div>

            <label className="ai-rule-prompt">
              Prompt 模板
              <textarea
                aria-label="Prompt 模板"
                value={form.promptTemplate}
                onChange={(event) =>
                  setForm((current) => current && { ...current, promptTemplate: event.target.value })
                }
              />
            </label>

            <section className="ai-rule-dimensions" aria-label="评分维度">
              <div className="ai-rule-section-heading">
                <h2>评分维度</h2>
                <button type="button" onClick={addDimension}>
                  新增维度
                </button>
              </div>
              <div className="ai-rule-dimension-list">
                {form.dimensions.map((dimension, index) => (
                  <article key={`${dimension.key}-${index}`}>
                    <label>
                      键
                      <input
                        aria-label={`维度 ${index + 1} 键`}
                        value={dimension.key}
                        onChange={(event) => updateDimension(index, { key: event.target.value })}
                      />
                    </label>
                    <label>
                      名称
                      <input
                        aria-label={`维度 ${index + 1} 名称`}
                        value={dimension.label}
                        onChange={(event) => updateDimension(index, { label: event.target.value })}
                      />
                    </label>
                    <label>
                      满分
                      <input
                        aria-label={`维度 ${index + 1} 满分`}
                        type="number"
                        min="1"
                        value={dimension.maxScore}
                        onChange={(event) => updateDimension(index, { maxScore: Number(event.target.value) })}
                      />
                    </label>
                    <button type="button" onClick={() => removeDimension(index)}>
                      删除
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </main>
        </form>
      ) : (
        <div className="ai-rule-empty">
          <strong>暂无可配置任务</strong>
          <span>请先创建任务并发布模板后再配置 AI 预审规则。</span>
        </div>
      )}
    </section>
  );
};

const SummaryMetric = ({ label, value }: { label: string; value: number }) => (
  <div>
    <dt>{label}</dt>
    <dd>{value.toLocaleString()}</dd>
  </div>
);

const ruleToForm = (rule: ReviewRuleDto): RuleForm => {
  const provider = normalizeProvider(rule.provider);
  const isLegacyMockRule = rule.provider.trim().toLowerCase() === 'mock';

  return {
    name: rule.name,
    promptTemplate: rule.promptTemplate,
    promptVersion: rule.promptVersion,
    dimensions: rule.dimensions,
    dimensionVersion: rule.dimensionVersion,
    passThreshold: rule.passThreshold,
    manualThreshold: rule.manualThreshold,
    provider,
    model: normalizeModel(rule.model, provider),
    temperature: rule.temperature,
    structuredOutputMode: isLegacyMockRule ? 'json_schema' : rule.structuredOutputMode,
  };
};

const normalizeProvider = (provider: string): string => {
  const normalized = provider.trim().toLowerCase();

  if (normalized === 'mock' || normalized === '') {
    return 'deepseek';
  }

  return normalized === 'openai-compatible' ? 'custom' : normalized;
};

const normalizeModel = (model: string, provider: string): string => {
  const normalized = model.trim();

  if (normalized && normalized !== 'mock-stable-reviewer') {
    return normalized;
  }

  if (provider === 'openai') {
    return 'gpt-4o-mini';
  }

  if (provider === 'custom') {
    return 'custom-ai-reviewer';
  }

  return 'deepseek-chat';
};

const modeLabel = (mode: RuleForm['structuredOutputMode']): string =>
  mode === 'json_schema' ? 'json_schema · 结构化' : 'function_calling · 结构化';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { PageError } from '../../components/AppErrorBoundary';
import { PageLoading } from '../../components/PageLoading';
import { applySchemaLinkage, validateSchemaAnswers } from '../../features/schema-renderer';
import { SchemaRenderer } from '../../features/schema-renderer';
import { ContributionStats } from '../../features/labeler/ContributionStats';
import { QuestionNavigator } from '../../features/labeler/QuestionNavigator';
import { RejectNotice } from '../../features/labeler/RejectNotice';
import { getAssignmentWorkbench, saveDraft, type WorkbenchDto } from '../../api/drafts';
import { getLabelerStats, submitAssignment, type LabelerStatsDto } from '../../api/submissions';

const LABELER_ID = 'user_labeler_li_lei';

export const WorkbenchPage = () => {
  const { taskId, itemId } = useParams<{ taskId: string; itemId: string }>();
  const [searchParams] = useSearchParams();
  const assignmentId = searchParams.get('assignmentId') ?? '';
  const [workbench, setWorkbench] = useState<WorkbenchDto | null>(null);
  const [stats, setStats] = useState<LabelerStatsDto | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [draftStatus, setDraftStatus] = useState('正在加载草稿。');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastSavedSnapshotRef = useRef('');
  const hydratedRef = useRef(false);

  const localCacheKey = assignmentId ? `labelhub.local-draft.${assignmentId}` : '';

  useEffect(() => {
    if (!assignmentId) {
      setErrorMessage('缺少领取记录 ID，无法进入标注台。');
      setIsLoading(false);
      return;
    }

    void loadWorkbench(assignmentId);
  }, [assignmentId]);

  const loadWorkbench = async (id: string) => {
    setIsLoading(true);
    try {
      const nextWorkbench = await getAssignmentWorkbench(id);
      const [nextStats] = await Promise.all([
        getLabelerStats({ labelerId: LABELER_ID, taskId: nextWorkbench.assignment.taskId }),
      ]);
      const cachedAnswers = readLocalDraft(localCacheKey);
      const initialAnswers = cachedAnswers ?? nextWorkbench.draft?.answers ?? {};

      setWorkbench(nextWorkbench);
      setStats(nextStats);
      setAnswers(initialAnswers);
      lastSavedSnapshotRef.current = JSON.stringify(nextWorkbench.draft?.answers ?? {});
      hydratedRef.current = true;
      setDraftStatus(
        cachedAnswers ? '检测到本地未同步草稿，已恢复到当前表单。' : '草稿已载入。',
      );
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '标注台加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  const saveDraftNow = useCallback(
    async (source: 'auto' | 'manual'): Promise<boolean> => {
      if (!workbench) {
        return false;
      }

      setIsSaving(true);
      try {
        const draft = await saveDraft(workbench.assignment.id, {
          actorId: LABELER_ID,
          answers,
        });
        lastSavedSnapshotRef.current = JSON.stringify(answers);
        window.localStorage.removeItem(localCacheKey);
        setDraftStatus(
          source === 'auto'
            ? `草稿已自动保存 ${formatTime(draft.updatedAt)}`
            : `草稿已手动保存 ${formatTime(draft.updatedAt)}`,
        );
        setStatusMessage(source === 'manual' ? '草稿已保存。' : null);
        setErrorMessage(null);
        return true;
      } catch (error) {
        window.localStorage.setItem(localCacheKey, JSON.stringify(answers));
        setDraftStatus('草稿保存失败，已写入本地临时缓存。');
        setErrorMessage(error instanceof Error ? error.message : '草稿保存失败。');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [answers, localCacheKey, workbench],
  );

  useEffect(() => {
    if (!hydratedRef.current || !workbench) {
      return;
    }

    const snapshot = JSON.stringify(answers);
    if (snapshot === lastSavedSnapshotRef.current) {
      return;
    }

    setDraftStatus('草稿待自动保存。');
    const timer = window.setTimeout(() => {
      void saveDraftNow('auto');
    }, 800);

    return () => window.clearTimeout(timer);
  }, [answers, saveDraftNow, workbench]);

  const submitCurrent = useCallback(async () => {
    if (!workbench) {
      return;
    }

    const linkageResult = applySchemaLinkage(workbench.task.schema, answers);
    const errors = validateSchemaAnswers(workbench.task.schema, linkageResult.answers, linkageResult);
    if (errors.length > 0) {
      setValidationMessages(errors.map((error) => error.message));
      return;
    }

    setIsSubmitting(true);
    setValidationMessages([]);
    try {
      const draftSaved = await saveDraftNow('manual');
      if (!draftSaved) {
        return;
      }

      const submission = await submitAssignment({
        assignmentId: workbench.assignment.id,
        actorId: LABELER_ID,
        answers: linkageResult.answers,
      });
      setWorkbench((current) =>
        current
          ? {
              ...current,
              assignment: { ...current.assignment, status: 'SUBMITTED' },
              submissionHistory: [
                {
                  id: submission.id,
                  status: submission.status,
                  round: submission.round,
                  answers: submission.answers,
                  schemaVersion: submission.schemaVersion,
                  submittedAt: submission.submittedAt,
                  reviewRecords: [],
                },
                ...current.submissionHistory,
              ],
            }
          : current,
      );
      setStatusMessage('提交成功，已进入 AI 预审队列。');
      setDraftStatus(`提交前草稿已同步 ${formatTime(submission.submittedAt)}`);
      setErrorMessage(null);
      setStats(await getLabelerStats({ labelerId: LABELER_ID, taskId: workbench.assignment.taskId }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '提交失败。');
    } finally {
      setIsSubmitting(false);
    }
  }, [answers, saveDraftNow, workbench]);

  const totalCount = useMemo(() => Math.max(1, stats?.totalAssignments ?? 1), [stats]);

  const handlePrevious = useCallback(() => {
    setStatusMessage('已经是当前加载范围的第一题。');
  }, []);

  const handleNext = useCallback(() => {
    setStatusMessage('当前演示仅加载本题，请从任务广场进入下一题。');
  }, []);

  const handleJump = useCallback((index: number) => {
    setStatusMessage(`当前演示仅加载本题，暂不能跳转到第 ${index + 1} 题。`);
  }, []);

  const reportCurrentIssue = useCallback(() => {
    setStatusMessage('请在本题备注中说明异常，提交后会随答案进入审核。');
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) && !(event.metaKey || event.ctrlKey)) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        void saveDraftNow('manual');
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void submitCurrent();
      }

      if (!(event.metaKey || event.ctrlKey || event.altKey)) {
        const key = event.key.toLowerCase();
        if (key === 'j') {
          event.preventDefault();
          handleNext();
        }
        if (key === 'k') {
          event.preventDefault();
          handlePrevious();
        }
        if (key === 'r') {
          event.preventDefault();
          reportCurrentIssue();
        }
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [handleNext, handlePrevious, reportCurrentIssue, saveDraftNow, submitCurrent]);

  if (isLoading) {
    return (
      <section className="labeler-workbench-page" aria-labelledby="labeler-workbench-title">
        <h1 id="labeler-workbench-title">标注台</h1>
        <PageLoading title="正在加载题目" description="正在恢复草稿、题目材料和贡献统计。" />
      </section>
    );
  }

  if (!workbench) {
    return (
      <section className="labeler-workbench-page" aria-labelledby="labeler-workbench-title">
        <PageError
          title="无法加载当前题目"
          description={errorMessage ?? '请返回任务广场重新进入标注台。'}
          actionLabel="返回任务广场"
          onReset={() => {
            window.location.assign('/labeler/market');
          }}
        />
      </section>
    );
  }

  return (
    <section className="labeler-workbench-page" aria-labelledby="labeler-workbench-title">
      <div className="workbench-topline">
        <div>
          <p className="eyebrow">标注员工作台 / {workbench.task.title}</p>
          <h1 id="labeler-workbench-title">
            {workbench.task.title} · 第 {workbench.taskItem.sortOrder} 题
          </h1>
          <p>
            模板 {workbench.task.schemaVersion} · 题目 ID {itemId ?? workbench.taskItem.id} · 奖励{' '}
            {workbench.task.rewardRule ?? '未设置'}
          </p>
        </div>
        <span className="autosave-indicator">{draftStatus}</span>
      </div>

      {statusMessage || errorMessage ? (
        <div className="task-status-message" aria-live="polite">
          {statusMessage ? <span>{statusMessage}</span> : null}
          {errorMessage ? <span role="alert">{errorMessage}</span> : null}
        </div>
      ) : null}

      <div className="workbench-layout">
        <QuestionNavigator
          workbench={workbench}
          currentIndex={0}
          totalCount={totalCount}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onJump={handleJump}
        />

        <main className="workbench-main-panel">
          <RejectNotice notice={workbench.rejectionNotice} />
          {validationMessages.length > 0 ? (
            <section className="submission-validation-summary" role="alert">
              <strong>提交前请修正以下内容</strong>
              <ul>
                {validationMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <RawDataPanel workbench={workbench} />
          <SchemaRenderer
            schema={workbench.task.schema}
            rawData={workbench.taskItem.rawData}
            value={answers}
            mode="answer"
            onChange={setAnswers}
          />
        </main>

        <ContributionStats stats={stats} history={workbench.submissionHistory} />
      </div>

      <div className="workbench-footer-actions">
        <button type="button" disabled onClick={handlePrevious}>
          ← 上一题
        </button>
        <button type="button" disabled={totalCount <= 1} onClick={handleNext}>
          下一题 →
        </button>
        <span>⌘/Ctrl + Enter 提交 · ⌘/Ctrl + S 保存 · J/K 切题 · R 报告</span>
        <button type="button" disabled={isSaving} onClick={() => void saveDraftNow('manual')}>
          保存草稿
        </button>
        <button
          className="primary-action"
          type="button"
          disabled={isSubmitting}
          onClick={() => void submitCurrent()}
        >
          提交本题 →
        </button>
      </div>
    </section>
  );
};

const RawDataPanel = ({ workbench }: { workbench: WorkbenchDto }) => {
  const rawData = workbench.taskItem.rawData;

  if (workbench.task.datasetKind === 'preference_compare') {
    return (
      <section className="workbench-raw-panel" aria-label="偏好对比材料">
        <h2>偏好对比材料</h2>
        <p>{stringValue(rawData.prompt)}</p>
        <div className="preference-compare-layout">
          <article>
            <span>回答 A</span>
            <p>{stringValue(rawData.response_a)}</p>
          </article>
          <article>
            <span>回答 B</span>
            <p>{stringValue(rawData.response_b)}</p>
          </article>
        </div>
      </section>
    );
  }

  return (
    <section className="workbench-raw-panel" aria-label="问答质量材料">
      <h2>问答质量材料</h2>
      <dl>
        <div>
          <dt>用户问题</dt>
          <dd>{stringValue(rawData.prompt)}</dd>
        </div>
        <div>
          <dt>模型回答</dt>
          <dd>{stringValue(rawData.model_answer)}</dd>
        </div>
        <div>
          <dt>参考要点</dt>
          <dd>{stringValue(rawData.reference)}</dd>
        </div>
        <div>
          <dt>期望维度</dt>
          <dd>{Array.isArray(rawData.expected_dimensions) ? rawData.expected_dimensions.join('、') : '未提供'}</dd>
        </div>
      </dl>
      <MediaMaterial rawData={rawData} />
    </section>
  );
};

const MediaMaterial = ({ rawData }: { rawData: Record<string, unknown> }) => {
  const mediaType = stringValue(rawData.media_type);
  const mediaUrl = stringValue(rawData.media_url);

  if (mediaType === 'image' && mediaUrl) {
    return <img className="workbench-media" src={mediaUrl} alt="题目媒体" />;
  }

  if (mediaType === 'video' && mediaUrl) {
    return <video className="workbench-media" src={mediaUrl} controls />;
  }

  if (mediaType === 'markdown') {
    return <pre className="workbench-markdown">{stringValue(rawData.content_markdown)}</pre>;
  }

  return null;
};

function readLocalDraft(key: string): Record<string, unknown> | null {
  if (!key) {
    return null;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? 'null') as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function stringValue(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : '未提供';
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

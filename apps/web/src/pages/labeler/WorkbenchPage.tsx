import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { getSchemaFieldKey, type SchemaField } from '@labelhub/shared';
import { PageError } from '../../components/AppErrorBoundary';
import { PageLoading } from '../../components/PageLoading';
import { ToastViewport, useToastController } from '../../components/ToastViewport';
import { applySchemaLinkage, validateSchemaAnswers } from '../../features/schema-renderer';
import { SchemaRenderer } from '../../features/schema-renderer';
import { QuestionNavigator } from '../../features/labeler/QuestionNavigator';
import { RejectNotice } from '../../features/labeler/RejectNotice';
import { listLabelerAssignments, type AssignmentStatus, type LabelerAssignmentDto } from '../../api/assignments';
import { getAssignmentWorkbench, saveDraft, type WorkbenchDto } from '../../api/drafts';
import { getLabelerStats, submitTask, type LabelerStatsDto, type TaskSubmissionDto } from '../../api/submissions';

const LABELER_ID = 'user_labeler_li_lei';

export const WorkbenchPage = () => {
  const navigate = useNavigate();
  const { taskId, itemId } = useParams<{ taskId: string; itemId: string }>();
  const [searchParams] = useSearchParams();
  const assignmentId = searchParams.get('assignmentId') ?? '';
  const [workbench, setWorkbench] = useState<WorkbenchDto | null>(null);
  const [stats, setStats] = useState<LabelerStatsDto | null>(null);
  const [taskAssignments, setTaskAssignments] = useState<LabelerAssignmentDto[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState('正在加载草稿。');
  const [fatalErrorMessage, setFatalErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTaskIds, setSubmittedTaskIds] = useState<ReadonlySet<string>>(() => new Set());
  const { dismissToast, messages, showErrorToast, showInfoToast, showStatusToast } = useToastController();
  const aiReviewPollTimerRef = useRef<number | null>(null);
  const lastSavedSnapshotRef = useRef('');
  const hydratedRef = useRef(false);
  const taskSubmitInFlightRef = useRef(false);

  const localCacheKey = assignmentId ? `labelhub.local-draft.${assignmentId}` : '';

  const clearAiReviewPolling = useCallback(() => {
    if (aiReviewPollTimerRef.current !== null) {
      window.clearTimeout(aiReviewPollTimerRef.current);
      aiReviewPollTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearAiReviewPolling, [clearAiReviewPolling]);

  useEffect(() => {
    if (!assignmentId) {
      setFatalErrorMessage('缺少领取记录 ID，无法进入标注台。');
      setIsLoading(false);
      return;
    }

    void loadWorkbench(assignmentId);
  }, [assignmentId]);

  const loadWorkbench = async (id: string) => {
    setIsLoading(true);
    try {
      const nextWorkbench = await getAssignmentWorkbench(id);
      const [nextStats, nextTaskAssignments] = await Promise.all([
        getLabelerStats({ labelerId: LABELER_ID, taskId: nextWorkbench.assignment.taskId }),
        listLabelerAssignments({ labelerId: LABELER_ID, taskId: nextWorkbench.assignment.taskId }),
      ]);
      const cachedAnswers = readLocalDraft(localCacheKey);
      const initialAnswers = cachedAnswers ?? nextWorkbench.draft?.answers ?? {};
      const flattenedFields = getFlattenedSchemaFields(nextWorkbench.task.schema.fields);
      const answerFields = getAnswerFields(flattenedFields);
      const defaultActiveField = answerFields[0] ?? flattenedFields[0] ?? null;

      setWorkbench(nextWorkbench);
      setStats(nextStats);
      setTaskAssignments(nextTaskAssignments.sort(compareLabelerAssignments));
      setAnswers(initialAnswers);
      setActiveFieldKey((current) =>
        current && answerFields.some((field) => getSchemaFieldKey(field) === current)
          ? current
          : defaultActiveField
            ? getSchemaFieldKey(defaultActiveField)
            : null,
      );
      lastSavedSnapshotRef.current = JSON.stringify(nextWorkbench.draft?.answers ?? {});
      hydratedRef.current = true;
      setDraftStatus(
        cachedAnswers ? '检测到本地未同步草稿，已恢复到当前表单。' : '草稿已载入。',
      );
      setFatalErrorMessage(null);
    } catch (error) {
      setFatalErrorMessage(error instanceof Error ? error.message : '标注台加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshWorkbenchSnapshot = useCallback(
    async (id: string): Promise<WorkbenchDto> => {
      const nextWorkbench = await getAssignmentWorkbench(id);
      const [nextStats, nextTaskAssignments] = await Promise.all([
        getLabelerStats({ labelerId: LABELER_ID, taskId: nextWorkbench.assignment.taskId }),
        listLabelerAssignments({ labelerId: LABELER_ID, taskId: nextWorkbench.assignment.taskId }),
      ]);
      const flattenedFields = getFlattenedSchemaFields(nextWorkbench.task.schema.fields);
      const answerFields = getAnswerFields(flattenedFields);
      const defaultActiveField = answerFields[0] ?? flattenedFields[0] ?? null;

      setWorkbench(nextWorkbench);
      setStats(nextStats);
      setTaskAssignments(nextTaskAssignments.sort(compareLabelerAssignments));
      setActiveFieldKey((current) =>
        current && answerFields.some((field) => getSchemaFieldKey(field) === current)
          ? current
          : defaultActiveField
            ? getSchemaFieldKey(defaultActiveField)
            : null,
      );
      return nextWorkbench;
    },
    [],
  );

  const startAiReviewPolling = useCallback(
    (submissionId: string) => {
      if (!assignmentId) {
        return;
      }

      clearAiReviewPolling();
      let attempt = 0;

      const poll = async () => {
        attempt += 1;
        try {
          const nextWorkbench = await refreshWorkbenchSnapshot(assignmentId);
          const latestSubmission = nextWorkbench.submissionHistory.find((submission) => submission.id === submissionId);
          const statusMessageForReview = latestSubmission ? getAiReviewStatusMessage(latestSubmission) : null;

          if (statusMessageForReview) {
            showStatusToast(statusMessageForReview);
            aiReviewPollTimerRef.current = null;
            return;
          }

          if (attempt < AI_REVIEW_MAX_POLL_ATTEMPTS) {
            aiReviewPollTimerRef.current = window.setTimeout(poll, AI_REVIEW_POLL_INTERVAL_MS);
            return;
          }

          aiReviewPollTimerRef.current = null;
        } catch (error) {
          if (attempt >= AI_REVIEW_MAX_POLL_ATTEMPTS) {
            showErrorToast(error instanceof Error ? error.message : 'AI 预审结果刷新失败。');
            aiReviewPollTimerRef.current = null;
            return;
          }

          aiReviewPollTimerRef.current = window.setTimeout(poll, AI_REVIEW_POLL_INTERVAL_MS);
        }
      };

      aiReviewPollTimerRef.current = window.setTimeout(poll, AI_REVIEW_POLL_INTERVAL_MS);
    },
    [assignmentId, clearAiReviewPolling, refreshWorkbenchSnapshot, showErrorToast, showStatusToast],
  );

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
        if (source === 'manual') {
          showStatusToast('草稿已保存。');
        }
        return true;
      } catch (error) {
        window.localStorage.setItem(localCacheKey, JSON.stringify(answers));
        setDraftStatus('草稿保存失败，已写入本地临时缓存。');
        showErrorToast(error instanceof Error ? error.message : '草稿保存失败。');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [answers, localCacheKey, showErrorToast, showStatusToast, workbench],
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

  const hasSubmittedCurrentTask = workbench ? submittedTaskIds.has(workbench.task.id) : false;
  const hasSubmittableCurrentTask = useMemo(
    () => (workbench ? hasSubmittableTaskAssignments(workbench, taskAssignments) : false),
    [taskAssignments, workbench],
  );
  const isTaskSubmitDisabled =
    isSubmitting || hasSubmittedCurrentTask || !hasSubmittableCurrentTask;

  const submitCurrent = useCallback(async () => {
    if (!workbench) {
      return;
    }

    if (taskSubmitInFlightRef.current || hasSubmittedCurrentTask || !hasSubmittableCurrentTask) {
      showStatusToast('当前任务已提交，请等待审核结果。');
      return;
    }

    const linkageResult = applySchemaLinkage(workbench.task.schema, answers);
    const errors = validateSchemaAnswers(workbench.task.schema, linkageResult.answers, linkageResult);
    if (errors.length > 0) {
      const firstError = errors[0]?.message;
      showErrorToast(
        firstError
          ? `提交前请修正 ${errors.length.toLocaleString()} 项内容：${firstError}`
          : '提交前请修正表单内容。',
      );
      return;
    }

    taskSubmitInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const draftSaved = await saveDraftNow('manual');
      if (!draftSaved) {
        taskSubmitInFlightRef.current = false;
        return;
      }

      const taskSubmission = await submitTask({
        taskId: workbench.assignment.taskId,
        labelerId: LABELER_ID,
        actorId: LABELER_ID,
        currentAssignmentId: workbench.assignment.id,
        currentAnswers: linkageResult.answers,
        idempotencyKey: createTaskSubmissionIdempotencyKey(workbench, linkageResult.answers),
      });
      const submissionsByAssignmentId = new Map(
        taskSubmission.submissions.map((submission) => [submission.assignmentId, submission]),
      );
      const currentSubmission = submissionsByAssignmentId.get(workbench.assignment.id);
      setWorkbench((current) =>
        current
          ? {
              ...current,
              assignment: { ...current.assignment, status: 'SUBMITTED' },
              submissionHistory: currentSubmission
                ? [
                    {
                      id: currentSubmission.id,
                      status: currentSubmission.status,
                      round: currentSubmission.round,
                      answers: currentSubmission.answers,
                      schemaVersion: currentSubmission.schemaVersion,
                      submittedAt: currentSubmission.submittedAt,
                      reviewRecords: [],
                    },
                    ...current.submissionHistory,
                  ]
                : current.submissionHistory,
            }
          : current,
      );
      showStatusToast(formatTaskSubmissionStatusMessage(taskSubmission));
      setSubmittedTaskIds((current) => new Set(current).add(workbench.task.id));
      setDraftStatus(
        currentSubmission
          ? `提交前草稿已同步 ${formatTime(currentSubmission.submittedAt)}`
          : '提交前草稿已同步。',
      );
      setTaskAssignments((current) =>
        current.map((assignment) => {
          const submission = submissionsByAssignmentId.get(assignment.assignmentId);

          return submission
            ? {
                ...assignment,
                status: 'SUBMITTED',
                latestSubmissionStatus: submission.status,
                latestSubmittedAt: submission.submittedAt,
                round: submission.round,
              }
            : assignment;
        }),
      );
      setStats(await getLabelerStats({ labelerId: LABELER_ID, taskId: workbench.assignment.taskId }));
      if (currentSubmission && AI_REVIEW_PENDING_STATUSES.has(currentSubmission.status)) {
        startAiReviewPolling(currentSubmission.id);
      }
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '提交失败。');
    } finally {
      taskSubmitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }, [
    answers,
    hasSubmittedCurrentTask,
    hasSubmittableCurrentTask,
    saveDraftNow,
    showErrorToast,
    showStatusToast,
    startAiReviewPolling,
    workbench,
  ]);

  const orderedTaskAssignments = useMemo(
    () => [...taskAssignments].sort(compareLabelerAssignments),
    [taskAssignments],
  );
  const currentAssignmentIndex = useMemo(() => {
    const index = orderedTaskAssignments.findIndex((assignment) =>
      assignment.assignmentId === assignmentId ||
      assignment.taskItemId === itemId,
    );

    if (index >= 0) {
      return index;
    }

    const sortOrderIndex = (workbench?.taskItem.sortOrder ?? 1) - 1;
    return Math.max(0, sortOrderIndex);
  }, [assignmentId, itemId, orderedTaskAssignments, workbench?.taskItem.sortOrder]);
  const totalCount = useMemo(
    () => Math.max(1, orderedTaskAssignments.length || stats?.totalAssignments || 1),
    [orderedTaskAssignments.length, stats?.totalAssignments],
  );
  const currentQuestionIndex = Math.min(currentAssignmentIndex, totalCount - 1);
  const currentQuestionRequiredComplete = useMemo(
    () => (workbench ? areRequiredAnswerFieldsComplete(workbench, answers) : false),
    [answers, workbench],
  );
  const navigatorItems = useMemo(
    () =>
      orderedTaskAssignments.map((assignment, index) => ({
        label: assignment.externalId,
        statusLabel:
          index === currentQuestionIndex
            ? resolveCurrentQuestionStatusLabel(assignment.status, currentQuestionRequiredComplete)
            : ASSIGNMENT_STATUS_LABELS[assignment.status] ?? assignment.status,
      })),
    [currentQuestionIndex, currentQuestionRequiredComplete, orderedTaskAssignments],
  );

  const navigateToAssignment = useCallback(
    (assignment: LabelerAssignmentDto) => {
      navigate(workbenchHref(assignment));
    },
    [navigate],
  );

  const handlePrevious = useCallback(() => {
    const previousAssignment = orderedTaskAssignments[currentQuestionIndex - 1];
    if (!previousAssignment) {
      showInfoToast('已经是当前任务的第一题。');
      return;
    }

    navigateToAssignment(previousAssignment);
  }, [currentQuestionIndex, navigateToAssignment, orderedTaskAssignments, showInfoToast]);

  const handleNext = useCallback(() => {
    const nextAssignment = orderedTaskAssignments[currentQuestionIndex + 1];
    if (!nextAssignment) {
      showInfoToast('已经是当前任务的最后一题。');
      return;
    }

    navigateToAssignment(nextAssignment);
  }, [currentQuestionIndex, navigateToAssignment, orderedTaskAssignments, showInfoToast]);

  const handleJump = useCallback((index: number) => {
    const targetAssignment = orderedTaskAssignments[index];
    if (!targetAssignment) {
      showErrorToast(`未找到第 ${index + 1} 题。`);
      return;
    }

    navigateToAssignment(targetAssignment);
  }, [navigateToAssignment, orderedTaskAssignments, showErrorToast]);

  const reportCurrentIssue = useCallback(() => {
    showInfoToast('请在本题备注中说明异常，提交任务后会随答案进入审核。');
  }, [showInfoToast]);

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

  const schemaFields = useMemo(
    () => (workbench ? getFlattenedSchemaFields(workbench.task.schema.fields) : []),
    [workbench],
  );
  const activeField = useMemo(
    () =>
      schemaFields.find((field) => getSchemaFieldKey(field) === activeFieldKey) ??
      getAnswerFields(schemaFields)[0] ??
      schemaFields[0] ??
      null,
    [activeFieldKey, schemaFields],
  );
  const aiReviewReport = useMemo(
    () => (workbench ? resolveLatestAiReviewReport(workbench.submissionHistory) : null),
    [workbench],
  );
  const focusAnnotationForm = useCallback(() => {
    const form = document.querySelector<HTMLElement>('.schema-renderer');
    form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form
      ?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
      )
      ?.focus();
  }, []);

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
          description={fatalErrorMessage ?? '请返回任务广场重新进入标注台。'}
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
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <div className="workbench-topline">
        <div>
          <h1 id="labeler-workbench-title">{workbench.task.title}</h1>
          <p className="workbench-meta-line">
            <span>第 {workbench.taskItem.sortOrder} 题</span>
          </p>
        </div>
        <div className="workbench-topline__actions">
          <span className="autosave-indicator">{draftStatus}</span>
        </div>
      </div>

      <div className="workbench-layout annotation-designer-layout">
        <aside className="annotation-navigation-panel" aria-label="题目导航">
          <QuestionNavigator
            workbench={workbench}
            currentIndex={currentQuestionIndex}
            totalCount={totalCount}
            items={navigatorItems}
            onJump={handleJump}
          />
        </aside>

        <main className="workbench-main-panel annotation-canvas-panel" aria-label="标注画布">
          <div className="annotation-canvas-tabs annotation-canvas-toolbar" aria-label="标注操作栏">
            <span className="workbench-reward-pill">{workbench.task.rewardRule ?? '未设置'}</span>
            <button className="annotation-canvas-toolbar__report" type="button" onClick={reportCurrentIssue}>
              报告题目
            </button>
          </div>
          <div className="annotation-canvas-scroll">
            <RejectNotice notice={workbench.rejectionNotice} />
            <AiReviewReport report={aiReviewReport} onRelabel={focusAnnotationForm} />
            <RawDataPanel workbench={workbench} />
            <SchemaRenderer
              schema={workbench.task.schema}
              rawData={workbench.taskItem.rawData}
              value={answers}
              mode="answer"
              onChange={setAnswers}
              activeFieldKey={activeField ? getSchemaFieldKey(activeField) : activeFieldKey}
              onActiveFieldChange={setActiveFieldKey}
            />
          </div>
        </main>

        <LabelerWorkbenchInfoPanel stats={stats} workbench={workbench} />
      </div>

      <div className="workbench-footer-actions">
        <button type="button" disabled={currentQuestionIndex <= 0} onClick={handlePrevious}>
          ← 上一题
        </button>
        <button type="button" disabled={currentQuestionIndex >= totalCount - 1} onClick={handleNext}>
          下一题 →
        </button>
        <button type="button" disabled={isSaving} onClick={() => void saveDraftNow('manual')}>
          保存草稿
        </button>
        <button
          className="primary-action"
          type="button"
          disabled={isTaskSubmitDisabled}
          onClick={() => void submitCurrent()}
        >
          提交任务 →
        </button>
      </div>
    </section>
  );
};

type AiReviewReportData = {
  submissionRound: number;
  submittedAt: string;
  decision: string | null;
  comment: string | null;
  scores: Record<string, unknown>;
};

const AiReviewReport = ({
  report,
  onRelabel,
}: {
  report: AiReviewReportData | null;
  onRelabel: () => void;
}) => {
  if (!report) {
    return null;
  }

  const overallScore = scoreValue(report.scores.overall);
  const reason = typeof report.scores.reason === 'string' ? report.scores.reason : '';
  const decisionClass = report.decision === 'pass' ? 'is-pass' : report.decision === 'manual' ? 'is-manual' : 'is-reject';

  return (
    <section className="ai-review-report" aria-label="AI 预审报告">
      <div className="ai-review-report__header">
        <div>
          <h2>AI 预审报告</h2>
          <p>
            第 {report.submissionRound} 轮 · {formatDateTime(report.submittedAt)}
          </p>
        </div>
        <div className="ai-review-report__summary">
          <span className={`ai-review-report__decision ${decisionClass}`}>
            {AI_REVIEW_DECISION_LABELS[report.decision ?? ''] ?? '待判断'}
          </span>
          <strong>综合 {overallScore ?? '-'}</strong>
        </div>
      </div>

      <div className="ai-review-report__scores" aria-label="AI 评分维度">
        {AI_REVIEW_SCORE_DIMENSIONS.map((dimension) => {
          const value = scoreValue(report.scores[dimension.key]);

          return (
            <div className="ai-review-report__score-row" key={dimension.key}>
              <span>{dimension.label}</span>
              <div className="ai-review-report__score-track" aria-hidden="true">
                <span style={{ width: `${value ?? 0}%` }} />
              </div>
              <strong>{value ?? '-'}</strong>
            </div>
          );
        })}
      </div>

      {report.comment || reason ? (
        <div className="ai-review-report__comment">
          <span>AI 评语</span>
          <p>{report.comment ?? reason}</p>
          {report.comment && reason && report.comment !== reason ? <small>{reason}</small> : null}
        </div>
      ) : null}

      <div className="ai-review-report__actions">
        <button type="button" onClick={onRelabel}>
          重新标注
        </button>
      </div>
    </section>
  );
};

const LabelerWorkbenchInfoPanel = ({
  stats,
  workbench,
}: {
  stats: LabelerStatsDto | null;
  workbench: WorkbenchDto;
}) => {
  const historyEntries = buildQuestionHistory(workbench);
  const rejectedCount = Math.max(stats?.rejectedCount ?? 0, stats?.needsRevisionCount ?? 0);

  return (
    <aside className="labeler-workbench-info-panel" aria-label="标注信息">
      <section className="labeler-info-section">
        <h2>我的贡献（本任务）</h2>
        <div className="labeler-info-stats" aria-label="我的贡献统计">
          <div>
            <span>已提交</span>
            <strong className="labeler-info-stat__value--submitted">
              {stats?.submittedCount ?? 0}
            </strong>
          </div>
          <div>
            <span>通过</span>
            <strong className="labeler-info-stat__value--approved">
              {stats?.approvedCount ?? 0}
            </strong>
          </div>
          <div>
            <span>打回</span>
            <strong className="labeler-info-stat__value--rejected">{rejectedCount}</strong>
          </div>
        </div>
      </section>

      <section className="labeler-info-section">
        <h2>本题历史</h2>
        <ol className="labeler-item-history" aria-label="本题历史列表">
          {historyEntries.map((entry) => (
            <li
              className={entry.isCurrent ? 'labeler-item-history__row is-current' : 'labeler-item-history__row'}
              key={entry.id}
            >
              <span>{entry.label}</span>
              {entry.dateTime ? (
                <time dateTime={entry.dateTime}>{entry.timeText}</time>
              ) : (
                <time>{entry.timeText}</time>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="labeler-info-section">
        <h2>快捷键</h2>
        <ul className="labeler-shortcut-list">
          <li>⌘+Enter 提交本题</li>
          <li>⌘+S 保存草稿</li>
          <li>← / → 上一题 / 下一题</li>
          <li>J 跳题 · R 报告题目</li>
        </ul>
      </section>
    </aside>
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

  if (workbench.task.datasetKind !== 'qa_quality') {
    return null;
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

const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  ASSIGNED: '待标注',
  IN_PROGRESS: '进行中',
  SUBMITTED: '已提交',
  UNDER_RECHECK: '复审中',
  FINAL_PENDING: '待完成',
  FINAL_APPROVED: '已完成',
  NEEDS_REVISION: '待修改',
  CANCELLED: '已取消',
};

type QuestionHistoryEntry = {
  id: string;
  label: string;
  timeText: string;
  dateTime?: string;
  isCurrent?: boolean;
};

const AI_REVIEW_DECISION_LABELS: Record<string, string> = {
  pass: '建议通过',
  reject: '建议打回',
  manual: '转人工复核',
};

const AI_REVIEW_SCORE_DIMENSIONS = [
  { key: 'relevance', label: '相关性' },
  { key: 'accuracy', label: '准确性' },
  { key: 'format', label: '格式合规' },
  { key: 'safety', label: '安全性' },
] as const;

const AI_REVIEW_POLL_INTERVAL_MS = 300;
const AI_REVIEW_MAX_POLL_ATTEMPTS = 10;
const AI_REVIEW_PENDING_STATUSES = new Set(['AI_QUEUED', 'AI_REVIEWING']);

function formatTaskSubmissionStatusMessage(taskSubmission: TaskSubmissionDto): string {
  const submittedCount = taskSubmission.submittedCount.toLocaleString();
  const hasAiPreReviewQueue = taskSubmission.submissions.some((submission) =>
    AI_REVIEW_PENDING_STATUSES.has(submission.status),
  );

  return hasAiPreReviewQueue
    ? `提交任务成功，${submittedCount} 条标注已进入 AI 预审队列。`
    : `提交任务成功，${submittedCount} 条标注已提交至人工复审。`;
}

function buildQuestionHistory(workbench: WorkbenchDto): QuestionHistoryEntry[] {
  const entries = workbench.submissionHistory.flatMap((submission) => {
    const submissionEntries: QuestionHistoryEntry[] = [
      {
        id: `${submission.id}:submit`,
        label: `${formatUserName(workbench.assignment.assigneeId)} · 提交`,
        timeText: formatHistoryTime(submission.submittedAt),
        dateTime: submission.submittedAt,
      },
    ];

    const reviewEntries = [...submission.reviewRecords]
      .sort((first, second) => first.createdAt.localeCompare(second.createdAt))
      .map((record, index) => {
        const isRecheck = isHumanRecheckRecord(record);
        const actorName = isRecheck
          ? formatReviewerName(record.assignedReviewerId)
          : 'AI 预审';

        return {
          id: `${submission.id}:review:${index}`,
          label: `${actorName} · ${formatReviewAction(record, isRecheck)}`,
          timeText: formatHistoryTime(record.createdAt),
          dateTime: record.createdAt,
        };
      });

    return [...submissionEntries, ...reviewEntries];
  });

  entries.sort((first, second) => (first.dateTime ?? '').localeCompare(second.dateTime ?? ''));

  return [
    ...entries,
    {
      id: 'current',
      label: `${formatUserName(workbench.assignment.assigneeId)} · ${formatCurrentHistoryAction(workbench)}`,
      timeText: '当前',
      isCurrent: true,
    },
  ];
}

function resolveLatestAiReviewReport(history: WorkbenchDto['submissionHistory']): AiReviewReportData | null {
  for (const submission of history) {
    const reviewRecord = submission.reviewRecords.find((record) =>
      record.decision === 'reject' || record.decision === 'manual' || record.decision === 'pass',
    );

    if (reviewRecord) {
      return {
        submissionRound: submission.round,
        submittedAt: submission.submittedAt,
        decision: reviewRecord.decision,
        comment: reviewRecord.comment ?? null,
        scores: reviewRecord.scores,
      };
    }
  }

  return null;
}

function isHumanRecheckRecord(
  record: WorkbenchDto['submissionHistory'][number]['reviewRecords'][number],
): boolean {
  return (
    record.reviewerType === 'HUMAN' ||
    record.stage === 'RECHECK' ||
    record.stage === 'FINAL' ||
    record.decision === 'recheck_pass' ||
    record.decision === 'revise_pass'
  );
}

function formatReviewAction(
  record: WorkbenchDto['submissionHistory'][number]['reviewRecords'][number],
  isRecheck: boolean,
): string {
  if (isRecheck) {
    if (record.decision === 'recheck_pass' || record.decision === 'revise_pass' || record.decision === 'pass') {
      return '复审通过';
    }

    if (record.decision === 'reject' || record.decision === 'recheck_reject') {
      return '复审打回';
    }

    if (record.decision === 'assigned') {
      return '开始复审';
    }

    return '复审';
  }

  if (record.decision === 'pass') {
    return '通过';
  }

  if (record.decision === 'manual') {
    return '转人工';
  }

  if (record.decision === 'reject') {
    return '打回';
  }

  return '预审';
}

function formatCurrentHistoryAction(workbench: WorkbenchDto): string {
  if (workbench.assignment.status === 'NEEDS_REVISION' || workbench.rejectionNotice) {
    return '修改中';
  }

  if (workbench.assignment.status === 'SUBMITTED') {
    return '已提交';
  }

  if (workbench.assignment.status === 'UNDER_RECHECK') {
    return '复审中';
  }

  if (workbench.assignment.status === 'FINAL_APPROVED') {
    return '已完成';
  }

  if (workbench.assignment.status === 'FINAL_PENDING') {
    return '待终审';
  }

  if (workbench.assignment.status === 'CANCELLED') {
    return '已取消';
  }

  return '标注中';
}

function getAiReviewStatusMessage(submission: WorkbenchDto['submissionHistory'][number]): string | null {
  const aiDecision = submission.reviewRecords.find((record) => record.decision)?.decision;

  if (aiDecision === 'reject' || submission.status === 'NEEDS_REVISION') {
    return 'AI 预审未通过，请根据报告修改后重新提交。';
  }

  if (aiDecision === 'manual') {
    return 'AI 预审需要人工复核，已流转到复审队列。';
  }

  if (
    aiDecision === 'pass' ||
    submission.status === 'AI_PASSED' ||
    submission.status === 'HUMAN_PENDING' ||
    submission.status === 'UNDER_RECHECK'
  ) {
    return 'AI 预审通过，已流转到人工复审。';
  }

  return AI_REVIEW_PENDING_STATUSES.has(submission.status) ? null : 'AI 预审已完成。';
}

function scoreValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : null;
  }

  return null;
}

function getFlattenedSchemaFields(fields: readonly SchemaField[]): SchemaField[] {
  return fields.flatMap((field) => {
    if (field.type === 'group') {
      return [field, ...getFlattenedSchemaFields(field.fields ?? [])];
    }

    if (field.type === 'tabs') {
      return [
        field,
        ...(field.tabs ?? []).flatMap((tab) => getFlattenedSchemaFields(tab.fields)),
      ];
    }

    return [field];
  });
}

function getAnswerFields(fields: readonly SchemaField[]): SchemaField[] {
  return fields.filter((field) =>
    !['show_item', 'llm_assist', 'group', 'tabs'].includes(field.type),
  );
}

function areRequiredAnswerFieldsComplete(workbench: WorkbenchDto, answers: Record<string, unknown>): boolean {
  const linkageResult = applySchemaLinkage(workbench.task.schema, answers);
  const answerFields = getAnswerFields(getFlattenedSchemaFields(workbench.task.schema.fields));

  return answerFields.every((field) => {
    const fieldKey = getSchemaFieldKey(field);
    const isDisabled = linkageResult.disabledFieldKeys.has(fieldKey);
    const isHidden = linkageResult.hiddenFieldKeys.has(fieldKey) && !field.validateWhenHidden;
    const isRequired = Boolean(
      field.required || field.validation?.required || linkageResult.requiredFieldKeys.has(fieldKey),
    );

    if (!isRequired || isDisabled || isHidden) {
      return true;
    }

    return !isEmptyAnswerValue(linkageResult.answers[fieldKey]);
  });
}

function resolveCurrentQuestionStatusLabel(status: AssignmentStatus, requiredComplete: boolean): string {
  if (isSubmittableAssignmentStatus(status)) {
    return requiredComplete ? '已完成' : '进行中';
  }

  return ASSIGNMENT_STATUS_LABELS[status] ?? status;
}

function isEmptyAnswerValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function compareLabelerAssignments(first: LabelerAssignmentDto, second: LabelerAssignmentDto): number {
  if (first.taskItemSortOrder !== second.taskItemSortOrder) {
    return first.taskItemSortOrder - second.taskItemSortOrder;
  }

  return first.externalId.localeCompare(second.externalId, 'zh-CN', { numeric: true });
}

function workbenchHref(assignment: LabelerAssignmentDto): string {
  return `/labeler/tasks/${assignment.taskId}/items/${assignment.taskItemId}?assignmentId=${assignment.assignmentId}`;
}

function hasSubmittableTaskAssignments(
  workbench: WorkbenchDto,
  taskAssignments: readonly LabelerAssignmentDto[],
): boolean {
  return (
    isSubmittableAssignmentStatus(workbench.assignment.status) ||
    taskAssignments.some((assignment) => isSubmittableAssignmentStatus(assignment.status))
  );
}

function isSubmittableAssignmentStatus(status: AssignmentStatus): boolean {
  return status === 'ASSIGNED' || status === 'IN_PROGRESS' || status === 'NEEDS_REVISION';
}

function createTaskSubmissionIdempotencyKey(
  workbench: WorkbenchDto,
  answers: Record<string, unknown>,
): string {
  const nextRound =
    Math.max(0, ...workbench.submissionHistory.map((submission) => submission.round)) + 1;

  return createClientIdempotencyKey(
    'task-submit',
    `${workbench.assignment.taskId}:${LABELER_ID}:${workbench.assignment.id}`,
    nextRound,
    answers,
  );
}

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

function formatDateTime(value: string): string {
  return value.slice(0, 16).replace('T', ' ');
}

function formatHistoryTime(value: string): string {
  return value.slice(5, 16).replace('T', ' ');
}

function formatUserName(userId: string | null | undefined): string {
  if (userId === 'user_labeler_li_lei') {
    return '李雷';
  }

  return '标注员';
}

function formatReviewerName(reviewerId: string | null | undefined): string {
  if (reviewerId === 'user_reviewer_wang_fang' || reviewerId === 'reviewer_1') {
    return '王芳';
  }

  if (reviewerId === 'reviewer_2') {
    return '复审员 2';
  }

  return '复审员';
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

function createClientIdempotencyKey(
  prefix: string,
  assignmentId: string,
  round: number,
  answers: Record<string, unknown>,
): string {
  return `${prefix}:${assignmentId}:${round}:${stableHash(JSON.stringify(answers))}`;
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

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
import { listTasks, type TaskDto } from '../../api/tasks';
import { createTaskDisplayIdMap } from '../owner/taskDisplayId';

const LABELER_ID = 'user_labeler_li_lei';
type WorkbenchNavigationState = {
  source?: 'my-data-table';
  taskDisplayId?: string;
  taskTitle?: string;
};
type WorkbenchCanvasTab = 'annotation' | 'ai-review';
type WorkbenchTaskIdentity = {
  displayId: string;
  title: string;
};

export const WorkbenchPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { itemId } = useParams<{ itemId: string }>();
  const [searchParams] = useSearchParams();
  const assignmentId = searchParams.get('assignmentId') ?? '';
  const [workbench, setWorkbench] = useState<WorkbenchDto | null>(null);
  const [stats, setStats] = useState<LabelerStatsDto | null>(null);
  const [taskAssignments, setTaskAssignments] = useState<LabelerAssignmentDto[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState('正在加载草稿。');
  const [draftStatusRevision, setDraftStatusRevision] = useState(0);
  const [localQuestionProgress, setLocalQuestionProgress] = useState<Record<string, QuestionProgressState>>({});
  const [fatalErrorMessage, setFatalErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeCanvasTab, setActiveCanvasTab] = useState<WorkbenchCanvasTab>('annotation');
  const [submittedTaskIds, setSubmittedTaskIds] = useState<ReadonlySet<string>>(() => new Set());
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const [taskIdentity, setTaskIdentity] = useState<WorkbenchTaskIdentity | null>(null);
  const { dismissToast, messages, showErrorToast, showInfoToast, showStatusToast } = useToastController();
  const aiReviewPollTimerRef = useRef<number | null>(null);
  const lastSavedSnapshotRef = useRef('');
  const hydratedRef = useRef(false);
  const loadWorkbenchRequestRef = useRef(0);
  const taskSubmitInFlightRef = useRef(false);
  const workbenchNavigationState = useMemo(
    () => (location.state as WorkbenchNavigationState | null),
    [location.state],
  );

  const localCacheKey = createLocalDraftCacheKey(assignmentId);

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
    const requestId = loadWorkbenchRequestRef.current + 1;
    loadWorkbenchRequestRef.current = requestId;
    setIsLoading(true);
    try {
      const nextWorkbench = await getAssignmentWorkbench(id);
      const [nextStats, nextTaskAssignments, tasksForIdentity] = await Promise.all([
        getLabelerStats({ labelerId: LABELER_ID, taskId: nextWorkbench.assignment.taskId }),
        listLabelerAssignments({ labelerId: LABELER_ID, taskId: nextWorkbench.assignment.taskId }),
        listTasks(),
      ]);

      if (requestId !== loadWorkbenchRequestRef.current) {
        return;
      }

      const nextLocalCacheKey = createLocalDraftCacheKey(id);
      const cachedAnswers = readLocalDraft(nextLocalCacheKey);
      const initialAnswers = cachedAnswers ?? nextWorkbench.draft?.answers ?? {};
      const flattenedFields = getFlattenedSchemaFields(nextWorkbench.task.schema.fields);
      const answerFields = getAnswerFields(flattenedFields);
      const defaultActiveField = answerFields[0] ?? flattenedFields[0] ?? null;

      setWorkbench(nextWorkbench);
      setStats(nextStats);
      setTaskAssignments(nextTaskAssignments.sort(compareLabelerAssignments));
      setTaskIdentity(resolveWorkbenchTaskIdentity(
        nextWorkbench,
        nextTaskAssignments,
        Array.isArray(tasksForIdentity) ? tasksForIdentity : [],
        workbenchNavigationState,
      ));
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
        cachedAnswers ? '检测到本地未同步草稿，已恢复到当前表单。' : '草稿已载入',
      );
      setFatalErrorMessage(null);
    } catch (error) {
      if (requestId !== loadWorkbenchRequestRef.current) {
        return;
      }
      setFatalErrorMessage(error instanceof Error ? error.message : '标注台加载失败。');
    } finally {
      if (requestId === loadWorkbenchRequestRef.current) {
        setIsLoading(false);
      }
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
    async (source: 'auto' | 'manual' | 'submit'): Promise<boolean> => {
      if (!workbench) {
        return false;
      }

      if (!isEditableAssignmentStatus(workbench.assignment.status)) {
        if (source === 'manual') {
          showInfoToast('当前题目已提交，暂不支持保存草稿。');
        }

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
            : source === 'manual'
              ? `草稿已手动保存 ${formatTime(draft.updatedAt)}`
              : `提交前草稿已同步 ${formatTime(draft.updatedAt)}`,
        );
        setDraftStatusRevision((current) => current + 1);
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
    [answers, localCacheKey, showErrorToast, showInfoToast, showStatusToast, workbench],
  );

  useEffect(() => {
    if (!hydratedRef.current || !workbench) {
      return;
    }

    const snapshot = JSON.stringify(answers);
    if (snapshot === lastSavedSnapshotRef.current) {
      return;
    }

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
  const isCurrentQuestionEditable = workbench
    ? !hasSubmittedCurrentTask && isEditableAssignmentStatus(workbench.assignment.status)
    : false;
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
    const submitAnswers = linkageResult.normalizedAnswers;
    const errors = validateSchemaAnswers(workbench.task.schema, submitAnswers, linkageResult);
    if (errors.length > 0) {
      const firstError = errors[0]?.message;
      setActiveFieldKey(errors[0]?.fieldKey ?? null);
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
      const draftSaved = await saveDraftNow('submit');
      if (!draftSaved) {
        taskSubmitInFlightRef.current = false;
        return;
      }

      const taskSubmission = await submitTask({
        taskId: workbench.assignment.taskId,
        labelerId: LABELER_ID,
        actorId: LABELER_ID,
        currentAssignmentId: workbench.assignment.id,
        currentAnswers: submitAnswers,
        idempotencyKey: createTaskSubmissionIdempotencyKey(workbench, submitAnswers),
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
  const isWorkbenchForCurrentRoute = Boolean(
    workbench &&
      (workbench.assignment.id === assignmentId || workbench.taskItem.id === itemId),
  );
  const navigationAssignmentId = workbench && !isWorkbenchForCurrentRoute ? workbench.assignment.id : assignmentId;
  const navigationItemId = workbench && !isWorkbenchForCurrentRoute ? workbench.taskItem.id : itemId;
  const routeAssignmentIndex = useMemo(() => {
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
  const currentAssignmentIndex = useMemo(() => {
    const index = orderedTaskAssignments.findIndex((assignment) =>
      assignment.assignmentId === navigationAssignmentId ||
      assignment.taskItemId === navigationItemId,
    );

    if (index >= 0) {
      return index;
    }

    const sortOrderIndex = (workbench?.taskItem.sortOrder ?? 1) - 1;
    return Math.max(0, sortOrderIndex);
  }, [navigationAssignmentId, navigationItemId, orderedTaskAssignments, workbench?.taskItem.sortOrder]);
  const totalCount = useMemo(
    () => Math.max(1, orderedTaskAssignments.length || stats?.totalAssignments || 1),
    [orderedTaskAssignments.length, stats?.totalAssignments],
  );
  const routeQuestionIndex = Math.min(routeAssignmentIndex, totalCount - 1);
  const currentQuestionIndex = Math.min(currentAssignmentIndex, totalCount - 1);
  const currentQuestionProgress = useMemo(
    () => (workbench ? resolveAnswerProgressState(workbench, answers) : 'empty'),
    [answers, workbench],
  );
  const currentTaskDisplayId = workbench
    ? taskIdentity?.displayId.trim() ||
      workbenchNavigationState?.taskDisplayId?.trim() ||
      workbench.assignment.taskId
    : workbenchNavigationState?.taskDisplayId?.trim() || '';
  const currentTaskTitle = workbench
    ? taskIdentity?.title.trim() ||
      workbenchNavigationState?.taskTitle?.trim() ||
      workbench.task.title
    : workbenchNavigationState?.taskTitle?.trim() || '标注台';
  const deadlineCountdown = workbench
    ? formatDeadlineCountdown(workbench.task.deadline, currentTimeMs)
    : '';

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTimeMs(Date.now()), COUNTDOWN_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!workbench || !isWorkbenchForCurrentRoute || !isSubmittableAssignmentStatus(workbench.assignment.status)) {
      return;
    }

    setLocalQuestionProgress((current) => {
      const assignmentKey = workbench.assignment.id;
      if (current[assignmentKey] === currentQuestionProgress) {
        return current;
      }

      return {
        ...current,
        [assignmentKey]: currentQuestionProgress,
      };
    });
  }, [
    currentQuestionProgress,
    isWorkbenchForCurrentRoute,
    workbench?.assignment.id,
    workbench?.assignment.status,
  ]);

  const navigatorItems = useMemo(
    () =>
      orderedTaskAssignments.map((assignment, index) => ({
        label: assignment.externalId,
        statusLabel:
          index === currentQuestionIndex && isWorkbenchForCurrentRoute
            ? resolveCurrentQuestionStatusLabel(assignment.status, currentQuestionProgress)
            : resolveNavigationQuestionStatusLabel(
                assignment,
                localQuestionProgress[assignment.assignmentId],
                workbench?.task.schema,
              ),
      })),
    [
      currentQuestionIndex,
      currentQuestionProgress,
      isWorkbenchForCurrentRoute,
      localQuestionProgress,
      orderedTaskAssignments,
      workbench?.task.schema,
    ],
  );

  const navigateToAssignment = useCallback(
    (assignment: LabelerAssignmentDto) => {
      navigate(workbenchHref(assignment), {
        state: {
          ...(workbenchNavigationState?.source ? { source: workbenchNavigationState.source } : {}),
          taskDisplayId: currentTaskDisplayId || assignment.taskId,
          taskTitle: currentTaskTitle || assignment.taskTitle,
        } satisfies WorkbenchNavigationState,
      });
    },
    [currentTaskDisplayId, currentTaskTitle, navigate, workbenchNavigationState?.source],
  );

  const handlePrevious = useCallback(() => {
    const previousAssignment = orderedTaskAssignments[routeQuestionIndex - 1];
    if (!previousAssignment) {
      showInfoToast('已经是当前任务的第一题。');
      return;
    }

    navigateToAssignment(previousAssignment);
  }, [navigateToAssignment, orderedTaskAssignments, routeQuestionIndex, showInfoToast]);

  const handleNext = useCallback(() => {
    const nextAssignment = orderedTaskAssignments[routeQuestionIndex + 1];
    if (!nextAssignment) {
      showInfoToast('已经是当前任务的最后一题。');
      return;
    }

    navigateToAssignment(nextAssignment);
  }, [navigateToAssignment, orderedTaskAssignments, routeQuestionIndex, showInfoToast]);

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
  const hasAiReviewReport = Boolean(aiReviewReport);
  const focusAnnotationForm = useCallback(() => {
    const form = document.querySelector<HTMLElement>('.schema-renderer');
    form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form
      ?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]',
      )
      ?.focus();
  }, []);
  const openAnnotationForm = useCallback(() => {
    setActiveCanvasTab('annotation');
    window.setTimeout(focusAnnotationForm, 0);
  }, [focusAnnotationForm]);

  useEffect(() => {
    if (!hasAiReviewReport && activeCanvasTab === 'ai-review') {
      setActiveCanvasTab('annotation');
    }
  }, [activeCanvasTab, hasAiReviewReport]);

  const workbenchPageEnterClass = useMemo(
    () =>
      workbenchNavigationState?.source === 'my-data-table'
        ? 'labeler-workbench-page workbench-page-enter workbench-page-enter--from-table'
        : 'labeler-workbench-page workbench-page-enter',
    [workbenchNavigationState?.source],
  );

  if (isLoading && !workbench) {
    return (
      <section
        className={workbenchPageEnterClass}
        aria-labelledby="labeler-workbench-title"
      >
        <h1 id="labeler-workbench-title">标注台</h1>
        <PageLoading title="正在加载题目" description="正在恢复草稿、题目材料和贡献统计。" />
      </section>
    );
  }

  if (!workbench) {
    return (
      <section
        className={workbenchPageEnterClass}
        aria-labelledby="labeler-workbench-title"
      >
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
    <section
      className={workbenchPageEnterClass}
      aria-labelledby="labeler-workbench-title"
    >
      <h1 id="labeler-workbench-title">{currentTaskTitle}</h1>
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <div className="workbench-topline">
        <div className="workbench-topline__identity">
          <div className="workbench-topline__title-row">
            <div className="workbench-identity-field workbench-identity-field--id" aria-label="任务ID">
              <code className="workbench-task-id">{currentTaskDisplayId}</code>
            </div>
            <div className="workbench-identity-field workbench-identity-field--title" aria-label="任务名称">
              <span className="workbench-task-title-value">{currentTaskTitle}</span>
            </div>
          </div>
          <div className="workbench-topline__meta" aria-label="任务状态">
            <span className="workbench-deadline-countdown">{deadlineCountdown}</span>
            <div className="workbench-topline__actions" aria-label="标注操作">
              <span className="workbench-reward-pill">{workbench.task.rewardRule ?? '未设置'}</span>
              <span className="autosave-indicator" aria-live="polite">
                <span className="autosave-indicator__text" key={draftStatusRevision}>
                  {draftStatus}
                </span>
              </span>
            </div>
          </div>
        </div>
        <button
          className="workbench-close-button"
          type="button"
          aria-label="返回我的工作台"
          onClick={() => navigate('/labeler/my-data')}
          title="返回我的工作台"
        >
          ×
        </button>
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
          {aiReviewReport ? (
            <div className="annotation-canvas-tabs" role="tablist" aria-label="标注画布视图">
              <button
                id="annotation-canvas-tab-annotation"
                type="button"
                role="tab"
                aria-selected={activeCanvasTab === 'annotation'}
                aria-controls="annotation-canvas-panel-annotation"
                onClick={() => setActiveCanvasTab('annotation')}
              >
                标注内容
              </button>
              <button
                id="annotation-canvas-tab-ai-review"
                type="button"
                role="tab"
                aria-selected={activeCanvasTab === 'ai-review'}
                aria-controls="annotation-canvas-panel-ai-review"
                onClick={() => setActiveCanvasTab('ai-review')}
              >
                AI 预审
              </button>
            </div>
          ) : null}
          <div
            id={activeCanvasTab === 'ai-review' && aiReviewReport
              ? 'annotation-canvas-panel-ai-review'
              : 'annotation-canvas-panel-annotation'}
            className="annotation-canvas-scroll"
            role={aiReviewReport ? 'tabpanel' : undefined}
            aria-labelledby={activeCanvasTab === 'ai-review' && aiReviewReport
              ? 'annotation-canvas-tab-ai-review'
              : aiReviewReport
                ? 'annotation-canvas-tab-annotation'
                : undefined}
          >
            {activeCanvasTab === 'ai-review' && aiReviewReport ? (
              <AiReviewWorkbenchTab report={aiReviewReport} workbench={workbench} onRelabel={openAnnotationForm} />
            ) : (
              <>
                <RejectNotice notice={workbench.rejectionNotice} />
                <RawDataPanel workbench={workbench} />
                <SchemaRenderer
                  schema={workbench.task.schema}
                  rawData={workbench.taskItem.rawData}
                  value={answers}
                  mode={isCurrentQuestionEditable ? 'answer' : 'review'}
                  onChange={setAnswers}
                  activeFieldKey={activeField ? getSchemaFieldKey(activeField) : activeFieldKey}
                  onActiveFieldChange={setActiveFieldKey}
                />
              </>
            )}
          </div>
          <div className="workbench-footer-actions annotation-submit-bar">
            <div className="annotation-submit-bar__navigation" aria-label="切题操作">
              <button type="button" disabled={routeQuestionIndex <= 0} onClick={handlePrevious}>
                ← 上一题
              </button>
              <button type="button" disabled={routeQuestionIndex >= totalCount - 1} onClick={handleNext}>
                下一题 →
              </button>
            </div>
            <div className="annotation-submit-bar__actions">
              <button type="button" onClick={reportCurrentIssue}>
                报告题目
              </button>
              <button
                type="button"
                disabled={isSaving || !isCurrentQuestionEditable}
                onClick={() => void saveDraftNow('manual')}
              >
                保存草稿
              </button>
              <button
                className="primary-action"
                type="button"
                disabled={isTaskSubmitDisabled}
                onClick={() => void submitCurrent()}
              >
                提交任务
              </button>
            </div>
          </div>
        </main>

        <LabelerWorkbenchInfoPanel stats={stats} workbench={workbench} />
      </div>
    </section>
  );
};

type AiReviewReportData = {
  submissionRound: number;
  submittedAt: string;
  answers: Record<string, unknown>;
  decision: string | null;
  comment: string | null;
  scores: Record<string, unknown>;
  fieldReviews: AiReviewFieldReview[];
  overallComment: string | null;
};

type AiReviewFieldReview = {
  fieldKey: string;
  label: string;
  score: number | null;
  decision: string | null;
  comment: string | null;
  suggestions: string[];
};

type AiReviewAnswerFieldSnapshot = {
  fieldKey: string;
  label: string;
  value: unknown;
  displayValue: string;
  requirement: string;
  review: AiReviewFieldReview | null;
};

const AiReviewWorkbenchTab = ({
  onRelabel,
  report,
  workbench,
}: {
  onRelabel: () => void;
  report: AiReviewReportData;
  workbench: WorkbenchDto;
}) => {
  const flattenedFields = useMemo(() => getFlattenedSchemaFields(workbench.task.schema.fields), [workbench.task.schema.fields]);
  const showItemSchema = useMemo(
    () => buildAiReviewShowItemSchema(workbench.task.schema),
    [workbench.task.schema],
  );
  const reviewFields = useMemo(
    () => buildAiReviewAnswerFieldSnapshots(flattenedFields, report.answers, report.fieldReviews),
    [flattenedFields, report.answers, report.fieldReviews],
  );
  const handleReadonlyShowItemChange = useCallback(() => undefined, []);
  const hasRejectedReviewField = reviewFields.some((field) => field.review?.decision === 'reject');
  const reason = typeof report.scores.reason === 'string' ? report.scores.reason : '';
  const decisionClass = report.decision === 'pass' ? 'is-pass' : report.decision === 'manual' ? 'is-manual' : 'is-reject';
  const comment = report.overallComment || report.comment || reason;

  return (
    <div className="ai-review-tab">
      <section className="ai-review-context" aria-label="AI 预审结果">
        <header className="ai-review-context__summary">
          <div>
            <h2>AI 预审</h2>
            <p>
              第 {report.submissionRound} 轮 · {formatDateTime(report.submittedAt)}
            </p>
            {comment ? <small>{comment}</small> : null}
          </div>
          <div className="ai-review-context__summary-actions">
            <span className={`ai-review-report__decision ${decisionClass}`}>
              {AI_REVIEW_DECISION_LABELS[report.decision ?? ''] ?? '待判断'}
            </span>
            {hasRejectedReviewField ? (
              <button type="button" onClick={onRelabel}>
                重新标注
              </button>
            ) : null}
          </div>
        </header>

        <section className="ai-review-context__show-item-panel" aria-label="展示项 ShowItem">
          {showItemSchema.fields.length > 0 ? (
            <SchemaRenderer
              schema={showItemSchema}
              rawData={workbench.taskItem.rawData}
              value={{}}
              mode="review"
              onChange={handleReadonlyShowItemChange}
            />
          ) : (
            <p className="ai-review-context__empty">当前模板没有配置展示项。</p>
          )}
        </section>

        <section className="ai-review-context__section">
          <div className="ai-review-context__heading">
            <h3>需要 AI 预审的字段</h3>
            <span>{reviewFields.length.toLocaleString()} 项</span>
          </div>
          {reviewFields.length > 0 ? (
            <div className="ai-review-context__field-list">
              {reviewFields.map((field) => (
                <article className={aiReviewFieldCardClass(field.review)} key={field.fieldKey}>
                  <header className="ai-review-context__field-header">
                    <div className="ai-review-context__field-title">
                      <strong>{field.label}</strong>
                      <small className="ai-review-context__field-key">{field.fieldKey}</small>
                    </div>
                    <div className="ai-review-context__field-result">
                      {field.review ? (
                        <>
                          <span className={`ai-review-report__decision ${field.review.decision === 'pass' ? 'is-pass' : 'is-reject'}`}>
                            {field.review.decision === 'pass' ? '通过' : '未通过'}
                          </span>
                        </>
                      ) : (
                        <span className="ai-review-report__decision is-manual">待返回</span>
                      )}
                    </div>
                  </header>
                  <dl className="ai-review-context__field-details">
                    <div className="ai-review-context__field-row ai-review-context__field-row--answer">
                      <dt>当前标注内容</dt>
                      <dd>{field.displayValue}</dd>
                    </div>
                    <div className="ai-review-context__field-row ai-review-context__field-row--standard">
                      <dt>AI 预审标准</dt>
                      <dd>{field.requirement}</dd>
                    </div>
                    <div className="ai-review-context__field-row ai-review-context__field-row--comment">
                      <dt>AI 对当前字段的评语</dt>
                      <dd>{field.review?.comment ?? 'AI 暂未返回该字段评语。'}</dd>
                    </div>
                    {field.review?.suggestions.length ? (
                      <div className="ai-review-context__field-row ai-review-context__field-row--suggestions">
                        <dt>修改建议</dt>
                        <dd>{field.review.suggestions.join('；')}</dd>
                      </div>
                    ) : null}
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <p className="ai-review-context__empty">当前模板没有开启 AI 预审的标注字段。</p>
          )}
        </section>
      </section>
    </div>
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

const AI_REVIEW_POLL_INTERVAL_MS = 300;
const AI_REVIEW_MAX_POLL_ATTEMPTS = 10;
const AI_REVIEW_PENDING_STATUSES = new Set(['AI_QUEUED', 'AI_REVIEWING']);
const COUNTDOWN_REFRESH_INTERVAL_MS = 1_000;

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
        answers: submission.answers,
        decision: reviewRecord.decision,
        comment: reviewRecord.comment ?? null,
        scores: normalizeAiReviewScores(reviewRecord.scores, reviewRecord.structuredOutput),
        fieldReviews: normalizeAiReviewFieldReviews(reviewRecord.structuredOutput),
        overallComment: normalizeAiReviewOverallComment(reviewRecord.structuredOutput),
      };
    }
  }

  return null;
}

function buildAiReviewShowItemSchema(schema: WorkbenchDto['task']['schema']): WorkbenchDto['task']['schema'] {
  return {
    ...schema,
    fields: getFlattenedSchemaFields(schema.fields).filter((field) => field.type === 'show_item'),
  };
}

function buildAiReviewAnswerFieldSnapshots(
  fields: readonly SchemaField[],
  answers: Record<string, unknown>,
  fieldReviews: readonly AiReviewFieldReview[],
): AiReviewAnswerFieldSnapshot[] {
  const reviewByFieldKey = new Map(fieldReviews.map((review) => [review.fieldKey, review]));

  return getAnswerFields(fields)
    .filter((field) => field.aiReview?.enabled)
    .map((field) => {
      const fieldKey = getSchemaFieldKey(field);
      const value = Object.prototype.hasOwnProperty.call(answers, fieldKey) ? answers[fieldKey] : null;

      return {
        fieldKey,
        label: field.label,
        value,
        displayValue: formatReviewFieldValue(field, value),
        requirement: field.aiReview?.requirement?.trim() || '请判断该字段标注结果是否符合题目事实和任务要求。',
        review: reviewByFieldKey.get(fieldKey) ?? null,
      };
    });
}

function aiReviewFieldCardClass(review: AiReviewFieldReview | null): string {
  if (review?.decision === 'pass') {
    return 'ai-review-context__field-card is-pass';
  }

  if (review?.decision === 'reject') {
    return 'ai-review-context__field-card is-reject';
  }

  return 'ai-review-context__field-card is-pending';
}

function normalizeAiReviewScores(
  scores: Record<string, unknown>,
  structuredOutput: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!isRecord(structuredOutput)) {
    return scores;
  }

  const overallScore = scoreValue(structuredOutput.overallScore);
  return overallScore === null ? scores : { ...scores, overall: overallScore };
}

function normalizeAiReviewFieldReviews(
  structuredOutput: Record<string, unknown> | null | undefined,
): AiReviewFieldReview[] {
  if (!isRecord(structuredOutput) || !Array.isArray(structuredOutput.fieldReviews)) {
    return [];
  }

  return structuredOutput.fieldReviews
    .filter(isRecord)
    .map((fieldReview, index) => {
      const rawFieldKey = typeof fieldReview.fieldKey === 'string' ? fieldReview.fieldKey.trim() : '';
      const fieldKey = rawFieldKey || `field_${index + 1}`;
      const rawLabel = typeof fieldReview.label === 'string' ? fieldReview.label.trim() : '';
      const rawComment = typeof fieldReview.comment === 'string' ? fieldReview.comment.trim() : '';
      const suggestions = Array.isArray(fieldReview.suggestions)
        ? fieldReview.suggestions
            .filter((suggestion): suggestion is string => typeof suggestion === 'string' && suggestion.trim().length > 0)
            .map((suggestion) => suggestion.trim())
        : [];

      return {
        fieldKey,
        label: rawLabel || fieldKey,
        score: scoreValue(fieldReview.score),
        decision: fieldReview.decision === 'pass' || fieldReview.decision === 'reject' ? fieldReview.decision : null,
        comment: rawComment || null,
        suggestions,
      };
    });
}

function normalizeAiReviewOverallComment(
  structuredOutput: Record<string, unknown> | null | undefined,
): string | null {
  if (!isRecord(structuredOutput)) {
    return null;
  }

  return typeof structuredOutput.overallComment === 'string' && structuredOutput.overallComment.trim()
    ? structuredOutput.overallComment.trim()
    : null;
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

function formatReviewFieldValue(field: SchemaField, value: unknown): string {
  if (field.options && field.options.length > 0) {
    const optionLabelByValue = new Map(field.options.map((option) => [option.value, option.label]));

    if (Array.isArray(value)) {
      const labels = value.map((item) =>
        typeof item === 'string' ? optionLabelByValue.get(item) ?? item : formatReviewDisplayValue(item),
      );

      return labels.length > 0 ? labels.join('、') : '未填写';
    }

    if (typeof value === 'string') {
      return optionLabelByValue.get(value) ?? value;
    }
  }

  return formatReviewDisplayValue(value);
}

function formatReviewDisplayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '未填写';
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(formatReviewDisplayValue).join('、') : '未填写';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

type QuestionProgressState = 'empty' | 'draft' | 'complete';

function resolveAnswerProgressState(workbench: WorkbenchDto, answers: Record<string, unknown>): QuestionProgressState {
  return resolveSchemaAnswerProgressState(workbench.task.schema, answers);
}

function resolveSchemaAnswerProgressState(
  schema: WorkbenchDto['task']['schema'],
  answers: Record<string, unknown>,
): QuestionProgressState {
  const linkageResult = applySchemaLinkage(schema, answers);
  const answerFields = getAnswerFields(getFlattenedSchemaFields(schema.fields));
  let hasAnyVisibleAnswer = false;
  let hasMissingRequiredAnswer = false;

  for (const field of answerFields) {
    const fieldKey = getSchemaFieldKey(field);
    const isDisabled = linkageResult.disabledFieldKeys.has(fieldKey);
    const isHidden = linkageResult.hiddenFieldKeys.has(fieldKey) && !field.validateWhenHidden;
    const isRequired = Boolean(
      field.required || field.validation?.required || linkageResult.requiredFieldKeys.has(fieldKey),
    );

    if (isDisabled || isHidden) {
      continue;
    }

    if (!isEmptyAnswerValue(linkageResult.answers[fieldKey])) {
      hasAnyVisibleAnswer = true;
    }

    if (isRequired && isEmptyAnswerValue(linkageResult.answers[fieldKey])) {
      hasMissingRequiredAnswer = true;
    }
  }

  if (!hasMissingRequiredAnswer) {
    return 'complete';
  }

  return hasAnyVisibleAnswer ? 'draft' : 'empty';
}

function resolveCurrentQuestionStatusLabel(status: AssignmentStatus, progress: QuestionProgressState): string {
  if (isSubmittableAssignmentStatus(status)) {
    if (progress === 'empty') {
      return ASSIGNMENT_STATUS_LABELS[status] ?? status;
    }

    return formatQuestionProgressLabel(progress);
  }

  return ASSIGNMENT_STATUS_LABELS[status] ?? status;
}

function resolveNavigationQuestionStatusLabel(
  assignment: LabelerAssignmentDto,
  locallyProgress?: QuestionProgressState,
  schema?: WorkbenchDto['task']['schema'],
): string {
  if (locallyProgress && locallyProgress !== 'empty' && isSubmittableAssignmentStatus(assignment.status)) {
    return formatQuestionProgressLabel(locallyProgress);
  }

  if (assignment.draftAnswers && schema && isSubmittableAssignmentStatus(assignment.status)) {
    const draftProgress = resolveSchemaAnswerProgressState(schema, assignment.draftAnswers);
    if (draftProgress !== 'empty') {
      return formatQuestionProgressLabel(draftProgress);
    }
  }

  return ASSIGNMENT_STATUS_LABELS[assignment.status] ?? assignment.status;
}

function formatQuestionProgressLabel(progress: QuestionProgressState): string {
  if (progress === 'complete') {
    return '已完成';
  }

  if (progress === 'draft') {
    return '进行中';
  }

  return '进行中';
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

function isEditableAssignmentStatus(status: AssignmentStatus): boolean {
  return status === 'ASSIGNED' || status === 'IN_PROGRESS' || status === 'NEEDS_REVISION';
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

function resolveWorkbenchTaskIdentity(
  workbench: WorkbenchDto,
  taskAssignments: LabelerAssignmentDto[],
  tasks: TaskDto[],
  navigationState: WorkbenchNavigationState | null,
): WorkbenchTaskIdentity {
  const taskDisplayIdByTaskId = createTaskDisplayIdMap(tasks);
  const taskFromList = tasks.find((task) => task.id === workbench.assignment.taskId);
  const assignmentTaskTitle = taskAssignments.find(
    (assignment) => assignment.taskId === workbench.assignment.taskId,
  )?.taskTitle;

  return {
    displayId:
      taskDisplayIdByTaskId.get(workbench.assignment.taskId) ??
      navigationState?.taskDisplayId?.trim() ??
      workbench.assignment.taskId,
    title:
      taskFromList?.title.trim() ||
      assignmentTaskTitle?.trim() ||
      navigationState?.taskTitle?.trim() ||
      workbench.task.title,
  };
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

function createLocalDraftCacheKey(assignmentId: string): string {
  return assignmentId ? `labelhub.local-draft.${assignmentId}` : '';
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatDeadlineCountdown(value: string | null, nowMs: number): string {
  if (!value) {
    return '未设置截止时间';
  }

  const deadlineMs = new Date(value).getTime();
  if (!Number.isFinite(deadlineMs)) {
    return '截止时间无效';
  }

  const remainingSeconds = Math.ceil((deadlineMs - nowMs) / 1_000);
  if (remainingSeconds <= 0) {
    return '已截止';
  }

  const days = Math.floor(remainingSeconds / (24 * 60 * 60));
  const hours = Math.floor((remainingSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((remainingSeconds % (60 * 60)) / 60);
  const seconds = remainingSeconds % 60;

  return `剩余 ${days} 天 ${hours} 小时 ${minutes} 分 ${seconds} 秒`;
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { getSchemaFieldKey, type SchemaField } from '@labelhub/shared';
import { PageError } from '../../components/AppErrorBoundary';
import { PageLoading } from '../../components/PageLoading';
import { ToastViewport, useToastController } from '../../components/ToastViewport';
import { applySchemaLinkage, validateSchemaAnswers } from '../../features/schema-renderer';
import { SchemaRenderer } from '../../features/schema-renderer';
import type { FieldNodeDecoration } from '../../features/schema-renderer/types';
import { QuestionNavigator } from '../../features/labeler/QuestionNavigator';
import { RejectNotice } from '../../features/labeler/RejectNotice';
import { listLabelerAssignments, type AssignmentStatus, type LabelerAssignmentDto } from '../../api/assignments';
import { getAssignmentWorkbench, saveDraft, type WorkbenchDto } from '../../api/drafts';
import { getLabelerStats, submitTask, type LabelerStatsDto, type TaskSubmissionDto } from '../../api/submissions';

const LABELER_ID = 'user_labeler_li_lei';
type WorkbenchNavigationState = {
  assignmentId?: string;
  source?: 'my-data-table';
  taskDisplayId?: string;
  taskTitle?: string;
};
type WorkbenchCanvasTab = 'annotation' | 'ai-review';
type WorkbenchTaskIdentity = {
  displayId: string;
  title: string;
};
type ValidationFocusTarget = {
  assignmentId: string;
  taskItemId: string;
  fieldKey: string;
};

export const WorkbenchPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { itemId } = useParams<{ itemId: string }>();
  const [searchParams] = useSearchParams();
  const workbenchNavigationState = location.state as WorkbenchNavigationState | null;
  const assignmentId = searchParams.get('assignmentId') ?? workbenchNavigationState?.assignmentId ?? '';
  const [workbench, setWorkbench] = useState<WorkbenchDto | null>(null);
  const [stats, setStats] = useState<LabelerStatsDto | null>(null);
  const [taskAssignments, setTaskAssignments] = useState<LabelerAssignmentDto[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);
  const [editedRejectedFieldKeys, setEditedRejectedFieldKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [validationFocusFieldKey, setValidationFocusFieldKey] = useState<string | null>(null);
  const [pendingValidationFocus, setPendingValidationFocus] = useState<ValidationFocusTarget | null>(null);
  const [showSubmissionValidationErrors, setShowSubmissionValidationErrors] = useState(false);
  const [draftStatus, setDraftStatus] = useState('正在加载草稿。');
  const [draftStatusRevision, setDraftStatusRevision] = useState(0);
  const [localQuestionProgress, setLocalQuestionProgress] = useState<Record<string, QuestionProgressState>>({});
  const [fatalErrorMessage, setFatalErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeCanvasTab, setActiveCanvasTab] = useState<WorkbenchCanvasTab>('annotation');
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const [taskIdentity, setTaskIdentity] = useState<WorkbenchTaskIdentity | null>(null);
  const { dismissToast, messages, showErrorToast, showInfoToast, showStatusToast } = useToastController();
  const aiReviewPollTimerRef = useRef<number | null>(null);
  const lastSavedSnapshotRef = useRef('');
  const hydratedRef = useRef(false);
  const loadWorkbenchRequestRef = useRef(0);
  const taskSubmitInFlightRef = useRef(false);
  const validationFocusTimerRef = useRef<number | null>(null);
  const workbenchCacheRef = useRef<Map<string, WorkbenchDto>>(new Map());
  const taskAssignmentsCacheRef = useRef<Map<string, LabelerAssignmentDto[]>>(new Map());
  const labelerStatsCacheRef = useRef<Map<string, LabelerStatsDto>>(new Map());
  const localCacheKey = createLocalDraftCacheKey(assignmentId);

  const clearAiReviewPolling = useCallback(() => {
    if (aiReviewPollTimerRef.current !== null) {
      window.clearTimeout(aiReviewPollTimerRef.current);
      aiReviewPollTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearAiReviewPolling, [clearAiReviewPolling]);

  useEffect(
    () => () => {
      if (validationFocusTimerRef.current !== null) {
        window.clearTimeout(validationFocusTimerRef.current);
      }
    },
    [],
  );

  const applyWorkbenchSnapshot = useCallback(
    (
      nextWorkbench: WorkbenchDto,
      nextStats: LabelerStatsDto,
      nextTaskAssignments: LabelerAssignmentDto[],
    ) => {
      const sortedTaskAssignments = [...nextTaskAssignments].sort(compareLabelerAssignments);
      const nextLocalCacheKey = createLocalDraftCacheKey(nextWorkbench.assignment.id);
      const cachedAnswers = readLocalDraft(nextLocalCacheKey);
      const initialAnswers = cachedAnswers ?? nextWorkbench.draft?.answers ?? {};
      const flattenedFields = getFlattenedSchemaFields(nextWorkbench.task.schema.fields);
      const answerFields = getAnswerFields(flattenedFields);
      const defaultActiveField = answerFields[0] ?? flattenedFields[0] ?? null;

      setWorkbench(nextWorkbench);
      setStats(nextStats);
      setTaskAssignments(sortedTaskAssignments);
      setTaskIdentity(resolveWorkbenchTaskIdentity(
        nextWorkbench,
        sortedTaskAssignments,
        workbenchNavigationState,
      ));
      setAnswers(initialAnswers);
      setEditedRejectedFieldKeys(new Set());
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
    },
    [workbenchNavigationState],
  );

  const loadTaskContextSnapshot = useCallback(async (taskId: string) => {
    const cachedAssignments = taskAssignmentsCacheRef.current.get(taskId);
    const cachedStats = labelerStatsCacheRef.current.get(taskId);

    if (cachedAssignments && cachedStats) {
      return {
        nextStats: cachedStats,
        nextTaskAssignments: cachedAssignments,
      };
    }

    const [nextStats, nextTaskAssignments] = await Promise.all([
      getLabelerStats({ labelerId: LABELER_ID, taskId }),
      listLabelerAssignments({ labelerId: LABELER_ID, taskId }),
    ]);
    const sortedTaskAssignments = [...nextTaskAssignments].sort(compareLabelerAssignments);

    labelerStatsCacheRef.current.set(taskId, nextStats);
    taskAssignmentsCacheRef.current.set(taskId, sortedTaskAssignments);

    return {
      nextStats,
      nextTaskAssignments: sortedTaskAssignments,
    };
  }, []);

  const preloadAdjacentWorkbenches = useCallback(
    (currentAssignmentId: string, assignments: readonly LabelerAssignmentDto[]) => {
      const currentIndex = assignments.findIndex((assignment) => assignment.assignmentId === currentAssignmentId);
      if (currentIndex < 0) {
        return;
      }

      for (const nextIndex of [currentIndex - 1, currentIndex + 1]) {
        const nextAssignment = assignments[nextIndex];
        if (!nextAssignment || workbenchCacheRef.current.has(nextAssignment.assignmentId)) {
          continue;
        }

        void getAssignmentWorkbench(nextAssignment.assignmentId)
          .then((nextWorkbench) => {
            workbenchCacheRef.current.set(nextAssignment.assignmentId, nextWorkbench);
          })
          .catch((error) => {
            showErrorToast(error instanceof Error
              ? `相邻题预加载失败：${error.message}`
              : '相邻题预加载失败。');
          });
      }
    },
    [showErrorToast],
  );

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
    const cachedWorkbench = workbenchCacheRef.current.get(id);
    const cachedTaskContext = cachedWorkbench
      ? {
          stats: labelerStatsCacheRef.current.get(cachedWorkbench.assignment.taskId),
          assignments: taskAssignmentsCacheRef.current.get(cachedWorkbench.assignment.taskId),
        }
      : null;

    setIsLoading(true);

    if (cachedWorkbench && cachedTaskContext?.stats && cachedTaskContext.assignments) {
      applyWorkbenchSnapshot(cachedWorkbench, cachedTaskContext.stats, cachedTaskContext.assignments);
      setIsLoading(false);
    }

    try {
      const nextWorkbench = await getAssignmentWorkbench(id);
      workbenchCacheRef.current.set(id, nextWorkbench);
      const { nextStats, nextTaskAssignments } = await loadTaskContextSnapshot(nextWorkbench.assignment.taskId);

      if (requestId !== loadWorkbenchRequestRef.current) {
        return;
      }

      applyWorkbenchSnapshot(nextWorkbench, nextStats, nextTaskAssignments);
      preloadAdjacentWorkbenches(nextWorkbench.assignment.id, nextTaskAssignments);
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
      workbenchCacheRef.current.set(id, nextWorkbench);
      const { nextStats, nextTaskAssignments } = await loadTaskContextSnapshot(nextWorkbench.assignment.taskId);

      applyWorkbenchSnapshot(nextWorkbench, nextStats, nextTaskAssignments);
      preloadAdjacentWorkbenches(nextWorkbench.assignment.id, nextTaskAssignments);
      return nextWorkbench;
    },
    [applyWorkbenchSnapshot, loadTaskContextSnapshot, preloadAdjacentWorkbenches],
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

  const hasSubmittableCurrentTask = useMemo(
    () => (workbench ? hasSubmittableTaskAssignments(workbench, taskAssignments) : false),
    [taskAssignments, workbench],
  );
  const isCurrentQuestionEditable = workbench
    ? isEditableAssignmentStatus(workbench.assignment.status)
    : false;
  const isCurrentQuestionCompleted = workbench
    ? isCompletedAssignmentStatus(workbench.assignment.status)
    : false;
  const canReportCurrentIssue = workbench ? !isCurrentQuestionCompleted : false;
  const isTaskSubmitDisabled =
    isSubmitting || !hasSubmittableCurrentTask || !isCurrentQuestionEditable;

  const orderedTaskAssignments = useMemo(
    () => [...taskAssignments].sort(compareLabelerAssignments),
    [taskAssignments],
  );
  const isWorkbenchForCurrentRoute = Boolean(
    workbench &&
      (workbench.assignment.id === assignmentId || workbench.taskItem.id === itemId),
  );
  const navigationAssignmentId = assignmentId || workbench?.assignment.id || '';
  const navigationItemId = itemId || workbench?.taskItem.id || '';
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
      resolveDisplayableTaskId(workbenchNavigationState?.taskDisplayId) ||
      formatGeneratedTaskDisplayId(1)
    : resolveDisplayableTaskId(workbenchNavigationState?.taskDisplayId) || '';
  const currentTaskTitle = workbench
    ? taskIdentity?.title.trim() ||
      workbenchNavigationState?.taskTitle?.trim() ||
      workbench.task.title
    : workbenchNavigationState?.taskTitle?.trim() || '标注台';
  const deadlineCountdown = workbench
    ? resolveTaskHeaderStatusLabel(workbench, orderedTaskAssignments, currentTimeMs)
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
        flowStatusLabel:
          index === currentQuestionIndex && isWorkbenchForCurrentRoute && workbench
            ? resolveCurrentQuestionFlowStatusLabel(workbench)
            : resolveNavigationQuestionFlowStatusLabel(assignment),
        annotationStatusLabel:
          index === currentQuestionIndex && isWorkbenchForCurrentRoute && workbench
            ? resolveCurrentQuestionAnnotationStatusLabel(workbench, currentQuestionProgress)
            : resolveNavigationQuestionAnnotationStatusLabel(
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
      workbench,
      workbench?.task.schema,
    ],
  );

  const triggerValidationFocusPulse = useCallback((fieldKey: string) => {
    if (validationFocusTimerRef.current !== null) {
      window.clearTimeout(validationFocusTimerRef.current);
    }

    setValidationFocusFieldKey(null);
    validationFocusTimerRef.current = window.setTimeout(() => {
      const fieldNode = findSchemaFieldNode(fieldKey);
      if (typeof fieldNode?.scrollIntoView === 'function') {
        fieldNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      focusFirstEditableControl(fieldNode);
      setValidationFocusFieldKey(fieldKey);
      validationFocusTimerRef.current = null;
    }, 0);
  }, []);

  const navigateToAssignment = useCallback(
    (assignment: LabelerAssignmentDto) => {
      navigate(workbenchHref(assignment), {
        state: {
          ...(workbenchNavigationState?.source ? { source: workbenchNavigationState.source } : {}),
          assignmentId: assignment.assignmentId,
          taskDisplayId: currentTaskDisplayId || assignment.taskDisplayId,
          taskTitle: currentTaskTitle || assignment.taskTitle,
        } satisfies WorkbenchNavigationState,
      });
    },
    [currentTaskDisplayId, currentTaskTitle, navigate, workbenchNavigationState?.source],
  );

  const focusValidationIssue = useCallback(
    (issue: TaskSubmissionValidationIssue) => {
      setShowSubmissionValidationErrors(true);
      setActiveCanvasTab('annotation');
      setActiveFieldKey(issue.fieldKey);

      if (issue.assignmentId !== navigationAssignmentId) {
        const targetAssignment = orderedTaskAssignments.find(
          (assignment) => assignment.assignmentId === issue.assignmentId,
        );

        if (targetAssignment) {
          setPendingValidationFocus({
            assignmentId: issue.assignmentId,
            taskItemId: issue.taskItemId,
            fieldKey: issue.fieldKey,
          });
          navigateToAssignment(targetAssignment);
          return;
        }
      }

      setPendingValidationFocus(null);
      triggerValidationFocusPulse(issue.fieldKey);
    },
    [navigateToAssignment, navigationAssignmentId, orderedTaskAssignments, triggerValidationFocusPulse],
  );

  useEffect(() => {
    if (!pendingValidationFocus || !workbench || !isWorkbenchForCurrentRoute) {
      return;
    }

    const isTargetWorkbench =
      workbench.assignment.id === pendingValidationFocus.assignmentId ||
      workbench.taskItem.id === pendingValidationFocus.taskItemId;

    if (!isTargetWorkbench) {
      return;
    }

    setShowSubmissionValidationErrors(true);
    setActiveCanvasTab('annotation');
    setActiveFieldKey(pendingValidationFocus.fieldKey);
    triggerValidationFocusPulse(pendingValidationFocus.fieldKey);
    setPendingValidationFocus(null);
  }, [
    isWorkbenchForCurrentRoute,
    pendingValidationFocus,
    triggerValidationFocusPulse,
    workbench,
  ]);

  const submitCurrent = useCallback(async () => {
    if (!workbench) {
      return;
    }

    if (taskSubmitInFlightRef.current || !hasSubmittableCurrentTask) {
      showStatusToast('当前任务已提交，请等待审核结果。');
      return;
    }

    const validationIssues = collectTaskSubmissionValidationIssues(
      workbench,
      orderedTaskAssignments,
      answers,
    );
    if (validationIssues.length > 0) {
      const firstIssue = validationIssues[0];
      setShowSubmissionValidationErrors(true);
      setActiveCanvasTab('annotation');
      setActiveFieldKey(firstIssue.fieldKey);
      if (firstIssue.assignmentId === navigationAssignmentId) {
        focusValidationIssue(firstIssue);
      }
      showErrorToast(formatTaskSubmissionValidationIssue(firstIssue), {
        actionLabel: '去修正',
        actionOnClick: () => focusValidationIssue(firstIssue),
        autoDismiss: false,
      });

      return;
    }

    setShowSubmissionValidationErrors(false);
    const linkageResult = applySchemaLinkage(workbench.task.schema, answers);
    const submitAnswers = linkageResult.normalizedAnswers;

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
          ? cacheWorkbenchSnapshot({
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
            }, workbenchCacheRef.current)
          : current,
      );
      showStatusToast(formatTaskSubmissionStatusMessage(taskSubmission));
      setDraftStatus(
        currentSubmission
          ? `提交前草稿已同步 ${formatTime(currentSubmission.submittedAt)}`
          : '提交前草稿已同步。',
      );
      setTaskAssignments((current) => {
        const nextAssignments = current.map((assignment) => {
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
        });
        taskAssignmentsCacheRef.current.set(workbench.assignment.taskId, nextAssignments);
        return nextAssignments;
      });
      const nextStats = await getLabelerStats({ labelerId: LABELER_ID, taskId: workbench.assignment.taskId });
      labelerStatsCacheRef.current.set(workbench.assignment.taskId, nextStats);
      setStats(nextStats);
      if (currentSubmission && AI_REVIEW_PENDING_STATUSES.has(currentSubmission.status)) {
        startAiReviewPolling(currentSubmission.id);
      }
    } catch (error) {
      showErrorToast(formatTaskSubmissionErrorMessage(error));
    } finally {
      taskSubmitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }, [
    answers,
    focusValidationIssue,
    hasSubmittableCurrentTask,
    navigationAssignmentId,
    orderedTaskAssignments,
    saveDraftNow,
    showErrorToast,
    showStatusToast,
    startAiReviewPolling,
    workbench,
  ]);

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
    if (!canReportCurrentIssue) {
      return;
    }

    showInfoToast('请在本题备注中说明异常，提交任务后会随答案进入审核。');
  }, [canReportCurrentIssue, showInfoToast]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) && !(event.metaKey || event.ctrlKey)) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        void saveDraftNow('manual');
      }

      if (!(event.metaKey || event.ctrlKey || event.altKey)) {
        const key = event.key.toLowerCase();
        if (key === 'j' || event.key === 'ArrowRight') {
          event.preventDefault();
          handleNext();
        }
        if (key === 'k' || event.key === 'ArrowLeft') {
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
  }, [handleNext, handlePrevious, reportCurrentIssue, saveDraftNow]);

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
  const reviewerRejectionSuggestion = useMemo(
    () => (workbench ? resolveReviewerRejectionSuggestion(workbench) : null),
    [workbench],
  );
  const rejectedAnnotationFieldDecorations = useMemo(
    () =>
      workbench
        ? resolveRejectedAnnotationFieldDecorations(workbench, answers, editedRejectedFieldKeys)
        : new Map<string, string | null>(),
    [answers, editedRejectedFieldKeys, workbench],
  );
  const getAnnotationFieldDecoration = useCallback(
    (field: SchemaField): FieldNodeDecoration | null => {
      const fieldKey = getSchemaFieldKey(field);
      const suggestion = rejectedAnnotationFieldDecorations.get(fieldKey);

      return rejectedAnnotationFieldDecorations.has(fieldKey)
        ? {
            state: 'rejected',
            label: '待修改',
            message: suggestion ? `修改建议：${suggestion}` : undefined,
          }
        : null;
    },
    [rejectedAnnotationFieldDecorations],
  );
  const handleRejectedFieldEdited = useCallback((fieldKey: string) => {
    setEditedRejectedFieldKeys((current) => {
      if (current.has(fieldKey)) {
        return current;
      }

      return new Set(current).add(fieldKey);
    });
  }, []);
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
            currentIndex={routeQuestionIndex}
            totalCount={totalCount}
            items={navigatorItems}
            onJump={handleJump}
          />
        </aside>

        <main
          className="workbench-main-panel annotation-canvas-panel"
          aria-label="标注画布"
          aria-busy={isLoading ? true : undefined}
        >
          <>
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
                <RejectNotice notice={workbench.rejectionNotice} suggestion={reviewerRejectionSuggestion} />
                <RawDataPanel workbench={workbench} />
                <SchemaRenderer
                  schema={workbench.task.schema}
                  rawData={workbench.taskItem.rawData}
                  value={answers}
                  mode={isCurrentQuestionEditable ? 'answer' : 'review'}
                  onChange={setAnswers}
                  onFieldEdited={handleRejectedFieldEdited}
                  activeFieldKey={activeField ? getSchemaFieldKey(activeField) : activeFieldKey}
                  onActiveFieldChange={setActiveFieldKey}
                  validationFocusFieldKey={validationFocusFieldKey}
                  showValidationErrors={showSubmissionValidationErrors}
                  getFieldNodeDecoration={getAnnotationFieldDecoration}
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
              <button type="button" disabled={!canReportCurrentIssue} onClick={reportCurrentIssue}>
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
          </>
        </main>

        <LabelerWorkbenchInfoPanel workbench={workbench} />
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
  workbench,
}: {
  workbench: WorkbenchDto;
}) => {
  const historyTimeline = buildQuestionHistoryTimeline(workbench);

  return (
    <aside className="labeler-workbench-info-panel" aria-label="标注信息">
      <section className="labeler-info-section">
        <h2>本题历史</h2>
        <ol className="labeler-item-history" aria-label="本题历史列表">
          {historyTimeline.rounds.length > 0 ? (
            historyTimeline.rounds.map((round) => (
              <li className="labeler-item-history__round" key={round.id}>
                <div className="labeler-item-history__round-header">
                  <span>第 {round.round} 轮</span>
                  <small>{round.summary}</small>
                </div>
                <ol className="labeler-item-history__events" aria-label={`第 ${round.round} 轮历史`}>
                  {round.entries.map((entry) => (
                    <li className={`labeler-item-history__row ${entry.className}`} key={entry.id}>
                      <span>{entry.label}</span>
                      <time dateTime={entry.dateTime}>{entry.timeText}</time>
                    </li>
                  ))}
                </ol>
              </li>
            ))
          ) : (
            <li className="labeler-item-history__empty">暂无本题流转记录</li>
          )}
        </ol>
      </section>

      <section className="labeler-info-section">
        <h2>快捷键</h2>
        <ul className="labeler-shortcut-list">
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

type QuestionHistoryEntry = {
  id: string;
  label: string;
  timeText: string;
  dateTime: string;
  className: string;
};

type QuestionHistoryRound = {
  id: string;
  round: number;
  summary: string;
  entries: QuestionHistoryEntry[];
};

type QuestionHistoryTimeline = {
  rounds: QuestionHistoryRound[];
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

function buildQuestionHistoryTimeline(workbench: WorkbenchDto): QuestionHistoryTimeline {
  const labelerActorName = formatLabelerActorName(workbench.assignment.assigneeId);
  const rounds = [...workbench.submissionHistory]
    .sort(compareSubmissionHistoryByRound)
    .map<QuestionHistoryRound>((submission) => {
      const reviewEntries = latestQuestionHistoryReviewRecords(submission.reviewRecords)
        .sort((first, second) => first.createdAt.localeCompare(second.createdAt))
        .map((record, index) => {
          const isRecheck = isHumanRecheckRecord(record);
          const actorName = isRecheck
            ? formatReviewRecordActorName(record)
            : 'AI 预审';

          return {
            id: `${submission.id}:review:${index}`,
            label: `${actorName} · ${formatReviewAction(record, isRecheck)}`,
            timeText: formatHistoryTime(record.createdAt),
            dateTime: record.createdAt,
            className: isRecheck ? 'labeler-item-history__row--reviewer' : 'labeler-item-history__row--ai',
          };
        });
      const entries = [
        {
          id: `${submission.id}:submit`,
          label: `${labelerActorName} · 提交`,
          timeText: formatHistoryTime(submission.submittedAt),
          dateTime: submission.submittedAt,
          className: 'labeler-item-history__row--submit',
        },
        ...reviewEntries,
      ].sort((first, second) => first.dateTime.localeCompare(second.dateTime));

      return {
        id: `${submission.id}:round:${submission.round}`,
        round: submission.round,
        summary: formatQuestionHistoryRoundSummary(entries),
        entries,
      };
    });

  return { rounds };
}

function compareSubmissionHistoryByRound(
  first: WorkbenchDto['submissionHistory'][number],
  second: WorkbenchDto['submissionHistory'][number],
): number {
  if (first.round !== second.round) {
    return first.round - second.round;
  }

  return first.submittedAt.localeCompare(second.submittedAt);
}

function latestQuestionHistoryReviewRecords(
  reviewRecords: WorkbenchDto['submissionHistory'][number]['reviewRecords'],
): WorkbenchDto['submissionHistory'][number]['reviewRecords'] {
  const latestByDecision = new Map<
    string,
    WorkbenchDto['submissionHistory'][number]['reviewRecords'][number]
  >();

  for (const record of reviewRecords) {
    const key = [
      record.stage ?? 'UNKNOWN_STAGE',
      record.reviewerType ?? 'UNKNOWN_REVIEWER',
      record.decision ?? 'UNKNOWN_DECISION',
    ].join(':');
    const current = latestByDecision.get(key);

    if (!current || current.createdAt.localeCompare(record.createdAt) < 0) {
      latestByDecision.set(key, record);
    }
  }

  return [...latestByDecision.values()];
}

function formatQuestionHistoryRoundSummary(entries: readonly QuestionHistoryEntry[]): string {
  const latestEntry = entries.at(-1);
  return latestEntry ? latestEntry.timeText : '';
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

function resolveReviewerRejectionSuggestion(workbench: WorkbenchDto): string | null {
  if (workbench.assignment.status !== 'NEEDS_REVISION' || !workbench.rejectionNotice) {
    return null;
  }

  const rejectedSubmission = workbench.submissionHistory.find(
    (submission) => submission.id === workbench.rejectionNotice?.submissionId,
  );
  const latestReviewRecord = latestReviewRecordByCreatedAt(rejectedSubmission?.reviewRecords ?? []);

  if (!latestReviewRecord || !isHumanRecheckRecord(latestReviewRecord)) {
    return null;
  }

  return (
    latestReviewRecord.comment ??
    stringScoreReason(latestReviewRecord.scores) ??
    workbench.rejectionNotice.reason ??
    null
  );
}

function stringScoreReason(scores: Record<string, unknown> | null | undefined): string | null {
  return typeof scores?.reason === 'string' && scores.reason.trim() ? scores.reason.trim() : null;
}

function resolveRejectedAnnotationFieldDecorations(
  workbench: WorkbenchDto,
  answers: Record<string, unknown>,
  editedRejectedFieldKeys: ReadonlySet<string>,
): ReadonlyMap<string, string | null> {
  if (workbench.assignment.status !== 'NEEDS_REVISION' || !workbench.rejectionNotice) {
    return new Map();
  }

  const rejectedSubmission = workbench.submissionHistory.find(
    (submission) => submission.id === workbench.rejectionNotice?.submissionId,
  );

  if (!rejectedSubmission) {
    return new Map();
  }

  const rejectedFieldDecorations = new Map<string, string | null>();

  for (const reviewRecord of rejectedSubmission.reviewRecords) {
    for (const fieldReview of normalizeAiReviewFieldReviews(reviewRecord.structuredOutput)) {
      if (fieldReview.decision !== 'reject' || editedRejectedFieldKeys.has(fieldReview.fieldKey)) {
        continue;
      }

      if (isFieldAnswerChangedSinceRejected(answers, rejectedSubmission.answers, fieldReview.fieldKey)) {
        continue;
      }

      rejectedFieldDecorations.set(
        fieldReview.fieldKey,
        formatRejectedFieldSuggestion(fieldReview, reviewRecord),
      );
    }
  }

  return rejectedFieldDecorations;
}

function formatRejectedFieldSuggestion(
  fieldReview: AiReviewFieldReview,
  reviewRecord: WorkbenchDto['submissionHistory'][number]['reviewRecords'][number],
): string | null {
  if (fieldReview.suggestions.length > 0) {
    return fieldReview.suggestions.join('；');
  }

  if (fieldReview.comment) {
    return fieldReview.comment;
  }

  return normalizeAiReviewOverallComment(reviewRecord.structuredOutput) ?? reviewRecord.comment ?? null;
}

function isFieldAnswerChangedSinceRejected(
  currentAnswers: Record<string, unknown>,
  rejectedAnswers: Record<string, unknown>,
  fieldKey: string,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(currentAnswers, fieldKey)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(rejectedAnswers, fieldKey)) {
    return false;
  }

  return !areWorkbenchAnswerValuesEqual(currentAnswers[fieldKey], rejectedAnswers[fieldKey]);
}

function areWorkbenchAnswerValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left !== typeof right || left === null || right === null) {
    return false;
  }

  if (typeof left !== 'object') {
    return false;
  }

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
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
type QuestionFlowStatusLabel = '待标注' | 'AI处理中' | '待审核' | '已完成' | '异常';
type QuestionAnnotationStatusLabel = '未填写' | '草稿' | '已标注';

const AI_REVIEWING_SUBMISSION_STATUSES = new Set(['AI_QUEUED', 'AI_REVIEWING', 'SUBMITTED']);
const AI_FAILED_SUBMISSION_STATUSES = new Set(['AI_FAILED', 'FAILED']);
const AI_REJECTED_SUBMISSION_STATUSES = new Set(['AI_REJECTED', 'REJECTED']);
const REVIEWER_REVIEWING_SUBMISSION_STATUSES = new Set([
  'AI_PASSED',
  'AI_MANUAL',
  'HUMAN_PENDING',
  'RECHECK_REVIEWING',
  'RECHECK_APPROVED',
  'RECHECK_REVISED_APPROVED',
  'FINAL_PENDING',
  'FINAL_REVIEWING',
  'UNDER_RECHECK',
]);
const COMPLETED_SUBMISSION_STATUSES = new Set(['FINAL_APPROVED']);
const REVIEWER_REJECTED_SUBMISSION_STATUSES = new Set(['RECHECK_REJECTED', 'FINAL_REJECTED']);
const REVIEWER_REVIEW_STAGES = new Set(['RECHECK', 'FINAL']);

type TaskSubmissionValidationIssue = {
  assignmentId: string;
  taskItemId: string;
  externalId: string;
  fieldKey: string;
  message: string;
};

type TaskSubmissionValidationSnapshot = {
  assignmentId: string;
  taskItemId: string;
  externalId: string;
  sortOrder: number;
  answers: Record<string, unknown>;
};

function collectTaskSubmissionValidationIssues(
  workbench: WorkbenchDto,
  taskAssignments: readonly LabelerAssignmentDto[],
  currentAnswers: Record<string, unknown>,
): TaskSubmissionValidationIssue[] {
  const snapshotsByAssignmentId = new Map<string, TaskSubmissionValidationSnapshot>();
  const fieldOrderByKey = new Map(
    getFlattenedSchemaFields(workbench.task.schema.fields).map((field, index) => [
      getSchemaFieldKey(field),
      index,
    ]),
  );

  for (const assignment of taskAssignments) {
    if (assignment.taskId !== workbench.assignment.taskId || !isSubmittableAssignmentStatus(assignment.status)) {
      continue;
    }

    snapshotsByAssignmentId.set(assignment.assignmentId, {
      assignmentId: assignment.assignmentId,
      taskItemId: assignment.taskItemId,
      externalId: assignment.externalId,
      sortOrder: assignment.taskItemSortOrder,
      answers: resolveSubmissionValidationAnswers(workbench, assignment, currentAnswers),
    });
  }

  if (
    isSubmittableAssignmentStatus(workbench.assignment.status) &&
    !snapshotsByAssignmentId.has(workbench.assignment.id)
  ) {
    snapshotsByAssignmentId.set(workbench.assignment.id, {
      assignmentId: workbench.assignment.id,
      taskItemId: workbench.assignment.taskItemId,
      externalId: workbench.taskItem.externalId,
      sortOrder: workbench.taskItem.sortOrder,
      answers: currentAnswers,
    });
  }

  return [...snapshotsByAssignmentId.values()]
    .sort(compareTaskSubmissionValidationSnapshots)
    .flatMap((snapshot) => {
      const linkageResult = applySchemaLinkage(workbench.task.schema, snapshot.answers);
      const errors = validateSchemaAnswers(
        workbench.task.schema,
        linkageResult.normalizedAnswers,
        linkageResult,
      );

      return [...errors]
        .sort((first, second) =>
          (fieldOrderByKey.get(first.fieldKey) ?? Number.MAX_SAFE_INTEGER) -
          (fieldOrderByKey.get(second.fieldKey) ?? Number.MAX_SAFE_INTEGER),
        )
        .map((error) => ({
          assignmentId: snapshot.assignmentId,
          taskItemId: snapshot.taskItemId,
          externalId: snapshot.externalId,
          fieldKey: error.fieldKey,
          message: error.message,
        }));
    });
}

function resolveSubmissionValidationAnswers(
  workbench: WorkbenchDto,
  assignment: LabelerAssignmentDto,
  currentAnswers: Record<string, unknown>,
): Record<string, unknown> {
  if (assignment.assignmentId === workbench.assignment.id) {
    return currentAnswers;
  }

  return assignment.draftAnswers ?? {};
}

function compareTaskSubmissionValidationSnapshots(
  first: TaskSubmissionValidationSnapshot,
  second: TaskSubmissionValidationSnapshot,
): number {
  if (first.sortOrder !== second.sortOrder) {
    return first.sortOrder - second.sortOrder;
  }

  return first.externalId.localeCompare(second.externalId, 'zh-CN', { numeric: true });
}

function formatTaskSubmissionValidationIssue(issue: TaskSubmissionValidationIssue): string {
  return `题目 ${issue.externalId}：${normalizeInlineValidationMessage(issue.message)}`;
}

function normalizeInlineValidationMessage(message: string): string {
  const normalizedMessage = message.replace(/[。.!！]+$/g, '').trim();

  return normalizedMessage || '答案填写有误';
}

function formatTaskSubmissionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : '';
  if (!message) {
    return '提交失败';
  }

  if (/答案未通过\s*Schema\s*校验/i.test(message)) {
    const externalId = message.match(/题目\s*(.+?)\s*的答案未通过\s*Schema\s*校验/i)?.[1]?.trim();

    return externalId ? `题目 ${externalId}：答案填写有误` : '提交前请修正题目答案后再提交';
  }

  return message;
}

function findSchemaFieldNode(fieldKey: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>('[data-field-key]')].find(
    (element) => element.dataset.fieldKey === fieldKey,
  ) ?? null;
}

function focusFirstEditableControl(fieldNode: HTMLElement | null): void {
  fieldNode
    ?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement>(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]',
    )
    ?.focus();
}

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

function resolveCurrentQuestionFlowStatusLabel(workbench: WorkbenchDto): QuestionFlowStatusLabel {
  const status = workbench.assignment.status;
  const latestSubmission = latestSubmissionByRound(workbench.submissionHistory);

  if (status === 'FINAL_APPROVED' || COMPLETED_SUBMISSION_STATUSES.has(latestSubmission?.status ?? '')) {
    return '已完成';
  }

  if (status === 'NEEDS_REVISION') {
    return '待标注';
  }

  if (status === 'SUBMITTED') {
    return resolveSubmittedQuestionFlowStatusLabel(latestSubmission?.status ?? null);
  }

  if (status === 'UNDER_RECHECK' || status === 'FINAL_PENDING') {
    return '待审核';
  }

  if (isSubmittableAssignmentStatus(status)) {
    return '待标注';
  }

  return '待标注';
}

function resolveNavigationQuestionFlowStatusLabel(assignment: LabelerAssignmentDto): QuestionFlowStatusLabel {
  if (
    assignment.status === 'FINAL_APPROVED' ||
    COMPLETED_SUBMISSION_STATUSES.has(assignment.latestSubmissionStatus ?? '')
  ) {
    return '已完成';
  }

  if (assignment.status === 'NEEDS_REVISION') {
    return '待标注';
  }

  if (assignment.status === 'SUBMITTED') {
    return resolveSubmittedQuestionFlowStatusLabel(assignment.latestSubmissionStatus);
  }

  if (assignment.status === 'UNDER_RECHECK' || assignment.status === 'FINAL_PENDING') {
    return '待审核';
  }

  if (isSubmittableAssignmentStatus(assignment.status)) {
    return '待标注';
  }

  return '待标注';
}

function resolveSubmittedQuestionFlowStatusLabel(status: string | null): QuestionFlowStatusLabel {
  if (COMPLETED_SUBMISSION_STATUSES.has(status ?? '')) {
    return '已完成';
  }

  if (AI_FAILED_SUBMISSION_STATUSES.has(status ?? '')) {
    return '异常';
  }

  if (REVIEWER_REJECTED_SUBMISSION_STATUSES.has(status ?? '') || AI_REJECTED_SUBMISSION_STATUSES.has(status ?? '')) {
    return '待标注';
  }

  if (REVIEWER_REVIEWING_SUBMISSION_STATUSES.has(status ?? '')) {
    return '待审核';
  }

  if (AI_REVIEWING_SUBMISSION_STATUSES.has(status ?? '')) {
    return 'AI处理中';
  }

  return 'AI处理中';
}

function resolveCurrentQuestionAnnotationStatusLabel(
  workbench: WorkbenchDto,
  progress: QuestionProgressState,
): QuestionAnnotationStatusLabel {
  const status = workbench.assignment.status;
  const latestSubmission = latestSubmissionByRound(workbench.submissionHistory);

  if (
    status === 'FINAL_APPROVED' ||
    status === 'SUBMITTED' ||
    status === 'UNDER_RECHECK' ||
    status === 'FINAL_PENDING' ||
    COMPLETED_SUBMISSION_STATUSES.has(latestSubmission?.status ?? '')
  ) {
    return '已标注';
  }

  return formatAnnotationProgressLabel(progress);
}

function resolveTaskHeaderStatusLabel(
  workbench: WorkbenchDto,
  assignments: readonly LabelerAssignmentDto[],
  currentTimeMs: number,
): string {
  const taskAssignments = assignments.length > 0 ? assignments : [{
    ...workbench.assignment,
    assignmentId: workbench.assignment.id,
    taskTitle: workbench.task.title,
    taskItemId: workbench.taskItem.id,
    taskItemSortOrder: workbench.taskItem.sortOrder,
    externalId: workbench.taskItem.externalId,
    datasetKind: workbench.taskItem.datasetKind,
    templateName: workbench.task.templateName,
    schemaVersion: workbench.task.schemaVersion,
    latestSubmissionStatus: latestSubmissionByRound(workbench.submissionHistory)?.status ?? null,
  } as LabelerAssignmentDto];

  if (taskAssignments.some((assignment) => assignment.status === 'NEEDS_REVISION')) {
    return '待修改';
  }

  if (taskAssignments.every((assignment) =>
    assignment.status === 'FINAL_APPROVED' ||
    COMPLETED_SUBMISSION_STATUSES.has(assignment.latestSubmissionStatus ?? ''),
  )) {
    return '已完成';
  }

  return formatDeadlineCountdown(workbench.task.deadline, currentTimeMs);
}

function resolveNavigationQuestionAnnotationStatusLabel(
  assignment: LabelerAssignmentDto,
  locallyProgress?: QuestionProgressState,
  schema?: WorkbenchDto['task']['schema'],
): QuestionAnnotationStatusLabel {
  if (
    assignment.status === 'FINAL_APPROVED' ||
    assignment.status === 'SUBMITTED' ||
    assignment.status === 'UNDER_RECHECK' ||
    assignment.status === 'FINAL_PENDING' ||
    COMPLETED_SUBMISSION_STATUSES.has(assignment.latestSubmissionStatus ?? '')
  ) {
    return '已标注';
  }

  if (locallyProgress) {
    return formatAnnotationProgressLabel(locallyProgress);
  }

  if (assignment.draftAnswers && schema && isSubmittableAssignmentStatus(assignment.status)) {
    return formatAnnotationProgressLabel(resolveSchemaAnswerProgressState(schema, assignment.draftAnswers));
  }

  return '未填写';
}

function formatAnnotationProgressLabel(progress: QuestionProgressState): QuestionAnnotationStatusLabel {
  if (progress === 'complete') {
    return '已标注';
  }

  if (progress === 'draft') {
    return '草稿';
  }

  return '未填写';
}

function latestSubmissionByRound(
  submissions: WorkbenchDto['submissionHistory'],
): WorkbenchDto['submissionHistory'][number] | null {
  return submissions.reduce<WorkbenchDto['submissionHistory'][number] | null>(
    (latest, submission) => (!latest || submission.round > latest.round ? submission : latest),
    null,
  );
}

function latestReviewRecordByCreatedAt(
  reviewRecords: WorkbenchDto['submissionHistory'][number]['reviewRecords'],
): WorkbenchDto['submissionHistory'][number]['reviewRecords'][number] | null {
  return reviewRecords.reduce<WorkbenchDto['submissionHistory'][number]['reviewRecords'][number] | null>(
    (latest, record) => (!latest || latest.createdAt.localeCompare(record.createdAt) < 0 ? record : latest),
    null,
  );
}

function isReviewerRejectionSource(input: {
  stage?: string | null;
  reviewerType?: string | null;
  submissionStatus?: string | null;
}): boolean {
  if (input.reviewerType === 'HUMAN') {
    return true;
  }

  if (input.stage && REVIEWER_REVIEW_STAGES.has(input.stage)) {
    return true;
  }

  return REVIEWER_REJECTED_SUBMISSION_STATUSES.has(input.submissionStatus ?? '');
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
  return `/labeler/tasks/${encodeURIComponent(assignment.taskDisplayId || assignment.taskId)}/items/${encodeURIComponent(assignment.externalId || assignment.taskItemId)}`;
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

function isCompletedAssignmentStatus(status: AssignmentStatus): boolean {
  return status === 'FINAL_APPROVED';
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
  navigationState: WorkbenchNavigationState | null,
): WorkbenchTaskIdentity {
  const currentTaskAssignment = taskAssignments.find(
    (assignment) => assignment.taskId === workbench.assignment.taskId,
  );
  const assignmentTaskTitle = currentTaskAssignment?.taskTitle;

  return {
    displayId: resolveWorkbenchTaskDisplayId(
      workbench.assignment.taskId,
      [navigationState?.taskDisplayId, currentTaskAssignment?.taskDisplayId],
      taskAssignments,
    ),
    title:
      assignmentTaskTitle?.trim() ||
      navigationState?.taskTitle?.trim() ||
      workbench.task.title,
  };
}

const BUSINESS_TASK_DISPLAY_ID_PATTERN = /^T-\d+$/i;

function resolveWorkbenchTaskDisplayId(
  taskId: string,
  candidates: Array<string | null | undefined>,
  taskAssignments: LabelerAssignmentDto[],
): string {
  const displayId = candidates.map(resolveDisplayableTaskId).find((candidate): candidate is string => Boolean(candidate));

  if (displayId) {
    return displayId;
  }

  const uniqueTaskIds = [...new Set(taskAssignments.map((assignment) => assignment.taskId))].sort();
  const taskIndex = uniqueTaskIds.indexOf(taskId);

  return formatGeneratedTaskDisplayId(taskIndex >= 0 ? taskIndex + 1 : 1);
}

function resolveDisplayableTaskId(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim();

  if (!trimmedValue || !BUSINESS_TASK_DISPLAY_ID_PATTERN.test(trimmedValue)) {
    return null;
  }

  return trimmedValue.toUpperCase();
}

function formatGeneratedTaskDisplayId(sequence: number): string {
  return `T-${sequence.toString().padStart(3, '0')}`;
}

function cacheWorkbenchSnapshot<TWorkbench extends WorkbenchDto>(
  workbench: TWorkbench,
  cache: Map<string, WorkbenchDto>,
): TWorkbench {
  cache.set(workbench.assignment.id, workbench);
  return workbench;
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
    return '王昱阳';
  }

  return '标注员';
}

function formatReviewRecordActorName(record: WorkbenchDto['submissionHistory'][number]['reviewRecords'][number]): string {
  const reviewerName =
    record.reviewerName?.trim() ||
    record.assignedReviewerName?.trim() ||
    formatReviewerName(record.reviewerId ?? record.assignedReviewerId);

  return reviewerName.startsWith('复审员') ? reviewerName : `复审员 ${reviewerName}`;
}

function formatReviewerName(reviewerId: string | null | undefined): string {
  if (
    reviewerId === 'user_reviewer_wang_fang' ||
    reviewerId === 'user_reviewer_xinzezhang' ||
    reviewerId === 'reviewer_1'
  ) {
    return '鑫泽张';
  }

  if (reviewerId === 'reviewer_2') {
    return '复审员 2';
  }

  return '复审员';
}

function formatLabelerActorName(labelerId: string | null | undefined): string {
  const labelerName = formatUserName(labelerId);
  return labelerName === '标注员' ? labelerName : `标注员 ${labelerName}`;
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

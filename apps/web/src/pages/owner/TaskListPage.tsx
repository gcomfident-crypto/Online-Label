import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

import {
  type DatasetKind,
  type DatasetRecord,
  type LabelHubSchema,
  type TaskStatus,
} from '@labelhub/shared';
import {
  createTask,
  deleteTask,
  listTasks,
  updateTask,
  updateTaskStatus,
  type TaskDto,
  type TaskFormInput,
} from '../../api/tasks';
import {
  importTaskItems,
  importTaskItemsZip,
  listTaskItems,
  type DatasetImportSummaryDto,
  type TaskItemDto,
} from '../../api/datasets';
import {
  listTemplates,
  type TemplateDto,
} from '../../api/templates';
import { PageLoading } from '../../components/PageLoading';
import {
  ToastViewport,
  createErrorToast,
  createStatusToast,
  type ToastMessage,
} from '../../components/ToastViewport';
import { useAdaptiveTablePageSize } from '../../hooks/useAdaptiveTablePageSize';
import { DatasetPreviewModal } from './components/DatasetPreviewModal';
import { PublishDrawer, type TaskDrawerFieldErrors } from './components/PublishDrawer';
import { TaskTable } from './components/TaskTable';
import {
  createAutoShowItemPreviewRecords,
  createAutoShowItemTemplateName,
  createAutoShowItemTemplateSchema,
  createAutoTemplateClassificationRequest,
} from './autoShowItemTemplate';
import {
  OWNER_TASKS_PATH,
  OWNER_TEMPLATES_PATH,
  consumeTaskTemplateReturnHandoff,
  writeTaskTemplateReturnHandoff,
  writeTemplateDraftHandoff,
  type TaskTemplateReturnHandoff,
} from './templateDraftHandoff';
import { createTaskDisplayIdMap, taskCreatedAtTimestamp } from './taskDisplayId';

const OWNER_ID = 'user_owner_zhang_man';
const CLOSE_CONFIRM_ANIMATION_MS = 220;
const DRAWER_CLOSE_ANIMATION_MS = 240;
const TASK_TEMPLATE_RETURN_ANIMATION_MS = 420;
const TASK_ROW_ENTER_ANIMATION_MS = 680;
const TASK_ROW_DELETE_ANIMATION_MS = 260;
const TASKS_FALLBACK_PAGE_SIZE = 7;
const TASK_TABLE_ROW_HEIGHT = 66;
const DATASET_FILE_MAX_SIZE_BYTES = 20 * 1024 * 1024;
const SUPPORTED_DATASET_EXTENSIONS = ['.json', '.jsonl', '.csv', '.xlsx'] as const;
const SUMMARY_FILTERS: Array<{ label: string; value: TaskStatus | 'ALL'; summaryKey: keyof TaskSummary }> = [
  { label: '总任务', value: 'ALL', summaryKey: 'total' },
  { label: '草稿', value: 'DRAFT', summaryKey: 'draft' },
  { label: '进行中', value: 'PUBLISHED', summaryKey: 'published' },
  { label: '已暂停', value: 'PAUSED', summaryKey: 'paused' },
  { label: '已完成', value: 'ENDED', summaryKey: 'ended' },
];

type TaskSummary = {
  draft: number;
  ended: number;
  paused: number;
  published: number;
  total: number;
};

type TaskTemplateSummary = TaskDto['template'];
type DatasetTemplateDraft = {
  fileName: string;
  name: string;
  previewRecords: DatasetRecord[];
  schema: LabelHubSchema;
};

export const TaskListPage = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL');
  const [currentTaskPage, setCurrentTaskPage] = useState(1);
  const [selectedTask, setSelectedTask] = useState<TaskDto | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormInput | null>(null);
  const [drawerMode, setDrawerMode] = useState<'existing' | 'new' | null>(null);
  const [templateOptions, setTemplateOptions] = useState<TaskTemplateSummary[]>([]);
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [datasetTemplateDraft, setDatasetTemplateDraft] = useState<DatasetTemplateDraft | null>(null);
  const [datasetTemplateSourceRecords, setDatasetTemplateSourceRecords] = useState<DatasetRecord[]>([]);
  const [datasetImportSummary, setDatasetImportSummary] = useState<DatasetImportSummaryDto | null>(null);
  const [datasetPreviewItems, setDatasetPreviewItems] = useState<TaskItemDto[]>([]);
  const [isDatasetPreviewOpen, setIsDatasetPreviewOpen] = useState(false);
  const [isDatasetPreviewLoading, setIsDatasetPreviewLoading] = useState(false);
  const [datasetPreviewError, setDatasetPreviewError] = useState<string | null>(null);
  const [isDrawerClosing, setIsDrawerClosing] = useState(false);
  const [isReturningFromTemplate, setIsReturningFromTemplate] = useState(false);
  const [isTaskFormDirty, setIsTaskFormDirty] = useState(false);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const [isCloseConfirmClosing, setIsCloseConfirmClosing] = useState(false);
  const [drawerFieldErrors, setDrawerFieldErrors] = useState<TaskDrawerFieldErrors>({});
  const [toastMessages, setToastMessages] = useState<ToastMessage[]>([]);
  const [deletingTaskIds, setDeletingTaskIds] = useState<ReadonlySet<string>>(() => new Set());
  const [enteringTaskIds, setEnteringTaskIds] = useState<ReadonlySet<string>>(() => new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreparingNewTask, setIsPreparingNewTask] = useState(false);
  const datasetFileSelectionId = useRef(0);
  const closeConfirmTimerRef = useRef<number | null>(null);
  const drawerCloseTimerRef = useRef<number | null>(null);
  const templateReturnAnimationTimerRef = useRef<number | null>(null);
  const taskEnterTimerRefs = useRef<Map<string, number>>(new Map());
  const taskDeleteTimerRefs = useRef<Map<string, number>>(new Map());
  const toastSequenceRef = useRef(0);
  const templateOptionsRequestTaskIdRef = useRef<string | null>(null);
  const { containerRef: taskTableContainerRef, pageSize: taskPageSize } = useAdaptiveTablePageSize({
    fallbackPageSize: TASKS_FALLBACK_PAGE_SIZE,
    rowHeight: TASK_TABLE_ROW_HEIGHT,
  });

  useEffect(() => {
    void loadTasks();
  }, []);

  useEffect(() => {
    const handoff = consumeTaskTemplateReturnHandoff();

    if (!handoff) {
      return;
    }

    restoreTaskDrawerFromTemplateReturn(handoff);
  }, []);

  useEffect(() => {
    return () => {
      if (closeConfirmTimerRef.current) {
        window.clearTimeout(closeConfirmTimerRef.current);
      }

      if (drawerCloseTimerRef.current) {
        window.clearTimeout(drawerCloseTimerRef.current);
      }

      if (templateReturnAnimationTimerRef.current) {
        window.clearTimeout(templateReturnAnimationTimerRef.current);
      }

      taskEnterTimerRefs.current.forEach((timerId) => window.clearTimeout(timerId));
      taskEnterTimerRefs.current.clear();
      taskDeleteTimerRefs.current.forEach((timerId) => window.clearTimeout(timerId));
      taskDeleteTimerRefs.current.clear();
    };
  }, []);

  const loadTasks = async () => {
    setIsLoading(true);
    try {
      setTasks(await listTasks({ ownerId: OWNER_ID }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '任务列表加载失败。';

      setTasks([]);
      if (!isTaskListBootstrapError(message)) {
        showErrorToast(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetDatasetPreview = () => {
    setDatasetPreviewItems([]);
    setIsDatasetPreviewOpen(false);
    setIsDatasetPreviewLoading(false);
    setDatasetPreviewError(null);
  };

  const displayTasks = useMemo(() => resolveOwnerDisplayTasks(tasks), [tasks]);
  const taskDisplayIdMap = useMemo(() => createTaskDisplayIdMap(displayTasks), [displayTasks]);

  const filteredTasks = useMemo(() => {
    return displayTasks
      .filter((task) => {
        const matchesStatus = statusFilter === 'ALL' || task.status === statusFilter;
        const keyword = searchKeyword.trim().toLowerCase();
        const taskDisplayId = taskDisplayIdMap.get(task.id) ?? task.id;
        const matchesSearch =
          keyword.length === 0 ||
          task.title.toLowerCase().includes(keyword) ||
          task.id.toLowerCase().includes(keyword) ||
          taskDisplayId.toLowerCase().includes(keyword) ||
          '张满'.includes(keyword);

        return matchesStatus && matchesSearch;
      })
      .sort((left, right) => taskCreatedAtTimestamp(right) - taskCreatedAtTimestamp(left));
  }, [displayTasks, searchKeyword, statusFilter, taskDisplayIdMap]);
  const totalTaskPages = Math.max(1, Math.ceil(filteredTasks.length / taskPageSize));
  const paginatedTasks = useMemo(() => {
    const startIndex = (currentTaskPage - 1) * taskPageSize;

    return filteredTasks.slice(startIndex, startIndex + taskPageSize);
  }, [currentTaskPage, filteredTasks, taskPageSize]);
  const summary = useMemo<TaskSummary>(
    () => ({
      total: displayTasks.length,
      draft: displayTasks.filter((task) => task.status === 'DRAFT').length,
      published: displayTasks.filter((task) => task.status === 'PUBLISHED').length,
      paused: displayTasks.filter((task) => task.status === 'PAUSED').length,
      ended: displayTasks.filter((task) => task.status === 'ENDED').length,
    }),
    [displayTasks],
  );
  const drawerDatasetFileName = datasetFile?.name ?? getDatasetFileNameFromImportSummary(datasetImportSummary);
  const isDrawerDatasetPreviewAvailable = Boolean(datasetFile) || Boolean(datasetImportSummary);
  const canCreateTemplateFromDataset = Boolean(datasetTemplateDraft) || Boolean(datasetImportSummary);

  useEffect(() => {
    setCurrentTaskPage(1);
  }, [searchKeyword, statusFilter]);

  useEffect(() => {
    setCurrentTaskPage((current) => Math.min(current, totalTaskPages));
  }, [totalTaskPages]);

  const openPublishDrawer = (task: TaskDto) => {
    clearDrawerCloseTimer();
    clearTemplateReturnAnimationTimer();
    setIsReturningFromTemplate(false);
    setIsDrawerClosing(false);
    setSelectedTask(task);
    setTaskForm(taskToForm(task));
    setDrawerMode('existing');
    setTemplateOptions((current) => mergeTaskTemplates([task.template, ...current]));
    setDatasetFile(null);
    setDatasetTemplateDraft(null);
    setDatasetTemplateSourceRecords([]);
    setDatasetImportSummary(task.datasetImportSummary ?? null);
    resetDatasetPreview();
    setIsTaskFormDirty(false);
    setIsCloseConfirmOpen(false);
    setDrawerFieldErrors({});
  };

  const handleTemplatePickerOpen = () => {
    if (!selectedTask || drawerMode !== 'existing' || selectedTask.status !== 'DRAFT') {
      return;
    }

    const hasLoadedAlternatives = templateOptions.some((template) => template.id !== selectedTask.templateId);
    if (hasLoadedAlternatives || templateOptionsRequestTaskIdRef.current === selectedTask.id) {
      return;
    }

    const task = selectedTask;
    templateOptionsRequestTaskIdRef.current = task.id;
    void loadTaskTemplateOptions()
      .then((options) => {
        setTemplateOptions((current) => mergeTaskTemplates([...options, task.template, ...current]));
      })
      .catch(() => {
        setTemplateOptions((current) => mergeTaskTemplates([task.template, ...current]));
      })
      .finally(() => {
        if (templateOptionsRequestTaskIdRef.current === task.id) {
          templateOptionsRequestTaskIdRef.current = null;
        }
      });
  };

  const restoreTaskDrawerFromTemplateReturn = (handoff: TaskTemplateReturnHandoff) => {
    clearDrawerCloseTimer();
    clearCloseConfirmTimer();
    clearTemplateReturnAnimationTimer();
    setIsDrawerClosing(false);
    setIsReturningFromTemplate(true);
    setTemplateOptions(mergeTaskTemplates(handoff.templateOptions));
    setSelectedTask(handoff.selectedTask);
    setTaskForm(handoff.form);
    setDrawerMode(handoff.drawerMode);
    setDatasetFile(handoff.datasetFile);
    setDatasetTemplateDraft(handoff.datasetTemplateDraft);
    setDatasetTemplateSourceRecords(handoff.datasetTemplateDraft?.previewRecords ?? []);
    setDatasetImportSummary(handoff.datasetImportSummary);
    resetDatasetPreview();
    setIsTaskFormDirty(handoff.isTaskFormDirty);
    setIsCloseConfirmOpen(false);
    setIsCloseConfirmClosing(false);
    setDrawerFieldErrors({});

    templateReturnAnimationTimerRef.current = window.setTimeout(() => {
      templateReturnAnimationTimerRef.current = null;
      setIsReturningFromTemplate(false);
    }, TASK_TEMPLATE_RETURN_ANIMATION_MS);
  };

  const handleCreateTask = async () => {
    setIsPreparingNewTask(true);

    try {
      const availableTemplates = await loadTaskTemplateOptions().catch(() => []);

      setTemplateOptions(availableTemplates);
      clearDrawerCloseTimer();
      clearTemplateReturnAnimationTimer();
      setIsDrawerClosing(false);
      setIsReturningFromTemplate(false);
      setDrawerMode('new');
      setDatasetFile(null);
      setDatasetTemplateDraft(null);
      setDatasetTemplateSourceRecords([]);
      setDatasetImportSummary(null);
      resetDatasetPreview();
      setIsTaskFormDirty(false);
      setIsCloseConfirmOpen(false);
      setDrawerFieldErrors({});

      const initialForm = createDefaultTaskForm(UNCONFIGURED_TEMPLATE.id);
      setSelectedTask(createNewTaskPreviewFromTemplate(UNCONFIGURED_TEMPLATE, initialForm));
      setTaskForm(initialForm);
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '模板列表加载失败，无法创建任务。');
    } finally {
      setIsPreparingNewTask(false);
    }
  };

  const handleTaskFormChange = (patch: Partial<TaskFormInput>) => {
    setTaskForm((current) => (current ? { ...current, ...patch } : current));
    setIsTaskFormDirty(true);
    setDrawerFieldErrors({});
  };

  const handleTemplateChange = (templateId: string) => {
    const template = templateOptions.find((item) => item.id === templateId);
    if (!template?.id) {
      return;
    }

    setTaskForm((current) => (current ? { ...current, templateId } : current));
    setSelectedTask((current) =>
      current
        ? {
            ...current,
            templateId,
            template,
        }
        : null,
    );
    setIsTaskFormDirty(true);
    setDrawerFieldErrors({});
  };

  const handleDatasetFileChange = (file: File | null) => {
    const selectionId = datasetFileSelectionId.current + 1;
    datasetFileSelectionId.current = selectionId;
    setDrawerFieldErrors({});

    if (file) {
      const fileError = validateDatasetFile(file);

      if (fileError) {
        setDatasetFile(null);
        setDatasetTemplateDraft(null);
        setDatasetTemplateSourceRecords([]);
        setDatasetImportSummary(null);
        resetDatasetPreview();
        setDrawerFieldErrors({ datasetFile: fileError });
        showDrawerError(fileError);
        if (drawerMode === 'new') {
          setTaskForm((current) => (current ? { ...current, quota: null, templateId: '' } : current));
        }
        return;
      }
    }

    setDatasetFile(file);
    setDatasetTemplateDraft(null);
    setDatasetTemplateSourceRecords([]);
    setDatasetImportSummary(null);
    resetDatasetPreview();
    setIsTaskFormDirty((current) => current || Boolean(file));

    if (!file) {
      if (drawerMode === 'new') {
        setTaskForm((current) => (current ? { ...current, quota: null, templateId: '' } : current));
      }
      return;
    }

    void populateDatasetMetadataFromFile(file, selectionId);
  };

  const populateDatasetMetadataFromFile = async (file: File, selectionId: number) => {
    try {
      const records = await parseDatasetRecordsFromFile(file);
      const itemCount = records.length;

      if (selectionId !== datasetFileSelectionId.current) {
        return;
      }

      const autoTemplateSchema = createAutoShowItemTemplateSchema(records, file.name);
      const previewRecords = createAutoShowItemPreviewRecords(records);
      setDatasetTemplateSourceRecords(records);
      setDatasetTemplateDraft({
        fileName: file.name,
        name: createAutoShowItemTemplateName(file.name),
        previewRecords,
        schema: autoTemplateSchema,
      });
      setTaskForm((current) =>
        current
          ? {
              ...current,
              quota: itemCount,
            }
          : current,
      );
      setSelectedTask((current) =>
        current
          ? {
              ...current,
              quota: itemCount,
            }
          : current,
      );
      setDrawerFieldErrors({});
    } catch {
      if (selectionId !== datasetFileSelectionId.current) {
        return;
      }

      const message = '题目数解析失败，请确认题目数据文件格式。';
      setDatasetTemplateDraft(null);
      setDatasetTemplateSourceRecords([]);
      setDrawerFieldErrors({ datasetFile: message });
      showDrawerError(message);
    }
  };

  const handleCreateTemplateFromDataset = async () => {
    if (!selectedTask || !taskForm || !drawerMode) {
      showDrawerError('请先上传题目数据文件。');
      return;
    }

    try {
      const resolvedDraft = await resolveDatasetTemplateDraftForCreation(selectedTask);

      if (!resolvedDraft) {
        showDrawerError('请先上传题目数据文件。');
        return;
      }

      const { draft, records } = resolvedDraft;
      const didWriteReturn = writeTaskTemplateReturnHandoff({
        datasetFile,
        datasetImportSummary,
        datasetTemplateDraft: draft,
        drawerMode,
        form: taskForm,
        isTaskFormDirty: true,
        selectedTask,
        templateOptions,
      });
      const didWriteDraft = writeTemplateDraftHandoff({
        name: draft.name,
        schema: draft.schema,
        sourceFileName: draft.fileName,
        returnTo: OWNER_TASKS_PATH,
        previewRecords: draft.previewRecords,
        autoClassificationRequest: createAutoTemplateClassificationRequest(
          records,
          draft.fileName,
        ),
      });

      if (!didWriteReturn || !didWriteDraft) {
        showDrawerError('模板草稿准备失败，请稍后重试。');
        return;
      }

      navigate(OWNER_TEMPLATES_PATH);
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '字段分类接口请求失败，请稍后重试。');
    }
  };

  const resolveDatasetTemplateDraftForCreation = async (
    task: TaskDto,
  ): Promise<{ draft: DatasetTemplateDraft; records: DatasetRecord[] } | null> => {
    if (datasetTemplateDraft) {
      return {
        draft: datasetTemplateDraft,
        records: datasetTemplateSourceRecords.length > 0
          ? datasetTemplateSourceRecords
          : datasetTemplateDraft.previewRecords,
      };
    }

    if (!datasetImportSummary) {
      return null;
    }

    const fileName = getDatasetFileNameFromImportSummary(datasetImportSummary);
    if (!fileName) {
      return null;
    }

    const importedRecords = await resolveImportedDatasetRecords(task, datasetImportSummary);
    if (importedRecords.length === 0) {
      return null;
    }

    const previewRecords = createAutoShowItemPreviewRecords(importedRecords);
    const draft: DatasetTemplateDraft = {
      fileName,
      name: createAutoShowItemTemplateName(fileName),
      previewRecords,
      schema: createAutoShowItemTemplateSchema(importedRecords, fileName),
    };

    return {
      draft,
      records: importedRecords,
    };
  };

  const handlePreviewDataset = async () => {
    if (!selectedTask) {
      return;
    }

    setIsDatasetPreviewOpen(true);
    setIsDatasetPreviewLoading(true);
    setDatasetPreviewError(null);

    try {
      const items = datasetFile
        ? await parseDatasetPreviewItemsFromFile(datasetFile, selectedTask)
        : await listTaskItems(selectedTask.id);
      setDatasetPreviewItems(items);
    } catch (error) {
      setDatasetPreviewItems([]);
      setDatasetPreviewError(error instanceof Error ? error.message : '题目数据预览失败。');
    } finally {
      setIsDatasetPreviewLoading(false);
    }
  };

  const importDatasetFileForTask = async (task: TaskDto): Promise<TaskDto> => {
    if (!datasetFile) {
      return task;
    }

    const payload = await buildDatasetImportPayload(datasetFile);
    const summary =
      payload.format === 'zip'
        ? await importTaskItemsZip(task.id, {
            fileName: payload.fileName,
            contentBase64: payload.contentBase64,
          })
        : await importTaskItems(task.id, {
            datasetKind: task.template.datasetKind,
            format: payload.format,
            fileName: payload.fileName,
            ...('content' in payload ? { content: payload.content } : {}),
            ...('contentBase64' in payload ? { contentBase64: payload.contentBase64 } : {}),
          });

    if (summary.importedCount <= 0) {
      throw new Error(formatEmptyImportError(summary));
    }

    const quotaTask = await updateTask(task.id, { quota: summary.importedCount });
    const normalizedSummary = normalizeDatasetImportSummary(summary, task, payload);
    setDatasetFile(null);
    setDatasetTemplateDraft(null);
    setDatasetTemplateSourceRecords([]);
    setDatasetImportSummary(normalizedSummary);

    return {
      ...quotaTask,
      itemCount: Math.max(quotaTask.itemCount, summary.importedCount),
      completedItemCount: quotaTask.completedItemCount ?? 0,
      quota: summary.importedCount,
      datasetImportSummary: normalizedSummary,
    };
  };

  const saveDraft = async (): Promise<TaskDto | null> => {
    if (!taskForm) {
      return null;
    }
    const taskFormForValidation = normalizeTaskForm(taskForm);
    const validation = validateTaskDrawerForm(taskFormForValidation, {
      datasetFile,
      displayTasks,
      intent: 'draft',
      selectedTask,
    });

    if (hasTaskDrawerFieldErrors(validation)) {
      showDrawerValidationErrors(validation);
      return null;
    }

    const taskFormForSave = taskFormForValidation;

    if (drawerMode === 'new') {
      const createdTask = await createTask({ ...taskFormForSave, actorId: OWNER_ID });
      markTaskEntering(createdTask.id);
      setTasks((current) => [createdTask, ...current]);
      setSelectedTask(createdTask);
      setTaskForm(taskToForm(createdTask));
      setDrawerMode('existing');
      const importedTask = await importDatasetFileForTask(createdTask);
      replaceTask(importedTask);
      setSelectedTask(importedTask);
      setTaskForm(taskToForm(importedTask));
      setIsTaskFormDirty(false);

      return importedTask;
    }

    if (!selectedTask) {
      return null;
    }

    const updatedTask = await updateTask(selectedTask.id, taskFormForSave);
    replaceTask(updatedTask);
    setSelectedTask(updatedTask);
    setTaskForm(taskToForm(updatedTask));
    const savedTask = await importDatasetFileForTask(updatedTask);
    replaceTask(savedTask);
    setSelectedTask(savedTask);
    setTaskForm(taskToForm(savedTask));
    setIsTaskFormDirty(false);

    return savedTask;
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      const savedTask = await saveDraft();
      if (!savedTask) {
        return;
      }
      showStatusToast('草稿已保存。');
      setDrawerFieldErrors({});
      closeDrawerWithAnimation();
    } catch (error) {
      showDrawerError(error instanceof Error ? error.message : '草稿保存失败。');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!taskForm) {
      return;
    }

    const normalizedTaskForm = normalizeTaskForm(taskForm);
    const validation = validateTaskDrawerForm(normalizedTaskForm, {
      datasetFile,
      displayTasks,
      intent: 'publish',
      selectedTask,
    });

    if (hasTaskDrawerFieldErrors(validation)) {
      showDrawerValidationErrors(validation);
      return;
    }

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
      closeDrawer();
      showStatusToast('任务已发布。');
      setDrawerFieldErrors({});
    } catch (error) {
      showDrawerError(error instanceof Error ? error.message : '任务发布失败。');
    } finally {
      setIsSaving(false);
    }
  };

  const transitionTask = async (task: TaskDto, status: TaskStatus, successMessage: string) => {
    try {
      const nextTask = await updateTaskStatus(task.id, { status, actorId: OWNER_ID });
      replaceTask(nextTask);
      showStatusToast(successMessage);
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '任务状态更新失败。');
    }
  };

  const handleDeleteTask = async (task: TaskDto) => {
    if (deletingTaskIds.has(task.id)) {
      return;
    }

    markTaskDeleting(task.id);

    try {
      await deleteTask(task.id);
      if (selectedTask?.id === task.id) {
        closeDrawerWithAnimation();
      }
      scheduleTaskRemoval(task.id);
      showStatusToast('任务已删除。');
    } catch (error) {
      clearTaskDeleting(task.id);
      showErrorToast(error instanceof Error ? error.message : '任务删除失败。');
    }
  };

  const markTaskDeleting = (taskId: string) => {
    setDeletingTaskIds((current) => {
      if (current.has(taskId)) {
        return current;
      }

      const next = new Set(current);
      next.add(taskId);
      return next;
    });
  };

  const markTaskEntering = (taskId: string) => {
    setEnteringTaskIds((current) => {
      const next = new Set(current);
      next.add(taskId);
      return next;
    });

    const existingTimerId = taskEnterTimerRefs.current.get(taskId);
    if (existingTimerId) {
      window.clearTimeout(existingTimerId);
    }

    const timerId = window.setTimeout(() => {
      taskEnterTimerRefs.current.delete(taskId);
      setEnteringTaskIds((current) => {
        if (!current.has(taskId)) {
          return current;
        }

        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }, TASK_ROW_ENTER_ANIMATION_MS);

    taskEnterTimerRefs.current.set(taskId, timerId);
  };

  const clearTaskDeleting = (taskId: string) => {
    setDeletingTaskIds((current) => {
      if (!current.has(taskId)) {
        return current;
      }

      const next = new Set(current);
      next.delete(taskId);
      return next;
    });
  };

  const scheduleTaskRemoval = (taskId: string) => {
    const existingTimerId = taskDeleteTimerRefs.current.get(taskId);
    if (existingTimerId) {
      window.clearTimeout(existingTimerId);
    }

    const timerId = window.setTimeout(() => {
      taskDeleteTimerRefs.current.delete(taskId);
      setTasks((current) => current.filter((item) => item.id !== taskId));
      clearTaskDeleting(taskId);
    }, TASK_ROW_DELETE_ANIMATION_MS);

    taskDeleteTimerRefs.current.set(taskId, timerId);
  };

  const replaceTask = (task: TaskDto) => {
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? mergeTaskClientState(task, item) : item)),
    );
  };

  const clearDrawerCloseTimer = () => {
    if (!drawerCloseTimerRef.current) {
      return;
    }

    window.clearTimeout(drawerCloseTimerRef.current);
    drawerCloseTimerRef.current = null;
  };

  const clearTemplateReturnAnimationTimer = () => {
    if (!templateReturnAnimationTimerRef.current) {
      return;
    }

    window.clearTimeout(templateReturnAnimationTimerRef.current);
    templateReturnAnimationTimerRef.current = null;
  };

  const resetDrawerState = () => {
    clearCloseConfirmTimer();
    clearTemplateReturnAnimationTimer();
    setSelectedTask(null);
    setTaskForm(null);
    setDrawerMode(null);
    setDatasetFile(null);
    setDatasetTemplateDraft(null);
    setDatasetTemplateSourceRecords([]);
    setDatasetImportSummary(null);
    resetDatasetPreview();
    setIsDrawerClosing(false);
    setIsReturningFromTemplate(false);
    setIsTaskFormDirty(false);
    setIsCloseConfirmOpen(false);
    setIsCloseConfirmClosing(false);
    setDrawerFieldErrors({});
  };

  const closeDrawer = () => {
    clearDrawerCloseTimer();
    resetDrawerState();
  };

  const closeDrawerWithAnimation = () => {
    if (isDrawerClosing) {
      return;
    }

    clearDrawerCloseTimer();
    clearTemplateReturnAnimationTimer();
    setIsCloseConfirmOpen(false);
    setIsCloseConfirmClosing(false);
    setIsReturningFromTemplate(false);
    setIsDrawerClosing(true);
    drawerCloseTimerRef.current = window.setTimeout(() => {
      drawerCloseTimerRef.current = null;
      resetDrawerState();
    }, DRAWER_CLOSE_ANIMATION_MS);
  };

  const requestDrawerClose = () => {
    if (!shouldPromptBeforeClosingDrawer()) {
      closeDrawerWithAnimation();
      return;
    }

    clearCloseConfirmTimer();
    setIsCloseConfirmOpen(true);
    setIsCloseConfirmClosing(false);
  };

  const shouldPromptBeforeClosingDrawer = () => {
    if (drawerMode === 'new') {
      return Boolean(taskForm?.title.trim());
    }

    return isTaskFormDirty;
  };

  const handleDrawerBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || isCloseConfirmOpen) {
      return;
    }

    requestDrawerClose();
  };

  const handleConfirmSaveDraft = async () => {
    setIsSaving(true);
    try {
      const savedTask = await saveDraft();
      if (!savedTask) {
        closeConfirmWithAnimation();
        return;
      }
      showStatusToast('草稿已保存。');
      setDrawerFieldErrors({});
      closeConfirmWithAnimation(closeDrawerWithAnimation);
    } catch (error) {
      closeConfirmWithAnimation();
      showDrawerError(error instanceof Error ? error.message : '草稿保存失败。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardDraft = () => {
    closeConfirmWithAnimation(closeDrawerWithAnimation);
  };

  const clearCloseConfirmTimer = () => {
    if (!closeConfirmTimerRef.current) {
      return;
    }

    window.clearTimeout(closeConfirmTimerRef.current);
    closeConfirmTimerRef.current = null;
  };

  const closeConfirmWithAnimation = (afterClose?: () => void) => {
    if (!isCloseConfirmOpen) {
      afterClose?.();
      return;
    }

    clearCloseConfirmTimer();
    setIsCloseConfirmClosing(true);
    closeConfirmTimerRef.current = window.setTimeout(() => {
      closeConfirmTimerRef.current = null;
      setIsCloseConfirmOpen(false);
      setIsCloseConfirmClosing(false);
      afterClose?.();
    }, CLOSE_CONFIRM_ANIMATION_MS);
  };

  const showDrawerError = (message: string) => {
    if (isDatasetRelatedError(message)) {
      setDrawerFieldErrors((current) => ({ ...current, datasetFile: message }));
      return;
    }

    showErrorToast(message);
  };

  const showDrawerValidationErrors = (errors: TaskDrawerFieldErrors) => {
    setDrawerFieldErrors(errors);
  };

  const showToast = (message: ToastMessage) => {
    toastSequenceRef.current += 1;
    setToastMessages((current) => [
      ...current,
      {
        ...message,
        id: `${message.id}-${toastSequenceRef.current}`,
      },
    ].slice(-4));
  };

  const showStatusToast = (message: string) => {
    showToast(createStatusToast(message));
  };

  const showErrorToast = (message: string) => {
    showToast(createErrorToast(message));
  };

  const dismissToast = (id: string) => {
    setToastMessages((current) => current.filter((message) => message.id !== id));
  };

  const isCurrentTemplateEditable = drawerMode === 'new' || selectedTask?.status === 'DRAFT';

  return (
    <section className="task-management-page" aria-labelledby="owner-tasks-title">
      <ToastViewport messages={toastMessages} onDismiss={dismissToast} />

      <div className="task-management-header">
        <div>
          <h1 id="owner-tasks-title">任务管理</h1>
        </div>
      </div>

      <section className="task-management-table-card" aria-label="任务列表工作区">
        <div className="task-management-table-toolbar">
          <div className="task-summary-grid">
            {SUMMARY_FILTERS.map((item) => (
              <SummaryCard
                key={item.value}
                isActive={statusFilter === item.value}
                label={item.label}
                status={item.value}
                value={summary[item.summaryKey].toString()}
                onClick={() => setStatusFilter(item.value)}
              />
            ))}
          </div>

          <div className="task-filter-bar">
            <input
              aria-label="搜索任务"
              placeholder="搜索任务名 / ID / 负责人"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
            />
            <button
              className="primary-action create-action task-filter-bar__create"
              type="button"
              disabled={isPreparingNewTask}
              onClick={() => void handleCreateTask()}
            >
              新建任务
            </button>
          </div>
        </div>

        {isLoading ? (
          <PageLoading title="正在加载任务列表" description="正在同步任务状态、题目数和发布信息。" />
        ) : (
          <TaskTable
            currentPage={currentTaskPage}
            getTaskDisplayId={(task) => taskDisplayIdMap.get(task.id) ?? task.id}
            enteringTaskIds={enteringTaskIds}
            tablePanelRef={taskTableContainerRef}
            tasks={paginatedTasks}
            totalPages={totalTaskPages}
            onOpenTask={openPublishDrawer}
            onPageChange={setCurrentTaskPage}
            onPublish={openPublishDrawer}
            onPause={(task) => void transitionTask(task, 'PAUSED', '任务已暂停。')}
            onResume={(task) => void transitionTask(task, 'PUBLISHED', '任务已恢复发布。')}
            onEnd={(task) => void transitionTask(task, 'ENDED', '任务已完成。')}
            deletingTaskIds={deletingTaskIds}
            onDelete={(task) => void handleDeleteTask(task)}
          />
        )}
      </section>

      {selectedTask && taskForm
        ? createPortal(
        <div
          className={[
            'task-publish-drawer-shell',
            isDrawerClosing ? 'is-closing' : '',
            isReturningFromTemplate ? 'is-returning-from-template' : '',
          ].filter(Boolean).join(' ')}
          onMouseDown={handleDrawerBackdropClick}
        >
          <PublishDrawer
            task={selectedTask}
            form={taskForm}
            fieldErrors={drawerFieldErrors}
            templateOptions={templateOptions}
            isTemplateEditable={isCurrentTemplateEditable}
            isSaving={isSaving}
            datasetFileName={drawerDatasetFileName}
            importSummary={datasetImportSummary}
            isDatasetPreviewAvailable={isDrawerDatasetPreviewAvailable}
            isDatasetPreviewLoading={isDatasetPreviewLoading}
            onChange={handleTaskFormChange}
            onTemplateChange={handleTemplateChange}
            onTemplatePickerOpen={handleTemplatePickerOpen}
            onCreateTemplateFromDataset={canCreateTemplateFromDataset ? handleCreateTemplateFromDataset : undefined}
            onDatasetFileChange={handleDatasetFileChange}
            onPreviewDataset={() => void handlePreviewDataset()}
            onSaveDraft={handleSaveDraft}
            onPublish={handlePublish}
          />
          {isDatasetPreviewOpen ? (
            <DatasetPreviewModal
              items={datasetPreviewItems}
              isLoading={isDatasetPreviewLoading}
              errorMessage={datasetPreviewError}
              onClose={resetDatasetPreview}
            />
          ) : null}
          {isCloseConfirmOpen ? (
            <div
              className={
                isCloseConfirmClosing
                  ? 'task-close-confirm is-closing'
                  : 'task-close-confirm'
              }
              role="dialog"
              aria-modal="true"
              aria-labelledby="task-close-confirm-title"
            >
              <div
                className="task-close-confirm__panel"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="task-close-confirm__header">
                  <h2 id="task-close-confirm-title">需要保存成草稿吗？</h2>
                  <button
                    aria-label="关闭保存草稿确认弹窗"
                    className="task-close-confirm__close"
                    disabled={isSaving}
                    type="button"
                    onClick={() => closeConfirmWithAnimation()}
                  >
                    ×
                  </button>
                </div>
                <p>当前修改尚未发布，关闭后将丢失未保存内容</p>
                <div className="task-close-confirm__actions">
                  <button
                    className="task-close-confirm__cancel"
                    type="button"
                    disabled={isSaving}
                    onClick={handleDiscardDraft}
                  >
                    取消
                  </button>
                  <button
                    className="task-close-confirm__save"
                    type="button"
                    disabled={isSaving}
                    onClick={handleConfirmSaveDraft}
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
          ,
          document.body,
        )
        : null}
    </section>
  );
};

const SummaryCard = ({
  isActive,
  label,
  onClick,
  status,
  value,
}: {
  isActive: boolean;
  label: string;
  onClick: () => void;
  status: TaskStatus | 'ALL';
  value: string;
}) => (
  <button
    className={[
      'task-summary-card',
      status === 'ALL' ? 'task-summary-card--total' : '',
      status === 'DRAFT' ? 'task-summary-card--draft' : '',
      status === 'PUBLISHED' ? 'task-summary-card--running' : '',
      status === 'PAUSED' ? 'task-summary-card--paused' : '',
      status === 'ENDED' ? 'task-summary-card--done' : '',
      isActive ? 'is-active' : '',
    ].filter(Boolean).join(' ')}
    type="button"
    aria-pressed={isActive}
    onClick={onClick}
  >
    <span>{label}</span>
    <strong>{value}</strong>
  </button>
);

const taskToForm = (task: TaskDto): TaskFormInput => ({
  title: task.title,
  tags: task.tags,
  rewardPerItem: task.rewardPerItem,
  perUserLimit: task.perUserLimit,
  quota: task.quota,
  deadline: task.deadline,
  distributionStrategy: task.distributionStrategy,
  aiPreReviewEnabled: task.aiPreReviewEnabled,
  aiRuleName: task.aiRuleName,
  templateId: task.templateId,
});

const normalizeTaskForm = (form: TaskFormInput): TaskFormInput => ({
  ...form,
  title: form.title.trim(),
  tags: (form.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
});

const validateTaskDrawerForm = (
  form: TaskFormInput,
  options: {
    datasetFile: File | null;
    displayTasks: TaskDto[];
    intent: 'draft' | 'publish';
    selectedTask: TaskDto | null;
  },
): TaskDrawerFieldErrors => {
  const errors: TaskDrawerFieldErrors = {};
  const title = form.title.trim();
  const tags = form.tags ?? [];
  const isPublishing = options.intent === 'publish';

  if (!title) {
    errors.title = '请输入任务标题。';
  } else if (title.length > 40) {
    errors.title = '任务标题不能超过 40 个字符。';
  } else if (!/[\p{L}\p{N}]/u.test(title)) {
    errors.title = '任务标题需要包含文字或数字。';
  } else if (
    options.displayTasks.some((task) => {
      if (task.id === options.selectedTask?.id || task.id === 'new-task-draft') {
        return false;
      }

      return task.title.trim() === title;
    })
  ) {
    errors.title = '任务标题已存在，请换一个标题。';
  }

  if (tags.length > 5) {
    errors.tags = '最多添加 5 个标签。';
  } else {
    const invalidTag = tags.find((tag) => tag.length > 12 || !/[\p{L}\p{N}]/u.test(tag));
    if (invalidTag) {
      errors.tags = '每个标签需为 1-12 个字符，并包含文字或数字。';
    }
  }

  const rewardPerItem = form.rewardPerItem;
  if (rewardPerItem === null || rewardPerItem === undefined) {
    if (isPublishing) {
      errors.rewardPerItem = '请输入单条奖励。';
    }
  } else if (!Number.isFinite(rewardPerItem)) {
    errors.rewardPerItem = '请输入数字。';
  } else if (rewardPerItem < 0) {
    errors.rewardPerItem = '不能输入负数。';
  } else if (rewardPerItem === 0 || rewardPerItem > 100) {
    errors.rewardPerItem = '单条奖励需大于 0 且不超过 100 元。';
  } else if (Math.abs(Math.round(rewardPerItem * 100) - rewardPerItem * 100) > 1e-8) {
    errors.rewardPerItem = '单条奖励最多保留两位小数。';
  }

  if (!form.deadline) {
    if (isPublishing) {
      errors.deadline = '请选择截止时间。';
    }
  } else {
    const deadline = new Date(form.deadline);
    if (!Number.isFinite(deadline.getTime())) {
      errors.deadline = '截止时间格式不正确。';
    } else if (deadline < new Date()) {
      errors.deadline = '截止时间不能早于当前时间。';
    }
  }

  if (isPublishing && !form.templateId) {
    errors.templateId = '请选择评测模板。';
  }

  if (options.datasetFile) {
    const datasetFileError = validateDatasetFile(options.datasetFile);
    if (datasetFileError) {
      errors.datasetFile = datasetFileError;
    } else if ((form.quota ?? 0) <= 0) {
      errors.datasetFile = '题目数据无法解析出有效题目。';
    }
  } else if (
    options.intent === 'publish' &&
    (!options.selectedTask || options.selectedTask.itemCount <= 0)
  ) {
    errors.datasetFile = '题目数据未导入';
  }

  return errors;
};

const validateDatasetFile = (file: File): string | null => {
  if (!SUPPORTED_DATASET_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension))) {
    return '仅支持 JSON、JSONL、CSV、XLSX 格式。';
  }

  if (file.size > DATASET_FILE_MAX_SIZE_BYTES) {
    return '题目数据文件不能超过 20MB。';
  }

  return null;
};

const hasTaskDrawerFieldErrors = (errors: TaskDrawerFieldErrors): boolean => {
  return Object.values(errors).some(Boolean);
};

const isDatasetRelatedError = (message: string): boolean =>
  message.includes('题目数据') || message.includes('导入') || message.includes('上传文件');

const createDefaultTaskForm = (templateId: string): TaskFormInput => ({
  title: '',
  tags: [],
  rewardPerItem: null,
  perUserLimit: null,
  quota: null,
  deadline: null,
  distributionStrategy: 'FIRST_COME_FIRST_SERVE',
  aiPreReviewEnabled: false,
  aiRuleName: null,
  templateId,
});

const createNewTaskPreviewFromTemplate = (template: TaskTemplateSummary, form: TaskFormInput): TaskDto => {
  const now = new Date().toISOString();

  return {
    id: 'new-task-draft',
    title: form.title,
    description: null,
    richTextInstruction: null,
    tags: form.tags ?? [],
    rewardRule: formatRewardRule(form.rewardPerItem ?? null),
    rewardPerItem: form.rewardPerItem ?? null,
    perUserLimit: form.perUserLimit ?? null,
    quota: form.quota ?? null,
    deadline: form.deadline ?? null,
    distributionStrategy: form.distributionStrategy ?? 'FIRST_COME_FIRST_SERVE',
    aiPreReviewEnabled: Boolean(form.aiPreReviewEnabled),
    aiRuleName: form.aiRuleName ?? null,
    status: 'DRAFT',
    templateId: form.templateId,
    template,
    createdById: OWNER_ID,
    itemCount: 0,
    completedItemCount: 0,
    exportableItemCount: 0,
    createdAt: now,
    updatedAt: now,
  };
};

const UNCONFIGURED_TEMPLATE: TaskTemplateSummary = {
  id: '',
  name: '',
  datasetKind: 'generic_json',
  schemaVersion: '',
  status: 'DRAFT',
};

const loadTaskTemplateOptions = async (): Promise<TaskTemplateSummary[]> => {
  const templates = await listTemplates();

  return mergeTaskTemplates(templates.map(templateToTaskTemplateSummary));
};

const templateToTaskTemplateSummary = (template: TemplateDto): TaskTemplateSummary => ({
  id: template.id,
  name: template.name,
  datasetKind: template.datasetKind,
  schemaVersion: template.schemaVersion,
  status: template.status,
});

const mergeTaskTemplates = (templates: TaskTemplateSummary[]): TaskTemplateSummary[] => {
  const seen = new Set<string>();
  const merged: TaskTemplateSummary[] = [];

  templates.forEach((template) => {
    if (!template?.id) {
      return;
    }

    if (seen.has(template.id)) {
      return;
    }

    seen.add(template.id);
    merged.push(template);
  });

  return merged;
};

const inferDatasetKindFromFileName = (fileName: string): DatasetKind | null => {
  const lowerFileName = fileName.toLowerCase();

  if (lowerFileName.includes('preference_compare') || lowerFileName.includes('preference')) {
    return 'preference_compare';
  }

  if (lowerFileName.includes('qa_quality')) {
    return 'qa_quality';
  }

  if (lowerFileName.includes('generic_json')) {
    return 'generic_json';
  }

  return null;
};

const formatEmptyImportError = (summary: DatasetImportSummaryDto): string => {
  const firstError = summary.errors[0];
  const detail = firstError?.message ? `首个错误：${firstError.message}` : '请确认文件格式与关联模板一致。';

  return `题目数据导入失败：未导入任何题目。${detail}`;
};

const defaultDeadline = (): string => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(23, 59, 0, 0);

  return date.toISOString();
};

type DatasetFilePayload =
  | {
      format: 'json' | 'jsonl' | 'csv';
      fileName: string;
      content: string;
    }
  | {
      format: 'xlsx' | 'zip';
      fileName: string;
      contentBase64: string;
    };

const buildDatasetImportPayload = async (file: File): Promise<DatasetFilePayload> => {
  const format = resolveDatasetImportFormat(file.name);

  if (format === 'json' || format === 'jsonl' || format === 'csv') {
    return {
      format,
      fileName: file.name,
      content: await readFileAsText(file),
    };
  }

  return {
    format,
    fileName: file.name,
    contentBase64: arrayBufferToBase64(await readFileAsArrayBuffer(file)),
  };
};

const getDatasetFileNameFromImportSummary = (summary: DatasetImportSummaryDto | null): string | null => {
  const firstFile = summary?.files?.find((file) => file.fileName.trim().length > 0);

  return firstFile?.fileName ?? null;
};

const normalizeDatasetImportSummary = (
  summary: DatasetImportSummaryDto,
  task: TaskDto,
  payload: DatasetFilePayload,
): DatasetImportSummaryDto => {
  const datasetKind = summary.datasetKind ?? task.template.datasetKind;
  const fields = Array.isArray(summary.fields) ? summary.fields : [];
  const files =
    Array.isArray(summary.files) && summary.files.length > 0
      ? summary.files
      : [
          {
            datasetKind,
            format: payload.format,
            fileName: payload.fileName,
            fields,
            importedCount: summary.importedCount,
            errorCount: summary.errorCount ?? 0,
          },
        ];

  return {
    taskId: summary.taskId ?? task.id,
    datasetKind,
    importedCount: summary.importedCount,
    errorCount: summary.errorCount ?? 0,
    skippedFiles: Array.isArray(summary.skippedFiles) ? summary.skippedFiles : [],
    fields,
    errors: Array.isArray(summary.errors) ? summary.errors : [],
    preview: Array.isArray(summary.preview) ? summary.preview : [],
    files,
  };
};

const resolveImportedDatasetRecords = async (
  task: TaskDto,
  summary: DatasetImportSummaryDto,
): Promise<DatasetRecord[]> => {
  const previewRecords = taskItemsToDatasetRecords(summary.preview);
  if (previewRecords.length > 0) {
    return previewRecords;
  }

  return taskItemsToDatasetRecords(await listTaskItems(task.id));
};

const taskItemsToDatasetRecords = (items: readonly TaskItemDto[] | undefined): DatasetRecord[] =>
  (items ?? [])
    .map((item) => item.rawData)
    .filter(isDatasetRecordLike);

const mergeTaskClientState = (task: TaskDto, previousTask?: TaskDto | null): TaskDto => ({
  ...task,
  datasetImportSummary: task.datasetImportSummary ?? previousTask?.datasetImportSummary ?? null,
});

export const resolveOwnerDisplayTasks = (tasks: TaskDto[]): TaskDto[] => tasks;

const isTaskListBootstrapError = (message: string): boolean =>
  message.startsWith('任务接口请求失败，请稍后重试。');

const parseDatasetPreviewItemsFromFile = async (file: File, task: TaskDto): Promise<TaskItemDto[]> => {
  const records = await parseDatasetRecordsFromFile(file);
  const now = new Date().toISOString();
  const datasetKind = inferDatasetKindFromFileName(file.name) ?? task.template.datasetKind;

  return records.map((record, index) => ({
    id: `preview_${index + 1}`,
    taskId: task.id,
    externalId: resolveDatasetRecordExternalId(record, index),
    datasetKind,
    rawData: record,
    status: 'UNASSIGNED',
    sortOrder: index + 1,
    createdAt: now,
    updatedAt: now,
  }));
};

const parseDatasetRecordsFromFile = async (file: File): Promise<DatasetRecord[]> => {
  const format = resolveDatasetImportFormat(file.name);

  if (format === 'json') {
    return parseJsonDatasetRecords(await readFileAsText(file));
  }

  if (format === 'jsonl') {
    return parseJsonlDatasetRecords(await readFileAsText(file));
  }

  if (format === 'csv') {
    return parseCsvDatasetRecords(await readFileAsText(file));
  }

  if (format === 'xlsx') {
    return parseXlsxDatasetRecords(await readFileAsArrayBuffer(file));
  }

  throw new Error('zip 文件需要先保存导入后再预览。');
};

const parseJsonDatasetRecords = (content: string): DatasetRecord[] => {
  const parsed = JSON.parse(content) as unknown;

  if (isDatasetRecordLike(parsed)) {
    return [parsed];
  }

  if (!Array.isArray(parsed)) {
    throw new Error('JSON 内容必须是对象或对象数组。');
  }

  return parsed.filter(isDatasetRecordLike);
};

const parseJsonlDatasetRecords = (content: string): DatasetRecord[] => {
  const records: DatasetRecord[] = [];

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const parsed = JSON.parse(line) as unknown;
    if (isDatasetRecordLike(parsed)) {
      records.push(parsed);
    }
  }

  return records;
};

const parseCsvDatasetRecords = (content: string): DatasetRecord[] => {
  const rows = parseCsvRows(content);
  const columnCount = Math.max(...rows.map((row) => row.length), 0);
  const headerRow = rows[0] ?? [];
  const headers = Array.from({ length: columnCount }, (_, index) => {
    return headerRow[index]?.trim() || `field_${index + 1}`;
  });

  return rows
    .slice(1)
    .map((row) => csvRowToRecord(headers, row))
    .filter(recordHasValue);
};

const parseCsvRows = (content: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += character;
  }

  row.push(cell);
  rows.push(row);

  return rows.filter((currentRow, index) =>
    index < rows.length - 1 || currentRow.some((value) => value.trim().length > 0),
  );
};

const parseXlsxDatasetRecords = async (buffer: ArrayBuffer): Promise<DatasetRecord[]> => {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  const workbookRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const sheetPath = resolveFirstWorksheetPath(workbookXml, workbookRelsXml);
  const sheetXml = await zip.file(sheetPath)?.async('string');

  if (!sheetXml) {
    throw new Error('Excel 文件没有可读取的工作表。');
  }

  const rows = parseXlsxRows(sheetXml, parseXlsxSharedStrings(sharedStringsXml));
  const columnCount = Math.max(...rows.map((row) => row.length), 0);
  const headerRow = rows[0] ?? [];
  const headers = Array.from({ length: columnCount }, (_, index) => {
    return headerRow[index]?.trim() || `field_${index + 1}`;
  });

  return rows
    .slice(1)
    .map((row) => xlsxRowToRecord(headers, row))
    .filter(recordHasValue);
};

const parseXlsxSharedStrings = (sharedStringsXml?: string): string[] => {
  return (sharedStringsXml?.match(/<si\b[\s\S]*?<\/si>/g) ?? []).map(readXlsxTextNodes);
};

const parseXlsxRows = (sheetXml: string, sharedStrings: string[]): string[][] => {
  return (sheetXml.match(/<row\b[\s\S]*?<\/row>/g) ?? []).map((rowTag) => {
    const values: string[] = [];
    const cellTags = rowTag.match(/<c\b[\s\S]*?<\/c>/g) ?? [];

    cellTags.forEach((cellTag, fallbackIndex) => {
      const cellRef = readXmlAttribute(cellTag, 'r');
      const cellIndex = cellRef ? columnReferenceToIndex(cellRef) : fallbackIndex;
      values[cellIndex] = readXlsxCellValue(cellTag, sharedStrings);
    });

    return values.map((value) => value ?? '');
  });
};

const readXlsxCellValue = (cellTag: string, sharedStrings: string[]): string => {
  const cellType = readXmlAttribute(cellTag, 't');

  if (cellType === 'inlineStr') {
    return readXlsxTextNodes(cellTag);
  }

  const rawValue = decodeXmlText(cellTag.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? '');

  if (cellType === 's') {
    return sharedStrings[Number(rawValue)] ?? '';
  }

  if (!rawValue && cellTag.includes('<is')) {
    return readXlsxTextNodes(cellTag);
  }

  return rawValue;
};

const readXlsxTextNodes = (xml: string): string => {
  return Array.from(xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
    .map((match) => decodeXmlText(match[1] ?? ''))
    .join('');
};

const columnReferenceToIndex = (cellRef: string): number => {
  const columnReference = cellRef.replace(/\d+/g, '').toUpperCase();
  let index = 0;

  for (const character of columnReference) {
    index = index * 26 + character.charCodeAt(0) - 64;
  }

  return Math.max(index - 1, 0);
};

const xlsxRowToRecord = (headers: string[], row: string[]): DatasetRecord => {
  const record: DatasetRecord = {};

  headers.forEach((header, index) => {
    const value = row[index] ?? '';

    if (value.trim()) {
      record[header] = value;
    }
  });

  return record;
};

const csvRowToRecord = (headers: string[], row: string[]): DatasetRecord => {
  const record: DatasetRecord = {};

  headers.forEach((header, index) => {
    const value = row[index] ?? '';

    if (value.trim()) {
      record[header] = value.trim();
    }
  });

  return record;
};

const resolveDatasetRecordExternalId = (record: DatasetRecord, index: number): string => {
  const idKeys = ['id', 'externalId', 'external_id', 'questionId', 'question_id', '题目ID', '题目编号'];

  for (const key of idKeys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return `row_${index + 1}`;
};

const recordHasValue = (record: DatasetRecord): boolean => {
  return Object.values(record).some((value) => String(value ?? '').trim().length > 0);
};

const decodeXmlText = (value: string): string => {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
};

const resolveFirstWorksheetPath = (workbookXml?: string, workbookRelsXml?: string): string => {
  const firstSheetTag = workbookXml?.match(/<sheet\b[^>]*>/)?.[0];
  const relationId = firstSheetTag ? readXmlAttribute(firstSheetTag, 'r:id') : null;
  const relationshipTags = workbookRelsXml?.match(/<Relationship\b[^>]*>/g) ?? [];
  const sheetRelationship = relationId
    ? relationshipTags.find((tag) => readXmlAttribute(tag, 'Id') === relationId)
    : null;
  const target = sheetRelationship ? readXmlAttribute(sheetRelationship, 'Target') : null;

  if (!target) {
    return 'xl/worksheets/sheet1.xml';
  }

  const normalizedTarget = target.replace(/^\/+/, '');

  return normalizedTarget.startsWith('xl/') ? normalizedTarget : `xl/${normalizedTarget}`;
};

const readXmlAttribute = (tag: string, attribute: string): string | null => {
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`${escapedAttribute}="([^"]+)"`));

  return match?.[1] ?? null;
};

const readFileAsText = (file: File): Promise<string> => {
  if (typeof file.text === 'function') {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败。'));
    reader.readAsText(file);
  });
};

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败。'));
    reader.readAsArrayBuffer(file);
  });
};

const resolveDatasetImportFormat = (fileName: string): DatasetFilePayload['format'] => {
  const lowerFileName = fileName.toLowerCase();

  if (lowerFileName.endsWith('.jsonl')) {
    return 'jsonl';
  }

  if (lowerFileName.endsWith('.csv')) {
    return 'csv';
  }

  if (lowerFileName.endsWith('.xlsx')) {
    return 'xlsx';
  }

  if (lowerFileName.endsWith('.zip')) {
    return 'zip';
  }

  return 'json';
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
};

const isDatasetRecordLike = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const formatRewardRule = (rewardPerItem: number | null): string | null =>
  rewardPerItem !== null ? `${rewardPerItem.toFixed(2)} 元 / 条` : null;

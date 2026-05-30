import type {
  AutoTemplateFieldClassificationRequest,
  AutoTemplateFieldValueStats,
  AutoTemplateSourceField,
  DatasetRecord,
  LabelHubSchema,
} from '@labelhub/shared';
import type { DatasetImportSummaryDto } from '../../api/datasets';
import type { TaskDto, TaskFormInput } from '../../api/tasks';

export const TEMPLATE_DRAFT_HANDOFF_STORAGE_KEY = 'labelhub.templateDraftHandoff';
export const TASK_TEMPLATE_RETURN_HANDOFF_STORAGE_KEY = 'labelhub.taskTemplateReturnHandoff';
export const OWNER_TEMPLATES_PATH = '/owner/templates';
export const OWNER_TASKS_PATH = '/owner/tasks';

export type TemplateDraftHandoff = {
  name: string;
  schema: LabelHubSchema;
  sourceFileName?: string;
  returnTo?: string;
  previewRecords?: DatasetRecord[];
  autoClassificationRequest?: AutoTemplateFieldClassificationRequest;
};

export type TaskTemplateReturnHandoff = {
  datasetFile: File | null;
  datasetImportSummary: DatasetImportSummaryDto | null;
  datasetTemplateDraft: {
    fileName: string;
    name: string;
    previewRecords: DatasetRecord[];
    schema: LabelHubSchema;
  } | null;
  drawerMode: 'existing' | 'new';
  form: TaskFormInput;
  isTaskFormDirty: boolean;
  selectedTask: TaskDto;
  templateOptions: Array<TaskDto['template']>;
};

let inMemoryTaskTemplateReturnHandoff: TaskTemplateReturnHandoff | null = null;

export const writeTemplateDraftHandoff = (draft: TemplateDraftHandoff): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    window.sessionStorage.setItem(TEMPLATE_DRAFT_HANDOFF_STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
};

export const consumeTemplateDraftHandoff = (): TemplateDraftHandoff | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storage = window.sessionStorage;
    const rawDraft = storage.getItem(TEMPLATE_DRAFT_HANDOFF_STORAGE_KEY);
    storage.removeItem(TEMPLATE_DRAFT_HANDOFF_STORAGE_KEY);

    if (!rawDraft) {
      return null;
    }

    const parsed = JSON.parse(rawDraft);

    if (!isTemplateDraftHandoff(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

export const writeTaskTemplateReturnHandoff = (draft: TaskTemplateReturnHandoff): boolean => {
  inMemoryTaskTemplateReturnHandoff = draft;

  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const { datasetFile: _datasetFile, ...serializableDraft } = draft;
    window.sessionStorage.setItem(TASK_TEMPLATE_RETURN_HANDOFF_STORAGE_KEY, JSON.stringify(serializableDraft));
    return true;
  } catch {
    return false;
  }
};

export const updateTaskTemplateReturnHandoff = (
  updater: (draft: TaskTemplateReturnHandoff) => TaskTemplateReturnHandoff | null,
): boolean => {
  const draft = readTaskTemplateReturnHandoff();

  if (!draft) {
    return false;
  }

  const nextDraft = updater(draft);

  if (!nextDraft) {
    return false;
  }

  return writeTaskTemplateReturnHandoff(nextDraft);
};

export const consumeTaskTemplateReturnHandoff = (): TaskTemplateReturnHandoff | null => {
  const memoryDraft = inMemoryTaskTemplateReturnHandoff;
  inMemoryTaskTemplateReturnHandoff = null;

  if (memoryDraft) {
    removeTaskTemplateReturnHandoffStorage();
    return memoryDraft;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawDraft = window.sessionStorage.getItem(TASK_TEMPLATE_RETURN_HANDOFF_STORAGE_KEY);
    removeTaskTemplateReturnHandoffStorage();

    if (!rawDraft) {
      return null;
    }

    const parsed = JSON.parse(rawDraft);

    if (!isTaskTemplateReturnHandoffSnapshot(parsed)) {
      return null;
    }

    return {
      ...parsed,
      datasetFile: null,
    };
  } catch {
    return null;
  }
};

const readTaskTemplateReturnHandoff = (): TaskTemplateReturnHandoff | null => {
  if (inMemoryTaskTemplateReturnHandoff) {
    return inMemoryTaskTemplateReturnHandoff;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawDraft = window.sessionStorage.getItem(TASK_TEMPLATE_RETURN_HANDOFF_STORAGE_KEY);

    if (!rawDraft) {
      return null;
    }

    const parsed = JSON.parse(rawDraft);

    if (!isTaskTemplateReturnHandoffSnapshot(parsed)) {
      return null;
    }

    return {
      ...parsed,
      datasetFile: null,
    };
  } catch {
    return null;
  }
};

const removeTaskTemplateReturnHandoffStorage = () => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(TASK_TEMPLATE_RETURN_HANDOFF_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
};

const isTemplateDraftHandoff = (value: unknown): value is TemplateDraftHandoff => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    isLabelHubSchema(value.schema) &&
    (value.sourceFileName === undefined || typeof value.sourceFileName === 'string') &&
    (value.returnTo === undefined || typeof value.returnTo === 'string') &&
    (value.previewRecords === undefined || isDatasetRecordArray(value.previewRecords)) &&
    (
      value.autoClassificationRequest === undefined ||
      isAutoTemplateFieldClassificationRequest(value.autoClassificationRequest)
    )
  );
};

const isAutoTemplateFieldClassificationRequest = (
  value: unknown,
): value is AutoTemplateFieldClassificationRequest =>
  isRecord(value) &&
  typeof value.fileName === 'string' &&
  Array.isArray(value.fields) &&
  value.fields.every(isAutoTemplateSourceField) &&
  Array.isArray(value.records) &&
  isDatasetRecordArray(value.records) &&
  (
    value.fieldStats === undefined ||
    (Array.isArray(value.fieldStats) && value.fieldStats.every(isAutoTemplateFieldValueStats))
  );

const isAutoTemplateSourceField = (value: unknown): value is AutoTemplateSourceField =>
  isRecord(value) &&
  typeof value.sourceKey === 'string' &&
  Array.isArray(value.samples) &&
  Array.isArray(value.valueTypes) &&
  value.valueTypes.every((item) => typeof item === 'string') &&
  typeof value.filledCount === 'number' &&
  typeof value.totalCount === 'number';

const isAutoTemplateFieldValueStats = (value: unknown): value is AutoTemplateFieldValueStats =>
  isRecord(value) &&
  typeof value.sourceKey === 'string' &&
  typeof value.totalCount === 'number' &&
  typeof value.filledCount === 'number' &&
  Array.isArray(value.valueTypes) &&
  value.valueTypes.every((item) => typeof item === 'string') &&
  Array.isArray(value.samples) &&
  Array.isArray(value.uniqueValues) &&
  value.uniqueValues.every((item) => typeof item === 'string') &&
  Array.isArray(value.optionCandidates) &&
  value.optionCandidates.every(isFieldOption) &&
  typeof value.hasMultiValue === 'boolean' &&
  typeof value.distinctCount === 'number' &&
  (value.truncated === undefined || typeof value.truncated === 'boolean');

const isFieldOption = (value: unknown): value is AutoTemplateFieldValueStats['optionCandidates'][number] =>
  isRecord(value) &&
  typeof value.label === 'string' &&
  typeof value.value === 'string';

const isLabelHubSchema = (value: unknown): value is LabelHubSchema => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.schemaVersion === 'string' &&
    typeof value.datasetKind === 'string' &&
    Array.isArray(value.fields) &&
    value.fields.every(isLabelHubSchemaField)
  );
};

const isLabelHubSchemaField = (value: unknown): value is LabelHubSchema['fields'][number] =>
  isRecord(value) &&
  typeof value.key === 'string' &&
  typeof value.type === 'string' &&
  typeof value.label === 'string';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isDatasetRecordArray = (value: unknown): value is DatasetRecord[] =>
  Array.isArray(value) && value.every(isRecord);

const isTaskTemplateReturnHandoffSnapshot = (
  value: unknown,
): value is Omit<TaskTemplateReturnHandoff, 'datasetFile'> => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.drawerMode === 'existing' || value.drawerMode === 'new') &&
    isRecord(value.form) &&
    isRecord(value.selectedTask) &&
    Array.isArray(value.templateOptions) &&
    value.templateOptions.every(isRecord) &&
    typeof value.isTaskFormDirty === 'boolean' &&
    (value.datasetImportSummary === null || value.datasetImportSummary === undefined || isRecord(value.datasetImportSummary)) &&
    (value.datasetTemplateDraft === null ||
      value.datasetTemplateDraft === undefined ||
      isDatasetTemplateDraft(value.datasetTemplateDraft))
  );
};

const isDatasetTemplateDraft = (value: unknown): value is NonNullable<TaskTemplateReturnHandoff['datasetTemplateDraft']> =>
  isRecord(value) &&
  typeof value.fileName === 'string' &&
  typeof value.name === 'string' &&
  isLabelHubSchema(value.schema) &&
  isDatasetRecordArray(value.previewRecords);

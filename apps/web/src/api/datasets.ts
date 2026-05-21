import type { DatasetImportFormat, DatasetKind, DatasetRecord } from '@labelhub/shared';

export type TaskItemStatus = 'UNASSIGNED' | 'ASSIGNED' | 'COMPLETED';

export type TaskItemDto = {
  id: string;
  taskId: string;
  externalId: string;
  datasetKind: DatasetKind;
  rawData: DatasetRecord;
  status: TaskItemStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type DatasetImportErrorDto = {
  fileName: string;
  lineNumber?: number;
  rowNumber?: number;
  field?: string;
  message: string;
};

export type DatasetImportFileSummary = {
  datasetKind: DatasetKind;
  format: DatasetImportFormat;
  fileName: string;
  fields: string[];
  importedCount: number;
  errorCount: number;
};

export type DatasetImportSummaryDto = {
  taskId: string;
  datasetKind: DatasetKind;
  importedCount: number;
  errorCount: number;
  skippedFiles: string[];
  fields: string[];
  errors: DatasetImportErrorDto[];
  preview: TaskItemDto[];
  files: DatasetImportFileSummary[];
};

type ImportTaskItemsInput = {
  datasetKind: DatasetKind;
  format: Exclude<DatasetImportFormat, 'zip'>;
  fileName: string;
  content?: string;
  contentBase64?: string;
};

type ImportTaskItemsZipInput = {
  fileName: string;
  contentBase64: string;
};

type ApiEnvelope<TData> = {
  data: TData;
  error?: {
    message?: string;
  };
};

const apiBaseUrl = (): string => import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

export async function importTaskItems(
  taskId: string,
  input: ImportTaskItemsInput,
): Promise<DatasetImportSummaryDto> {
  return requestDatasetApi<DatasetImportSummaryDto>(`/tasks/${taskId}/items/import`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function importTaskItemsZip(
  taskId: string,
  input: ImportTaskItemsZipInput,
): Promise<DatasetImportSummaryDto> {
  return requestDatasetApi<DatasetImportSummaryDto>(`/tasks/${taskId}/items/import-zip`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listTaskItems(taskId: string): Promise<TaskItemDto[]> {
  return requestDatasetApi<TaskItemDto[]>(`/tasks/${taskId}/items`, { method: 'GET' });
}

export async function updateTaskItem(
  itemId: string,
  rawDataPatch: DatasetRecord,
): Promise<TaskItemDto> {
  return requestDatasetApi<TaskItemDto>(`/task-items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify({ rawDataPatch }),
  });
}

async function requestDatasetApi<TData>(path: string, init: RequestInit): Promise<TData> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const envelope = (await response.json()) as ApiEnvelope<TData>;

  if (!response.ok) {
    throw new Error(envelope.error?.message ?? '数据集接口请求失败，请稍后重试。');
  }

  return envelope.data;
}

import type { DatasetKind, ExportFormat, ExportStatus } from '@labelhub/shared';
import { apiBaseUrl, requestApi } from './request';

export type ExportFieldMapping = {
  source: string;
  target: string;
  enabled: boolean;
};

export type ExportJobDto = {
  id: string;
  taskId: string;
  requestedById: string | null;
  status: ExportStatus;
  format: ExportFormat;
  idempotencyKey: string | null;
  fieldMapping: unknown;
  includeReviews: boolean;
  filters: unknown;
  filePath: string | null;
  resultUrl: string | null;
  errorMessage: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExportPreviewDto = {
  taskId: string;
  datasetKind: DatasetKind;
  fieldMapping: ExportFieldMapping[];
  rows: Array<Record<string, unknown>>;
  totalFinalApproved: number;
};

export async function listExports(input: { taskId?: string } = {}): Promise<ExportJobDto[]> {
  const searchParams = new URLSearchParams();
  if (input.taskId) {
    searchParams.set('taskId', input.taskId);
  }
  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';

  return requestExportApi<ExportJobDto[]>(`/exports${suffix}`, { method: 'GET' });
}

export async function createExport(input: {
  taskId: string;
  requestedById?: string;
  format: ExportFormat;
  includeReviews: boolean;
  fieldMapping: ExportFieldMapping[];
  idempotencyKey?: string;
}): Promise<ExportJobDto> {
  return requestExportApi<ExportJobDto>('/exports', {
    method: 'POST',
    headers: input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : undefined,
    body: JSON.stringify(input),
  });
}

export async function retryExport(exportJobId: string): Promise<ExportJobDto> {
  return requestExportApi<ExportJobDto>(`/exports/${exportJobId}/retry`, { method: 'POST' });
}

export function getExportDownloadUrl(exportJobId: string): string {
  return `${apiBaseUrl()}/exports/${encodeURIComponent(exportJobId)}/download`;
}

export async function getExportPreview(input: {
  taskId: string;
  includeReviews: boolean;
  fieldMapping?: ExportFieldMapping[];
}): Promise<ExportPreviewDto> {
  const searchParams = new URLSearchParams({
    includeReviews: input.includeReviews ? 'true' : 'false',
  });
  if (input.fieldMapping) {
    searchParams.set('fieldMapping', JSON.stringify(input.fieldMapping));
  }

  return requestExportApi<ExportPreviewDto>(`/tasks/${input.taskId}/export-preview?${searchParams.toString()}`, {
    method: 'GET',
  });
}

async function requestExportApi<TData>(path: string, init: RequestInit): Promise<TData> {
  return requestApi<TData>(path, init, '导出接口请求失败，请稍后重试。');
}

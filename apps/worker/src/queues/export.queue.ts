import type { ExportFormat } from '@labelhub/shared';

export const EXPORT_QUEUE_NAME = 'export';

export type ExportJobPayload = {
  exportJobId: string;
  taskId: string;
  format: ExportFormat;
};

export function buildExportJobPayload(input: ExportJobPayload): ExportJobPayload {
  return {
    exportJobId: input.exportJobId,
    taskId: input.taskId,
    format: input.format,
  };
}

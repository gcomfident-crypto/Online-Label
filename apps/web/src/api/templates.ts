import type { LabelHubSchema, TemplateCompatibilityReport } from '@labelhub/shared';
import { requestApi } from './request';

export type TemplateDto = {
  id: string;
  name: string;
  description: string | null;
  datasetKind: LabelHubSchema['datasetKind'];
  schemaVersion: string;
  schema: LabelHubSchema;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  version: number;
  parentTemplateId: string | null;
  rootTemplateId: string | null;
  archivedAt: string | null;
  restoredFromTemplateId: string | null;
  createdById: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  usageCount?: number;
  activeUsageCount?: number;
};

export async function createTemplateDraft(input: {
  name: string;
  description?: string;
  schema: LabelHubSchema;
  parentTemplateId?: string;
  actorId?: string;
}): Promise<TemplateDto> {
  return requestTemplateApi<TemplateDto>('/templates', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      datasetKind: input.schema.datasetKind,
      schema: input.schema,
      parentTemplateId: input.parentTemplateId,
      actorId: input.actorId,
    }),
  });
}

export async function listTemplates(): Promise<TemplateDto[]> {
  return requestTemplateApi<TemplateDto[]>('/templates', { method: 'GET' });
}

export async function deleteTemplate(templateId: string): Promise<{ id: string }> {
  return requestTemplateApi<{ id: string }>(`/templates/${templateId}`, {
    method: 'DELETE',
  });
}

export async function saveTemplateSchema(
  templateId: string,
  schema: LabelHubSchema,
  input: { name?: string } = {},
): Promise<TemplateDto> {
  return requestTemplateApi<TemplateDto>(`/templates/${templateId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      schema,
      ...(input.name !== undefined ? { name: input.name } : {}),
    }),
  });
}

export type PublishTemplateResponse = {
  template: TemplateDto;
  compatibilityReport: TemplateCompatibilityReport;
};

export async function publishTemplate(
  templateId: string,
  versionName: string,
  input: { actorId?: string } = {},
): Promise<PublishTemplateResponse> {
  return requestTemplateApi<PublishTemplateResponse>(`/templates/${templateId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ versionName, actorId: input.actorId }),
  });
}

export type TemplateVersionDto = TemplateDto & {
  usageCount: number;
  activeUsageCount: number;
  isCurrent: boolean;
  isArchived: boolean;
};

export type TemplateVersionDiffItem = {
  fieldKey: string;
  label?: string;
  before?: unknown;
  after?: unknown;
  changeDescription: string;
};

export type TemplateVersionDiffSection = {
  type: 'added' | 'removed' | 'changed';
  title: string;
  items: TemplateVersionDiffItem[];
};

export type TemplateVersionDiff = {
  summary: {
    added: number;
    removed: number;
    changed: number;
  };
  sections: TemplateVersionDiffSection[];
};

export type TemplateTaskUsageDto = {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ENDED';
  templateId: string | null;
};

export type RestoreTemplateVersionResponse = {
  restoredTemplate: TemplateDto;
  archivedVersions: TemplateDto[];
  affectedActiveTasks: TemplateTaskUsageDto[];
  message: string;
  warning?: string;
};

export async function listTemplateVersions(templateId: string): Promise<TemplateVersionDto[]> {
  return requestTemplateApi<TemplateVersionDto[]>(`/templates/${templateId}/versions`, {
    method: 'GET',
  });
}

export async function diffTemplateVersion(
  templateId: string,
  versionId: string,
): Promise<TemplateVersionDiff> {
  return requestTemplateApi<TemplateVersionDiff>(`/templates/${templateId}/versions/${versionId}/diff`, {
    method: 'GET',
  });
}

export async function restoreTemplateVersion(
  templateId: string,
  versionId: string,
): Promise<RestoreTemplateVersionResponse> {
  return requestTemplateApi<RestoreTemplateVersionResponse>(
    `/templates/${templateId}/versions/${versionId}/restore`,
    {
      method: 'POST',
    },
  );
}

async function requestTemplateApi<TData>(
  path: string,
  init: RequestInit,
): Promise<TData> {
  return requestApi<TData>(path, init, '模板接口请求失败，请稍后重试。');
}

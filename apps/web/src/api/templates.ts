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
  createdById: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function createTemplateDraft(input: {
  name: string;
  description?: string;
  schema: LabelHubSchema;
}): Promise<TemplateDto> {
  return requestTemplateApi<TemplateDto>('/templates', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      datasetKind: input.schema.datasetKind,
      schema: input.schema,
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
): Promise<PublishTemplateResponse> {
  return requestTemplateApi<PublishTemplateResponse>(`/templates/${templateId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ versionName }),
  });
}

async function requestTemplateApi<TData>(
  path: string,
  init: RequestInit,
): Promise<TData> {
  return requestApi<TData>(path, init, '模板接口请求失败，请稍后重试。');
}

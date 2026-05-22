import type { LabelHubSchema, TemplateCompatibilityReport } from '@labelhub/shared';
import type { OfficialTemplateKey } from '../features/template-designer/templateStore';

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

type ApiEnvelope<TData> = {
  data: TData;
  error?: {
    message?: string;
  };
};

const apiBaseUrl = (): string => import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

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

export async function createTemplateFromProfile(profile: OfficialTemplateKey): Promise<TemplateDto> {
  return requestTemplateApi<TemplateDto>('/templates/from-profile', {
    method: 'POST',
    body: JSON.stringify({ profile }),
  });
}

export async function saveTemplateSchema(
  templateId: string,
  schema: LabelHubSchema,
): Promise<TemplateDto> {
  return requestTemplateApi<TemplateDto>(`/templates/${templateId}`, {
    method: 'PATCH',
    body: JSON.stringify({ schema }),
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
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const envelope = (await response.json()) as ApiEnvelope<TData>;

  if (!response.ok) {
    throw new Error(envelope.error?.message ?? '模板接口请求失败，请稍后重试。');
  }

  return envelope.data;
}

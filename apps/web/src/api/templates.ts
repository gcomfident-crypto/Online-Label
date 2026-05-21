import type { LabelHubSchema } from '@labelhub/shared';
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
};

const apiBaseUrl = (): string => import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

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

export async function publishTemplate(templateId: string, versionName: string): Promise<TemplateDto> {
  const result = await requestTemplateApi<{ template: TemplateDto }>(`/templates/${templateId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ versionName }),
  });

  return result.template;
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
    throw new Error('模板接口请求失败，请稍后重试。');
  }

  return envelope.data;
}

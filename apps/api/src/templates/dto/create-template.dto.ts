import type { DatasetKind, LabelHubSchema } from '@labelhub/shared';

export type CreateTemplateDto = {
  name?: unknown;
  description?: unknown;
  datasetKind?: unknown;
  schema?: unknown;
  actorId?: unknown;
  parentTemplateId?: unknown;
};

export type CreateTemplateInput = {
  name: string;
  description?: string;
  datasetKind: DatasetKind;
  schema?: LabelHubSchema;
  actorId?: string;
  parentTemplateId?: string;
};

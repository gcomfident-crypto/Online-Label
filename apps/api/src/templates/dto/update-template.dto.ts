import type { LabelHubSchema } from '@labelhub/shared';

export type UpdateTemplateDto = {
  name?: unknown;
  description?: unknown;
  schema?: unknown;
};

export type UpdateTemplateInput = {
  name?: string;
  description?: string | null;
  schema?: LabelHubSchema;
};

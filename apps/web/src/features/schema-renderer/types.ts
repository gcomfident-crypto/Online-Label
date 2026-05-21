import type { LabelHubSchema, SchemaField } from '@labelhub/shared';

export type SchemaRendererMode = 'preview' | 'answer' | 'review';

export type SchemaRendererProps = {
  schema: LabelHubSchema;
  rawData: Record<string, unknown>;
  value: Record<string, unknown>;
  mode: SchemaRendererMode;
  onChange: (next: Record<string, unknown>) => void;
};

export type FieldRendererProps = {
  field: SchemaField;
  rawData: Record<string, unknown>;
  value: Record<string, unknown>;
  mode: SchemaRendererMode;
  onFieldChange: (field: SchemaField, nextValue: unknown) => void;
};

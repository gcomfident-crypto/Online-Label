import type { LabelHubSchema, SchemaField } from '@labelhub/shared';

export { getSchemaFieldKey } from '@labelhub/shared';

export type SchemaRendererMode = 'preview' | 'answer' | 'review';

export type SchemaRendererProps = {
  schema: LabelHubSchema;
  rawData: Record<string, unknown>;
  value: Record<string, unknown>;
  mode: SchemaRendererMode;
  onChange: (next: Record<string, unknown>) => void;
  activeFieldKey?: string | null;
  onActiveFieldChange?: (fieldKey: string) => void;
};

export type FieldValueUpdater = (currentValue: unknown) => unknown;
export type FieldNextValue = unknown | FieldValueUpdater;

export type FieldRendererProps = {
  field: SchemaField;
  datasetKind: LabelHubSchema['datasetKind'];
  rendererScope: string;
  fieldPath: string;
  rawData: Record<string, unknown>;
  value: Record<string, unknown>;
  mode: SchemaRendererMode;
  hiddenFieldKeys: ReadonlySet<string>;
  disabledFieldKeys: ReadonlySet<string>;
  requiredFieldKeys: ReadonlySet<string>;
  validationMessagesByField: ReadonlyMap<string, readonly string[]>;
  onFieldChange: (field: SchemaField, nextValue: FieldNextValue) => void;
  activeFieldKey?: string | null;
  onActiveFieldChange?: (fieldKey: string) => void;
  disabled?: boolean;
};

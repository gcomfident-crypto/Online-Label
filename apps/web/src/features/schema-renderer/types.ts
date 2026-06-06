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
  validationFocusFieldKey?: string | null;
  showValidationErrors?: boolean;
  getFieldNodeDecoration?: (field: SchemaField) => FieldNodeDecoration | null;
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
  allowedOptionsByFieldKey: ReadonlyMap<string, ReadonlySet<string>>;
  overrideableOptionLimitFieldKeys: ReadonlySet<string>;
  validationMessagesByField: ReadonlyMap<string, readonly string[]>;
  showValidationErrors: boolean;
  onFieldChange: (field: SchemaField, nextValue: FieldNextValue) => void;
  activeFieldKey?: string | null;
  onActiveFieldChange?: (fieldKey: string) => void;
  validationFocusFieldKey?: string | null;
  disabled?: boolean;
  optionLimitActive?: boolean;
  getFieldNodeDecoration?: (field: SchemaField) => FieldNodeDecoration | null;
};

export type FieldNodeDecoration = {
  state: 'added' | 'removed' | 'changed';
  label: string;
};

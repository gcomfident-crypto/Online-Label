import type { SchemaField } from '@labelhub/shared';

import { FieldRenderer } from './FieldRenderer';
import type { SchemaRendererProps } from './types';

export const SchemaRenderer = ({
  schema,
  rawData,
  value,
  mode,
  onChange,
}: SchemaRendererProps) => {
  const handleFieldChange = (field: SchemaField, nextValue: unknown) => {
    onChange({ ...value, [field.key]: nextValue });
  };

  return (
    <section className="schema-renderer" data-mode={mode}>
      {schema.fields.map((field) => (
        <FieldRenderer
          key={field.key}
          field={field}
          rawData={rawData}
          value={value}
          mode={mode}
          onFieldChange={handleFieldChange}
        />
      ))}
    </section>
  );
};

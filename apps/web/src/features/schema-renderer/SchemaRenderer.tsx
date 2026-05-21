import { useEffect, useId, useRef } from 'react';
import type { SchemaField } from '@labelhub/shared';

import { FieldRenderer } from './FieldRenderer';
import type { FieldNextValue, FieldValueUpdater, SchemaRendererProps } from './types';

const isFieldValueUpdater = (nextValue: FieldNextValue): nextValue is FieldValueUpdater => {
  return typeof nextValue === 'function';
};

export const SchemaRenderer = ({
  schema,
  rawData,
  value,
  mode,
  onChange,
}: SchemaRendererProps) => {
  const rendererScope = useId();
  const latestValueRef = useRef(value);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  const handleFieldChange = (field: SchemaField, nextValue: FieldNextValue) => {
    const currentAnswers = latestValueRef.current;
    const resolvedValue = isFieldValueUpdater(nextValue)
      ? nextValue(currentAnswers[field.key])
      : nextValue;
    const nextAnswers = { ...currentAnswers, [field.key]: resolvedValue };

    latestValueRef.current = nextAnswers;
    onChange(nextAnswers);
  };

  return (
    <section className="schema-renderer" data-mode={mode}>
      {schema.fields.map((field) => (
        <FieldRenderer
          key={field.key}
          field={field}
          rendererScope={rendererScope}
          fieldPath={field.key}
          rawData={rawData}
          value={value}
          mode={mode}
          onFieldChange={handleFieldChange}
        />
      ))}
    </section>
  );
};

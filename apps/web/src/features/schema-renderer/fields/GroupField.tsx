import { FieldRenderer } from '../FieldRenderer';
import type { BaseFieldProps } from './common';

export const GroupField = ({
  field,
  rawData,
  value,
  mode,
  onFieldChange,
}: BaseFieldProps) => {
  return (
    <fieldset className="schema-field schema-field--group" data-field-type={field.type}>
      <legend>{field.label}</legend>
      {field.description ? <p>{field.description}</p> : null}
      {(field.fields ?? []).map((child) => (
        <FieldRenderer
          key={child.key}
          field={child}
          rawData={rawData}
          value={value}
          mode={mode}
          onFieldChange={onFieldChange}
        />
      ))}
    </fieldset>
  );
};


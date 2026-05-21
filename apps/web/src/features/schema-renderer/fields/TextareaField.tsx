import type { EditableFieldProps } from './common';
import { FieldDescription, getFieldValue, getStringValue, isDisabledMode } from './common';

export const TextareaField = ({
  field,
  value,
  mode,
  disabled,
  onFieldChange,
}: EditableFieldProps) => {
  return (
    <label className="schema-field" data-field-type={field.type}>
      <span>{field.label}</span>
      <FieldDescription field={field} />
      <textarea
        aria-label={field.label}
        disabled={isDisabledMode(mode, disabled)}
        placeholder={field.placeholder}
        value={getStringValue(getFieldValue(field, value))}
        onChange={(event) => onFieldChange(field, event.target.value)}
      />
    </label>
  );
};

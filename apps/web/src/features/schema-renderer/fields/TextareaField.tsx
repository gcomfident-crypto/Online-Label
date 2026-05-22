import type { EditableFieldProps } from './common';
import {
  FieldCounter,
  FieldDescription,
  getFieldValue,
  getStringValue,
  isDisabledMode,
} from './common';

export const TextareaField = ({
  field,
  value,
  mode,
  disabled,
  onFieldChange,
}: EditableFieldProps) => {
  const stringValue = getStringValue(getFieldValue(field, value));

  return (
    <label className="schema-field" data-field-type={field.type}>
      <span>{field.label}</span>
      <FieldDescription field={field} />
      <textarea
        aria-label={field.label}
        disabled={isDisabledMode(mode, disabled)}
        placeholder={field.placeholder}
        value={stringValue}
        onChange={(event) => onFieldChange(field, event.target.value)}
      />
      <FieldCounter maxLength={field.validation?.maxLength} value={stringValue} />
    </label>
  );
};

import type { EditableFieldProps } from './common';
import { FieldDescription, getFieldValue, getStringValue, isDisabledMode } from './common';

export const RichTextField = ({ field, value, mode, onFieldChange }: EditableFieldProps) => {
  return (
    <label className="schema-field" data-field-type={field.type}>
      <span>{field.label}</span>
      <span className="schema-field__meta">富文本</span>
      <FieldDescription field={field} />
      <textarea
        aria-label={field.label}
        disabled={isDisabledMode(mode)}
        placeholder={field.placeholder}
        value={getStringValue(getFieldValue(field, value))}
        onChange={(event) => onFieldChange(field, event.target.value)}
      />
    </label>
  );
};

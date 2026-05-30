import type { EditableFieldProps } from './common';
import { FieldTitleRow, getFieldValue, getStringValue, isDisabledMode } from './common';

export const RichTextField = ({
  field,
  value,
  mode,
  disabled,
  onFieldChange,
}: EditableFieldProps) => {
  return (
    <label className="schema-field" data-field-type={field.type}>
      <FieldTitleRow field={field} meta="富文本" />
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

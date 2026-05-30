import type { EditableFieldProps } from './common';
import {
  FieldCounter,
  FieldTitleRow,
  getFieldValue,
  getStringValue,
  isDisabledMode,
} from './common';

export const TextField = ({ field, value, mode, disabled, onFieldChange }: EditableFieldProps) => {
  const stringValue = getStringValue(getFieldValue(field, value));

  return (
    <label className="schema-field" data-field-type={field.type}>
      <FieldTitleRow field={field} />
      <input
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

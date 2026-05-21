import type { EditableFieldProps } from './common';
import {
  FieldDescription,
  getFieldValue,
  getStringArrayValue,
  isDisabledMode,
  optionLabel,
} from './common';

export const RadioField = ({ field, value, mode, onFieldChange }: EditableFieldProps) => {
  const fieldValue = getFieldValue(field, value);

  return (
    <fieldset className="schema-field" data-field-type={field.type}>
      <legend>{field.label}</legend>
      <FieldDescription field={field} />
      {(field.options ?? []).map((option) => (
        <label key={option.value}>
          <input
            aria-label={option.label}
            checked={fieldValue === option.value}
            disabled={isDisabledMode(mode)}
            name={field.key}
            type="radio"
            value={option.value}
            onChange={() => onFieldChange(field, option.value)}
          />
          <span>{optionLabel(field, option)}</span>
        </label>
      ))}
    </fieldset>
  );
};

export const MultiChoiceField = ({ field, value, mode, onFieldChange }: EditableFieldProps) => {
  const selectedValues = getStringArrayValue(getFieldValue(field, value));

  return (
    <fieldset className="schema-field" data-field-type={field.type}>
      <legend>{field.label}</legend>
      <FieldDescription field={field} />
      {(field.options ?? []).map((option) => {
        const checked = selectedValues.includes(option.value);

        return (
          <label key={option.value}>
            <input
              aria-label={option.label}
              checked={checked}
              disabled={isDisabledMode(mode)}
              type="checkbox"
              value={option.value}
              onChange={() =>
                onFieldChange(field, (currentValue: unknown) => {
                  const currentValues = getStringArrayValue(currentValue);

                  return currentValues.includes(option.value)
                    ? currentValues.filter((item) => item !== option.value)
                    : [...currentValues, option.value];
                })
              }
            />
            <span>{optionLabel(field, option)}</span>
          </label>
        );
      })}
    </fieldset>
  );
};

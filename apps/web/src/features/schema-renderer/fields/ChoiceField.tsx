import type { EditableFieldProps } from './common';
import {
  FieldLegend,
  getFieldValue,
  getStringArrayValue,
  isDisabledMode,
  optionLabel,
} from './common';

export const RadioField = ({
  field,
  rendererScope,
  fieldPath,
  value,
  mode,
  disabled,
  onFieldChange,
}: EditableFieldProps) => {
  const fieldValue = getFieldValue(field, value);
  const radioGroupName = `${rendererScope}:${fieldPath}`;

  return (
    <fieldset className="schema-field" data-field-type={field.type}>
      <FieldLegend field={field} />
      {(field.options ?? []).map((option) => (
        <label key={option.value}>
          <input
            aria-label={option.label}
            checked={fieldValue === option.value}
            disabled={isDisabledMode(mode, disabled)}
            name={radioGroupName}
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

export const MultiChoiceField = ({
  field,
  value,
  mode,
  disabled,
  onFieldChange,
}: EditableFieldProps) => {
  const selectedValues = getStringArrayValue(getFieldValue(field, value));

  return (
    <fieldset className="schema-field" data-field-type={field.type}>
      <FieldLegend field={field} />
      {(field.options ?? []).map((option) => {
        const checked = selectedValues.includes(option.value);

        return (
          <label key={option.value}>
            <input
              aria-label={option.label}
              checked={checked}
              disabled={isDisabledMode(mode, disabled)}
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

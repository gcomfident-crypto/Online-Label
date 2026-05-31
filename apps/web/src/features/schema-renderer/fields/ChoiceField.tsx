import { InlineLlmSuggestionControl } from './InlineLlmSuggestionControl';
import type { BaseFieldProps, EditableFieldProps } from './common';
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
      <div className="schema-choice-bubbles" role="presentation">
        {(field.options ?? []).map((option) => (
          <label className="schema-choice-bubble" key={option.value}>
            <input
              aria-label={option.label}
              checked={fieldValue === option.value}
              disabled={isDisabledMode(mode, disabled)}
              name={radioGroupName}
              type="radio"
              value={option.value}
              onChange={() => onFieldChange(field, option.value)}
            />
            <span className="schema-choice-bubble__surface">{optionLabel(field, option)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
};

export const MultiChoiceField = (props: BaseFieldProps) => {
  const { field, value, mode, disabled, onFieldChange } = props;
  const selectedValues = getStringArrayValue(getFieldValue(field, value));

  return (
    <fieldset className="schema-field" data-field-type={field.type}>
      <FieldLegend field={field} />
      <div className="schema-choice-bubbles" role="presentation">
        {(field.options ?? []).map((option) => {
          const checked = selectedValues.includes(option.value);

          return (
            <label className="schema-choice-bubble" key={option.value}>
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
              <span className="schema-choice-bubble__surface">{optionLabel(field, option)}</span>
            </label>
          );
        })}
      </div>
      {field.type === 'tag_select' ? <InlineLlmSuggestionControl {...props} /> : null}
    </fieldset>
  );
};

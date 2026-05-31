import { InlineLlmSuggestionControl } from './InlineLlmSuggestionControl';
import type { BaseFieldProps } from './common';
import {
  FieldCounter,
  FieldTitleRow,
  getFieldValue,
  getStringValue,
  isDisabledMode,
} from './common';

export const TextField = (props: BaseFieldProps) => {
  const { field, value, mode, disabled, onFieldChange } = props;
  const stringValue = getStringValue(getFieldValue(field, value));

  return (
    <section className="schema-field" data-field-type={field.type}>
      <label className="schema-field__answer-control">
        <FieldTitleRow field={field} />
        <input
          aria-label={field.label}
          disabled={isDisabledMode(mode, disabled)}
          placeholder={field.placeholder}
          value={stringValue}
          onChange={(event) => onFieldChange(field, event.target.value)}
        />
      </label>
      <FieldCounter maxLength={field.validation?.maxLength} value={stringValue} />
      <InlineLlmSuggestionControl {...props} />
    </section>
  );
};

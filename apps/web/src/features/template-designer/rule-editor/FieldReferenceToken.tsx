import { InlineChoicePopover } from './InlineChoicePopover';
import type { LinkageRuleFieldOption } from './ruleEditorAst';

export const FieldReferenceToken = ({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: readonly LinkageRuleFieldOption[];
  value: string;
  onChange: (value: string) => void;
}) => {
  return (
    <InlineChoicePopover
      ariaLabel={ariaLabel}
      options={options.map((option) => ({
        description: option.description ?? option.value,
        label: option.label,
        triggerLabel: option.label,
        value: option.value,
      }))}
      placeholder="选择字段"
      tone="field"
      value={value}
      onChange={onChange}
    />
  );
};

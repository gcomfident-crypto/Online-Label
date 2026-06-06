import type { ReactNode } from 'react';

import { MultiChoiceField, RadioField, TagSelectField } from './fields/ChoiceField';
import { FileUploadField } from './fields/FileUploadField';
import { GroupField } from './fields/GroupField';
import { ImageUploadField } from './fields/ImageUploadField';
import { JsonEditorField } from './fields/JsonEditorField';
import { LlmAssistField } from './fields/LlmAssistField';
import { RichTextField } from './fields/RichTextField';
import { ShowItemField } from './fields/ShowItemField';
import { TabsField } from './fields/TabsField';
import { TextareaField } from './fields/TextareaField';
import { TextField } from './fields/TextField';
import { UnsupportedField } from './fields/UnsupportedField';
import type { FieldRendererProps } from './types';
import { getSchemaFieldKey } from './types';

const withAllowedOptions = (
  field: FieldRendererProps['field'],
  allowedOptions: ReadonlySet<string> | undefined,
): FieldRendererProps['field'] => {
  if (!allowedOptions || !field.options) {
    return field;
  }

  return {
    ...field,
    options: field.options.filter((option) => allowedOptions.has(option.value)),
  };
};

export const FieldRenderer = (props: FieldRendererProps) => {
  const fieldKey = getSchemaFieldKey(props.field);
  const allowedOptions = props.allowedOptionsByFieldKey.get(fieldKey);
  const shouldApplyAllowedOptions =
    Boolean(allowedOptions) && !props.overrideableOptionLimitFieldKeys.has(fieldKey);
  const validationMessages = props.showValidationErrors
    ? props.validationMessagesByField.get(fieldKey) ?? []
    : [];

  if (props.hiddenFieldKeys.has(fieldKey)) {
    return null;
  }

  const isRequiredByLinkage = props.requiredFieldKeys.has(fieldKey);
  const restrictedField = withAllowedOptions(
    props.field,
    shouldApplyAllowedOptions ? allowedOptions : undefined,
  );
  const field = isRequiredByLinkage && !restrictedField.validation?.required
    ? {
        ...restrictedField,
        validation: {
          ...(restrictedField.validation ?? {}),
          required: true,
        },
      }
    : restrictedField;
  const fieldProps = {
    ...props,
    field,
    disabled: props.disabledFieldKeys.has(fieldKey),
    optionLimitActive: Boolean(allowedOptions),
  };
  let fieldElement: ReactNode;

  switch (field.type) {
    case 'show_item':
      fieldElement = <ShowItemField {...fieldProps} />;
      break;
    case 'text':
      fieldElement = <TextField {...fieldProps} />;
      break;
    case 'textarea':
      fieldElement = <TextareaField {...fieldProps} />;
      break;
    case 'radio':
      fieldElement = <RadioField {...fieldProps} />;
      break;
    case 'checkbox':
      fieldElement = <MultiChoiceField {...fieldProps} />;
      break;
    case 'tag_select':
      fieldElement = <TagSelectField {...fieldProps} />;
      break;
    case 'rich_text':
      fieldElement = <RichTextField {...fieldProps} />;
      break;
    case 'file_upload':
      fieldElement = <FileUploadField {...fieldProps} />;
      break;
    case 'image_upload':
      fieldElement = <ImageUploadField {...fieldProps} />;
      break;
    case 'json_editor':
      fieldElement = <JsonEditorField {...fieldProps} />;
      break;
    case 'group':
      fieldElement = <GroupField {...fieldProps} />;
      break;
    case 'tabs':
      fieldElement = <TabsField {...fieldProps} />;
      break;
    case 'llm_assist':
      fieldElement = <LlmAssistField {...fieldProps} />;
      break;
    default:
      fieldElement = <UnsupportedField {...fieldProps} />;
      break;
  }
  const decoration = props.getFieldNodeDecoration?.(field) ?? null;
  const className = [
    props.activeFieldKey === fieldKey ? 'schema-renderer__field-node is-active' : 'schema-renderer__field-node',
    props.validationFocusFieldKey === fieldKey ? 'is-validation-focus-pulse' : '',
    decoration ? `schema-renderer__field-node--diff-${decoration.state}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      data-field-key={fieldKey}
      data-diff-state={decoration?.state}
      onClick={() => props.onActiveFieldChange?.(fieldKey)}
      onFocusCapture={() => props.onActiveFieldChange?.(fieldKey)}
    >
      {decoration ? (
        <span className="schema-renderer__field-diff-badge">{decoration.label}</span>
      ) : null}
      {fieldElement}
      {validationMessages.length > 0 ? (
        <ul className="schema-field__errors" role="alert">
          {validationMessages.map((message) => (
            <li className="schema-field__error-text" key={message}>
              {message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

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

export const FieldRenderer = (props: FieldRendererProps) => {
  const fieldKey = getSchemaFieldKey(props.field);

  if (props.hiddenFieldKeys.has(fieldKey)) {
    return null;
  }

  const isRequiredByLinkage = props.requiredFieldKeys.has(fieldKey);
  const field = isRequiredByLinkage && !props.field.validation?.required
    ? {
        ...props.field,
        validation: {
          ...(props.field.validation ?? {}),
          required: true,
        },
      }
    : props.field;
  const fieldProps = {
    ...props,
    field,
    disabled: props.disabledFieldKeys.has(fieldKey),
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

  return (
    <div
      className={
        props.activeFieldKey === fieldKey
          ? 'schema-renderer__field-node is-active'
          : 'schema-renderer__field-node'
      }
      data-field-key={fieldKey}
      onClick={() => props.onActiveFieldChange?.(fieldKey)}
      onFocusCapture={() => props.onActiveFieldChange?.(fieldKey)}
    >
      {fieldElement}
    </div>
  );
};

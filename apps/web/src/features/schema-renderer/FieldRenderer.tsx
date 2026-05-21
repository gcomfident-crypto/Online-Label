import type { ReactNode } from 'react';

import { MultiChoiceField, RadioField } from './fields/ChoiceField';
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

  const fieldProps = {
    ...props,
    disabled: props.disabledFieldKeys.has(fieldKey),
  };
  const validationMessages = props.validationMessagesByField.get(fieldKey) ?? [];
  let fieldElement: ReactNode;

  switch (props.field.type) {
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
    case 'tag_select':
      fieldElement = <MultiChoiceField {...fieldProps} />;
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
    <>
      {fieldElement}
      {validationMessages.length > 0 ? (
        <ul className="schema-field__errors" role="alert">
          {validationMessages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
};

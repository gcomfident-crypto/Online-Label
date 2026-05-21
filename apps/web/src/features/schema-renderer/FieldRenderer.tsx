import { MultiChoiceField, RadioField } from './fields/ChoiceField';
import { FileUploadField } from './fields/FileUploadField';
import { GroupField } from './fields/GroupField';
import { ImageUploadField } from './fields/ImageUploadField';
import { JsonEditorField } from './fields/JsonEditorField';
import { RichTextField } from './fields/RichTextField';
import { ShowItemField } from './fields/ShowItemField';
import { TabsField } from './fields/TabsField';
import { TextareaField } from './fields/TextareaField';
import { TextField } from './fields/TextField';
import { UnsupportedField } from './fields/UnsupportedField';
import type { FieldRendererProps } from './types';

export const FieldRenderer = (props: FieldRendererProps) => {
  switch (props.field.type) {
    case 'show_item':
      return <ShowItemField {...props} />;
    case 'text':
      return <TextField {...props} />;
    case 'textarea':
      return <TextareaField {...props} />;
    case 'radio':
      return <RadioField {...props} />;
    case 'checkbox':
    case 'tag_select':
      return <MultiChoiceField {...props} />;
    case 'rich_text':
      return <RichTextField {...props} />;
    case 'file_upload':
      return <FileUploadField {...props} />;
    case 'image_upload':
      return <ImageUploadField {...props} />;
    case 'json_editor':
      return <JsonEditorField {...props} />;
    case 'group':
      return <GroupField {...props} />;
    case 'tabs':
      return <TabsField {...props} />;
    case 'llm_assist':
    default:
      return <UnsupportedField {...props} />;
  }
};

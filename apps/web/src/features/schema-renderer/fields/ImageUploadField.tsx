import { useState } from 'react';

import type { EditableFieldProps } from './common';
import { ToastViewport, useToastController } from '../../../components/ToastViewport';
import {
  FieldTitleRow,
  UploadedFilePreview,
  getFieldValue,
  getUploadedFileValue,
  isDisabledMode,
} from './common';

const toLocalImageValue = (file: File) => ({
  name: file.name,
  url: `mock://local/${file.name}`,
  mimeType: file.type,
  size: file.size,
});

export const ImageUploadField = ({
  field,
  value,
  mode,
  disabled,
  onFieldChange,
}: EditableFieldProps) => {
  const [error, setError] = useState<string | null>(null);
  const { dismissToast, messages, showErrorToast } = useToastController();
  const uploadedImage = getUploadedFileValue(getFieldValue(field, value));

  return (
    <section className="schema-field" data-field-type={field.type}>
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <FieldTitleRow field={field} meta="图片" />
      {uploadedImage ? <UploadedFilePreview file={uploadedImage} /> : null}
      <input
        accept="image/*"
        aria-label={field.label}
        disabled={isDisabledMode(mode, disabled)}
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (file) {
            if (!file.type.startsWith('image/')) {
              if (!error) {
                showErrorToast('只能上传图片文件。');
              }
              setError('只能上传图片文件。');
              return;
            }

            setError(null);
            onFieldChange(field, toLocalImageValue(file));
          }
        }}
      />
    </section>
  );
};

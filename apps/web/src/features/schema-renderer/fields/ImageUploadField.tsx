import { useState } from 'react';

import type { EditableFieldProps } from './common';
import {
  FieldDescription,
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

export const ImageUploadField = ({ field, value, mode, onFieldChange }: EditableFieldProps) => {
  const [error, setError] = useState<string | null>(null);
  const uploadedImage = getUploadedFileValue(getFieldValue(field, value));

  return (
    <section className="schema-field" data-field-type={field.type}>
      <span>{field.label}</span>
      <span className="schema-field__meta">图片</span>
      <FieldDescription field={field} />
      {uploadedImage ? <UploadedFilePreview file={uploadedImage} /> : null}
      <input
        accept="image/*"
        aria-label={field.label}
        disabled={isDisabledMode(mode)}
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (file) {
            if (!file.type.startsWith('image/')) {
              setError('只能上传图片文件。');
              return;
            }

            setError(null);
            onFieldChange(field, toLocalImageValue(file));
          }
        }}
      />
      {error ? <small role="alert">{error}</small> : null}
    </section>
  );
};

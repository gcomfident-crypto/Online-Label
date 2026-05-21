import type { EditableFieldProps } from './common';
import { FieldDescription, isDisabledMode } from './common';

const toLocalImageValue = (file: File) => ({
  name: file.name,
  url: `mock://local/${file.name}`,
  mimeType: file.type,
  size: file.size,
});

export const ImageUploadField = ({ field, mode, onFieldChange }: EditableFieldProps) => {
  return (
    <label className="schema-field" data-field-type={field.type}>
      <span>{field.label}</span>
      <span className="schema-field__meta">图片</span>
      <FieldDescription field={field} />
      <input
        accept="image/*"
        aria-label={field.label}
        disabled={isDisabledMode(mode)}
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (file) {
            onFieldChange(field, toLocalImageValue(file));
          }
        }}
      />
    </label>
  );
};

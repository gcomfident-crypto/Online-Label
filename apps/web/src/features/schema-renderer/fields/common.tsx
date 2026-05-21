import type { FieldOption, SchemaField } from '@labelhub/shared';

import type { FieldRendererProps } from '../types';
import { getSchemaFieldKey } from '../types';

export type BaseFieldProps = FieldRendererProps;

export type EditableFieldProps = Pick<
  FieldRendererProps,
  'field' | 'rendererScope' | 'fieldPath' | 'value' | 'mode' | 'onFieldChange' | 'disabled'
>;

export type UploadedFileValue = {
  name: string;
  url: string;
  mimeType: string;
  size: number;
};

export const isDisabledMode = (
  mode: FieldRendererProps['mode'],
  disabled = false,
): boolean => {
  return mode === 'review' || disabled;
};

export const getFieldValue = (field: SchemaField, value: Record<string, unknown>): unknown => {
  return value[getSchemaFieldKey(field)];
};

export const getStringValue = (value: unknown): string => {
  return typeof value === 'string' ? value : '';
};

export const getStringArrayValue = (value: unknown): string[] => {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
};

export const getUploadedFileValue = (value: unknown): UploadedFileValue | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<Record<keyof UploadedFileValue, unknown>>;

  if (
    typeof candidate.name !== 'string' ||
    typeof candidate.url !== 'string' ||
    typeof candidate.mimeType !== 'string' ||
    typeof candidate.size !== 'number'
  ) {
    return null;
  }

  return {
    name: candidate.name,
    url: candidate.url,
    mimeType: candidate.mimeType,
    size: candidate.size,
  };
};

export const formatFileSize = (size: number): string => {
  if (size < 1024) {
    return `${size} B`;
  }

  return `${(size / 1024).toFixed(1)} KB`;
};

export const stringifyDisplayValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return '暂无内容';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
};

export const optionLabel = (field: SchemaField, option: FieldOption): string => {
  return `${field.label}：${option.label}`;
};

export const FieldDescription = ({ field }: { field: SchemaField }) => {
  return field.description ? <small>{field.description}</small> : null;
};

export const FieldCounter = ({
  maxLength,
  value,
}: {
  maxLength?: number;
  value: string;
}) => {
  if (maxLength === undefined) {
    return null;
  }

  const overLimit = value.length > maxLength;

  return (
    <small
      className={
        overLimit ? 'schema-field__counter schema-field__counter--over' : 'schema-field__counter'
      }
    >
      {value.length} / {maxLength}
    </small>
  );
};

export const UploadedFilePreview = ({ file }: { file: UploadedFileValue }) => {
  return (
    <div className="schema-field__file-preview">
      <span>{file.name}</span>
      <small>
        {file.mimeType} · {formatFileSize(file.size)}
      </small>
      <a href={file.url}>{file.url}</a>
    </div>
  );
};

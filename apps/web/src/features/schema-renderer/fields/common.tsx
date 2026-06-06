import type { ReactNode } from 'react';

import type { FieldOption, ModelRawDataContext, SchemaField } from '@labelhub/shared';

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

export const createLlmAssistPayload = ({
  answers,
  datasetKind,
  modelRawDataContext,
  promptTemplate,
  rawData,
  targetFieldKey,
}: {
  answers: Record<string, unknown>;
  datasetKind: FieldRendererProps['datasetKind'];
  modelRawDataContext?: ModelRawDataContext;
  promptTemplate?: string;
  rawData: Record<string, unknown>;
  targetFieldKey: string;
}) => {
  const { [targetFieldKey]: previousTargetValue, ...answersWithoutTarget } = answers;
  const assistRawData = modelRawDataContext?.rawData ?? rawData;

  return {
    datasetKind,
    rawData: assistRawData,
    ...(modelRawDataContext
      ? {
          visibleRawDataKeys: modelRawDataContext.visibleRawDataKeys,
          annotationRawDataKeys: modelRawDataContext.annotationRawDataKeys,
        }
      : {}),
    answers: answersWithoutTarget,
    targetFieldKey,
    promptTemplate,
    ...(previousTargetValue !== undefined ? { previousTargetValue } : {}),
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

const isNavigableResourceUrl = (value: string): boolean => {
  if (value.startsWith('/')) {
    return true;
  }

  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const optionLabel = (_field: SchemaField, option: FieldOption): string => {
  return option.label;
};

export const FieldDescription = ({ field }: { field: SchemaField }) => {
  return field.description ? <small className="schema-field__description">{field.description}</small> : null;
};

export const FieldTitleRow = ({
  field,
  meta,
}: {
  field: SchemaField;
  meta?: ReactNode;
}) => (
  <span className="schema-field__title-row">
    <span className="schema-field__title">{field.label}</span>
    {field.validation?.required ? (
      <span className="schema-field__required-mark" aria-hidden="true">
        *
      </span>
    ) : null}
    <FieldDescription field={field} />
    {meta ? <span className="schema-field__meta">{meta}</span> : null}
  </span>
);

export const FieldLegend = ({ field }: { field: SchemaField }) => (
  <legend className="schema-field__title-row">
    <span className="schema-field__title">{field.label}</span>
    {field.validation?.required ? (
      <span className="schema-field__required-mark" aria-hidden="true">
        *
      </span>
    ) : null}
    <FieldDescription field={field} />
  </legend>
);

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
  const canNavigate = isNavigableResourceUrl(file.url);

  return (
    <div className="schema-field__file-preview">
      <span>{file.name}</span>
      <small>
        {file.mimeType} · {formatFileSize(file.size)}
      </small>
      {canNavigate ? <a href={file.url}>{file.url}</a> : <small>{file.url}</small>}
    </div>
  );
};

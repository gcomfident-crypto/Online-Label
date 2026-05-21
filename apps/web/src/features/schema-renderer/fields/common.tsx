import type { FieldOption, SchemaField } from '@labelhub/shared';

import type { FieldRendererProps } from '../types';

export type BaseFieldProps = FieldRendererProps;

export type EditableFieldProps = Pick<
  FieldRendererProps,
  'field' | 'value' | 'mode' | 'onFieldChange'
>;

export const isDisabledMode = (mode: FieldRendererProps['mode']): boolean => {
  return mode === 'review';
};

export const getFieldValue = (field: SchemaField, value: Record<string, unknown>): unknown => {
  return value[field.key];
};

export const getStringValue = (value: unknown): string => {
  return typeof value === 'string' ? value : '';
};

export const getStringArrayValue = (value: unknown): string[] => {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
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

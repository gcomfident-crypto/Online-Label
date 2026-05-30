import type {
  FieldOption,
  FieldType,
  ShowItemDisplayConfig,
  ShowItemDisplayField,
} from './schema.ts';
import type { DatasetRecord } from './datasetProfiles.ts';

export const AUTO_TEMPLATE_ANNOTATION_FIELD_TYPES = [
  'text',
  'textarea',
  'radio',
  'checkbox',
  'tag_select',
  'rich_text',
  'file_upload',
  'image_upload',
  'json_editor',
] as const satisfies readonly FieldType[];

export type AutoTemplateAnnotationFieldType =
  (typeof AUTO_TEMPLATE_ANNOTATION_FIELD_TYPES)[number];

export type AutoTemplateSourceField = {
  sourceKey: string;
  samples: readonly unknown[];
  valueTypes: readonly string[];
  filledCount: number;
  totalCount: number;
};

export type AutoTemplateFieldValueStats = {
  sourceKey: string;
  totalCount: number;
  filledCount: number;
  valueTypes: readonly string[];
  samples: readonly unknown[];
  uniqueValues: readonly string[];
  optionCandidates: readonly FieldOption[];
  hasMultiValue: boolean;
  distinctCount: number;
  truncated?: boolean;
};

export type AutoTemplateFieldClassificationRequest = {
  fileName: string;
  fields: readonly AutoTemplateSourceField[];
  records: readonly DatasetRecord[];
  fieldStats?: readonly AutoTemplateFieldValueStats[];
};

export type AutoTemplateAnnotationField = {
  sourceKey: string;
  label?: string;
  type?: AutoTemplateAnnotationFieldType | string;
  options?: readonly FieldOption[];
  required?: boolean;
  description?: string;
  placeholder?: string;
};

export type AutoTemplateFieldClassificationResult = {
  layout?: ShowItemDisplayConfig['layout'];
  displayFields?: readonly ShowItemDisplayField[];
  annotationFields?: readonly AutoTemplateAnnotationField[];
  provider?: string;
  model?: string;
  reasoning?: string;
};

export const isAutoTemplateAnnotationFieldType = (
  value: unknown,
): value is AutoTemplateAnnotationFieldType =>
  typeof value === 'string' &&
  AUTO_TEMPLATE_ANNOTATION_FIELD_TYPES.includes(value as AutoTemplateAnnotationFieldType);

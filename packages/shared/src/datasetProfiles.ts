import type { DatasetImportFormat, DatasetKind } from './schema.ts';

export type DatasetProfile = {
  kind: DatasetKind;
  primaryKeyField: string;
  expectedCount?: number;
  supportedFormats: readonly DatasetImportFormat[];
  excelSheetName?: string;
  requiredFields: readonly string[];
  arrayFields?: readonly string[];
  booleanFields?: readonly string[];
  mediaFields?: readonly string[];
};

export type DatasetRecord = Record<string, unknown>;

export type DatasetRecordValidationResult = {
  ok: boolean;
  missingFields: string[];
};

const DATASET_PROFILES = {
  qa_quality: {
    kind: 'qa_quality',
    primaryKeyField: 'id',
    expectedCount: 30,
    supportedFormats: ['json', 'jsonl', 'xlsx'],
    excelSheetName: '标注题目',
    requiredFields: ['id', 'prompt', 'model_answer', 'expected_dimensions'],
    arrayFields: ['tags', 'expected_dimensions'],
    mediaFields: ['media_type', 'media_url', 'content_markdown'],
  },
  preference_compare: {
    kind: 'preference_compare',
    primaryKeyField: 'id',
    expectedCount: 12,
    supportedFormats: ['json', 'jsonl', 'xlsx'],
    excelSheetName: '偏好对比',
    requiredFields: ['id', 'prompt', 'response_a', 'response_b'],
    arrayFields: ['dimensions'],
    booleanFields: ['safety_flag'],
  },
  generic_json: {
    kind: 'generic_json',
    primaryKeyField: 'id',
    supportedFormats: ['json', 'jsonl'],
    requiredFields: [],
  },
} as const satisfies Record<DatasetKind, DatasetProfile>;

export const getDatasetProfile = (kind: DatasetKind): DatasetProfile => {
  return DATASET_PROFILES[kind];
};

const resolveDatasetProfile = (
  profileOrKind: DatasetProfile | DatasetKind,
): DatasetProfile => {
  return typeof profileOrKind === 'string'
    ? getDatasetProfile(profileOrKind)
    : profileOrKind;
};

const isBlankRequiredValue = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
};

export const validateDatasetRecord = (
  profileOrKind: DatasetProfile | DatasetKind,
  record: DatasetRecord,
): DatasetRecordValidationResult => {
  const profile = resolveDatasetProfile(profileOrKind);
  const missingFields = profile.requiredFields.filter((field) =>
    isBlankRequiredValue(record[field]),
  );

  return {
    ok: missingFields.length === 0,
    missingFields,
  };
};

const normalizeArrayField = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    return value
      .split('|')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return value;
};

const normalizeBooleanField = (value: unknown): unknown => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === '是') {
    return true;
  }

  if (value === '否') {
    return false;
  }

  return value;
};

export const normalizeDatasetRecord = <TRecord extends DatasetRecord>(
  profileOrKind: DatasetProfile | DatasetKind,
  record: TRecord,
): DatasetRecord => {
  const profile = resolveDatasetProfile(profileOrKind);
  const normalized: DatasetRecord = { ...record };

  for (const field of profile.arrayFields ?? []) {
    if (field in normalized) {
      normalized[field] = normalizeArrayField(normalized[field]);
    }
  }

  for (const field of profile.booleanFields ?? []) {
    if (field in normalized) {
      normalized[field] = normalizeBooleanField(normalized[field]);
    }
  }

  return normalized;
};

export const shouldSkipImportFile = (path: string): boolean => {
  const normalizedPath = path.replaceAll('\\', '/');
  const fileName = normalizedPath.split('/').at(-1) ?? normalizedPath;

  return (
    normalizedPath.startsWith('__MACOSX/') ||
    normalizedPath.includes('/__MACOSX/') ||
    fileName === '.DS_Store' ||
    fileName.startsWith('._') ||
    (fileName.startsWith('.~') && fileName.endsWith('.xlsx'))
  );
};

import {
  createLabelHubSchema,
  isAutoTemplateAnnotationFieldType,
  type AutoTemplateAnnotationField,
  type AutoTemplateFieldClassificationRequest,
  type AutoTemplateFieldClassificationResult,
  type AutoTemplateFieldValueStats,
  type DatasetRecord,
  type FieldOption,
  type LabelHubSchema,
  type SchemaField,
  type ShowItemDisplayConfig,
  type ShowItemDisplayField,
} from '@labelhub/shared';

const AUTO_SHOW_ITEM_FIELD_KEY = 'auto_show_item';
const FALLBACK_FIELD_KEY = 'id';
const AUTO_FIELD_SCAN_LIMIT = 20;
const AUTO_FIELD_SAMPLE_LIMIT = 3;
const AUTO_PREVIEW_RECORD_LIMIT = 3;
const AUTO_FIELD_DESCRIPTION_MAX_LENGTH = 20;
const AUTO_OPTION_STATS_RECORD_LIMIT = 10_000;
const AUTO_OPTION_LIMIT = 100;
const AUTO_RADIO_OPTION_LIMIT = 20;
const AUTO_CHECKBOX_OPTION_LIMIT = 80;
const AUTO_LONG_TEXT_LENGTH = 60;

export const createAutoShowItemTemplateName = (fileName: string): string =>
  `自动解析模板 · ${fileName}`;

export const createAutoTemplateClassificationRequest = (
  records: readonly DatasetRecord[],
  fileName: string,
): AutoTemplateFieldClassificationRequest => {
  const classificationRecords = createAutoTemplateClassificationRecords(records, fileName);
  const fieldSampleRecords = isJsonFileName(fileName) ? classificationRecords : records;
  const sourceKeys = inferSourceKeys(fieldSampleRecords);

  return {
    fileName,
    fields: sourceKeys.map((sourceKey) => summarizeSourceField(fieldSampleRecords, sourceKey)),
    records: classificationRecords,
    fieldStats: buildAutoTemplateFieldValueStats(records),
  };
};

export const createAutoShowItemTemplateSchema = (
  records: readonly DatasetRecord[],
  fileName: string,
  classification?: AutoTemplateFieldClassificationResult | null,
  fieldStats?: readonly AutoTemplateFieldValueStats[],
): LabelHubSchema => {
  const resolvedFieldStats = fieldStats ?? buildAutoTemplateFieldValueStats(records);
  const sourceKeysFromStats = resolvedFieldStats.map((stats) => stats.sourceKey);
  const sourceKeys = sourceKeysFromStats.length > 0 ? sourceKeysFromStats : inferSourceKeys(records);
  const fieldStatsMap = new Map(resolvedFieldStats.map((stats) => [stats.sourceKey, stats]));
  const classifiedFields = resolveClassifiedFields(sourceKeys, classification, fieldStatsMap);
  const schemaFields: SchemaField[] = [];

  if (classifiedFields.displayFields.length > 0) {
    const visibleDisplayFields = classifiedFields.displayFields.filter((field) => field.visible !== false);

    schemaFields.push({
      key: AUTO_SHOW_ITEM_FIELD_KEY,
      type: 'show_item',
      label: fileName,
      sourceKeys: visibleDisplayFields.map((field) => field.sourceKey),
      displayConfig: {
        layout: 'table',
        fields: classifiedFields.displayFields,
      },
    });
  }

  for (const annotationField of classifiedFields.annotationFields) {
    schemaFields.push(createAnnotationSchemaField(annotationField, schemaFields));
  }

  return createLabelHubSchema({
    schemaVersion: 'auto-draft',
    datasetKind: 'generic_json',
    fields: schemaFields,
  });
};

export const createAutoShowItemPreviewRecords = (
  records: readonly DatasetRecord[],
): DatasetRecord[] =>
  records
    .filter((record) => Object.keys(record).length > 0)
    .slice(0, AUTO_PREVIEW_RECORD_LIMIT);

const createAutoTemplateClassificationRecords = (
  records: readonly DatasetRecord[],
  fileName: string,
): DatasetRecord[] =>
  isJsonFileName(fileName)
    ? records.filter((record) => Object.keys(record).length > 0).slice(0, 1)
    : records.filter((record) => Object.keys(record).length > 0);

const isJsonFileName = (fileName: string): boolean =>
  fileName.trim().toLowerCase().endsWith('.json');

const resolveClassifiedFields = (
  sourceKeys: readonly string[],
  classification?: AutoTemplateFieldClassificationResult | null,
  fieldStatsMap: ReadonlyMap<string, AutoTemplateFieldValueStats> = new Map(),
): {
  layout: ShowItemDisplayConfig['layout'];
  displayFields: ShowItemDisplayField[];
  annotationFields: AutoTemplateAnnotationField[];
} => {
  const knownSourceKeys = new Set(sourceKeys);
  const annotationFields = normalizeAnnotationFields(
    classification?.annotationFields,
    knownSourceKeys,
    fieldStatsMap,
  );
  const annotationSourceKeys = new Set(annotationFields.map((field) => field.sourceKey));
  const displayFields = normalizeDisplayFields(
    classification?.displayFields,
    knownSourceKeys,
    annotationSourceKeys,
  );
  const classifiedSourceKeys = new Set([
    ...displayFields.map((field) => field.sourceKey),
    ...annotationSourceKeys,
  ]);

  for (const sourceKey of sourceKeys) {
    if (!classifiedSourceKeys.has(sourceKey)) {
      annotationFields.push(
        enrichAnnotationFieldWithStats(
          {
            sourceKey,
            label: sourceKey,
            type: 'text',
          },
          fieldStatsMap.get(sourceKey),
        ),
      );
    }
  }

  return {
    layout: normalizeLayout(classification?.layout),
    displayFields,
    annotationFields,
  };
};

const normalizeDisplayFields = (
  fields: AutoTemplateFieldClassificationResult['displayFields'],
  knownSourceKeys: ReadonlySet<string>,
  annotationSourceKeys: ReadonlySet<string>,
): ShowItemDisplayField[] => {
  const seen = new Set<string>();
  const normalizedFields: ShowItemDisplayField[] = [];

  for (const field of fields ?? []) {
    if (!field || !knownSourceKeys.has(field.sourceKey) || annotationSourceKeys.has(field.sourceKey)) {
      continue;
    }

    if (seen.has(field.sourceKey)) {
      continue;
    }

    seen.add(field.sourceKey);
    normalizedFields.push({
      sourceKey: field.sourceKey,
      label: normalizeLabel(field.label, field.sourceKey),
      ...normalizeDisplayArea(field.area),
      ...normalizeDisplayFormat(field.format),
      ...normalizePositiveNumber('width', field.width),
      ...normalizePositiveNumber('maxLines', field.maxLines),
      ...(field.visible === false ? { visible: false } : {}),
    });
  }

  return normalizedFields;
};

const normalizeAnnotationFields = (
  fields: AutoTemplateFieldClassificationResult['annotationFields'],
  knownSourceKeys: ReadonlySet<string>,
  fieldStatsMap: ReadonlyMap<string, AutoTemplateFieldValueStats>,
): AutoTemplateAnnotationField[] => {
  const seen = new Set<string>();
  const normalizedFields: AutoTemplateAnnotationField[] = [];

  for (const field of fields ?? []) {
    if (!field || !knownSourceKeys.has(field.sourceKey) || seen.has(field.sourceKey)) {
      continue;
    }

    seen.add(field.sourceKey);
    normalizedFields.push(
      enrichAnnotationFieldWithStats(
        {
          sourceKey: field.sourceKey,
          label: normalizeAnnotationLabel(field.label, field.sourceKey),
          type: isAutoTemplateAnnotationFieldType(field.type) ? field.type : 'text',
          options: normalizeOptions(field.options),
          required: true,
          ...normalizeDescriptionProperty(field.description),
          ...normalizeTextProperty('placeholder', field.placeholder),
        },
        fieldStatsMap.get(field.sourceKey),
      ),
    );
  }

  return normalizedFields;
};

export const buildAutoTemplateFieldValueStats = (
  records: readonly DatasetRecord[],
  sourceKeys?: readonly string[],
): AutoTemplateFieldValueStats[] => {
  const scannedRecords = records
    .filter((record) => Object.keys(record).length > 0)
    .slice(0, AUTO_OPTION_STATS_RECORD_LIMIT);
  const effectiveSourceKeys = sourceKeys && sourceKeys.length > 0
    ? sourceKeys
    : inferStatsSourceKeys(scannedRecords);

  return effectiveSourceKeys.map((sourceKey) => summarizeFieldValueStats(scannedRecords, sourceKey));
};

const summarizeFieldValueStats = (
  records: readonly DatasetRecord[],
  sourceKey: string,
): AutoTemplateFieldValueStats => {
  const valueTypes: string[] = [];
  const samples: unknown[] = [];
  const uniqueValues: string[] = [];
  const optionCandidates: FieldOption[] = [];
  const seenValues = new Set<string>();
  const seenOptions = new Set<string>();
  let filledCount = 0;
  let hasMultiValue = false;
  let truncated = false;

  for (const record of records) {
    const value = record[sourceKey];

    if (!isFilledValue(value)) {
      continue;
    }

    filledCount += 1;

    const valueType = resolveValueType(value);
    if (!valueTypes.includes(valueType)) {
      valueTypes.push(valueType);
    }

    if (samples.length < AUTO_FIELD_SAMPLE_LIMIT) {
      samples.push(value);
    }

    const uniqueValue = normalizeUniqueFieldValue(value);
    if (uniqueValue && !seenValues.has(uniqueValue)) {
      seenValues.add(uniqueValue);
      uniqueValues.push(uniqueValue);
    }

    const extracted = extractOptionLabelsFromValue(value);
    hasMultiValue = hasMultiValue || extracted.hasMultiValue;

    for (const label of extracted.labels) {
      if (seenOptions.has(label)) {
        continue;
      }

      seenOptions.add(label);

      if (optionCandidates.length < AUTO_OPTION_LIMIT) {
        optionCandidates.push({ label, value: label });
      } else {
        truncated = true;
      }
    }
  }

  return {
    sourceKey,
    totalCount: records.length,
    filledCount,
    valueTypes,
    samples,
    uniqueValues,
    optionCandidates,
    hasMultiValue,
    distinctCount: seenOptions.size,
    ...(truncated || records.length >= AUTO_OPTION_STATS_RECORD_LIMIT ? { truncated: true } : {}),
  };
};

const enrichAnnotationFieldWithStats = (
  field: AutoTemplateAnnotationField,
  stats?: AutoTemplateFieldValueStats,
): AutoTemplateAnnotationField => {
  const candidateType = isAutoTemplateAnnotationFieldType(field.type) ? field.type : 'text';
  const options = resolveFieldOptions(field.sourceKey, stats, normalizeOptions(field.options));
  const candidateIsChoiceType =
    candidateType === 'radio' || candidateType === 'checkbox' || candidateType === 'tag_select';
  const looksLikeFreeText = Boolean(stats && isHighCardinalityFreeTextStats(stats));
  const hasFiniteOptions =
    options.length > 0 &&
    (!stats || stats.distinctCount <= AUTO_OPTION_LIMIT) &&
    !looksLikeFreeText &&
    (stats?.hasMultiValue || options.length >= 2 || candidateIsChoiceType);
  const hasLongText = Boolean(stats && hasLongTextStats(stats));
  let type: AutoTemplateAnnotationField['type'] = candidateType;

  if (isFixedNonChoiceFieldType(candidateType)) {
    type = candidateType;
  } else if (isLongTextAnnotationSourceKey(field.sourceKey) || hasLongText) {
    type = 'textarea';
  } else if (hasFiniteOptions) {
    if (candidateType === 'checkbox' || candidateType === 'tag_select') {
      type = candidateType;
    } else if (stats?.hasMultiValue) {
      type = options.length <= AUTO_CHECKBOX_OPTION_LIMIT ? 'checkbox' : 'tag_select';
    } else if (options.length <= AUTO_RADIO_OPTION_LIMIT) {
      type = 'radio';
    } else {
      type = 'tag_select';
    }
  } else if (
    !candidateType ||
    candidateType === 'radio' ||
    candidateType === 'checkbox' ||
    candidateType === 'tag_select'
  ) {
    type = 'text';
  }

  return {
    ...field,
    type,
    ...(type === 'radio' || type === 'checkbox' || type === 'tag_select'
      ? { options }
      : { options: [] }),
  };
};

const resolveFieldOptions = (
  sourceKey: string,
  stats: AutoTemplateFieldValueStats | undefined,
  candidateOptions: readonly FieldOption[],
): FieldOption[] => {
  const statsOptions = stats && stats.distinctCount <= AUTO_OPTION_LIMIT ? stats.optionCandidates : [];
  const preferredDefaults = isPreferredSourceKey(sourceKey)
    ? [
        { label: 'A', value: 'A' },
        { label: 'B', value: 'B' },
      ]
    : [];

  return mergeOptions(statsOptions, candidateOptions, preferredDefaults).slice(0, AUTO_OPTION_LIMIT);
};

const mergeOptions = (...optionGroups: readonly (readonly FieldOption[])[]): FieldOption[] => {
  const options: FieldOption[] = [];
  const seenValues = new Set<string>();
  const seenLabels = new Set<string>();

  for (const group of optionGroups) {
    for (const option of group) {
      const value = normalizeOptionLabel(option.value);
      const label = normalizeOptionLabel(option.label) || value;

      if (!value || seenValues.has(value) || seenLabels.has(label)) {
        continue;
      }

      seenValues.add(value);
      seenLabels.add(label);
      options.push({
        value,
        label,
      });
    }
  }

  return options;
};

const isFixedNonChoiceFieldType = (type: AutoTemplateAnnotationField['type']): boolean =>
  type === 'file_upload' ||
  type === 'image_upload' ||
  type === 'json_editor' ||
  type === 'rich_text';

const isPreferredSourceKey = (sourceKey: string): boolean => {
  const normalizedKey = sourceKey.trim().toLowerCase();

  return normalizedKey === 'preferred' || normalizedKey.includes('preference');
};

const isLongTextAnnotationSourceKey = (sourceKey: string): boolean => {
  const normalizedKey = sourceKey.trim().toLowerCase();

  return (
    normalizedKey.includes('note') ||
    normalizedKey.includes('comment') ||
    normalizedKey.includes('rationale') ||
    normalizedKey.includes('reason') ||
    normalizedKey.includes('explanation')
  );
};

const hasLongTextStats = (stats: AutoTemplateFieldValueStats): boolean =>
  stats.samples.some((value) => typeof value === 'string' && isLongTextValue(value)) ||
  stats.uniqueValues.some(isLongTextValue);

const isHighCardinalityFreeTextStats = (stats: AutoTemplateFieldValueStats): boolean =>
  !stats.hasMultiValue &&
  stats.filledCount >= 10 &&
  stats.distinctCount >= 10 &&
  stats.distinctCount / stats.filledCount > 0.8;

const createAnnotationSchemaField = (
  field: AutoTemplateAnnotationField,
  existingFields: readonly SchemaField[],
): SchemaField => {
  const type = isAutoTemplateAnnotationFieldType(field.type) ? field.type : 'text';
  const isRequired = field.required !== false;
  const schemaField: SchemaField = {
    key: uniqueSchemaFieldKey(field.sourceKey, existingFields),
    fieldKey: field.sourceKey,
    sourceKey: field.sourceKey,
    type,
    label: normalizeAnnotationLabel(field.label, field.sourceKey),
    ...normalizeDescriptionProperty(field.description),
    ...normalizeTextProperty('placeholder', field.placeholder),
    ...(isRequired ? { validation: { required: true } } : {}),
  };

  if (type === 'radio' || type === 'checkbox' || type === 'tag_select') {
    schemaField.options = normalizeOptions(field.options);
  }

  if (type === 'file_upload') {
    schemaField.fileConstraints = {
      maxFiles: 1,
      maxSizeMb: 20,
      acceptedMimeTypes: ['application/pdf', 'text/plain', 'image/*'],
    };
  }

  if (type === 'image_upload') {
    schemaField.fileConstraints = {
      maxFiles: 1,
      maxSizeMb: 10,
      acceptedMimeTypes: ['image/*'],
    };
  }

  return schemaField;
};

const inferSourceKeys = (records: readonly DatasetRecord[]): string[] => {
  const sourceKeys: string[] = [];
  const seenKeys = new Set<string>();

  for (const record of records.slice(0, AUTO_FIELD_SCAN_LIMIT)) {
    for (const key of Object.keys(record)) {
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        sourceKeys.push(key);
      }
    }
  }

  return sourceKeys.length > 0 ? sourceKeys : [FALLBACK_FIELD_KEY];
};

const inferStatsSourceKeys = (records: readonly DatasetRecord[]): string[] => {
  const sourceKeys: string[] = [];
  const seenKeys = new Set<string>();

  for (const record of records.slice(0, AUTO_OPTION_STATS_RECORD_LIMIT)) {
    for (const key of Object.keys(record)) {
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        sourceKeys.push(key);
      }
    }
  }

  return sourceKeys.length > 0 ? sourceKeys : [FALLBACK_FIELD_KEY];
};

const summarizeSourceField = (
  records: readonly DatasetRecord[],
  sourceKey: string,
): AutoTemplateFieldClassificationRequest['fields'][number] => {
  const samples: unknown[] = [];
  const valueTypes: string[] = [];
  let filledCount = 0;
  const scannedRecords = records.slice(0, AUTO_FIELD_SCAN_LIMIT);

  for (const record of scannedRecords) {
    const value = record[sourceKey];

    if (!isFilledValue(value)) {
      continue;
    }

    filledCount += 1;

    const valueType = resolveValueType(value);
    if (!valueTypes.includes(valueType)) {
      valueTypes.push(valueType);
    }

    if (samples.length < AUTO_FIELD_SAMPLE_LIMIT) {
      samples.push(value);
    }
  }

  return {
    sourceKey,
    samples,
    valueTypes,
    filledCount,
    totalCount: scannedRecords.length,
  };
};

const isFilledValue = (value: unknown): boolean =>
  value !== null && value !== undefined && value !== '';

const resolveValueType = (value: unknown): string => {
  if (Array.isArray(value)) {
    return 'array';
  }

  if (value === null) {
    return 'null';
  }

  return typeof value;
};

const normalizeLabel = (label: unknown, fallback: string): string =>
  typeof label === 'string' && label.trim() ? label.trim() : fallback;

const normalizeAnnotationLabel = (label: unknown, fallback: string): string => {
  const normalizedLabel = normalizeLabel(label, fallback);
  const strippedLabel = normalizedLabel
    .replace(/^(?:请)?(?:选择|填写|上传|输入|勾选|给出)\s*/u, '')
    .replace(/^(?:所有)?适用的/u, '')
    .trim();

  return strippedLabel || normalizedLabel;
};

const normalizeOptions = (options: unknown): FieldOption[] => {
  if (!Array.isArray(options)) {
    return [];
  }

  const normalizedOptions: FieldOption[] = [];
  const seenValues = new Set<string>();

  for (const option of options) {
    if (!option || typeof option !== 'object') {
      continue;
    }

    const candidate = option as Partial<FieldOption>;
    const value = typeof candidate.value === 'string' ? candidate.value.trim() : '';

    if (!value || seenValues.has(value)) {
      continue;
    }

    seenValues.add(value);
    normalizedOptions.push({
      value,
      label: normalizeLabel(candidate.label, value),
    });
  }

  return normalizedOptions;
};

const normalizeUniqueFieldValue = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return normalizeOptionLabel(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const normalizedItems = value
      .map(normalizeUniqueFieldValue)
      .filter((item): item is string => Boolean(item));

    return normalizedItems.length > 0 ? normalizedItems.join(' | ') : null;
  }

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  return null;
};

const extractOptionLabelsFromValue = (
  value: unknown,
): { labels: string[]; hasMultiValue: boolean } => {
  const labels: string[] = [];
  const seenLabels = new Set<string>();
  let hasMultiValue = false;

  const appendLabel = (label: string): void => {
    const normalizedLabel = normalizeOptionLabel(label);

    if (!normalizedLabel || seenLabels.has(normalizedLabel)) {
      return;
    }

    seenLabels.add(normalizedLabel);
    labels.push(normalizedLabel);
  };

  const visit = (currentValue: unknown): void => {
    if (Array.isArray(currentValue)) {
      hasMultiValue = hasMultiValue || currentValue.length > 1;

      for (const item of currentValue) {
        visit(item);
      }
      return;
    }

    if (typeof currentValue === 'string') {
      const parts = currentValue.split(/[|｜,，、;；\n\r]+/u);
      hasMultiValue = hasMultiValue || parts.length > 1;

      for (const part of parts) {
        appendLabel(part);
      }
      return;
    }

    if (typeof currentValue === 'number' || typeof currentValue === 'boolean') {
      appendLabel(String(currentValue));
    }
  };

  visit(value);

  return { labels, hasMultiValue };
};

const normalizeOptionLabel = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

const isLongTextValue = (value: string): boolean =>
  value.length > AUTO_LONG_TEXT_LENGTH || value.includes('\n') || value.includes('\r');

const normalizeLayout = (layout: unknown): ShowItemDisplayConfig['layout'] => {
  if (layout === 'table' || layout === 'card' || layout === 'field_list' || layout === 'comparison') {
    return layout;
  }

  return 'field_list';
};

const normalizeDisplayArea = (
  area: unknown,
): Pick<ShowItemDisplayField, 'area'> =>
  area === 'primary' || area === 'meta' || area === 'content' ? { area } : {};

const normalizeDisplayFormat = (
  format: unknown,
): Pick<ShowItemDisplayField, 'format'> =>
  format === 'text' ||
  format === 'long_text' ||
  format === 'badge' ||
  format === 'code' ||
  format === 'json'
    ? { format }
    : {};

const normalizePositiveNumber = <TKey extends 'width' | 'maxLines'>(
  key: TKey,
  value: unknown,
): Partial<Pick<ShowItemDisplayField, TKey>> =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? ({ [key]: value } as Pick<ShowItemDisplayField, TKey>)
    : {};

const normalizeTextProperty = <TKey extends 'description' | 'placeholder'>(
  key: TKey,
  value: unknown,
): Partial<Pick<SchemaField, TKey>> =>
  typeof value === 'string' && value.trim()
    ? ({ [key]: value.trim() } as Pick<SchemaField, TKey>)
    : {};

const normalizeDescriptionProperty = (
  value: unknown,
): Partial<Pick<SchemaField, 'description'>> => {
  if (typeof value !== 'string') {
    return {};
  }

  const description = value.trim().replace(/\s+/g, ' ').slice(0, AUTO_FIELD_DESCRIPTION_MAX_LENGTH);

  return description ? { description } : {};
};

const uniqueSchemaFieldKey = (
  sourceKey: string,
  existingFields: readonly SchemaField[],
): string => {
  const existingKeys = new Set(existingFields.flatMap((field) => [field.key, field.fieldKey ?? '']));
  const baseKey = sanitizeSchemaFieldKey(sourceKey);

  if (!existingKeys.has(baseKey)) {
    return baseKey;
  }

  let index = 2;
  let nextKey = `${baseKey}_${index}`;

  while (existingKeys.has(nextKey)) {
    index += 1;
    nextKey = `${baseKey}_${index}`;
  }

  return nextKey;
};

const sanitizeSchemaFieldKey = (sourceKey: string): string => {
  const normalized = sourceKey
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'field';
};

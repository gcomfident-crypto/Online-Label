import type { LabelHubSchema, SchemaField, ShowItemDisplayField } from './schema.ts';

export type ModelRawDataContext = {
  annotationRawDataKeys: string[];
  rawData: Record<string, unknown>;
  visibleRawDataKeys: string[];
};

export const buildModelRawDataContext = (
  schema: LabelHubSchema,
  rawData: Record<string, unknown>,
): ModelRawDataContext => {
  const fields = flattenSchemaFields(schema.fields);
  const annotationRawDataKeys = collectAnnotationRawDataKeys(fields);
  const annotationRawDataKeySet = new Set(annotationRawDataKeys);
  const showItemRawDataKeys = collectShowItemRawDataKeys(fields);
  const candidateVisibleKeys = showItemRawDataKeys.length > 0 ? showItemRawDataKeys : Object.keys(rawData);
  const visibleRawDataKeys = candidateVisibleKeys.filter((sourceKey) => !annotationRawDataKeySet.has(sourceKey));

  return {
    annotationRawDataKeys,
    rawData: Object.fromEntries(visibleRawDataKeys.map((sourceKey) => [sourceKey, rawData[sourceKey] ?? null])),
    visibleRawDataKeys,
  };
};

export const collectAnnotationRawDataKeys = (fields: readonly SchemaField[]): string[] => {
  const keys: string[] = [];
  const seen = new Set<string>();

  for (const field of fields) {
    if (!isAnswerField(field)) {
      continue;
    }

    for (const key of [
      field.key,
      field.fieldKey,
      field.sourceKey,
      ...(field.sourceKeys ?? []),
    ]) {
      addUniqueKey(keys, seen, key);
    }
  }

  return keys;
};

export const collectShowItemRawDataKeys = (fields: readonly SchemaField[]): string[] => {
  const keys: string[] = [];
  const seen = new Set<string>();

  for (const field of fields) {
    if (field.type !== 'show_item') {
      continue;
    }

    for (const displayField of normalizeShowItemDisplayFields(field)) {
      addUniqueKey(keys, seen, displayField.sourceKey);
    }
  }

  return keys;
};

export const flattenSchemaFields = (fields: readonly SchemaField[]): SchemaField[] => {
  const flattened: SchemaField[] = [];

  for (const field of fields) {
    flattened.push(field);

    if (field.fields) {
      flattened.push(...flattenSchemaFields(field.fields));
    }

    if (field.tabs) {
      for (const tab of field.tabs) {
        flattened.push(...flattenSchemaFields(tab.fields));
      }
    }
  }

  return flattened;
};

export const isAnswerField = (field: SchemaField): boolean =>
  !['show_item', 'group', 'tabs', 'llm_assist'].includes(field.type);

export const normalizeShowItemDisplayFields = (field: SchemaField): ShowItemDisplayField[] => {
  if (field.displayConfig?.fields) {
    return field.displayConfig.fields
      .filter((displayField) => displayField.visible !== false)
      .map((displayField) => ({
        ...displayField,
        label: displayField.label || displayField.sourceKey,
      }));
  }

  const sourceKeys = field.sourceKeys ?? (field.sourceKey ? [field.sourceKey] : []);

  return sourceKeys.map((sourceKey) => ({
    sourceKey,
    label: sourceKey,
    area: 'content',
    format: 'text',
  }));
};

const addUniqueKey = (keys: string[], seen: Set<string>, value: unknown): void => {
  if (typeof value !== 'string' || !value.trim()) {
    return;
  }

  const key = value.trim();

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  keys.push(key);
};

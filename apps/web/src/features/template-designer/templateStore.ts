import { create } from 'zustand';

import {
  CUSTOM_VALIDATOR_KEYS,
  createLabelHubSchema,
  preferenceCompareSampleSchema,
  qaQualitySampleSchema,
  titleCleanupSampleSchema,
  type CustomValidatorKey,
  type FieldLinkageRule,
  type FieldType,
  type LabelHubSchema,
  type SchemaField,
} from '@labelhub/shared';

export type OfficialTemplateKey = 'qa_quality' | 'preference_compare' | 'title_cleanup';

export type MaterialSpec = {
  type: FieldType;
  label: string;
  group: '基础物料' | '高级物料' | '布局物料';
};

export const DESIGNER_MATERIALS: readonly MaterialSpec[] = [
  { type: 'text', label: '单行输入', group: '基础物料' },
  { type: 'textarea', label: '多行文本', group: '基础物料' },
  { type: 'radio', label: '单选', group: '基础物料' },
  { type: 'checkbox', label: '多选', group: '基础物料' },
  { type: 'tag_select', label: '标签选择', group: '基础物料' },
  { type: 'rich_text', label: '富文本', group: '基础物料' },
  { type: 'file_upload', label: '文件/图片', group: '基础物料' },
  { type: 'json_editor', label: 'JSON 编辑器', group: '高级物料' },
  { type: 'llm_assist', label: 'LLM 触发组件', group: '高级物料' },
  { type: 'show_item', label: '展示项 ShowItem', group: '高级物料' },
  { type: 'group', label: '分组容器', group: '布局物料' },
  { type: 'tabs', label: '多 Tab 布局', group: '布局物料' },
];

type TemplateDesignerState = {
  schema: LabelHubSchema;
  selectedFieldKey: string | null;
  past: LabelHubSchema[];
  future: LabelHubSchema[];
  resetDesigner: () => void;
  addField: (type: FieldType) => void;
  addFieldBefore: (type: FieldType, targetFieldKey: string) => void;
  selectField: (fieldKey: string | null) => void;
  updateSelectedField: (patch: Partial<SchemaField>) => void;
  updateSelectedFieldValidation: (
    patch: NonNullable<SchemaField['validation']>,
  ) => void;
  addLinkageRuleToSelectedField: () => void;
  removeField: (fieldKey: string) => void;
  duplicateField: (fieldKey: string) => void;
  moveField: (fieldKey: string, direction: 'up' | 'down') => void;
  reorderField: (fieldKey: string, overFieldKey: string) => void;
  setSchema: (schema: LabelHubSchema) => void;
  loadOfficialTemplate: (templateKey: OfficialTemplateKey) => void;
  undo: () => void;
  redo: () => void;
};

const emptySchema = (): LabelHubSchema =>
  createLabelHubSchema({
    schemaVersion: 'draft',
    datasetKind: 'generic_json',
    fields: [],
  });

export const useTemplateDesignerStore = create<TemplateDesignerState>((set, get) => ({
  schema: emptySchema(),
  selectedFieldKey: null,
  past: [],
  future: [],
  resetDesigner: () =>
    set({
      schema: emptySchema(),
      selectedFieldKey: null,
      past: [],
      future: [],
    }),
  addField: (type) => {
    commitSchemaChange(set, get, (schema) => {
      const field = createDefaultField(type, schema);

      return {
        schema: {
          ...schema,
          fields: [...schema.fields, field],
        },
        selectedFieldKey: field.key,
      };
    });
  },
  addFieldBefore: (type, targetFieldKey) => {
    commitSchemaChange(set, get, (schema) => {
      const field = createDefaultField(type, schema);

      return {
        schema: {
          ...schema,
          fields: insertBeforeField(schema.fields, targetFieldKey, field),
        },
        selectedFieldKey: field.key,
      };
    });
  },
  selectField: (fieldKey) => set({ selectedFieldKey: fieldKey }),
  updateSelectedField: (patch) => {
    const selectedFieldKey = get().selectedFieldKey;

    if (!selectedFieldKey) {
      return;
    }

    commitSchemaChange(set, get, (schema) => ({
      schema: {
        ...schema,
        fields: updateFieldInList(schema.fields, selectedFieldKey, (field) => ({
          ...field,
          ...patch,
        })),
      },
      selectedFieldKey,
    }));
  },
  updateSelectedFieldValidation: (patch) => {
    const selectedField = findFieldByKey(get().schema.fields, get().selectedFieldKey);

    if (!selectedField) {
      return;
    }

    get().updateSelectedField({
      validation: {
        ...(selectedField.validation ?? {}),
        ...patch,
      },
    });
  },
  addLinkageRuleToSelectedField: () => {
    const selectedField = findFieldByKey(get().schema.fields, get().selectedFieldKey);
    const firstField = get().schema.fields[0];

    if (!selectedField || !firstField) {
      return;
    }

    const rule: FieldLinkageRule = {
      when: {
        fieldKey: firstEditableAnswerKey(get().schema.fields) ?? selectedField.fieldKey ?? selectedField.key,
        operator: 'equals',
        value: '',
      },
      action: 'require',
      targetFieldKey: selectedField.fieldKey ?? selectedField.key,
    };

    get().updateSelectedField({
      linkageRules: [...(selectedField.linkageRules ?? []), rule],
    });
  },
  removeField: (fieldKey) => {
    commitSchemaChange(set, get, (schema) => ({
      schema: {
        ...schema,
        fields: removeFieldFromList(schema.fields, fieldKey),
      },
      selectedFieldKey: get().selectedFieldKey === fieldKey ? null : get().selectedFieldKey,
    }));
  },
  duplicateField: (fieldKey) => {
    commitSchemaChange(set, get, (schema) => {
      const field = findFieldByKey(schema.fields, fieldKey);

      if (!field) {
        return { schema, selectedFieldKey: get().selectedFieldKey };
      }

      const duplicated = withUniqueKeys(clone(field), schema);

      return {
        schema: {
          ...schema,
          fields: insertAfterField(schema.fields, fieldKey, duplicated),
        },
        selectedFieldKey: duplicated.key,
      };
    });
  },
  moveField: (fieldKey, direction) => {
    commitSchemaChange(set, get, (schema) => ({
      schema: {
        ...schema,
        fields: moveFieldInList(schema.fields, fieldKey, direction),
      },
      selectedFieldKey: get().selectedFieldKey,
    }));
  },
  reorderField: (fieldKey, overFieldKey) => {
    if (fieldKey === overFieldKey) {
      return;
    }

    commitSchemaChange(set, get, (schema) => ({
      schema: {
        ...schema,
        fields: reorderFieldInList(schema.fields, fieldKey, overFieldKey),
      },
      selectedFieldKey: get().selectedFieldKey,
    }));
  },
  setSchema: (schema) => {
    commitSchemaChange(set, get, () => ({
      schema: clone(schema),
      selectedFieldKey: firstEditableFieldKey(schema.fields),
    }));
  },
  loadOfficialTemplate: (templateKey) => {
    get().setSchema(officialTemplateSchema(templateKey));
  },
  undo: () => {
    const { past, schema, future } = get();

    if (past.length === 0) {
      return;
    }

    const previous = past[past.length - 1];

    set({
      schema: previous,
      selectedFieldKey: firstEditableFieldKey(previous.fields),
      past: past.slice(0, -1),
      future: [schema, ...future].slice(0, 20),
    });
  },
  redo: () => {
    const { past, schema, future } = get();

    if (future.length === 0) {
      return;
    }

    const next = future[0];

    set({
      schema: next,
      selectedFieldKey: firstEditableFieldKey(next.fields),
      past: [...past, schema].slice(-20),
      future: future.slice(1),
    });
  },
}));

const commitSchemaChange = (
  set: (partial: Partial<TemplateDesignerState>) => void,
  get: () => TemplateDesignerState,
  updater: (schema: LabelHubSchema) => {
    schema: LabelHubSchema;
    selectedFieldKey?: string | null;
  },
) => {
  const current = get();
  const next = updater(current.schema);

  set({
    schema: next.schema,
    selectedFieldKey: next.selectedFieldKey ?? current.selectedFieldKey,
    past: [...current.past, current.schema].slice(-20),
    future: [],
  });
};

const createDefaultField = (type: FieldType, schema: LabelHubSchema): SchemaField => {
  const material = DESIGNER_MATERIALS.find((item) => item.type === type);
  const key = uniqueFieldKey(type, schema);
  const base = {
    key,
    fieldKey: type === 'show_item' || type === 'group' || type === 'tabs' ? undefined : key,
    type,
    label: material?.label ?? type,
  } satisfies SchemaField;

  if (type === 'show_item') {
    return { ...base, sourceKey: 'prompt' };
  }

  if (type === 'radio' || type === 'checkbox') {
    return { ...base, options: [] };
  }

  if (type === 'tag_select') {
    return {
      ...base,
      options: [
        { label: '选项 A', value: 'option_a' },
        { label: '选项 B', value: 'option_b' },
      ],
    };
  }

  if (type === 'group') {
    return { ...base, fields: [] };
  }

  if (type === 'tabs') {
    return {
      ...base,
      tabs: [
        { key: 'tab_1', label: '基础信息', fields: [] },
        { key: 'tab_2', label: '标注', fields: [] },
      ],
    };
  }

  if (type === 'llm_assist') {
    return { ...base, targetFieldKey: firstEditableAnswerKey(schema.fields) ?? undefined };
  }

  if (type === 'file_upload') {
    return {
      ...base,
      fileConstraints: {
        maxFiles: 1,
        maxSizeMb: 20,
        acceptedMimeTypes: ['application/pdf', 'text/plain', 'image/*'],
      },
    };
  }

  if (type === 'image_upload') {
    return {
      ...base,
      fileConstraints: {
        maxFiles: 1,
        maxSizeMb: 10,
        acceptedMimeTypes: ['image/*'],
      },
    };
  }

  return base;
};

const officialTemplateSchema = (templateKey: OfficialTemplateKey): LabelHubSchema => {
  if (templateKey === 'qa_quality') {
    return clone(qaQualitySampleSchema);
  }

  if (templateKey === 'preference_compare') {
    return clone(preferenceCompareSampleSchema);
  }

  return clone(titleCleanupSampleSchema);
};

const findFieldByKey = (
  fields: readonly SchemaField[],
  fieldKey: string | null,
): SchemaField | null => {
  if (!fieldKey) {
    return null;
  }

  for (const field of fields) {
    if (field.key === fieldKey) {
      return field;
    }

    const nestedField = findFieldByKey(field.fields ?? [], fieldKey);

    if (nestedField) {
      return nestedField;
    }

    for (const tab of field.tabs ?? []) {
      const tabField = findFieldByKey(tab.fields, fieldKey);

      if (tabField) {
        return tabField;
      }
    }
  }

  return null;
};

export const selectDesignerField = (
  schema: LabelHubSchema,
  fieldKey: string | null,
): SchemaField | null => findFieldByKey(schema.fields, fieldKey);

const updateFieldInList = (
  fields: readonly SchemaField[],
  fieldKey: string,
  updater: (field: SchemaField) => SchemaField,
): SchemaField[] => {
  return fields.map((field) => {
    if (field.key === fieldKey) {
      return updater(field);
    }

    return {
      ...field,
      fields: field.fields ? updateFieldInList(field.fields, fieldKey, updater) : undefined,
      tabs: field.tabs?.map((tab) => ({
        ...tab,
        fields: updateFieldInList(tab.fields, fieldKey, updater),
      })),
    };
  });
};

const removeFieldFromList = (fields: readonly SchemaField[], fieldKey: string): SchemaField[] => {
  return fields
    .filter((field) => field.key !== fieldKey)
    .map((field) => ({
      ...field,
      fields: field.fields ? removeFieldFromList(field.fields, fieldKey) : undefined,
      tabs: field.tabs?.map((tab) => ({
        ...tab,
        fields: removeFieldFromList(tab.fields, fieldKey),
      })),
    }));
};

const insertAfterField = (
  fields: readonly SchemaField[],
  fieldKey: string,
  insertedField: SchemaField,
): SchemaField[] => {
  const next: SchemaField[] = [];

  for (const field of fields) {
    next.push({
      ...field,
      fields: field.fields ? insertAfterField(field.fields, fieldKey, insertedField) : undefined,
      tabs: field.tabs?.map((tab) => ({
        ...tab,
        fields: insertAfterField(tab.fields, fieldKey, insertedField),
      })),
    });

    if (field.key === fieldKey) {
      next.push(insertedField);
    }
  }

  return next;
};

const insertBeforeField = (
  fields: readonly SchemaField[],
  fieldKey: string,
  insertedField: SchemaField,
): SchemaField[] => {
  const targetIndex = fields.findIndex((field) => field.key === fieldKey);

  if (targetIndex >= 0) {
    return [
      ...fields.slice(0, targetIndex),
      insertedField,
      ...fields.slice(targetIndex),
    ];
  }

  return fields.map((field) => ({
    ...field,
    fields: field.fields ? insertBeforeField(field.fields, fieldKey, insertedField) : undefined,
    tabs: field.tabs?.map((tab) => ({
      ...tab,
      fields: insertBeforeField(tab.fields, fieldKey, insertedField),
    })),
  }));
};

const moveFieldInList = (
  fields: readonly SchemaField[],
  fieldKey: string,
  direction: 'up' | 'down',
): SchemaField[] => {
  const next = [...fields];
  const index = next.findIndex((field) => field.key === fieldKey);

  if (index >= 0) {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex >= 0 && targetIndex < next.length) {
      const [field] = next.splice(index, 1);
      next.splice(targetIndex, 0, field);
    }

    return next;
  }

  return fields.map((field) => ({
    ...field,
    fields: field.fields ? moveFieldInList(field.fields, fieldKey, direction) : undefined,
    tabs: field.tabs?.map((tab) => ({
      ...tab,
      fields: moveFieldInList(tab.fields, fieldKey, direction),
    })),
  }));
};

const reorderFieldInList = (
  fields: readonly SchemaField[],
  fieldKey: string,
  overFieldKey: string,
): SchemaField[] => {
  const currentIndex = fields.findIndex((field) => field.key === fieldKey);
  const targetIndex = fields.findIndex((field) => field.key === overFieldKey);

  if (currentIndex >= 0 && targetIndex >= 0) {
    return moveItem(fields, currentIndex, targetIndex);
  }

  return fields.map((field) => ({
    ...field,
    fields: field.fields ? reorderFieldInList(field.fields, fieldKey, overFieldKey) : undefined,
    tabs: field.tabs?.map((tab) => ({
      ...tab,
      fields: reorderFieldInList(tab.fields, fieldKey, overFieldKey),
    })),
  }));
};

const moveItem = <TItem>(items: readonly TItem[], currentIndex: number, targetIndex: number): TItem[] => {
  const next = [...items];
  const [item] = next.splice(currentIndex, 1);

  next.splice(targetIndex, 0, item);

  return next;
};

const firstEditableFieldKey = (fields: readonly SchemaField[]): string | null => {
  for (const field of fields) {
    if (field.type !== 'show_item' && field.type !== 'group' && field.type !== 'tabs') {
      return field.key;
    }

    const nestedFieldKey = firstEditableFieldKey(field.fields ?? []);

    if (nestedFieldKey) {
      return nestedFieldKey;
    }

    for (const tab of field.tabs ?? []) {
      const tabFieldKey = firstEditableFieldKey(tab.fields);

      if (tabFieldKey) {
        return tabFieldKey;
      }
    }
  }

  return null;
};

const firstEditableAnswerKey = (fields: readonly SchemaField[]): string | null => {
  const fieldKey = firstEditableFieldKey(fields);
  const field = findFieldByKey(fields, fieldKey);

  return field ? field.fieldKey ?? field.key : null;
};

const uniqueFieldKey = (type: FieldType, schema: LabelHubSchema): string => {
  const existingKeys = new Set(collectFieldKeys(schema.fields));
  const baseKey = type.replace(/_field$/, '');
  let index = existingKeys.size + 1;
  let key = `${baseKey}_${index}`;

  while (existingKeys.has(key)) {
    index += 1;
    key = `${baseKey}_${index}`;
  }

  return key;
};

const withUniqueKeys = (field: SchemaField, schema: LabelHubSchema): SchemaField => {
  const key = uniqueFieldKey(field.type, schema);
  const nextFieldKey = field.fieldKey ? key : undefined;

  return {
    ...field,
    key,
    fieldKey: nextFieldKey,
    label: `${field.label}副本`,
  };
};

const collectFieldKeys = (fields: readonly SchemaField[]): string[] => {
  return fields.flatMap((field) => [
    field.key,
    ...(field.fieldKey ? [field.fieldKey] : []),
    ...(field.fields ? collectFieldKeys(field.fields) : []),
    ...(field.tabs?.flatMap((tab) => collectFieldKeys(tab.fields)) ?? []),
  ]);
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const CUSTOM_VALIDATOR_OPTIONS: readonly CustomValidatorKey[] = CUSTOM_VALIDATOR_KEYS;

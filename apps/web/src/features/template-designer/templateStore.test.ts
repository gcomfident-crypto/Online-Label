import { describe, expect, it } from 'vitest';

import { useTemplateDesignerStore } from './templateStore';

describe('useTemplateDesignerStore', () => {
  it('添加字段、复制字段并支持撤销重做', () => {
    const store = useTemplateDesignerStore.getState();

    store.resetDesigner();
    store.addField('text');
    expect(useTemplateDesignerStore.getState().schema.fields).toHaveLength(1);
    expect(useTemplateDesignerStore.getState().schema.fields[0]).toMatchObject({
      type: 'text',
      label: '单行输入',
    });

    store.duplicateField(useTemplateDesignerStore.getState().schema.fields[0].key);
    expect(useTemplateDesignerStore.getState().schema.fields).toHaveLength(2);
    expect(useTemplateDesignerStore.getState().schema.fields[1].key).not.toBe(
      useTemplateDesignerStore.getState().schema.fields[0].key,
    );

    store.undo();
    expect(useTemplateDesignerStore.getState().schema.fields).toHaveLength(1);

    store.redo();
    expect(useTemplateDesignerStore.getState().schema.fields).toHaveLength(2);
  });

  it('支持按目标字段拖拽重排同级字段', () => {
    const store = useTemplateDesignerStore.getState();

    store.resetDesigner();
    store.addField('text');
    store.addField('textarea');

    const [textField, textareaField] = useTemplateDesignerStore.getState().schema.fields;

    store.reorderField(textField.key, textareaField.key);

    expect(useTemplateDesignerStore.getState().schema.fields.map((field) => field.key)).toEqual([
      textareaField.key,
      textField.key,
    ]);
  });

  it('载入商品标题清洗蓝本并更新 nested 字段校验', () => {
    const store = useTemplateDesignerStore.getState();

    store.resetDesigner();
    store.loadOfficialTemplate('title_cleanup');
    store.selectField('cleaned_title_field');
    store.updateSelectedField({
      validation: {
        required: true,
        maxLength: 42,
        pattern: '^[^#]+$',
        customValidatorKey: 'valid_json',
      },
    });

    const group = useTemplateDesignerStore.getState().schema.fields[0];
    const cleanedTitle = group.fields?.find((field) => field.key === 'cleaned_title_field');

    expect(useTemplateDesignerStore.getState().selectedFieldKey).toBe('cleaned_title_field');
    expect(cleanedTitle?.validation).toEqual({
      required: true,
      maxLength: 42,
      pattern: '^[^#]+$',
      customValidatorKey: 'valid_json',
    });
  });
});

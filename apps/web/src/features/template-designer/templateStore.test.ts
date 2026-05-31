import { describe, expect, it } from 'vitest';

import { resolveDesignerDropTarget, useTemplateDesignerStore } from './templateStore';

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

  it('支持把左侧物料插入到目标字段位置', () => {
    const store = useTemplateDesignerStore.getState();

    store.resetDesigner();
    store.addField('text');
    store.addField('textarea');

    const [textField, textareaField] = useTemplateDesignerStore.getState().schema.fields;

    store.addFieldBefore('checkbox', textareaField.key);

    expect(useTemplateDesignerStore.getState().schema.fields.map((field) => field.type)).toEqual([
      'text',
      'checkbox',
      'textarea',
    ]);
    expect(useTemplateDesignerStore.getState().selectedFieldKey).not.toBe(textField.key);
  });

  it('支持把物料新增到 group 和指定 tab 内', () => {
    const store = useTemplateDesignerStore.getState();

    store.resetDesigner();
    store.addField('group');
    store.addField('tabs');

    const [group, tabs] = useTemplateDesignerStore.getState().schema.fields;
    expect(group).toMatchObject({
      type: 'group',
      layout: 'single_column',
      defaultCollapsed: false,
    });
    expect(tabs).toMatchObject({
      type: 'tabs',
      layout: 'auto_rows',
    });

    store.addFieldAtTarget('text', { kind: 'group', groupKey: group.key });
    store.addFieldAtTarget('textarea', {
      kind: 'tab',
      tabsKey: tabs.key,
      tabKey: tabs.tabs?.[1].key ?? 'tab_2',
    });

    const nextSchema = useTemplateDesignerStore.getState().schema;
    expect(nextSchema.fields[0].fields?.map((field) => field.type)).toEqual(['text']);
    expect(nextSchema.fields[1].tabs?.[1].fields.map((field) => field.type)).toEqual(['textarea']);
  });

  it('支持已有字段在 root、group 和 tab 之间移动', () => {
    const store = useTemplateDesignerStore.getState();

    store.resetDesigner();
    store.addField('text');
    store.addField('group');
    store.addField('tabs');

    const [text, group, tabs] = useTemplateDesignerStore.getState().schema.fields;

    store.moveFieldToTarget(text.key, { kind: 'group', groupKey: group.key });
    expect(useTemplateDesignerStore.getState().schema.fields.map((field) => field.key)).toEqual([
      group.key,
      tabs.key,
    ]);
    expect(useTemplateDesignerStore.getState().schema.fields[0].fields?.[0].key).toBe(text.key);

    store.moveFieldToTarget(text.key, {
      kind: 'tab',
      tabsKey: tabs.key,
      tabKey: tabs.tabs?.[0].key ?? 'tab_1',
    });
    expect(useTemplateDesignerStore.getState().schema.fields[0].fields).toEqual([]);
    expect(useTemplateDesignerStore.getState().schema.fields[1].tabs?.[0].fields[0].key).toBe(text.key);

    store.moveFieldToTarget(text.key, { kind: 'root', beforeFieldKey: group.key });
    expect(useTemplateDesignerStore.getState().schema.fields.map((field) => field.key)).toEqual([
      text.key,
      group.key,
      tabs.key,
    ]);
  });

  it('支持同一 Tab 内字段从前往后拖动交换位置', () => {
    const store = useTemplateDesignerStore.getState();

    store.resetDesigner();
    store.addField('tabs');
    const tabs = useTemplateDesignerStore.getState().schema.fields[0];
    const tabKey = tabs.tabs?.[0].key ?? 'tab_1';

    store.addFieldAtTarget('text', { kind: 'tab', tabsKey: tabs.key, tabKey });
    store.addFieldAtTarget('textarea', { kind: 'tab', tabsKey: tabs.key, tabKey });
    store.addFieldAtTarget('radio', { kind: 'tab', tabsKey: tabs.key, tabKey });

    const fields = useTemplateDesignerStore.getState().schema.fields[0].tabs?.[0].fields ?? [];
    const [first, second, third] = fields;

    store.moveFieldToTarget(first.key, {
      kind: 'tab',
      tabsKey: tabs.key,
      tabKey,
      beforeFieldKey: second.key,
    });

    expect(useTemplateDesignerStore.getState().schema.fields[0].tabs?.[0].fields.map((field) => field.key)).toEqual([
      second.key,
      first.key,
      third.key,
    ]);

    store.moveFieldToTarget(first.key, {
      kind: 'tab',
      tabsKey: tabs.key,
      tabKey,
      beforeFieldKey: third.key,
    });

    expect(useTemplateDesignerStore.getState().schema.fields[0].tabs?.[0].fields.map((field) => field.key)).toEqual([
      second.key,
      third.key,
      first.key,
    ]);
  });

  it('能根据拖拽 overId 解析容器 drop target', () => {
    const store = useTemplateDesignerStore.getState();

    store.resetDesigner();
    store.addField('group');
    store.addField('tabs');
    const [group, tabs] = useTemplateDesignerStore.getState().schema.fields;

    store.addFieldAtTarget('text', { kind: 'group', groupKey: group.key });
    const child = useTemplateDesignerStore.getState().schema.fields[0].fields?.[0];

    expect(resolveDesignerDropTarget(useTemplateDesignerStore.getState().schema, child?.key)).toEqual({
      kind: 'group',
      groupKey: group.key,
      beforeFieldKey: child?.key,
    });
    expect(resolveDesignerDropTarget(useTemplateDesignerStore.getState().schema, tabs.key)).toEqual({
      kind: 'root',
      beforeFieldKey: tabs.key,
    });
  });

  it('新增上传物料时带有发布所需的文件限制', () => {
    const store = useTemplateDesignerStore.getState();

    store.resetDesigner();
    store.addField('image_upload');

    expect(useTemplateDesignerStore.getState().schema.fields[0]).toMatchObject({
      type: 'image_upload',
      fileConstraints: {
        maxFiles: 1,
        maxSizeMb: 10,
        acceptedMimeTypes: ['image/*'],
      },
    });
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

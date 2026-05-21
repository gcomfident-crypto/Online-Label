import { DndContext, type DragEndEvent } from '@dnd-kit/core';

import { useMemo, useState } from 'react';

import { SchemaRenderer } from '../../features/schema-renderer';
import { DesignerCanvas } from '../../features/template-designer/DesignerCanvas';
import { MaterialPanel } from '../../features/template-designer/MaterialPanel';
import { OfficialTemplateGallery } from '../../features/template-designer/OfficialTemplateGallery';
import { PropertyPanel } from '../../features/template-designer/PropertyPanel';
import {
  selectDesignerField,
  useTemplateDesignerStore,
  type MaterialSpec,
} from '../../features/template-designer/templateStore';

const TITLE_CLEANUP_RAW_DATA = {
  raw_title: '超柔软纯棉男士宽松家居服套装 春秋季睡衣大码情侣居家服',
  seller_category: '服饰鞋包 / 家居服',
  shop_name: '张满示例店',
};

export const TemplateDesignerPage = () => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const {
    schema,
    selectedFieldKey,
    addField,
    selectField,
    updateSelectedField,
    updateSelectedFieldValidation,
    addLinkageRuleToSelectedField,
    removeField,
    duplicateField,
    moveField,
    reorderField,
    loadOfficialTemplate,
    undo,
    redo,
    past,
    future,
  } = useTemplateDesignerStore();
  const selectedField = useMemo(
    () => selectDesignerField(schema, selectedFieldKey),
    [schema, selectedFieldKey],
  );
  const schemaJson = JSON.stringify(schema, null, 2);

  const handleDragEnd = (event: DragEndEvent) => {
    const type = event.active.data.current?.type as MaterialSpec['type'] | undefined;
    const fieldKey = event.active.data.current?.fieldKey;
    const overId = event.over?.id;

    if (
      event.active.data.current?.kind === 'field' &&
      typeof fieldKey === 'string' &&
      overId &&
      overId !== 'designer-canvas' &&
      String(overId) !== fieldKey
    ) {
      reorderField(fieldKey, String(overId));
      return;
    }

    if (event.over && type) {
      addField(type);
    }
  };

  return (
    <section className="template-designer-page" aria-labelledby="template-designer-title">
      <header className="template-designer-topbar">
        <div>
          <p className="eyebrow">任务负责人后台 / 模板搭建 / 商品清洗 · v3</p>
          <h1 id="template-designer-title">模板搭建器（Designer）</h1>
          <p>Schema 与 Renderer 解耦：左侧物料、中间画布、右侧属性 / 校验 / 联动配置。</p>
        </div>
        <div className="template-designer-topbar__actions">
          <button type="button" onClick={() => setPreviewOpen((current) => !current)}>
            预览
          </button>
          <button type="button">导出 Schema JSON</button>
          <button className="primary-action" type="button">
            保存并发布版本 r1
          </button>
        </div>
      </header>

      <OfficialTemplateGallery onUseTemplate={loadOfficialTemplate} />

      <DndContext onDragEnd={handleDragEnd}>
        <div className="template-designer-layout">
          <MaterialPanel onAddField={addField} />
          <DesignerCanvas
            schema={schema}
            selectedFieldKey={selectedFieldKey}
            onSelectField={selectField}
            onMoveField={moveField}
            onDuplicateField={duplicateField}
            onRemoveField={removeField}
          />
          <PropertyPanel
            field={selectedField}
            onUpdateField={updateSelectedField}
            onUpdateValidation={updateSelectedFieldValidation}
            onAddLinkageRule={addLinkageRuleToSelectedField}
          />
        </div>
      </DndContext>

      <section className="designer-json-panel" aria-label="Schema JSON">
        <div className="designer-history">
          <button type="button" disabled={past.length === 0} onClick={undo}>
            撤销
          </button>
          <button type="button" disabled={future.length === 0} onClick={redo}>
            重做
          </button>
        </div>
        <h2>Schema JSON</h2>
        <pre>{schemaJson}</pre>
      </section>

      {previewOpen ? (
        <section className="designer-preview" aria-label="Renderer 预览">
          <h2>Renderer 预览</h2>
          <SchemaRenderer
            schema={schema}
            rawData={TITLE_CLEANUP_RAW_DATA}
            value={{}}
            mode="answer"
            onChange={() => undefined}
          />
        </section>
      ) : null}
    </section>
  );
};

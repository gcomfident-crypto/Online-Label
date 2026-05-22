import { DndContext, type DragEndEvent } from '@dnd-kit/core';

import { useEffect, useMemo, useState } from 'react';

import {
  validateTemplateSchema,
  type LabelHubSchema,
  type TemplateCompatibilityReport,
} from '@labelhub/shared';

import {
  createTemplateDraft,
  publishTemplate,
  saveTemplateSchema,
  type TemplateDto,
} from '../../api/templates';
import { SchemaRenderer } from '../../features/schema-renderer';
import { DesignerCanvas } from '../../features/template-designer/DesignerCanvas';
import { MaterialPanel } from '../../features/template-designer/MaterialPanel';
import { OfficialTemplateGallery } from '../../features/template-designer/OfficialTemplateGallery';
import { PropertyPanel } from '../../features/template-designer/PropertyPanel';
import {
  selectDesignerField,
  useTemplateDesignerStore,
  type MaterialSpec,
  type OfficialTemplateKey,
} from '../../features/template-designer/templateStore';

const TITLE_CLEANUP_RAW_DATA = {
  raw_title: '超柔软纯棉男士宽松家居服套装 春秋季睡衣大码情侣居家服',
  seller_category: '服饰鞋包 / 家居服',
  shop_name: '张满示例店',
};

const DESIGNER_DRAFT_STORAGE_KEY = 'labelhub.templateDesignerDraft';

export const TemplateDesignerPage = () => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateVersion, setTemplateVersion] = useState(0);
  const [templateStatus, setTemplateStatus] = useState<TemplateDto['status']>('DRAFT');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [compatibilityReport, setCompatibilityReport] = useState<TemplateCompatibilityReport | null>(null);
  const [isSaving, setIsSaving] = useState(false);
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
    setSchema,
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
  const nextVersionName = `r${templateVersion + 1}`;

  useEffect(() => {
    const draft = readPersistedDesignerDraft();

    if (!draft) {
      return;
    }

    setSchema(draft.schema);
    setTemplateId(draft.templateId);
    setTemplateVersion(draft.version);
    setTemplateStatus(draft.status);
    setStatusMessage('已恢复最近保存的草稿。');
  }, [setSchema]);

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

  const handleUseTemplate = (templateKey: OfficialTemplateKey) => {
    loadOfficialTemplate(templateKey);
    setTemplateId(null);
    setTemplateVersion(0);
    setTemplateStatus('DRAFT');
    setCompatibilityReport(null);
    setErrorMessage(null);
    setStatusMessage('已载入模板蓝本，可继续编辑。');
  };

  const saveDraft = async (options?: { quiet?: boolean }): Promise<TemplateDto | null> => {
    const validation = validateTemplateSchema(schema);

    if (!validation.valid) {
      setErrorMessage(validation.errors.map((error) => error.message).join('；'));
      setStatusMessage(null);
      return null;
    }

    const draftSchema = templateStatus === 'PUBLISHED' ? { ...schema, schemaVersion: 'draft' } : schema;
    const savedTemplate =
      templateId && templateStatus !== 'PUBLISHED'
        ? await saveTemplateSchema(templateId, draftSchema)
        : await createTemplateDraft({
            name: templateNameFromSchema(draftSchema),
            schema: draftSchema,
          });

    setTemplateId(savedTemplate.id);
    setTemplateVersion(savedTemplate.version);
    setTemplateStatus(savedTemplate.status);
    persistDesignerDraft(savedTemplate);

    if (!options?.quiet) {
      setStatusMessage('草稿已保存。');
    }

    setErrorMessage(null);
    return savedTemplate;
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    setCompatibilityReport(null);

    try {
      await saveDraft();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '草稿保存失败，请稍后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    setIsSaving(true);
    setCompatibilityReport(null);

    try {
      const draft = await saveDraft({ quiet: true });

      if (!draft) {
        return;
      }

      const versionName = `r${draft.version + 1}`;
      const result = await publishTemplate(draft.id, versionName);

      setTemplateId(result.template.id);
      setTemplateVersion(result.template.version);
      setTemplateStatus(result.template.status);
      setSchema(result.template.schema);
      setCompatibilityReport(result.compatibilityReport);
      persistDesignerDraft(result.template);
      setStatusMessage(`模板已发布为 ${result.template.schemaVersion}。`);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '模板发布失败，请稍后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportSchema = () => {
    exportSchemaJson(schema);
    setStatusMessage('Schema JSON 已导出。');
    setErrorMessage(null);
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
          <button type="button" onClick={handleExportSchema}>
            导出 Schema JSON
          </button>
          <button type="button" disabled={isSaving} onClick={handleSaveDraft}>
            保存草稿
          </button>
          <button className="primary-action" type="button" disabled={isSaving} onClick={handlePublish}>
            保存并发布版本 {nextVersionName}
          </button>
        </div>
      </header>

      {statusMessage || errorMessage || compatibilityReport ? (
        <section className="designer-status-strip" aria-live="polite">
          {statusMessage ? <span>{statusMessage}</span> : null}
          {errorMessage ? <span role="alert">{errorMessage}</span> : null}
          {compatibilityReport && compatibilityReport.riskMessages.length > 0 ? (
            <ul>
              {compatibilityReport.riskMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <OfficialTemplateGallery onUseTemplate={handleUseTemplate} />

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

type PersistedDesignerDraft = {
  templateId: string | null;
  version: number;
  status: TemplateDto['status'];
  schema: LabelHubSchema;
};

const readPersistedDesignerDraft = (): PersistedDesignerDraft | null => {
  try {
    const rawValue = window.localStorage.getItem(DESIGNER_DRAFT_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<PersistedDesignerDraft>;

    if (!parsed.schema || !Array.isArray(parsed.schema.fields)) {
      return null;
    }

    return {
      templateId: typeof parsed.templateId === 'string' ? parsed.templateId : null,
      version: typeof parsed.version === 'number' ? parsed.version : 0,
      status: parsed.status ?? 'DRAFT',
      schema: parsed.schema,
    };
  } catch {
    return null;
  }
};

const persistDesignerDraft = (template: TemplateDto) => {
  window.localStorage.setItem(
    DESIGNER_DRAFT_STORAGE_KEY,
    JSON.stringify({
      templateId: template.id,
      version: template.version,
      status: template.status,
      schema: template.schema,
    }),
  );
};

const templateNameFromSchema = (schema: LabelHubSchema): string => {
  if (schema.datasetKind === 'qa_quality') {
    return '问答质量官方模板';
  }

  if (schema.datasetKind === 'preference_compare') {
    return '偏好对比官方模板';
  }

  return schema.fields[0]?.label ?? '自定义模板';
};

const exportSchemaJson = (schema: LabelHubSchema) => {
  const blob = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = `${templateNameFromSchema(schema)}.schema.json`;
  anchor.click();
  window.URL.revokeObjectURL(url);
};

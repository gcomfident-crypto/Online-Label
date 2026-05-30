import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import {
  validateTemplateSchema,
  type AutoTemplateFieldClassificationRequest,
  type AutoTemplateSourceField,
  type DatasetRecord,
  type LabelHubSchema,
} from '@labelhub/shared';

import { classifyTemplateFields } from '../../api/llm';
import type { TaskDto } from '../../api/tasks';
import type { TaskItemDto } from '../../api/datasets';
import {
  createTemplateDraft,
  deleteTemplate,
  listTemplates,
  publishTemplate,
  saveTemplateSchema,
  type TemplateDto,
} from '../../api/templates';
import { FilterSelect } from '../../components/FilterSelect';
import { TableEmptyState } from '../../components/TableEmptyState';
import {
  ToastViewport,
  createErrorToast,
  createInfoToast,
  createStatusToast,
  type ToastMessage,
} from '../../components/ToastViewport';
import { DesignerCanvas, DesignerFieldDragOverlay } from '../../features/template-designer/DesignerCanvas';
import { MaterialDragOverlay, MaterialPanel } from '../../features/template-designer/MaterialPanel';
import { PropertyPanel } from '../../features/template-designer/PropertyPanel';
import {
  DESIGNER_MATERIALS,
  selectDesignerField,
  useTemplateDesignerStore,
  type MaterialSpec,
} from '../../features/template-designer/templateStore';
import { useAdaptiveTablePageSize } from '../../hooks/useAdaptiveTablePageSize';
import { createAutoShowItemTemplateSchema } from './autoShowItemTemplate';
import { DatasetPreviewModal } from './components/DatasetPreviewModal';
import {
  consumeTemplateDraftHandoff,
  updateTaskTemplateReturnHandoff,
  type TemplateDraftHandoff,
} from './templateDraftHandoff';
import { formatTemplateDisplayId } from './templateDisplayId';

const DESIGNER_PREVIEW_RAW_DATA = {
  prompt: '用户询问如何判断一段回答是否准确、完整且没有安全风险。',
  model_answer: '可以从事实准确性、覆盖范围、表达清晰度和潜在风险四个维度判断。',
  reference: '评分时需要给出结论和一句话说明。',
  media_type: 'text',
  response_a: '回答 A：更完整地覆盖了事实、步骤和风险。',
  response_b: '回答 B：表达较短，但缺少风险说明。',
  model_a: 'model-a',
  model_b: 'model-b',
};

const DESIGNER_DRAFT_STORAGE_KEY = 'labelhub.templateDesignerDraft';
const FIELD_DROP_ANIMATION = {
  duration: 520,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
};
const TEMPLATE_DESIGNER_CLOSE_ANIMATION_MS = 240;
const TEMPLATE_FALLBACK_PAGE_SIZE = 8;
const TEMPLATE_TABLE_ROW_HEIGHT = 58;

type TemplateDatasetKey = TemplateDto['datasetKind'];
type TemplateDatasetFilter = TemplateDatasetKey | 'ALL';
type TemplateStatusFilter = TemplateDto['status'] | 'ALL' | 'custom';
type TemplateManagerRow = {
  createdAt: string;
  datasetFilterKey: TemplateDatasetKey;
  datasetKind: string;
  fieldCount: number;
  id: string;
  key: string;
  kind: 'custom';
  name: string;
  owner: string;
  rawId: string;
  searchValues: string[];
  status: string;
  statusClassName: string;
  statusFilterKey: TemplateStatusFilter;
  template?: TemplateDto;
  version: string;
};

const TEMPLATE_DATASET_FILTER_OPTIONS: Array<{ label: string; value: TemplateDatasetFilter }> = [
  { label: '全部数据类型', value: 'ALL' },
  { label: '问答质量', value: 'qa_quality' },
  { label: '偏好对比', value: 'preference_compare' },
  { label: '通用 JSON', value: 'generic_json' },
];

const TEMPLATE_STATUS_FILTER_OPTIONS: Array<{ label: string; value: TemplateStatusFilter }> = [
  { label: '全部状态', value: 'ALL' },
  { label: '自定义模板', value: 'custom' },
  { label: '已发布', value: 'PUBLISHED' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已归档', value: 'ARCHIVED' },
];

type TemplateDesignerPageProps = {
  onReturnTo?: (path: string) => void;
};

const resolveCanvasCardWidth = (): number | null => {
  const fieldCard = document.querySelector(
    '.designer-canvas > .designer-canvas__fields > .designer-field-card:not(.designer-field-card--drop-preview)',
  );
  const fieldCardWidth = fieldCard?.getBoundingClientRect().width ?? 0;

  if (fieldCardWidth > 0) {
    return Math.round(fieldCardWidth);
  }

  const canvas = document.querySelector('.designer-canvas');
  const canvasWidth = canvas?.getBoundingClientRect().width ?? 0;

  return canvasWidth > 48 ? Math.round(canvasWidth - 32) : null;
};

const pointIsInsideDesignerCanvas = (point: { x: number; y: number }): boolean => {
  const canvas = document.querySelector('.designer-canvas');
  const rect = canvas?.getBoundingClientRect();

  if (!rect) {
    return false;
  }

  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
};

const pointerCoordinatesFromActivator = (event: Event): { x: number; y: number } | null => {
  if ('clientX' in event && 'clientY' in event) {
    return {
      x: Number(event.clientX),
      y: Number(event.clientY),
    };
  }

  return null;
};

const createAutoClassificationSchemaRecords = (
  request: AutoTemplateFieldClassificationRequest,
  previewRecords: readonly DatasetRecord[],
): DatasetRecord[] => {
  const sourceKeyRecord = Object.fromEntries(
    request.fields.map((field) => [
      field.sourceKey,
      resolveAutoClassificationSampleValue(field, previewRecords),
    ]),
  );

  return [sourceKeyRecord, ...previewRecords].filter((record) => Object.keys(record).length > 0);
};

const resolveAutoClassificationSampleValue = (
  field: AutoTemplateSourceField,
  previewRecords: readonly DatasetRecord[],
): unknown => {
  for (const record of previewRecords) {
    if (Object.prototype.hasOwnProperty.call(record, field.sourceKey)) {
      return record[field.sourceKey];
    }
  }

  return field.samples[0] ?? '';
};

const updateTaskReturnHandoffTemplate = (template: TemplateDto): boolean => {
  const taskTemplate = toTaskTemplateSummary(template);

  return updateTaskTemplateReturnHandoff((handoff) => ({
    ...handoff,
    form: {
      ...handoff.form,
      templateId: taskTemplate.id,
    },
    selectedTask: {
      ...handoff.selectedTask,
      templateId: taskTemplate.id,
      template: taskTemplate,
    },
    templateOptions: [
      taskTemplate,
      ...handoff.templateOptions.filter((currentTemplate) => currentTemplate.id !== taskTemplate.id),
    ],
    isTaskFormDirty: true,
  }));
};

const toTaskTemplateSummary = (template: TemplateDto): TaskDto['template'] => ({
  id: template.id,
  name: template.name,
  datasetKind: template.datasetKind,
  schemaVersion: template.schemaVersion,
  status: template.status,
});

const createDesignerPreviewItems = (
  records: readonly DatasetRecord[],
  datasetKind: LabelHubSchema['datasetKind'],
): TaskItemDto[] =>
  records.map((record, index) => ({
    id: `uploaded_preview_${index + 1}`,
    taskId: 'template-designer-preview',
    externalId: `preview_${index + 1}`,
    datasetKind,
    rawData: record,
    status: 'UNASSIGNED',
    sortOrder: index + 1,
    createdAt: '',
    updatedAt: '',
  }));

export const TemplateDesignerPage = ({ onReturnTo }: TemplateDesignerPageProps = {}) => {
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [templateSearchKeyword, setTemplateSearchKeyword] = useState('');
  const [templateDatasetFilter, setTemplateDatasetFilter] = useState<TemplateDatasetFilter>('ALL');
  const [templateStatusFilter, setTemplateStatusFilter] = useState<TemplateStatusFilter>('ALL');
  const [currentTemplatePage, setCurrentTemplatePage] = useState(1);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [persistedDraft, setPersistedDraft] = useState<PersistedDesignerDraft | null>(null);
  const [isDesignerOpen, setIsDesignerOpen] = useState(false);
  const [isDesignerClosing, setIsDesignerClosing] = useState(false);
  const [draggingFieldKey, setDraggingFieldKey] = useState<string | null>(null);
  const [draggingMaterialType, setDraggingMaterialType] = useState<MaterialSpec['type'] | null>(null);
  const [isDraggingMaterialOverCanvas, setIsDraggingMaterialOverCanvas] = useState(false);
  const [materialDropTargetId, setMaterialDropTargetId] = useState<string | null>(null);
  const [materialOverlayWidth, setMaterialOverlayWidth] = useState<number | null>(null);
  const [committedDropFieldKey, setCommittedDropFieldKey] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateDraftName, setTemplateDraftName] = useState<string | null>(null);
  const { containerRef: templateTableContainerRef, pageSize: templatePageSize } = useAdaptiveTablePageSize({
    fallbackPageSize: TEMPLATE_FALLBACK_PAGE_SIZE,
    rowHeight: TEMPLATE_TABLE_ROW_HEIGHT,
  });
  const [templateVersion, setTemplateVersion] = useState(0);
  const [templateStatus, setTemplateStatus] = useState<TemplateDto['status']>('DRAFT');
  const [templateDraftReturnTo, setTemplateDraftReturnTo] = useState<string | null>(null);
  const [designerPreviewRawData, setDesignerPreviewRawData] = useState<Record<string, unknown>>(
    DESIGNER_PREVIEW_RAW_DATA,
  );
  const [designerPreviewRecords, setDesignerPreviewRecords] = useState<DatasetRecord[]>([]);
  const [isDesignerPreviewOpen, setIsDesignerPreviewOpen] = useState(false);
  const [toastMessages, setToastMessages] = useState<ToastMessage[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const dragStartPointerRef = useRef<{ x: number; y: number } | null>(null);
  const commitAnimationTimerRef = useRef<number | null>(null);
  const designerCloseTimerRef = useRef<number | null>(null);
  const didConsumeTemplateDraftHandoffRef = useRef(false);
  const autoClassificationRunRef = useRef(0);
  const toastSequenceRef = useRef(0);
  const isMountedRef = useRef(true);
  const {
    schema,
    selectedFieldKey,
    addField,
    addFieldBefore,
    selectField,
    updateSelectedField,
    updateSelectedFieldValidation,
    addLinkageRuleToSelectedField,
    removeField,
    duplicateField,
    reorderField,
    setSchema,
    resetDesigner,
  } = useTemplateDesignerStore();
  const selectedField = useMemo(
    () => selectDesignerField(schema, selectedFieldKey),
    [schema, selectedFieldKey],
  );
  const draggingField = useMemo(
    () => selectDesignerField(schema, draggingFieldKey),
    [schema, draggingFieldKey],
  );
  const draggingMaterial = useMemo(
    () => DESIGNER_MATERIALS.find((material) => material.type === draggingMaterialType) ?? null,
    [draggingMaterialType],
  );
  const dragOverlayPortalTarget = typeof document === 'undefined' ? null : document.body;
  const currentTemplateName = templateDraftName ?? templateNameFromSchema(schema);
  const nextVersionName = `r${templateVersion + 1}`;
  const allTemplateRows = useMemo<TemplateManagerRow[]>(
    () =>
      templates.map((template, index) => {
        const displayId = formatTemplateDisplayId(index + 1);
        const status = templateStatusLabel(template.status);
        const owner = mockTemplateOwnerName(template.createdById);
        const datasetKind = datasetKindLabel(template.datasetKind);

        return {
          createdAt: template.createdAt,
          datasetFilterKey: template.datasetKind,
          datasetKind,
          fieldCount: template.schema.fields.length,
          id: displayId,
          key: template.id,
          kind: 'custom' as const,
          name: template.name,
          owner,
          rawId: template.id,
          searchValues: [
            template.name,
            template.id,
            displayId,
            owner,
            template.createdById ?? '',
            datasetKind,
            template.datasetKind,
            template.schemaVersion,
            status,
          ],
          status,
          statusClassName: `template-manager-card__status template-manager-card__status--${template.status.toLowerCase()}`,
          statusFilterKey: template.status,
          template,
          version: template.version > 0 ? `v${template.version}` : 'v0',
        };
      }),
    [templates],
  );
  const templateRows = useMemo(() => {
    const keyword = templateSearchKeyword.trim().toLowerCase();

    return allTemplateRows.filter((template) => {
      const matchesKeyword =
        !keyword || template.searchValues.some((value) => value.toLowerCase().includes(keyword));
      const matchesDataset =
        templateDatasetFilter === 'ALL' || template.datasetFilterKey === templateDatasetFilter;
      const matchesStatus =
        templateStatusFilter === 'ALL' ||
        template.statusFilterKey === templateStatusFilter ||
        (templateStatusFilter === 'custom' && template.kind === 'custom');

      return matchesKeyword && matchesDataset && matchesStatus;
    });
  }, [allTemplateRows, templateDatasetFilter, templateSearchKeyword, templateStatusFilter]);
  const templateStats = useMemo(
    () => ({
      total: allTemplateRows.length,
    }),
    [allTemplateRows],
  );
  const totalTemplatePages = Math.max(1, Math.ceil(templateRows.length / templatePageSize));
  const paginatedTemplateRows = useMemo(() => {
    const startIndex = (currentTemplatePage - 1) * templatePageSize;

    return templateRows.slice(startIndex, startIndex + templatePageSize);
  }, [currentTemplatePage, templatePageSize, templateRows]);

  useEffect(() => {
    let isMounted = true;

    setPersistedDraft(readPersistedDesignerDraft());
    setIsLoadingTemplates(true);

    void listTemplates()
      .then((nextTemplates) => {
        if (!isMounted) {
          return;
        }

        setTemplates(nextTemplates);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setTemplates([]);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingTemplates(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setCurrentTemplatePage(1);
  }, [templateDatasetFilter, templateSearchKeyword, templateStatusFilter]);

  useEffect(() => {
    setCurrentTemplatePage((current) => Math.min(current, totalTemplatePages));
  }, [totalTemplatePages]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      if (commitAnimationTimerRef.current) {
        window.clearTimeout(commitAnimationTimerRef.current);
      }

      if (designerCloseTimerRef.current) {
        window.clearTimeout(designerCloseTimerRef.current);
      }

      isMountedRef.current = false;
    };
  }, []);

  const markCommittedDropField = (fieldKey: string | null | undefined) => {
    if (!fieldKey) {
      return;
    }

    if (commitAnimationTimerRef.current) {
      window.clearTimeout(commitAnimationTimerRef.current);
    }

    setCommittedDropFieldKey(fieldKey);
    commitAnimationTimerRef.current = window.setTimeout(() => {
      setCommittedDropFieldKey(null);
      commitAnimationTimerRef.current = null;
    }, 620);
  };

  const resetDragState = () => {
    setDraggingFieldKey(null);
    setDraggingMaterialType(null);
    setIsDraggingMaterialOverCanvas(false);
    setMaterialDropTargetId(null);
    setMaterialOverlayWidth(null);
    dragStartPointerRef.current = null;
  };

  const showToast = (message: ToastMessage) => {
    toastSequenceRef.current += 1;
    setToastMessages((current) => [
      ...current,
      {
        ...message,
        id: `${message.id}-${toastSequenceRef.current}`,
      },
    ].slice(-4));
  };

  const showStatusToast = (message: string) => {
    showToast(createStatusToast(message));
  };

  const showInfoToast = (message: string) => {
    showToast(createInfoToast(message));
  };

  const showErrorToast = (message: string) => {
    showToast(createErrorToast(message));
  };

  const dismissToast = (id: string) => {
    setToastMessages((current) => current.filter((message) => message.id !== id));
  };

  const resolveMaterialDropProjection = (event: DragMoveEvent | DragOverEvent | DragEndEvent) => {
    const type = event.active.data.current?.type as MaterialSpec['type'] | undefined;
    const startPointer = dragStartPointerRef.current;

    if (!type || !startPointer) {
      return null;
    }

    const currentPointer = {
      x: startPointer.x + event.delta.x,
      y: startPointer.y + event.delta.y,
    };

    if (!pointIsInsideDesignerCanvas(currentPointer)) {
      return {
        insideCanvas: false,
        targetId: null,
        width: null,
      };
    }

    const overId = event.over?.id ? String(event.over.id) : null;

    return {
      insideCanvas: true,
      targetId: overId === 'designer-canvas' ? null : overId,
      width: resolveCanvasCardWidth(),
    };
  };

  const updateMaterialDropProjection = (event: DragMoveEvent | DragOverEvent) => {
    const projection = resolveMaterialDropProjection(event);

    if (!projection?.insideCanvas) {
      setIsDraggingMaterialOverCanvas(false);
      setMaterialDropTargetId(null);
      setMaterialOverlayWidth(null);
      return;
    }

    setIsDraggingMaterialOverCanvas(true);
    setMaterialDropTargetId(projection.targetId);
    setMaterialOverlayWidth(projection.width);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const fieldKey = event.active.data.current?.fieldKey;
    const type = event.active.data.current?.type as MaterialSpec['type'] | undefined;

    setDraggingFieldKey(typeof fieldKey === 'string' ? fieldKey : null);
    setDraggingMaterialType(type ?? null);
    setIsDraggingMaterialOverCanvas(false);
    setMaterialDropTargetId(null);
    setMaterialOverlayWidth(null);
    dragStartPointerRef.current = pointerCoordinatesFromActivator(event.activatorEvent);
  };

  const handleDragMove = (event: DragMoveEvent) => {
    updateMaterialDropProjection(event);
  };

  const handleDragOver = (event: DragOverEvent) => {
    updateMaterialDropProjection(event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const type = event.active.data.current?.type as MaterialSpec['type'] | undefined;
    const fieldKey = event.active.data.current?.fieldKey;
    const overId = event.over?.id;
    const materialProjection = resolveMaterialDropProjection(event);

    resetDragState();

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

    if (type && materialProjection?.insideCanvas && materialProjection.targetId) {
      addFieldBefore(type, materialProjection.targetId);
      markCommittedDropField(useTemplateDesignerStore.getState().selectedFieldKey);
      return;
    }

    if (type && materialProjection?.insideCanvas) {
      addField(type);
      markCommittedDropField(useTemplateDesignerStore.getState().selectedFieldKey);
    }
  };

  const openNewTemplate = () => {
    autoClassificationRunRef.current += 1;
    clearDesignerCloseTimer();
    resetDesigner();
    setTemplateId(null);
    setTemplateDraftName(null);
    setTemplateVersion(0);
    setTemplateStatus('DRAFT');
    setTemplateDraftReturnTo(null);
    setDesignerPreviewRawData(DESIGNER_PREVIEW_RAW_DATA);
    setDesignerPreviewRecords([]);
    setIsDesignerPreviewOpen(false);
    setIsDesignerClosing(false);
    setIsDesignerOpen(true);
  };

  const openExistingTemplate = (template: TemplateDto) => {
    autoClassificationRunRef.current += 1;
    clearDesignerCloseTimer();
    setSchema(template.schema);
    setTemplateId(template.id);
    setTemplateDraftName(template.name);
    setTemplateVersion(template.version);
    setTemplateStatus(template.status);
    setTemplateDraftReturnTo(null);
    setDesignerPreviewRawData(DESIGNER_PREVIEW_RAW_DATA);
    setDesignerPreviewRecords([]);
    setIsDesignerPreviewOpen(false);
    setIsDesignerClosing(false);
    setIsDesignerOpen(true);
  };

  const openPersistedDraft = (draft: PersistedDesignerDraft) => {
    autoClassificationRunRef.current += 1;
    clearDesignerCloseTimer();
    setSchema(draft.schema);
    setTemplateId(draft.templateId);
    setTemplateDraftName(draft.name ?? templateNameFromSchema(draft.schema));
    setTemplateVersion(draft.version);
    setTemplateStatus(draft.status);
    setTemplateDraftReturnTo(null);
    setDesignerPreviewRawData(DESIGNER_PREVIEW_RAW_DATA);
    setDesignerPreviewRecords([]);
    setIsDesignerPreviewOpen(false);
    showStatusToast('已恢复最近保存的草稿。');
    setIsDesignerClosing(false);
    setIsDesignerOpen(true);
  };

  const openTemplateDraftHandoff = (draft: TemplateDraftHandoff) => {
    if (draft.autoClassificationRequest) {
      openPendingTemplateDraftHandoff(draft as TemplateDraftHandoff & {
        autoClassificationRequest: AutoTemplateFieldClassificationRequest;
      });
      return;
    }

    applyTemplateDraftHandoff(draft);
  };

  const openPendingTemplateDraftHandoff = (draft: TemplateDraftHandoff & {
    autoClassificationRequest: AutoTemplateFieldClassificationRequest;
  }) => {
    clearDesignerCloseTimer();
    const runId = autoClassificationRunRef.current + 1;
    autoClassificationRunRef.current = runId;
    setIsDesignerOpen(false);
    setIsDesignerClosing(false);
    showToast({ ...createInfoToast('正在分析输入文件并创建模板'), className: 'toast--brand-blue' });

    void classifyTemplateFields(draft.autoClassificationRequest)
      .then((classification) => {
        if (!isMountedRef.current || autoClassificationRunRef.current !== runId) {
          return;
        }

        const schemaRecords = createAutoClassificationSchemaRecords(
          draft.autoClassificationRequest,
          draft.previewRecords ?? [],
        );
        const schema = createAutoShowItemTemplateSchema(
          schemaRecords,
          draft.sourceFileName ?? draft.autoClassificationRequest.fileName,
          classification,
          draft.autoClassificationRequest.fieldStats,
        );

        applyTemplateDraftHandoff({
          ...draft,
          schema,
          autoClassificationRequest: undefined,
        });
      })
      .catch((error) => {
        if (!isMountedRef.current || autoClassificationRunRef.current !== runId) {
          return;
        }

        setIsDesignerOpen(false);
        setIsDesignerClosing(false);
        showErrorToast(error instanceof Error ? error.message : '字段分类接口请求失败，请稍后重试。');
      });
  };

  const applyTemplateDraftHandoff = (draft: TemplateDraftHandoff) => {
    clearDesignerCloseTimer();
    setSchema(draft.schema);
    selectField(draft.schema.fields[0]?.key ?? null);
    setTemplateId(null);
    setTemplateDraftName(draft.name);
    setTemplateVersion(0);
    setTemplateStatus('DRAFT');
    setTemplateDraftReturnTo(draft.returnTo ?? null);
    setDesignerPreviewRawData(draft.previewRecords?.[0] ?? DESIGNER_PREVIEW_RAW_DATA);
    setDesignerPreviewRecords([...(draft.previewRecords ?? [])]);
    setIsDesignerPreviewOpen(false);
    setIsDesignerClosing(false);
    setIsDesignerOpen(true);
  };

  useEffect(() => {
    if (didConsumeTemplateDraftHandoffRef.current) {
      return;
    }

    didConsumeTemplateDraftHandoffRef.current = true;
    const draft = consumeTemplateDraftHandoff();

    if (!draft) {
      return;
    }

    openTemplateDraftHandoff(draft);
  }, []);

  const clearDesignerCloseTimer = () => {
    if (!designerCloseTimerRef.current) {
      return;
    }

    window.clearTimeout(designerCloseTimerRef.current);
    designerCloseTimerRef.current = null;
  };

  const resetDesignerDrawerState = () => {
    resetDragState();
    setIsDesignerOpen(false);
    setIsDesignerClosing(false);
    setTemplateDraftReturnTo(null);
  };

  const closeDesignerWithAnimation = () => {
    if (isDesignerClosing) {
      return;
    }

    resetDragState();
    clearDesignerCloseTimer();
    const returnTo = templateDraftReturnTo;
    setIsDesignerClosing(true);
    designerCloseTimerRef.current = window.setTimeout(() => {
      designerCloseTimerRef.current = null;
      resetDesignerDrawerState();
      if (returnTo) {
        onReturnTo?.(returnTo);
      }
    }, TEMPLATE_DESIGNER_CLOSE_ANIMATION_MS);
  };

  const upsertTemplateInList = (template: TemplateDto) => {
    setTemplates((current) => [
      template,
      ...current.filter((currentTemplate) => currentTemplate.id !== template.id),
    ]);
  };

  const handleCopyTemplateRow = async (template: TemplateManagerRow) => {
    try {
      const copiedTemplate = await createTemplateDraft({
        name: `${template.name} 副本`,
        description: template.template?.description ?? undefined,
        schema: cloneTemplateSchemaForDraft(resolveTemplateSchema(template)),
      });

      upsertTemplateInList(copiedTemplate);
      showStatusToast('模板已复制为草稿。');
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '模板复制失败，请稍后重试。');
    }
  };

  const handleDeleteTemplateRow = async (template: TemplateManagerRow) => {
    if (template.kind !== 'custom' || !template.template) {
      return;
    }

    try {
      const deletedTemplateId = template.template.id;

      await deleteTemplate(deletedTemplateId);
      setTemplates((current) => current.filter((currentTemplate) => currentTemplate.id !== deletedTemplateId));
      showInfoToast('模板已删除。');
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '模板删除失败，请稍后重试。');
    }
  };

  const openTemplateRow = (template: TemplateManagerRow) => {
    openExistingTemplate(template.template!);
  };

  const handleTemplateRowClick = (template: TemplateManagerRow) => {
    if (window.getSelection()?.toString().trim()) {
      return;
    }

    openTemplateRow(template);
  };

  const handleTemplateRowKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    template: TemplateManagerRow,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    openTemplateRow(template);
  };

  const saveDraft = async (options?: { quiet?: boolean }): Promise<TemplateDto | null> => {
    const validation = validateTemplateSchema(schema);

    if (!validation.valid) {
      showErrorToast(validation.errors.map((error) => error.message).join('；'));
      return null;
    }

    const draftSchema = templateStatus === 'PUBLISHED' ? { ...schema, schemaVersion: 'draft' } : schema;
    const draftName = resolveTemplateName(templateDraftName, draftSchema);
    const savedTemplate =
      templateId && templateStatus !== 'PUBLISHED'
        ? await saveTemplateSchema(templateId, draftSchema, { name: draftName })
        : await createTemplateDraft({
            name: draftName,
            schema: draftSchema,
          });

    setTemplateId(savedTemplate.id);
    setTemplateDraftName(savedTemplate.name);
    setTemplateVersion(savedTemplate.version);
    setTemplateStatus(savedTemplate.status);
    persistDesignerDraft(savedTemplate);
    setPersistedDraft(toPersistedDesignerDraft(savedTemplate));
    upsertTemplateInList(savedTemplate);

    if (!options?.quiet) {
      showStatusToast('草稿已保存。');
    }

    return savedTemplate;
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);

    try {
      const savedDraft = await saveDraft();

      if (savedDraft) {
        closeDesignerWithAnimation();
      }
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '草稿保存失败，请稍后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    setIsSaving(true);

    try {
      const draft = await saveDraft({ quiet: true });

      if (!draft) {
        return;
      }

      const versionName = `r${draft.version + 1}`;
      const result = await publishTemplate(draft.id, versionName);

      setTemplateId(result.template.id);
      setTemplateDraftName(result.template.name);
      setTemplateVersion(result.template.version);
      setTemplateStatus(result.template.status);
      setSchema(result.template.schema);
      persistDesignerDraft(result.template);
      setPersistedDraft(toPersistedDesignerDraft(result.template));
      upsertTemplateInList(result.template);

      if (templateDraftReturnTo) {
        const didUpdateReturnHandoff = updateTaskReturnHandoffTemplate(result.template);

        if (didUpdateReturnHandoff) {
          onReturnTo?.(templateDraftReturnTo);
          return;
        }

        showErrorToast('任务抽屉状态恢复失败，请回到任务管理页后重新选择模板。');
        return;
      }

      const publishedVersionLabel =
        result.template.version > 0 ? `v${result.template.version}` : result.template.schemaVersion;
      showStatusToast(`"${result.template.name}" 模版已发布为${publishedVersionLabel}`);
      if (result.compatibilityReport.riskMessages.length > 0) {
        showInfoToast(result.compatibilityReport.riskMessages.join('；'));
      }
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '模板发布失败，请稍后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="template-manager-page" aria-label="评测模板">
      <ToastViewport variant="banner" messages={toastMessages} onDismiss={dismissToast} />

      <div className="task-filter-bar template-manager-filter-bar" aria-label="模板筛选栏">
        <input
          aria-label="搜索模板"
          placeholder="搜索模板名称 / ID / 负责人"
          value={templateSearchKeyword}
          onChange={(event) => setTemplateSearchKeyword(event.target.value)}
        />
        <FilterSelect
          ariaLabel="数据类型筛选"
          options={TEMPLATE_DATASET_FILTER_OPTIONS}
          value={templateDatasetFilter}
          onChange={setTemplateDatasetFilter}
        />
        <FilterSelect
          ariaLabel="状态筛选"
          options={TEMPLATE_STATUS_FILTER_OPTIONS}
          value={templateStatusFilter}
          onChange={setTemplateStatusFilter}
        />
      </div>

      <section
        className="task-table-panel export-task-table-panel template-manager-list template-manager-table-panel"
        aria-label="已有模板列表"
        ref={templateTableContainerRef}
      >
        <div className="labeler-list-panel-heading export-table-heading template-manager-list-heading" aria-label="模板列表概览">
          <dl className="task-market-heading-stats export-table-heading__total" aria-label="模板总数">
            <div>
              <dt>模板总数</dt>
              <dd>{templateStats.total.toLocaleString()}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="primary-action template-manager-list-heading__create"
            onClick={openNewTemplate}
          >
            新增模板
          </button>
        </div>
        <div className="task-table-scroll template-manager-table-scroll" data-adaptive-table-viewport="true">
          <table className="task-table template-manager-table" aria-label="模板列表">
            <colgroup>
              <col className="template-manager-table__col-id" />
              <col className="template-manager-table__col-name" />
              <col className="template-manager-table__col-status" />
              <col className="template-manager-table__col-owner" />
              <col className="template-manager-table__col-created" />
              <col className="template-manager-table__col-dataset" />
              <col className="template-manager-table__col-version" />
              <col className="template-manager-table__col-fields" />
              <col className="template-manager-table__col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>模板ID</th>
                <th>模板名称</th>
                <th>状态</th>
                <th>负责人</th>
                <th>创建时间</th>
                <th>数据类型</th>
                <th>版本</th>
                <th>字段数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTemplateRows.map((template) => (
                <tr
                  key={template.key}
                  className="task-table__row"
                  role="button"
                  tabIndex={0}
                  aria-label={`打开模板 ${template.name}`}
                  onClick={() => handleTemplateRowClick(template)}
                  onKeyDown={(event) => handleTemplateRowKeyDown(event, template)}
                >
                  <td className="task-table__id">
                    <code title={`原始ID：${template.rawId}`}>{template.id}</code>
                  </td>
                  <td>
                    <span className="template-manager-table__name">
                      {template.name}
                    </span>
                  </td>
                  <td>
                    <span className={template.statusClassName}>{template.status}</span>
                  </td>
                  <td>{template.owner}</td>
                  <td>{formatDateTimeMinute(template.createdAt)}</td>
                  <td>{template.datasetKind}</td>
                  <td>{template.version}</td>
                  <td>{template.fieldCount ?? '—'}</td>
                  <td>
                    <div className="template-manager-table__actions">
                      <button
                        className="template-manager-row-action"
                        type="button"
                        aria-label={`复制 ${template.name}`}
                        title="复制"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleCopyTemplateRow(template);
                        }}
                      >
                        <TemplateCopyIcon />
                      </button>
                      <button
                        className="template-manager-row-action template-manager-row-action--delete"
                        type="button"
                        aria-label={`删除 ${template.name}`}
                        title="删除"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeleteTemplateRow(template);
                        }}
                      >
                        <TemplateDeleteIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {isLoadingTemplates ? (
                <tr>
                  <td colSpan={9}>
                    <p className="template-manager-list-message">模板列表加载中...</p>
                  </td>
                </tr>
              ) : null}
              {!isLoadingTemplates && templateRows.length === 0 ? (
                <tr className="task-table__empty-row">
                  <td colSpan={9}>
                    <TableEmptyState title="暂无模板" illustrationAlt="空模板列表插画" />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="task-table-pagination" aria-label="模板列表分页">
          <button
            type="button"
            disabled={currentTemplatePage <= 1}
            onClick={() => setCurrentTemplatePage((current) => current - 1)}
          >
            上一页
          </button>
          <span aria-label="当前页码">
            第 {currentTemplatePage} / {totalTemplatePages} 页
          </span>
          <button
            type="button"
            disabled={currentTemplatePage >= totalTemplatePages}
            onClick={() => setCurrentTemplatePage((current) => current + 1)}
          >
            下一页
          </button>
        </div>
      </section>

      {isDesignerOpen
        ? createPortal(
        <div
          className={
            isDesignerClosing
              ? 'template-designer-drawer-shell is-closing'
              : 'template-designer-drawer-shell'
          }
          data-testid="template-designer-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeDesignerWithAnimation();
            }
          }}
        >
          <section
            className="template-designer-page template-designer-page--drawer"
            role="dialog"
            aria-label="模板配置"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="template-designer-topbar">
              <div>
                <h1 id="template-designer-title">模板配置</h1>
              </div>
              <div className="template-designer-topbar__actions">
                <button type="button" disabled={isSaving} onClick={handleSaveDraft}>
                  保存草稿
                </button>
                <button className="primary-action" type="button" disabled={isSaving} onClick={handlePublish}>
                  保存并发布版本 {nextVersionName}
                </button>
              </div>
            </header>

            <DndContext
              onDragCancel={resetDragState}
              onDragEnd={handleDragEnd}
              onDragMove={handleDragMove}
              onDragOver={handleDragOver}
              onDragStart={handleDragStart}
            >
              <div className="template-designer-layout">
                <MaterialPanel />
                <DesignerCanvas
                  schema={schema}
                  templateName={currentTemplateName}
                  previewRawData={designerPreviewRawData}
                  selectedFieldKey={selectedFieldKey}
                  committingFieldKey={committedDropFieldKey}
                  isDropHighlighted={isDraggingMaterialOverCanvas}
                  materialDropPreview={
                    draggingMaterial && isDraggingMaterialOverCanvas
                      ? { targetFieldKey: materialDropTargetId, type: draggingMaterial.type }
                      : null
                  }
                  onTemplateNameChange={setTemplateDraftName}
                  onPreviewUploadedFile={() => setIsDesignerPreviewOpen(true)}
                  onSelectField={selectField}
                  onDuplicateField={duplicateField}
                  onRemoveField={removeField}
                  previewRecordCount={designerPreviewRecords.length}
                />
                <aside className="designer-inspector" aria-label="右侧配置面板">
                  <PropertyPanel
                    field={selectedField}
                    onUpdateField={updateSelectedField}
                    onUpdateValidation={updateSelectedFieldValidation}
                    onAddLinkageRule={addLinkageRuleToSelectedField}
                  />
                </aside>
              </div>
              {dragOverlayPortalTarget
                ? createPortal(
                  <DragOverlay dropAnimation={draggingField ? FIELD_DROP_ANIMATION : null}>
                    {draggingField ? <DesignerFieldDragOverlay field={draggingField} /> : null}
                    {!draggingField && draggingMaterial ? (
                      <MaterialDragOverlay
                        material={draggingMaterial}
                        isExpanded={isDraggingMaterialOverCanvas}
                        expandedWidth={materialOverlayWidth}
                      />
                    ) : null}
                  </DragOverlay>,
                  dragOverlayPortalTarget,
                )
                : null}
            </DndContext>
            {isDesignerPreviewOpen ? (
              <DatasetPreviewModal
                title="预览已上传文件"
                description={`共 ${designerPreviewRecords.length.toLocaleString()} 条样例`}
                items={createDesignerPreviewItems(designerPreviewRecords, schema.datasetKind)}
                isLoading={false}
                errorMessage={null}
                showItemMeta={false}
                onClose={() => setIsDesignerPreviewOpen(false)}
              />
            ) : null}
          </section>
        </div>
          ,
          document.body,
        )
        : null}
    </section>
  );
};

type PersistedDesignerDraft = {
  templateId: string | null;
  name?: string;
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

    if (isDeprecatedTitleCleanupDraft(parsed.schema)) {
      window.localStorage.removeItem(DESIGNER_DRAFT_STORAGE_KEY);
      return null;
    }

    return {
      templateId: typeof parsed.templateId === 'string' ? parsed.templateId : null,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      version: typeof parsed.version === 'number' ? parsed.version : 0,
      status: parsed.status ?? 'DRAFT',
      schema: parsed.schema,
    };
  } catch {
    return null;
  }
};

const isDeprecatedTitleCleanupDraft = (schema: Pick<LabelHubSchema, 'fields'>): boolean => {
  return schema.fields.some(
    (field) => field.key === 'title_cleanup_group' && field.label === '商品标题清洗 v3',
  );
};

const persistDesignerDraft = (template: TemplateDto) => {
  window.localStorage.setItem(
    DESIGNER_DRAFT_STORAGE_KEY,
    JSON.stringify(toPersistedDesignerDraft(template)),
  );
};

const toPersistedDesignerDraft = (template: TemplateDto): PersistedDesignerDraft => ({
  templateId: template.id,
  name: template.name,
  version: template.version,
  status: template.status,
  schema: template.schema,
});

const templateStatusLabel = (status: TemplateDto['status']): string => {
  if (status === 'PUBLISHED') {
    return '已发布';
  }

  if (status === 'ARCHIVED') {
    return '已归档';
  }

  return '草稿';
};

const templateNameFromSchema = (schema: LabelHubSchema): string => {
  if (schema.datasetKind === 'qa_quality') {
    return '问答质量模板';
  }

  if (schema.datasetKind === 'preference_compare') {
    return '偏好对比模板';
  }

  return schema.fields[0]?.label ?? '自定义模板';
};

const resolveTemplateName = (name: string | null, schema: LabelHubSchema): string =>
  name?.trim() || templateNameFromSchema(schema);

const templateOwnerName = (createdById: string | null): string => {
  if (!createdById) {
    return '未记录';
  }

  if (createdById === 'user_owner_zhang_man' || createdById === 'user_owner_001') {
    return '张满';
  }

  return createdById;
};

const mockTemplateOwnerName = (createdById: string | null): string => {
  if (!createdById || createdById === 'user_owner_zhang_man' || createdById === 'user_owner_001') {
    return '张满';
  }

  return createdById;
};

const datasetKindLabel = (datasetKind: LabelHubSchema['datasetKind']): string => {
  if (datasetKind === 'qa_quality') {
    return '问答质量';
  }

  if (datasetKind === 'preference_compare') {
    return '偏好对比';
  }

  return '通用数据';
};

const formatDateTimeMinute = (value: string): string => value.slice(0, 16).replace('T', ' ');

const resolveTemplateSchema = (template: TemplateManagerRow): LabelHubSchema => {
  return template.template!.schema;
};

const cloneTemplateSchemaForDraft = (schema: LabelHubSchema): LabelHubSchema => {
  const clonedSchema = JSON.parse(JSON.stringify(schema)) as LabelHubSchema;

  return {
    ...clonedSchema,
    schemaVersion: 'draft',
  };
};

const TemplateCopyIcon = () => (
  <svg
    aria-hidden="true"
    className="template-manager-row-action__icon"
    viewBox="0 0 1024 1024"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M793.4 241.8h-20.8V232c0-92.8-74.5-168.3-166-168.3h-376c-91.5 0-166 75.5-166 168.3v381.2c0 92.8 74.5 168.3 166 168.3h20.8v9.8c0 92.8 74.5 168.3 166 168.3h376c91.5 0 166-75.5 166-168.3V410.1c0-92.8-74.5-168.3-166-168.3z m-542 168.3v291.6h-20.8c-48.1 0-87.3-39.7-87.3-88.5V232c0-48.8 39.2-88.6 87.3-88.6h376c48.2 0 87.3 39.7 87.3 88.6v9.8H417.4c-91.5 0-166 75.5-166 168.3z m629.3 381.2c0 48.8-39.2 88.5-87.3 88.5h-376c-48.2 0-87.3-39.7-87.3-88.5V410.1c0-48.8 39.2-88.6 87.3-88.6h376c48.2 0 87.3 39.7 87.3 88.6v381.2z m-118-230.5h-118V441.2c0-21.9-17.7-39.9-39.3-39.9-21.6 0-39.3 17.9-39.3 39.9v119.6h-118c-21.6 0-39.3 18-39.3 39.9s17.7 39.9 39.3 39.9h118v119.6c0 21.9 17.7 39.9 39.3 39.9 21.6 0 39.3-17.9 39.3-39.9V640.5h118c21.6 0 39.3-17.9 39.3-39.9 0.1-21.9-17.6-39.8-39.3-39.8z"
      fill="#306DF8"
    />
  </svg>
);

const TemplateDeleteIcon = () => (
  <svg
    aria-hidden="true"
    className="template-manager-row-action__icon"
    viewBox="0 0 1024 1024"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M836.6 339.2c-21.5 0-39 16.5-39 36.9v419.7c0 49.5-42.6 89.9-94.9 89.9H320.2c-52.3 0-94.9-40.3-94.9-89.9V376.1c0-20.4-17.5-36.9-39-36.9s-39 16.5-39 36.9v419.7c0 90.3 77.6 163.7 173 163.7h382.4c95.4 0 173-73.4 173-163.7V376.1c-0.1-20.4-17.6-36.9-39.1-36.9zM919.8 193H718.4l-81.5-89.9c-21.9-24.1-53.8-38-87.4-38h-86.6c-35.8 0-68.9 15.3-90.9 42L301.2 193H103c-21.5 0-39 16.5-39 36.9s17.5 36.9 39 36.9h217.3c12 0 23.4-5.2 30.8-14.2l82.5-100.1c7.1-8.6 17.8-13.6 29.3-13.6h86.6c10.9 0 21.2 4.5 28.3 12.3L670.9 254c7.4 8.2 18.2 12.9 29.6 12.9h219.3c21.5 0 39-16.5 39-36.9s-17.5-37-39-37zM447.2 754.5V420.1c0-20.4-17.5-36.9-39-36.9s-39 16.5-39 36.9v334.4c0 20.4 17.5 36.9 39 36.9 21.6 0.1 39-16.5 39-36.9z m206.4 0V420.1c0-20.4-17.5-36.9-39-36.9-21.6 0-39 16.5-39 36.9v334.4c0 20.4 17.5 36.9 39 36.9 21.5 0.1 39-16.5 39-36.9z"
      fill="currentColor"
    />
  </svg>
);

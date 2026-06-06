import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import {
  validateTemplateSchema,
  type AutoTemplateAnnotationField,
  type AutoTemplateFieldClassificationResult,
  type AutoTemplateFieldClassificationRequest,
  type AutoTemplateSourceField,
  type DatasetRecord,
  type LabelHubSchema,
  type SchemaField,
  type ShowItemDisplayField,
} from '@labelhub/shared';

import { classifyTemplateFields } from '../../api/llm';
import { requestApi } from '../../api/request';
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
  resolveDesignerDropTarget,
  selectDesignerField,
  useTemplateDesignerStore,
  type DesignerDropTarget,
  type MaterialSpec,
} from '../../features/template-designer/templateStore';
import { useAdaptiveTablePageSize } from '../../hooks/useAdaptiveTablePageSize';
import versionIcon from '../../assets/version.svg';
import { createAutoShowItemTemplateSchema } from './autoShowItemTemplate';
import { DatasetPreviewModal } from './components/DatasetPreviewModal';
import { TemplateVersionManagerModal } from './components/TemplateVersionManagerModal';
import {
  consumeTemplateOpenTarget,
  consumeTemplateDraftHandoff,
  updateTaskTemplateReturnHandoff,
  type TemplateOpenTarget,
  type TemplateDraftHandoff,
} from './templateDraftHandoff';
import { createTemplateDisplayIdMap, formatTemplateDisplayId } from './templateDisplayId';

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

const OWNER_ID = 'user_owner_zhang_man';
const DESIGNER_CANVAS_AUTOSCROLL_EDGE = 72;
const DESIGNER_CANVAS_AUTOSCROLL_MAX_STEP = 22;

type LlmAssistPreviewResult = {
  datasetKind?: string;
  targetFieldKey?: string;
  summary?: string;
  suggestion?: unknown;
};

const LLM_ASSIST_PREVIEW_ERROR_MESSAGE = 'LLM 辅助暂时不可用，请稍后重试。';

const DESIGNER_DRAFT_STORAGE_KEY = 'labelhub.templateDesignerDraft';
const FIELD_DROP_ANIMATION = {
  duration: 520,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
};
const CLOSE_CONFIRM_ANIMATION_MS = 220;
const TEMPLATE_DESIGNER_CLOSE_ANIMATION_MS = 240;
const TEMPLATE_FALLBACK_PAGE_SIZE = 8;
const TEMPLATE_TABLE_ROW_HEIGHT = 58;
const DESIGNER_DROP_TARGET_LOCK_MARGIN = 12;
const AUTO_TEMPLATE_SOURCE_METADATA_KEY = 'autoTemplateSource';

const resolveInitialTemplateOpenTarget = (): TemplateOpenTarget | null => {
  const handoffTarget = consumeTemplateOpenTarget();
  const routeTarget = readTemplateOpenTargetFromLocationSearch();

  if (!routeTarget) {
    return handoffTarget;
  }

  if (!handoffTarget || handoffTarget.templateId !== routeTarget.templateId) {
    return routeTarget;
  }

  return {
    ...routeTarget,
    returnTo: routeTarget.returnTo ?? handoffTarget.returnTo,
  };
};

const readTemplateOpenTargetFromLocationSearch = (): TemplateOpenTarget | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const templateId = new URLSearchParams(window.location.search).get('templateId')?.trim() ?? '';

  return templateId ? { templateId } : null;
};

type DesignerHistoryShortcut = 'undo' | 'redo';

const resolveDesignerHistoryShortcut = (
  event: Pick<globalThis.KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
): DesignerHistoryShortcut | null => {
  if (event.altKey || (!event.ctrlKey && !event.metaKey)) {
    return null;
  }

  const key = event.key.toLowerCase();

  if (key === 'z') {
    return event.shiftKey ? 'redo' : 'undo';
  }

  if (key === 'y') {
    return 'redo';
  }

  return null;
};

const isDesignerTextEditingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  if (target.matches('input, textarea, select')) {
    return true;
  }

  return Boolean(
    target.closest('[contenteditable="true"], [role="textbox"], .ck-editor__editable, .ProseMirror'),
  );
};

type TemplateStatusFilter = TemplateDto['status'] | 'ALL';
type TemplateSummary = {
  draft: number;
  published: number;
  total: number;
};
type TemplateManagerRow = {
  activeUsageCount: number;
  createdAt: string;
  datasetKind: string;
  fieldCount: number;
  id: string;
  key: string;
  name: string;
  owner: string;
  rawId: string;
  searchValues: string[];
  status: string;
  statusFilterKey: TemplateDto['status'];
  updatedAt: string;
  template?: TemplateDto;
  usageCount: number;
  version: string;
};

type TemplateSortField = 'templateId' | 'createdAt' | 'updatedAt';
type TemplateSortDirection = 'asc' | 'desc';

const TEMPLATE_SUMMARY_FILTERS: Array<{
  label: string;
  summaryKey: keyof TemplateSummary;
  value: TemplateStatusFilter;
}> = [
  { label: '总模版', value: 'ALL', summaryKey: 'total' },
  { label: '草稿', value: 'DRAFT', summaryKey: 'draft' },
  { label: '已发布', value: 'PUBLISHED', summaryKey: 'published' },
];

type TemplateDesignerPageProps = {
  onReturnTo?: (path: string) => void;
};

type TemplateDraftReturnSource = 'task-template-draft' | 'task-template-preview';

type TemplateDraftReturnState = {
  returnTo: string | null;
  source: TemplateDraftReturnSource | null;
};

const createDesignerDirtySnapshot = ({
  name,
  previewRecords,
  schema,
  status,
}: {
  name: string;
  previewRecords: readonly DatasetRecord[];
  schema: LabelHubSchema;
  status: TemplateDto['status'];
}): string =>
  JSON.stringify({
    name,
    previewRecords,
    schema,
    status,
  });

type DesignerSourceContext = {
  previewRecords: DatasetRecord[];
  sourceFileName?: string;
};

const EMPTY_DESIGNER_SOURCE_CONTEXT: DesignerSourceContext = {
  previewRecords: [],
};

const readDesignerSourceContext = (schema: LabelHubSchema): DesignerSourceContext => {
  const metadataSource = schema.metadata?.[AUTO_TEMPLATE_SOURCE_METADATA_KEY];

  if (!isPlainRecord(metadataSource)) {
    return EMPTY_DESIGNER_SOURCE_CONTEXT;
  }

  const sourceFileName =
    typeof metadataSource.sourceFileName === 'string' && metadataSource.sourceFileName.trim()
      ? metadataSource.sourceFileName.trim()
      : undefined;
  const previewRecords = Array.isArray(metadataSource.previewRecords)
    ? metadataSource.previewRecords.filter(isDatasetRecord)
    : [];

  if (!sourceFileName && previewRecords.length === 0) {
    return EMPTY_DESIGNER_SOURCE_CONTEXT;
  }

  return {
    previewRecords,
    ...(sourceFileName ? { sourceFileName } : {}),
  };
};

const withDesignerSourceContext = (
  schema: LabelHubSchema,
  context: {
    previewRecords?: readonly DatasetRecord[];
    sourceFileName?: string;
  },
): LabelHubSchema => {
  const previewRecords = (context.previewRecords ?? []).filter(isDatasetRecord);
  const sourceFileName = context.sourceFileName?.trim();

  if (!sourceFileName && previewRecords.length === 0) {
    return withoutDesignerSourceContext(schema);
  }

  return {
    ...schema,
    metadata: {
      ...(schema.metadata ?? {}),
      [AUTO_TEMPLATE_SOURCE_METADATA_KEY]: {
        ...(sourceFileName ? { sourceFileName } : {}),
        previewRecords,
      },
    },
  };
};

const withoutDesignerSourceContext = (schema: LabelHubSchema): LabelHubSchema => {
  if (!schema.metadata || !(AUTO_TEMPLATE_SOURCE_METADATA_KEY in schema.metadata)) {
    return schema;
  }

  const { [AUTO_TEMPLATE_SOURCE_METADATA_KEY]: _removed, ...metadata } = schema.metadata;

  if (Object.keys(metadata).length === 0) {
    const { metadata: _schemaMetadata, ...schemaWithoutMetadata } = schema;

    return schemaWithoutMetadata;
  }

  return {
    ...schema,
    metadata,
  };
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isDatasetRecord = (value: unknown): value is DatasetRecord => isPlainRecord(value);

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

const scrollDesignerCanvasNearPointer = (point: { x: number; y: number }): boolean => {
  const canvas = document.querySelector<HTMLElement>('.designer-canvas');
  const rect = canvas?.getBoundingClientRect();

  if (!canvas || !rect) {
    return false;
  }

  const distanceToTop = point.y - rect.top;
  const distanceToBottom = rect.bottom - point.y;
  let scrollDelta = 0;

  if (distanceToTop >= 0 && distanceToTop < DESIGNER_CANVAS_AUTOSCROLL_EDGE) {
    scrollDelta = -Math.ceil(
      ((DESIGNER_CANVAS_AUTOSCROLL_EDGE - distanceToTop) / DESIGNER_CANVAS_AUTOSCROLL_EDGE) *
        DESIGNER_CANVAS_AUTOSCROLL_MAX_STEP,
    );
  } else if (distanceToBottom >= 0 && distanceToBottom < DESIGNER_CANVAS_AUTOSCROLL_EDGE) {
    scrollDelta = Math.ceil(
      ((DESIGNER_CANVAS_AUTOSCROLL_EDGE - distanceToBottom) / DESIGNER_CANVAS_AUTOSCROLL_EDGE) *
        DESIGNER_CANVAS_AUTOSCROLL_MAX_STEP,
    );
  }

  if (scrollDelta === 0) {
    return false;
  }

  const previousScrollTop = canvas.scrollTop;
  canvas.scrollTop += scrollDelta;

  return canvas.scrollTop !== previousScrollTop;
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

const pointerCoordinatesFromDragEvent = (
  event: MouseEvent | PointerEvent | TouchEvent,
): { x: number; y: number } | null => {
  if ('touches' in event) {
    const touch = event.touches[0] ?? event.changedTouches[0];

    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  return {
    x: event.clientX,
    y: event.clientY,
  };
};

type LockedDesignerDropTarget = {
  element: HTMLElement;
  rect: DOMRect;
  target: DesignerDropTarget;
};

const isPointInsideRect = (
  point: { x: number; y: number },
  rect: DOMRect,
  margin = 0,
): boolean => {
  return (
    point.x >= rect.left - margin &&
    point.x <= rect.right + margin &&
    point.y >= rect.top - margin &&
    point.y <= rect.bottom + margin
  );
};

const resolveDesignerDropTargetElement = (
  element: Element,
  point: { x: number; y: number },
): LockedDesignerDropTarget | null => {
  const targetElement = element.closest<HTMLElement>('[data-designer-drop-target-kind]');

  if (!targetElement) {
    return null;
  }

  const kind = targetElement.dataset.designerDropTargetKind;
  const withPointBeforeField = (target: DesignerDropTarget): LockedDesignerDropTarget => ({
    element: targetElement,
    rect: targetElement.getBoundingClientRect(),
    target: applyBeforeFieldFromPoint(targetElement, target, point),
  });

  if (kind === 'root') {
    return withPointBeforeField({ kind: 'root' });
  }

  if (kind === 'group') {
    const groupKey = targetElement.dataset.designerGroupKey;

    return groupKey
      ? withPointBeforeField({ kind: 'group', groupKey })
      : null;
  }

  if (kind === 'tab') {
    const tabsKey = targetElement.dataset.designerTabsKey;
    const tabKey = targetElement.dataset.designerTabKey;

    return tabsKey && tabKey
      ? withPointBeforeField({ kind: 'tab', tabsKey, tabKey })
      : null;
  }

  return null;
};

const applyBeforeFieldFromPoint = (
  targetElement: HTMLElement,
  target: DesignerDropTarget,
  point: { x: number; y: number },
): DesignerDropTarget => {
  const beforeFieldKey = resolveBeforeFieldKeyFromPoint(targetElement, point);

  return beforeFieldKey ? { ...target, beforeFieldKey } : target;
};

const resolveBeforeFieldKeyFromPoint = (
  targetElement: HTMLElement,
  point: { x: number; y: number },
): string | undefined => {
  const fieldEntries = Array.from(
    targetElement.querySelectorAll<HTMLElement>('.designer-field-card[data-designer-field-key]'),
  )
    .filter((fieldElement) => {
      if (
        fieldElement.classList.contains('is-dragging') ||
        fieldElement.classList.contains('is-removing')
      ) {
        return false;
      }

      const nearestParentDropTarget = fieldElement.parentElement?.closest('[data-designer-drop-target-kind]');

      if (nearestParentDropTarget === targetElement) {
        return true;
      }

      return (
        targetElement.classList.contains('designer-canvas') &&
        nearestParentDropTarget instanceof HTMLElement &&
        nearestParentDropTarget.classList.contains('designer-canvas__fields')
      );
    })
    .map((fieldElement) => ({
      key: fieldElement.dataset.designerFieldKey,
      rect: fieldElement.getBoundingClientRect(),
    }))
    .filter((entry): entry is { key: string; rect: DOMRect } => Boolean(entry.key))
    .sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left);

  if (fieldEntries.length === 0) {
    return undefined;
  }

  const rows: Array<{
    bottom: number;
    entries: typeof fieldEntries;
    top: number;
  }> = [];

  for (const entry of fieldEntries) {
    const row = rows.find((candidate) => Math.abs(candidate.top - entry.rect.top) <= 8);

    if (row) {
      row.entries.push(entry);
      row.top = Math.min(row.top, entry.rect.top);
      row.bottom = Math.max(row.bottom, entry.rect.bottom);
    } else {
      rows.push({
        bottom: entry.rect.bottom,
        entries: [entry],
        top: entry.rect.top,
      });
    }
  }

  for (const row of rows) {
    row.entries.sort((left, right) => left.rect.left - right.rect.left);
  }

  rows.sort((left, right) => left.top - right.top);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!;

    if (point.y < row.top - 4) {
      return row.entries[0]?.key;
    }

    if (point.y <= row.bottom + 4) {
      if (row.entries.length === 1) {
        const entry = row.entries[0]!;
        const rowMiddle = entry.rect.top + entry.rect.height / 2;

        return point.y < rowMiddle ? entry.key : rows[rowIndex + 1]?.entries[0]?.key;
      }

      const beforeEntry = row.entries.find((entry) => point.x < entry.rect.left + entry.rect.width / 2);

      return beforeEntry?.key ?? rows[rowIndex + 1]?.entries[0]?.key;
    }
  }

  return undefined;
};

export const resolveDesignerDropTargetAtPoint = (
  point: { x: number; y: number },
): LockedDesignerDropTarget | null => {
  if (typeof document.elementsFromPoint !== 'function') {
    return null;
  }

  const visitedElements = new Set<Element>();

  for (const element of document.elementsFromPoint(point.x, point.y)) {
    const targetElement = element.closest<HTMLElement>('[data-designer-drop-target-kind]');

    if (!targetElement || visitedElements.has(targetElement)) {
      continue;
    }

    visitedElements.add(targetElement);

    const target = resolveDesignerDropTargetElement(targetElement, point);

    if (target) {
      return target;
    }
  }

  return null;
};

export const resolveDesignerDropTargetForProjection = ({
  overTarget,
  pointTarget,
}: {
  overTarget: DesignerDropTarget | null;
  pointTarget: DesignerDropTarget | null;
}): DesignerDropTarget => pointTarget ?? overTarget ?? { kind: 'root' };

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

const createLocalAutoClassificationFallback = (
  request: AutoTemplateFieldClassificationRequest,
): AutoTemplateFieldClassificationResult => ({
  layout: hasAutoClassificationSourceKeys(request.fields, ['response_a', 'response_b'])
    ? 'comparison'
    : 'field_list',
  displayFields: request.fields
    .filter((field) => !isLocalAutoClassificationAnnotationField(field.sourceKey))
    .map(createLocalAutoClassificationDisplayField),
  annotationFields: request.fields
    .filter((field) => isLocalAutoClassificationAnnotationField(field.sourceKey))
    .map(createLocalAutoClassificationAnnotationField),
});

const createLocalAutoClassificationDisplayField = (
  field: AutoTemplateSourceField,
): ShowItemDisplayField => {
  const normalizedKey = field.sourceKey.trim().toLowerCase();

  if (
    normalizedKey === 'id' ||
    normalizedKey === 'task_id' ||
    normalizedKey.includes('type') ||
    normalizedKey === 'lang' ||
    normalizedKey === 'language' ||
    normalizedKey === 'category' ||
    normalizedKey === 'difficulty'
  ) {
    return {
      sourceKey: field.sourceKey,
      label: field.sourceKey,
      area: 'meta',
      format: 'badge',
    };
  }

  if (normalizedKey.includes('prompt') || normalizedKey.includes('question')) {
    return {
      sourceKey: field.sourceKey,
      label: field.sourceKey,
      area: 'primary',
      format: 'long_text',
      maxLines: 8,
    };
  }

  if (
    normalizedKey.includes('response') ||
    normalizedKey.includes('answer') ||
    normalizedKey.includes('reference')
  ) {
    return {
      sourceKey: field.sourceKey,
      label: field.sourceKey,
      area: 'content',
      format: 'long_text',
      maxLines: 12,
    };
  }

  const valueType = field.valueTypes[0];

  return {
    sourceKey: field.sourceKey,
    label: field.sourceKey,
    area: valueType === 'number' || valueType === 'boolean' ? 'meta' : 'content',
    format: valueType === 'object' || valueType === 'array' ? 'json' : 'text',
  };
};

const createLocalAutoClassificationAnnotationField = (
  field: AutoTemplateSourceField,
): AutoTemplateAnnotationField => {
  const normalizedKey = field.sourceKey.trim().toLowerCase();

  if (
    normalizedKey === 'preferred' ||
    normalizedKey.includes('preference') ||
    normalizedKey.includes('decision') ||
    normalizedKey.includes('judgment') ||
    normalizedKey.includes('verdict')
  ) {
    return {
      sourceKey: field.sourceKey,
      label: field.sourceKey,
      type: 'radio',
      options: [
        { label: 'A', value: 'A' },
        { label: 'B', value: 'B' },
      ],
      required: true,
    };
  }

  if (normalizedKey.includes('dimension')) {
    return {
      sourceKey: field.sourceKey,
      label: field.sourceKey,
      type: 'checkbox',
      options: [],
    };
  }

  if (
    normalizedKey.includes('note') ||
    normalizedKey.includes('comment') ||
    normalizedKey.includes('rationale') ||
    normalizedKey.includes('reason')
  ) {
    return {
      sourceKey: field.sourceKey,
      label: field.sourceKey,
      type: 'textarea',
    };
  }

  return {
    sourceKey: field.sourceKey,
    label: field.sourceKey,
    type: 'text',
  };
};

const isLocalAutoClassificationAnnotationField = (sourceKey: string): boolean => {
  if (isProtectedLocalAutoClassificationDisplayField(sourceKey)) {
    return false;
  }

  const normalizedKey = sourceKey.trim().toLowerCase();

  return (
    normalizedKey === 'preferred' ||
    normalizedKey.includes('preference') ||
    normalizedKey.includes('margin') ||
    normalizedKey.includes('dimension') ||
    normalizedKey.includes('safety_flag') ||
    normalizedKey.includes('annotator') ||
    normalizedKey.includes('reviewer') ||
    normalizedKey.includes('decision') ||
    normalizedKey.includes('rationale') ||
    normalizedKey.includes('reason') ||
    normalizedKey.includes('note') ||
    normalizedKey.includes('comment') ||
    normalizedKey.includes('score') ||
    normalizedKey.includes('rating') ||
    normalizedKey.includes('judgment') ||
    normalizedKey.includes('verdict')
  );
};

const isProtectedLocalAutoClassificationDisplayField = (sourceKey: string): boolean => {
  const normalizedKey = sourceKey.trim().toLowerCase();
  const exactDisplayKeys = new Set([
    'id',
    'task_id',
    'task_type',
    'category',
    'difficulty',
    'lang',
    'language',
    'media_type',
    'media_url',
    'content_markdown',
    'prompt',
    'question',
    'model_answer',
    'reference',
    'reference_answer',
    'tags',
    'source',
    'expected_dimensions',
    'response_a',
    'response_b',
  ]);

  return (
    exactDisplayKeys.has(normalizedKey) ||
    normalizedKey.startsWith('expected_') ||
    normalizedKey.includes('prompt') ||
    normalizedKey.includes('question') ||
    normalizedKey.includes('reference') ||
    normalizedKey.includes('model_answer') ||
    normalizedKey.includes('content_markdown') ||
    normalizedKey.includes('media_url')
  );
};

const hasAutoClassificationSourceKeys = (
  fields: readonly AutoTemplateSourceField[],
  sourceKeys: readonly string[],
): boolean => {
  const sourceKeySet = new Set(fields.map((field) => field.sourceKey.trim().toLowerCase()));

  return sourceKeys.every((sourceKey) => sourceKeySet.has(sourceKey));
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

  return updateTaskTemplateReturnHandoff((handoff) => {
    const hasExistingTemplateOption = handoff.templateOptions.some(
      (currentTemplate) => currentTemplate.id === taskTemplate.id,
    );

    return {
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
      templateOptions: hasExistingTemplateOption
        ? handoff.templateOptions.map((currentTemplate) =>
          currentTemplate.id === taskTemplate.id ? taskTemplate : currentTemplate,
        )
        : [
          taskTemplate,
          ...handoff.templateOptions.filter((currentTemplate) => currentTemplate.id !== taskTemplate.id),
        ],
      isTaskFormDirty: true,
    };
  });
};

const toTaskTemplateSummary = (template: TemplateDto): TaskDto['template'] => ({
  id: template.id,
  name: template.name,
  datasetKind: template.datasetKind,
  schemaVersion: template.schemaVersion,
  status: template.status,
  version: template.version,
});

const templateVersionChainKey = (template: TemplateDto): string =>
  template.rootTemplateId ?? template.parentTemplateId ?? template.id;

const isSameTemplateVersionChain = (left: TemplateDto, right: TemplateDto): boolean => {
  const leftChainKey = templateVersionChainKey(left);
  const rightChainKey = templateVersionChainKey(right);

  return (
    leftChainKey === rightChainKey ||
    left.id === rightChainKey ||
    right.id === leftChainKey ||
    left.parentTemplateId === right.id ||
    right.parentTemplateId === left.id
  );
};

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
  const [routeTemplateTarget] = useState(resolveInitialTemplateOpenTarget);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [templateSearchKeyword, setTemplateSearchKeyword] = useState('');
  const [templateStatusFilter, setTemplateStatusFilter] = useState<TemplateStatusFilter>('ALL');
  const [currentTemplatePage, setCurrentTemplatePage] = useState(1);
  const [templateSortField, setTemplateSortField] = useState<TemplateSortField | null>(null);
  const [templateSortDirection, setTemplateSortDirection] = useState<TemplateSortDirection>('asc');
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isDesignerOpen, setIsDesignerOpen] = useState(false);
  const [isDesignerClosing, setIsDesignerClosing] = useState(false);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const [isCloseConfirmClosing, setIsCloseConfirmClosing] = useState(false);
  const [isPublishSaveAsOpen, setIsPublishSaveAsOpen] = useState(false);
  const [isPublishSaveAsClosing, setIsPublishSaveAsClosing] = useState(false);
  const [publishSaveAsTemplateName, setPublishSaveAsTemplateName] = useState('');
  const [draggingFieldKey, setDraggingFieldKey] = useState<string | null>(null);
  const [draggingMaterialType, setDraggingMaterialType] = useState<MaterialSpec['type'] | null>(null);
  const [isDraggingMaterialOverCanvas, setIsDraggingMaterialOverCanvas] = useState(false);
  const [materialDropTarget, setMaterialDropTarget] = useState<DesignerDropTarget | null>(null);
  const [materialOverlayWidth, setMaterialOverlayWidth] = useState<number | null>(null);
  const [committedDropFieldKey, setCommittedDropFieldKey] = useState<string | null>(null);
  const [isMaterialDropSettling, setIsMaterialDropSettling] = useState(false);
  const [activeDesignerTabByFieldKey, setActiveDesignerTabByFieldKey] = useState<Record<string, string>>({});
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateDraftName, setTemplateDraftName] = useState<string | null>(null);
  const [templateNameDraftOverride, setTemplateNameDraftOverride] = useState<string | null>(null);
  const { containerRef: templateTableContainerRef, pageSize: templatePageSize } = useAdaptiveTablePageSize({
    fallbackPageSize: TEMPLATE_FALLBACK_PAGE_SIZE,
    rowHeight: TEMPLATE_TABLE_ROW_HEIGHT,
  });
  const [templateVersion, setTemplateVersion] = useState(0);
  const [templateStatus, setTemplateStatus] = useState<TemplateDto['status']>('DRAFT');
  const [versionManagerTemplate, setVersionManagerTemplate] = useState<TemplateDto | null>(null);
  const [designerPreviewRawData, setDesignerPreviewRawData] = useState<Record<string, unknown>>(
    DESIGNER_PREVIEW_RAW_DATA,
  );
  const [designerPreviewRecords, setDesignerPreviewRecords] = useState<DatasetRecord[]>([]);
  const [isDesignerPreviewOpen, setIsDesignerPreviewOpen] = useState(false);
  const [toastMessages, setToastMessages] = useState<ToastMessage[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const dragStartPointerRef = useRef<{ x: number; y: number } | null>(null);
  const latestDragPointerRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerProjectionFrameRef = useRef<number | null>(null);
  const dragAutoScrollPointerRef = useRef<{ x: number; y: number } | null>(null);
  const dragAutoScrollFrameRef = useRef<number | null>(null);
  const dropTargetLockRef = useRef<LockedDesignerDropTarget | null>(null);
  const commitAnimationTimerRef = useRef<number | null>(null);
  const designerCloseTimerRef = useRef<number | null>(null);
  const closeConfirmTimerRef = useRef<number | null>(null);
  const publishSaveAsTimerRef = useRef<number | null>(null);
  const templateDraftReturnRef = useRef<TemplateDraftReturnState>({ returnTo: null, source: null });
  const didConsumeTemplateDraftHandoffRef = useRef(false);
  const openedRouteTemplateIdRef = useRef<string | null>(null);
  const autoClassificationRunRef = useRef(0);
  const toastSequenceRef = useRef(0);
  const isMountedRef = useRef(true);
  const designerBaselineSnapshotRef = useRef<string | null>(null);
  const {
    schema,
    selectedFieldKey,
    addFieldAtTarget,
    selectField,
    updateSelectedField,
    updateSelectedFieldValidation,
    addLinkageRuleToSelectedField,
    removeField,
    duplicateField,
    updateAiReviewPromptConfig,
    moveFieldToTarget,
    setSchema,
    resetDesigner,
    canUndo,
    canRedo,
    undo,
    redo,
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
  const effectiveTemplateName =
    templateNameDraftOverride !== null ? templateNameDraftOverride.trim() || currentTemplateName : currentTemplateName;
  const activeSavedTemplate = useMemo(
    () => (templateId ? templates.find((template) => template.id === templateId) ?? null : null),
    [templateId, templates],
  );
  const isPublishBlockedByUsage = useMemo(() => {
    if (!activeSavedTemplate) {
      return false;
    }

    return templates.some(
      (template) =>
        isSameTemplateVersionChain(template, activeSavedTemplate) && (template.activeUsageCount ?? 0) > 0,
    );
  }, [activeSavedTemplate, templates]);
  const setTemplateDraftReturn = (
    returnTo: string | null,
    source: TemplateDraftReturnSource | null,
  ) => {
    templateDraftReturnRef.current = returnTo ? { returnTo, source } : { returnTo: null, source: null };
  };
  const clearTemplateDraftReturn = () => {
    setTemplateDraftReturn(null, null);
  };
  const clearTemplatePreviewReturnAfterSave = () => {
    if (templateDraftReturnRef.current.source === 'task-template-preview') {
      clearTemplateDraftReturn();
    }
  };
  const hasDesignerContentChanges = () => {
    const baselineSnapshot = designerBaselineSnapshotRef.current;

    if (!baselineSnapshot) {
      return true;
    }

    return baselineSnapshot !== createDesignerDirtySnapshot({
      name: effectiveTemplateName,
      previewRecords: designerPreviewRecords,
      schema,
      status: templateStatus,
    });
  };
  const nextVersionName = `v${templateVersion + 1}`;
  const allTemplateRows = useMemo<TemplateManagerRow[]>(
    () => {
      const templateDisplayIdMap = createTemplateDisplayIdMap(templates);

      return templates.map((template, index) => {
        const displayId = templateDisplayIdMap.get(template.id) ?? formatTemplateDisplayId(index + 1);
        const status = templateStatusLabel(template.status);
        const owner = mockTemplateOwnerName(template.createdById);
        const datasetKind = datasetKindLabel(template.datasetKind);

        return {
          activeUsageCount: template.activeUsageCount ?? 0,
          createdAt: template.createdAt,
          datasetKind,
          fieldCount: template.schema.fields.length,
          id: displayId,
          key: template.id,
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
          statusFilterKey: template.status,
          updatedAt: template.updatedAt,
          template,
          usageCount: template.usageCount ?? 0,
          version: template.version > 0 ? `v${template.version}` : 'v0',
        };
      });
    },
    [templates],
  );
  const templateRows = useMemo(() => {
    const keyword = templateSearchKeyword.trim().toLowerCase();
    const filteredRows = allTemplateRows.filter((template) => {
      const matchesKeyword =
        !keyword || template.searchValues.some((value) => value.toLowerCase().includes(keyword));
      const matchesStatus =
        templateStatusFilter === 'ALL' || template.statusFilterKey === templateStatusFilter;

      return matchesKeyword && matchesStatus;
    });

    if (!templateSortField) {
      return filteredRows;
    }

    return [...filteredRows].sort((left, right) => {
      const multiplier = templateSortDirection === 'asc' ? 1 : -1;
      const diff = compareTemplateRowsBySortField(left, right, templateSortField);

      if (diff !== 0) {
        return diff * multiplier;
      }

      return left.rawId.localeCompare(right.rawId);
    });
  }, [allTemplateRows, templateSearchKeyword, templateSortField, templateSortDirection, templateStatusFilter]);
  const templateStats = useMemo(
    () => ({
      total: allTemplateRows.length,
      draft: allTemplateRows.filter((template) => template.statusFilterKey === 'DRAFT').length,
      published: allTemplateRows.filter((template) => template.statusFilterKey === 'PUBLISHED').length,
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

    readPersistedDesignerDraft();
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
  }, [templateSearchKeyword, templateStatusFilter, templateSortField, templateSortDirection]);

  useEffect(() => {
    setCurrentTemplatePage((current) => Math.min(current, totalTemplatePages));
  }, [totalTemplatePages]);

  useEffect(() => {
    if (!isDesignerOpen) {
      return;
    }

    const handleDesignerHistoryKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || isDesignerTextEditingTarget(event.target)) {
        return;
      }

      const shortcut = resolveDesignerHistoryShortcut(event);

      if (shortcut === 'undo' && canUndo) {
        event.preventDefault();
        undo();
        return;
      }

      if (shortcut === 'redo' && canRedo) {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleDesignerHistoryKeyDown);

    return () => {
      window.removeEventListener('keydown', handleDesignerHistoryKeyDown);
    };
  }, [canRedo, canUndo, isDesignerOpen, redo, undo]);

  useEffect(() => {
    isMountedRef.current = true;
    const updateLatestPointer = (event: MouseEvent | PointerEvent | TouchEvent) => {
      const point = pointerCoordinatesFromDragEvent(event);

      if (point) {
        latestDragPointerRef.current = point;
      }
    };
    const listenerOptions = { capture: true };
    const touchListenerOptions = { capture: true, passive: true };

    window.addEventListener('pointermove', updateLatestPointer, listenerOptions);
    window.addEventListener('mousemove', updateLatestPointer, listenerOptions);
    window.addEventListener('touchmove', updateLatestPointer, touchListenerOptions);

    return () => {
      window.removeEventListener('pointermove', updateLatestPointer, listenerOptions);
      window.removeEventListener('mousemove', updateLatestPointer, listenerOptions);
      window.removeEventListener('touchmove', updateLatestPointer, touchListenerOptions);

      if (commitAnimationTimerRef.current) {
        window.clearTimeout(commitAnimationTimerRef.current);
      }

      if (designerCloseTimerRef.current) {
        window.clearTimeout(designerCloseTimerRef.current);
      }

      if (closeConfirmTimerRef.current) {
        window.clearTimeout(closeConfirmTimerRef.current);
      }

      if (publishSaveAsTimerRef.current) {
        window.clearTimeout(publishSaveAsTimerRef.current);
      }

      if (dragAutoScrollFrameRef.current) {
        window.cancelAnimationFrame(dragAutoScrollFrameRef.current);
      }

      if (dragPointerProjectionFrameRef.current) {
        window.cancelAnimationFrame(dragPointerProjectionFrameRef.current);
      }

      isMountedRef.current = false;
    };
  }, []);

  const markCommittedDropField = (fieldKey: string | null | undefined) => {
    if (!fieldKey) {
      setIsMaterialDropSettling(false);
      return;
    }

    if (commitAnimationTimerRef.current) {
      window.clearTimeout(commitAnimationTimerRef.current);
    }

    setCommittedDropFieldKey(fieldKey);
    commitAnimationTimerRef.current = window.setTimeout(() => {
      setCommittedDropFieldKey(null);
      setIsMaterialDropSettling(false);
      commitAnimationTimerRef.current = null;
    }, 620);
  };

  const beginMaterialDropSettling = () => {
    if (commitAnimationTimerRef.current) {
      window.clearTimeout(commitAnimationTimerRef.current);
      commitAnimationTimerRef.current = null;
    }

    setCommittedDropFieldKey(null);
    setIsMaterialDropSettling(true);
  };

  const stopDesignerCanvasAutoScroll = () => {
    dragAutoScrollPointerRef.current = null;

    if (dragAutoScrollFrameRef.current) {
      window.cancelAnimationFrame(dragAutoScrollFrameRef.current);
      dragAutoScrollFrameRef.current = null;
    }
  };

  const stopDragPointerProjection = () => {
    if (dragPointerProjectionFrameRef.current) {
      window.cancelAnimationFrame(dragPointerProjectionFrameRef.current);
      dragPointerProjectionFrameRef.current = null;
    }
  };

  const resetDragState = () => {
    setDraggingFieldKey(null);
    setDraggingMaterialType(null);
    setIsDraggingMaterialOverCanvas(false);
    setMaterialDropTarget(null);
    setMaterialOverlayWidth(null);
    stopDragPointerProjection();
    stopDesignerCanvasAutoScroll();
    dropTargetLockRef.current = null;
    dragStartPointerRef.current = null;
    latestDragPointerRef.current = null;
  };

  const showToast = (message: ToastMessage): string => {
    toastSequenceRef.current += 1;
    const toastId = `${message.id}-${toastSequenceRef.current}`;
    setToastMessages((current) => [
      ...current,
      {
        ...message,
        id: toastId,
      },
    ].slice(-4));

    return toastId;
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

  const handleDesignerLlmPromptTest = async (field: SchemaField) => {
    const promptTemplate = field.promptTemplate?.trim();
    const targetFieldKey = field.fieldKey ?? field.key;

    if (!promptTemplate) {
      showErrorToast('请先填写 LLM 提示内容');
      return;
    }

    try {
      const result = await requestApi<LlmAssistPreviewResult>(
        '/llm/assist',
        {
          method: 'POST',
          body: JSON.stringify({
            datasetKind: schema.datasetKind,
            rawData: designerPreviewRawData,
            answers: {},
            targetFieldKey,
            promptTemplate,
          }),
        },
        LLM_ASSIST_PREVIEW_ERROR_MESSAGE,
      );

      if (!result || typeof result.summary !== 'string') {
        throw new Error('LLM 辅助返回格式不正确');
      }

      if (typeof result.targetFieldKey === 'string' && result.targetFieldKey !== targetFieldKey) {
        throw new Error('LLM 辅助返回目标字段不一致');
      }

      showInfoToast(result.summary || 'LLM 建议已生成');
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : LLM_ASSIST_PREVIEW_ERROR_MESSAGE);
    }
  };

  const dismissToast = (id: string) => {
    setToastMessages((current) => current.filter((message) => message.id !== id));
  };

  const resolveCurrentDragPointer = (event: DragMoveEvent | DragOverEvent | DragEndEvent) => {
    if (latestDragPointerRef.current) {
      return latestDragPointerRef.current;
    }

    const startPointer = dragStartPointerRef.current;

    if (!startPointer) {
      return null;
    }

    return {
      x: startPointer.x + event.delta.x,
      y: startPointer.y + event.delta.y,
    };
  };

  const resolveLockedDropTarget = (point: { x: number; y: number }): DesignerDropTarget | null => {
    const nextTarget = resolveDesignerDropTargetAtPoint(point);

    if (nextTarget) {
      dropTargetLockRef.current = nextTarget;
      return nextTarget.target;
    }

    const lockedTarget = dropTargetLockRef.current;

    if (
      lockedTarget &&
      isPointInsideRect(point, lockedTarget.rect, DESIGNER_DROP_TARGET_LOCK_MARGIN)
    ) {
      return lockedTarget.target;
    }

    dropTargetLockRef.current = null;
    return null;
  };

  const resolveMaterialDropProjectionAtPoint = (
    type: MaterialSpec['type'],
    currentPointer: { x: number; y: number },
    overId?: string | null,
  ) => {
    if (!pointIsInsideDesignerCanvas(currentPointer)) {
      return {
        insideCanvas: false,
        target: null,
        width: null,
      };
    }

    const overTarget = resolveDesignerDropTarget(schema, overId);
    const pointTarget = resolveLockedDropTarget(currentPointer);
    const target = resolveDesignerDropTargetForProjection({ overTarget, pointTarget });

    return {
      insideCanvas: true,
      target,
      width: resolveCanvasCardWidth(),
    };
  };

  const resolveMaterialDropProjection = (event: DragMoveEvent | DragOverEvent | DragEndEvent) => {
    const type = event.active.data.current?.type as MaterialSpec['type'] | undefined;
    const currentPointer = resolveCurrentDragPointer(event);

    if (!type || !currentPointer) {
      return null;
    }

    return resolveMaterialDropProjectionAtPoint(type, currentPointer, event.over?.id ? String(event.over.id) : null);
  };

  const applyMaterialDropProjection = (
    projection: ReturnType<typeof resolveMaterialDropProjectionAtPoint> | null,
  ) => {
    if (!projection?.insideCanvas) {
      setIsDraggingMaterialOverCanvas(false);
      setMaterialDropTarget(null);
      setMaterialOverlayWidth(null);
      return;
    }

    setIsDraggingMaterialOverCanvas(true);
    setMaterialDropTarget(projection.target);
    setMaterialOverlayWidth(projection.width);
  };

  const scheduleDesignerCanvasAutoScroll = (
    type: MaterialSpec['type'],
    point: { x: number; y: number },
  ) => {
    dragAutoScrollPointerRef.current = point;

    if (dragAutoScrollFrameRef.current) {
      return;
    }

    const runAutoScroll = () => {
      dragAutoScrollFrameRef.current = null;
      const latestPoint = dragAutoScrollPointerRef.current;

      if (!latestPoint) {
        return;
      }

      if (!scrollDesignerCanvasNearPointer(latestPoint)) {
        return;
      }

      applyMaterialDropProjection(resolveMaterialDropProjectionAtPoint(type, latestPoint));
      dragAutoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
    };

    dragAutoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
  };

  const updateMaterialDropProjection = (event: DragMoveEvent | DragOverEvent) => {
    const type = event.active.data.current?.type as MaterialSpec['type'] | undefined;
    const currentPointer = resolveCurrentDragPointer(event);

    if (!type || !currentPointer) {
      return;
    }

    const projection = resolveMaterialDropProjectionAtPoint(
      type,
      currentPointer,
      event.over?.id ? String(event.over.id) : null,
    );

    if (!projection?.insideCanvas) {
      stopDesignerCanvasAutoScroll();
      applyMaterialDropProjection(projection);
      return;
    }

    scheduleDesignerCanvasAutoScroll(type, currentPointer);
    applyMaterialDropProjection(projection);
  };

  useEffect(() => {
    if (!draggingMaterialType) {
      return undefined;
    }

    const updateProjectionFromPointer = (event: MouseEvent | PointerEvent | TouchEvent) => {
      const point = pointerCoordinatesFromDragEvent(event);

      if (!point) {
        return;
      }

      latestDragPointerRef.current = point;
      stopDragPointerProjection();
      dragPointerProjectionFrameRef.current = window.requestAnimationFrame(() => {
        dragPointerProjectionFrameRef.current = null;
        const projection = resolveMaterialDropProjectionAtPoint(draggingMaterialType, point);

        if (!projection?.insideCanvas) {
          stopDesignerCanvasAutoScroll();
          applyMaterialDropProjection(projection);
          return;
        }

        scheduleDesignerCanvasAutoScroll(draggingMaterialType, point);
        applyMaterialDropProjection(projection);
      });
    };
    const listenerOptions = { capture: true };
    const touchListenerOptions = { capture: true, passive: true };

    window.addEventListener('pointermove', updateProjectionFromPointer, listenerOptions);
    window.addEventListener('mousemove', updateProjectionFromPointer, listenerOptions);
    window.addEventListener('touchmove', updateProjectionFromPointer, touchListenerOptions);

    return () => {
      window.removeEventListener('pointermove', updateProjectionFromPointer, listenerOptions);
      window.removeEventListener('mousemove', updateProjectionFromPointer, listenerOptions);
      window.removeEventListener('touchmove', updateProjectionFromPointer, touchListenerOptions);
      stopDragPointerProjection();
    };
  }, [draggingMaterialType, schema]);

  const handleDragStart = (event: DragStartEvent) => {
    const fieldKey = event.active.data.current?.fieldKey;
    const type = event.active.data.current?.type as MaterialSpec['type'] | undefined;

    setDraggingFieldKey(typeof fieldKey === 'string' ? fieldKey : null);
    setDraggingMaterialType(type ?? null);
    setIsDraggingMaterialOverCanvas(false);
    setMaterialDropTarget(null);
    setMaterialOverlayWidth(null);
    const startPointer = pointerCoordinatesFromActivator(event.activatorEvent);
    dragStartPointerRef.current = startPointer;
    latestDragPointerRef.current = startPointer;
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
    const isFieldDrag = event.active.data.current?.kind === 'field' && typeof fieldKey === 'string';
    const fieldDropPointer = isFieldDrag ? resolveCurrentDragPointer(event) : null;
    const fieldPointTarget =
      fieldDropPointer && pointIsInsideDesignerCanvas(fieldDropPointer)
        ? resolveLockedDropTarget(fieldDropPointer)
        : null;

    resetDragState();

    if (isFieldDrag) {
      const overTarget = resolveDesignerDropTarget(schema, overId ? String(overId) : null);
      const target = fieldPointTarget ?? overTarget;

      if (target && target.beforeFieldKey !== fieldKey) {
        moveFieldToTarget(fieldKey, target);
      }
      return;
    }

    if (type && materialProjection?.insideCanvas) {
      beginMaterialDropSettling();
      addFieldAtTarget(type, materialProjection.target ?? { kind: 'root' });
      markCommittedDropField(useTemplateDesignerStore.getState().selectedFieldKey);
      return;
    }
  };

  const handleDesignerTabChange = (tabsKey: string, tabKey: string) => {
    setActiveDesignerTabByFieldKey((current) => ({
      ...current,
      [tabsKey]: tabKey,
    }));
  };

  const openNewTemplate = () => {
    autoClassificationRunRef.current += 1;
    clearDesignerCloseTimer();
    designerBaselineSnapshotRef.current = null;
    resetDesigner();
    setTemplateId(null);
    setTemplateDraftName(null);
    setTemplateNameDraftOverride(null);
    setTemplateVersion(0);
    setTemplateStatus('DRAFT');
    clearTemplateDraftReturn();
    setDesignerPreviewRawData(DESIGNER_PREVIEW_RAW_DATA);
    setDesignerPreviewRecords([]);
    setIsDesignerPreviewOpen(false);
    setIsDesignerClosing(false);
    setIsDesignerOpen(true);
  };

  const openExistingTemplate = (template: TemplateDto, options: { returnTo?: string | null } = {}) => {
    autoClassificationRunRef.current += 1;
    clearDesignerCloseTimer();
    const sourceContext = readDesignerSourceContext(template.schema);
    designerBaselineSnapshotRef.current = createDesignerDirtySnapshot({
      name: template.name,
      previewRecords: sourceContext.previewRecords,
      schema: template.schema,
      status: template.status,
    });
    setSchema(template.schema);
    setTemplateId(template.id);
    setTemplateDraftName(template.name);
    setTemplateNameDraftOverride(null);
    setTemplateVersion(template.version);
    setTemplateStatus(template.status);
    setTemplateDraftReturn(options.returnTo ?? null, options.returnTo ? 'task-template-preview' : null);
    setDesignerPreviewRawData(sourceContext.previewRecords[0] ?? DESIGNER_PREVIEW_RAW_DATA);
    setDesignerPreviewRecords([...sourceContext.previewRecords]);
    setIsDesignerPreviewOpen(false);
    setIsDesignerClosing(false);
    setIsDesignerOpen(true);
  };

  useEffect(() => {
    if (
      !routeTemplateTarget?.templateId ||
      isLoadingTemplates ||
      openedRouteTemplateIdRef.current === routeTemplateTarget.templateId
    ) {
      return;
    }

    const template = templates.find((item) => item.id === routeTemplateTarget.templateId);

    if (!template) {
      return;
    }

    openedRouteTemplateIdRef.current = routeTemplateTarget.templateId;
    openExistingTemplate(template, { returnTo: routeTemplateTarget.returnTo });
  }, [isLoadingTemplates, routeTemplateTarget, templates]);

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
    designerBaselineSnapshotRef.current = null;
    setIsDesignerOpen(false);
    setIsDesignerClosing(false);
    const loadingToastId = showToast({
      ...createInfoToast('正在分析输入文件并创建模板'),
      autoDismiss: false,
      className: 'toast--brand-blue',
      isDismissible: false,
      isLoading: true,
    });
    const applyAutoClassificationDraft = (
      classification?: AutoTemplateFieldClassificationResult | null,
    ) => {
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
    };

    void classifyTemplateFields(draft.autoClassificationRequest)
      .then((classification) => {
        if (!isMountedRef.current) {
          return;
        }

        if (autoClassificationRunRef.current !== runId) {
          dismissToast(loadingToastId);
          return;
        }

        applyAutoClassificationDraft(classification);
        dismissToast(loadingToastId);
      })
      .catch(() => {
        if (!isMountedRef.current) {
          return;
        }

        if (autoClassificationRunRef.current !== runId) {
          dismissToast(loadingToastId);
          return;
        }

        applyAutoClassificationDraft(createLocalAutoClassificationFallback(draft.autoClassificationRequest));
        dismissToast(loadingToastId);
      });
  };

  const applyTemplateDraftHandoff = (draft: TemplateDraftHandoff) => {
    clearDesignerCloseTimer();
    const previewRecords = [...(draft.previewRecords ?? [])];
    const schemaWithSourceContext = withDesignerSourceContext(draft.schema, {
      previewRecords,
      sourceFileName: draft.sourceFileName,
    });

    designerBaselineSnapshotRef.current = null;
    setSchema(schemaWithSourceContext);
    selectField(schemaWithSourceContext.fields[0]?.key ?? null);
    setTemplateId(null);
    setTemplateDraftName(draft.name);
    setTemplateVersion(0);
    setTemplateStatus('DRAFT');
    setTemplateDraftReturn(draft.returnTo ?? null, draft.returnTo ? 'task-template-draft' : null);
    setDesignerPreviewRawData(previewRecords[0] ?? DESIGNER_PREVIEW_RAW_DATA);
    setDesignerPreviewRecords(previewRecords);
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

  const clearCloseConfirmTimer = () => {
    if (!closeConfirmTimerRef.current) {
      return;
    }

    window.clearTimeout(closeConfirmTimerRef.current);
    closeConfirmTimerRef.current = null;
  };

  const closeConfirmWithAnimation = (afterClose?: () => void) => {
    if (!isCloseConfirmOpen) {
      afterClose?.();
      return;
    }

    clearCloseConfirmTimer();
    setIsCloseConfirmClosing(true);
    closeConfirmTimerRef.current = window.setTimeout(() => {
      closeConfirmTimerRef.current = null;
      setIsCloseConfirmOpen(false);
      setIsCloseConfirmClosing(false);
      afterClose?.();
    }, CLOSE_CONFIRM_ANIMATION_MS);
  };

  const clearPublishSaveAsTimer = () => {
    if (!publishSaveAsTimerRef.current) {
      return;
    }

    window.clearTimeout(publishSaveAsTimerRef.current);
    publishSaveAsTimerRef.current = null;
  };

  const closePublishSaveAsWithAnimation = (afterClose?: () => void) => {
    if (!isPublishSaveAsOpen) {
      afterClose?.();
      return;
    }

    clearPublishSaveAsTimer();
    setIsPublishSaveAsClosing(true);
    publishSaveAsTimerRef.current = window.setTimeout(() => {
      publishSaveAsTimerRef.current = null;
      setIsPublishSaveAsOpen(false);
      setIsPublishSaveAsClosing(false);
      afterClose?.();
    }, CLOSE_CONFIRM_ANIMATION_MS);
  };

  const openPublishSaveAsModal = () => {
    const defaultName = `${effectiveTemplateName} 副本`;

    clearPublishSaveAsTimer();
    setPublishSaveAsTemplateName(defaultName);
    setIsPublishSaveAsOpen(true);
    setIsPublishSaveAsClosing(false);
  };

  const requestDesignerClose = () => {
    if (isDesignerClosing || isCloseConfirmOpen || isPublishSaveAsOpen || isPublishSaveAsClosing) {
      return;
    }

    if (
      templateDraftReturnRef.current.returnTo &&
      templateDraftReturnRef.current.source === 'task-template-preview'
    ) {
      closeDesignerWithAnimation();
      return;
    }

    if (!hasDesignerContentChanges()) {
      closeDesignerWithAnimation();
      return;
    }

    clearCloseConfirmTimer();
    setIsCloseConfirmOpen(true);
    setIsCloseConfirmClosing(false);
  };

  const handleConfirmSaveDraft = async () => {
    setIsSaving(true);

    try {
      const savedDraft = await saveDraft();

      if (!savedDraft) {
        closeConfirmWithAnimation();
        return;
      }

      closeConfirmWithAnimation(closeDesignerWithAnimation);
    } catch (error) {
      closeConfirmWithAnimation();
      showErrorToast(error instanceof Error ? error.message : '草稿保存失败，请稍后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardDraft = () => {
    closeConfirmWithAnimation(closeDesignerWithAnimation);
  };

  const resetDesignerDrawerState = () => {
    resetDragState();
    designerBaselineSnapshotRef.current = null;
    clearPublishSaveAsTimer();
    setIsDesignerOpen(false);
    setIsDesignerClosing(false);
    setIsCloseConfirmOpen(false);
    setIsCloseConfirmClosing(false);
    setIsPublishSaveAsOpen(false);
    setIsPublishSaveAsClosing(false);
    setPublishSaveAsTemplateName('');
    setCommittedDropFieldKey(null);
    setIsMaterialDropSettling(false);
    clearTemplateDraftReturn();
  };

  const closeDesignerWithAnimation = () => {
    if (isDesignerClosing) {
      return;
    }

    resetDragState();
    clearDesignerCloseTimer();
    const returnTo = templateDraftReturnRef.current.returnTo;
    setIsDesignerClosing(true);
    designerCloseTimerRef.current = window.setTimeout(() => {
      designerCloseTimerRef.current = null;
      resetDesignerDrawerState();
      if (returnTo) {
        onReturnTo?.(returnTo);
      }
    }, TEMPLATE_DESIGNER_CLOSE_ANIMATION_MS);
  };

  const upsertTemplateInList = (template: TemplateDto, options: { collapseVersionChain?: boolean } = {}) => {
    setTemplates((current) => [
      template,
      ...current.filter((currentTemplate) =>
        currentTemplate.id !== template.id &&
        (!options.collapseVersionChain || !isSameTemplateVersionChain(currentTemplate, template)),
      ),
    ]);
  };

  const handleCopyTemplateRow = async (template: TemplateManagerRow) => {
    try {
      const copiedTemplate = await createTemplateDraft({
        name: `${template.name} 副本`,
        description: template.template?.description ?? undefined,
        schema: cloneTemplateSchemaForDraft(resolveTemplateSchema(template)),
        actorId: OWNER_ID,
      });

      upsertTemplateInList(copiedTemplate);
      showStatusToast('模板已复制为草稿。');
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '模板复制失败，请稍后重试。');
    }
  };

  const applySavedDesignerTemplate = (savedTemplate: TemplateDto) => {
    const savedSourceContext = readDesignerSourceContext(savedTemplate.schema);
    const nextPreviewRecords =
      savedSourceContext.previewRecords.length > 0 ? savedSourceContext.previewRecords : designerPreviewRecords;

    setTemplateId(savedTemplate.id);
    setTemplateDraftName(savedTemplate.name);
    setTemplateNameDraftOverride(null);
    setTemplateVersion(savedTemplate.version);
    setTemplateStatus(savedTemplate.status);
    setSchema(savedTemplate.schema);
    setDesignerPreviewRawData(nextPreviewRecords[0] ?? DESIGNER_PREVIEW_RAW_DATA);
    setDesignerPreviewRecords([...nextPreviewRecords]);
    designerBaselineSnapshotRef.current = createDesignerDirtySnapshot({
      name: savedTemplate.name,
      previewRecords: nextPreviewRecords,
      schema: savedTemplate.schema,
      status: savedTemplate.status,
    });
    persistDesignerDraft(savedTemplate);
    upsertTemplateInList(savedTemplate);

    return nextPreviewRecords;
  };

  const handleDeleteTemplateRow = async (template: TemplateManagerRow) => {
    if (!template.template) {
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

  const openVersionManager = (template: TemplateDto) => {
    setVersionManagerTemplate(template);
  };

  const handleTemplateSort = (field: TemplateSortField) => {
    if (templateSortField === field) {
      setTemplateSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setTemplateSortField(field);
    setTemplateSortDirection('asc');
  };

  const handleTemplateVersionRestored = (result: {
    restoredTemplate: TemplateDto;
    archivedVersions: TemplateDto[];
    message: string;
    warning?: string;
  }) => {
    const archivedVersionIds = new Set(result.archivedVersions.map((template) => template.id));

    setVersionManagerTemplate(result.restoredTemplate);
    setTemplates((current) => [
      result.restoredTemplate,
      ...current.filter(
        (template) => template.id !== result.restoredTemplate.id && !archivedVersionIds.has(template.id),
      ),
    ]);

    if (templateId === result.restoredTemplate.id || (templateId && archivedVersionIds.has(templateId))) {
      openExistingTemplate(result.restoredTemplate);
    }

    showStatusToast(result.warning ?? result.message);
    void listTemplates()
      .then(setTemplates)
      .catch(() => {
        // 恢复结果已回填，列表刷新失败时保留当前可用状态。
      });
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

  const saveDraft = async (
    options?: {
      preservePreviewReturn?: boolean;
      quiet?: boolean;
    },
  ): Promise<TemplateDto | null> => {
    const validation = validateTemplateSchema(schema);

    if (!validation.valid) {
      showErrorToast(validation.errors.map((error) => error.message).join('；'));
      return null;
    }

    const sourceContext = readDesignerSourceContext(schema);
    const draftSchema = withDesignerSourceContext(
      templateStatus === 'PUBLISHED' ? { ...schema, schemaVersion: 'draft' } : schema,
      {
        previewRecords: designerPreviewRecords,
        sourceFileName: sourceContext.sourceFileName,
      },
    );
    const draftName = resolveTemplateName(effectiveTemplateName, draftSchema);
    const savedTemplate =
      templateId && templateStatus !== 'PUBLISHED'
        ? await saveTemplateSchema(templateId, draftSchema, { name: draftName })
        : await createTemplateDraft({
            name: draftName,
            schema: draftSchema,
            ...(templateId && templateStatus === 'PUBLISHED' ? { parentTemplateId: templateId } : {}),
            actorId: OWNER_ID,
          });
    applySavedDesignerTemplate(savedTemplate);
    if (!options?.preservePreviewReturn) {
      clearTemplatePreviewReturnAfterSave();
    }

    if (!options?.quiet) {
      showStatusToast('草稿已保存。');
    }

    return savedTemplate;
  };

  const saveAsNewTemplate = async (
    options?: { preservePreviewReturn?: boolean },
  ): Promise<TemplateDto | null> => {
    const validation = validateTemplateSchema(schema);

    if (!validation.valid) {
      showErrorToast(validation.errors.map((error) => error.message).join('；'));
      return null;
    }

    const sourceContext = readDesignerSourceContext(schema);
    const draftSchema = withDesignerSourceContext(
      templateStatus === 'PUBLISHED' ? { ...schema, schemaVersion: 'draft' } : schema,
      {
        previewRecords: designerPreviewRecords,
        sourceFileName: sourceContext.sourceFileName,
      },
    );
    const draftName = resolveTemplateName(publishSaveAsTemplateName, draftSchema);
    const savedTemplate = await createTemplateDraft({
      name: draftName,
      schema: draftSchema,
      actorId: OWNER_ID,
    });

    applySavedDesignerTemplate(savedTemplate);
    if (!options?.preservePreviewReturn) {
      clearTemplatePreviewReturnAfterSave();
    }
    return savedTemplate;
  };

  const handleSelectPreviewTemplate = () => {
    const previewReturnState = templateDraftReturnRef.current;

    if (
      !activeSavedTemplate ||
      !previewReturnState.returnTo ||
      previewReturnState.source !== 'task-template-preview'
    ) {
      showErrorToast('任务抽屉状态恢复失败，请回到任务管理页后重新选择模板。');
      return;
    }

    const didUpdateReturnHandoff = updateTaskReturnHandoffTemplate(activeSavedTemplate);

    if (didUpdateReturnHandoff) {
      onReturnTo?.(previewReturnState.returnTo);
      return;
    }

    showErrorToast('任务抽屉状态恢复失败，请回到任务管理页后重新选择模板。');
  };

  const handlePublish = async () => {
    if (!hasDesignerContentChanges()) {
      if (
        activeSavedTemplate &&
        templateDraftReturnRef.current.returnTo &&
        templateDraftReturnRef.current.source === 'task-template-preview'
      ) {
        handleSelectPreviewTemplate();
        return;
      }

      showInfoToast('没有任何变更，无法保存为新的版本');
      return;
    }

    if (isPublishBlockedByUsage) {
      openPublishSaveAsModal();
      return;
    }

    setIsSaving(true);

    try {
      const publishReturnState = templateDraftReturnRef.current;
      const draft = await saveDraft({ preservePreviewReturn: true, quiet: true });

      if (!draft) {
        return;
      }

      const versionName = `v${draft.version + 1}`;
      const result = await publishTemplate(draft.id, versionName, { actorId: OWNER_ID });

      setTemplateId(result.template.id);
      setTemplateDraftName(result.template.name);
      setTemplateNameDraftOverride(null);
      setTemplateVersion(result.template.version);
      setTemplateStatus(result.template.status);
      setSchema(result.template.schema);
      const publishedSourceContext = readDesignerSourceContext(result.template.schema);
      setDesignerPreviewRawData(publishedSourceContext.previewRecords[0] ?? DESIGNER_PREVIEW_RAW_DATA);
      setDesignerPreviewRecords([...publishedSourceContext.previewRecords]);
      designerBaselineSnapshotRef.current = createDesignerDirtySnapshot({
        name: result.template.name,
        previewRecords: publishedSourceContext.previewRecords,
        schema: result.template.schema,
        status: result.template.status,
      });
      persistDesignerDraft(result.template);
      upsertTemplateInList(result.template, { collapseVersionChain: true });

      if (
        publishReturnState.returnTo &&
        (publishReturnState.source === 'task-template-draft' ||
          publishReturnState.source === 'task-template-preview')
      ) {
        const didUpdateReturnHandoff = updateTaskReturnHandoffTemplate(result.template);

        if (didUpdateReturnHandoff) {
          onReturnTo?.(publishReturnState.returnTo);
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

  const handleConfirmSaveAsNewTemplate = async () => {
    setIsSaving(true);

    try {
      const saveAsReturnState = templateDraftReturnRef.current;
      const savedTemplate = await saveAsNewTemplate({ preservePreviewReturn: true });

      if (!savedTemplate) {
        return;
      }

      if (
        saveAsReturnState.returnTo &&
        (saveAsReturnState.source === 'task-template-draft' ||
          saveAsReturnState.source === 'task-template-preview')
      ) {
        const returnTo = saveAsReturnState.returnTo;
        const didUpdateReturnHandoff = updateTaskReturnHandoffTemplate(savedTemplate);

        if (didUpdateReturnHandoff) {
          closePublishSaveAsWithAnimation(() => onReturnTo?.(returnTo));
          return;
        }

        showErrorToast('任务抽屉状态恢复失败，请回到任务管理页后重新选择模板。');
        return;
      }

      clearTemplatePreviewReturnAfterSave();
      showStatusToast('模板已另存为新模板。');
      closePublishSaveAsWithAnimation();
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '另存为新模板失败，请稍后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  const shouldSelectUnchangedPreviewTemplate = Boolean(
    activeSavedTemplate &&
      templateDraftReturnRef.current.returnTo &&
      templateDraftReturnRef.current.source === 'task-template-preview' &&
      !hasDesignerContentChanges(),
  );

  return (
    <section className="template-manager-page" aria-labelledby="owner-templates-title">
      <ToastViewport variant="banner" messages={toastMessages} onDismiss={dismissToast} />

      <div className="task-management-header">
        <div>
          <h1 id="owner-templates-title">评测模板</h1>
        </div>
        <p className="task-management-table-description">
          提供模板创建、字段配置、版本管理等核心功能，实现从配置到发布复用的全流程管理
        </p>
      </div>

      <section
        className="task-management-table-card template-manager-list template-manager-table-panel"
        aria-label="已有模板列表"
        ref={templateTableContainerRef}
      >
        <div className="task-management-table-toolbar template-manager-table-toolbar">
          <div className="task-summary-grid template-summary-grid" aria-label="模板状态筛选">
            {TEMPLATE_SUMMARY_FILTERS.map((item) => (
              <TemplateSummaryCard
                key={item.value}
                isActive={templateStatusFilter === item.value}
                label={item.label}
                status={item.value}
                value={templateStats[item.summaryKey].toString()}
                onClick={() => setTemplateStatusFilter(item.value)}
              />
            ))}
          </div>

          <div className="task-filter-bar template-manager-filter-bar" aria-label="模板筛选栏">
            <input
              aria-label="搜索模板"
              placeholder="搜索模板名称 / ID / 负责人"
              value={templateSearchKeyword}
              onChange={(event) => setTemplateSearchKeyword(event.target.value)}
            />
            <button
              type="button"
              className="primary-action create-action task-filter-bar__create template-manager-filter-bar__create"
              onClick={openNewTemplate}
            >
              新增模板
            </button>
          </div>
        </div>
        <div className="task-table-scroll template-manager-table-scroll" data-adaptive-table-viewport="true">
          <table className="task-table template-manager-table" aria-label="模板列表">
            <colgroup>
              <col className="template-manager-table__col-id" />
              <col className="template-manager-table__col-name" />
              <col className="template-manager-table__col-status" />
              <col className="template-manager-table__col-owner" />
              <col className="template-manager-table__col-created" />
              <col className="template-manager-table__col-updated" />
              <col className="template-manager-table__col-version" />
              <col className="template-manager-table__col-fields" />
              <col className="template-manager-table__col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>
                  <SortableTemplateHeader
                    field="templateId"
                    label="模板ID"
                    sortDirection={templateSortDirection}
                    sortField={templateSortField}
                    onSort={handleTemplateSort}
                  />
                </th>
                <th>模板名称</th>
                <th>状态</th>
                <th>负责人</th>
                <th>
                  <SortableTemplateHeader
                    field="createdAt"
                    label="创建时间"
                    sortDirection={templateSortDirection}
                    sortField={templateSortField}
                    onSort={handleTemplateSort}
                  />
                </th>
                <th>
                  <SortableTemplateHeader
                    field="updatedAt"
                    label="上次更改"
                    sortDirection={templateSortDirection}
                    sortField={templateSortField}
                    onSort={handleTemplateSort}
                  />
                </th>
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
                    <TemplateStatusTag label={template.status} status={template.statusFilterKey} />
                  </td>
                  <td>{template.owner}</td>
                  <td>{formatDateTimeMinute(template.createdAt)}</td>
                  <td>{formatDateTimeMinute(template.updatedAt)}</td>
                  <td>{template.version}</td>
                  <td>{template.fieldCount ?? '—'}</td>
                  <td>
                    <div className="template-manager-table__actions">
                      <button
                        className="template-manager-row-action"
                        type="button"
                        aria-label={`查看 ${template.name} 版本管理`}
                        title="版本管理"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (template.template) {
                            openVersionManager(template.template);
                          }
                        }}
                      >
                        <TemplateHistoryIcon />
                      </button>
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
                        title={
                          template.activeUsageCount > 0
                            ? '模板正在被未完成任务使用，暂不可删除'
                            : '删除'
                        }
                        disabled={template.activeUsageCount > 0}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (template.activeUsageCount > 0) {
                            return;
                          }

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
              requestDesignerClose();
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
              <div className="template-designer-topbar__title-group">
                <h1 id="template-designer-title">模板配置</h1>
                <div className="template-designer-history-actions" aria-label="编辑历史">
                  <button
                    aria-label="撤销"
                    className="template-designer-history-button"
                    disabled={!canUndo}
                    title="撤销"
                    type="button"
                    onClick={undo}
                  >
                    <TemplateUndoIcon />
                  </button>
                  <button
                    aria-label="重做"
                    className="template-designer-history-button"
                    disabled={!canRedo}
                    title="重做"
                    type="button"
                    onClick={redo}
                  >
                    <TemplateRedoIcon />
                  </button>
                </div>
              </div>
              <div className="template-designer-topbar__actions">
                {activeSavedTemplate ? (
                  <button
                    className="template-designer-version-button"
                    type="button"
                    onClick={() => openVersionManager(activeSavedTemplate)}
                  >
                    <TemplateHistoryIcon className="template-designer-version-button__icon" />
                    <span>版本管理</span>
                  </button>
                ) : null}
                <button
                  className="primary-action"
                  type="button"
                  disabled={isSaving}
                  onClick={shouldSelectUnchangedPreviewTemplate ? handleSelectPreviewTemplate : handlePublish}
                >
                  {shouldSelectUnchangedPreviewTemplate ? '选择该模板' : `保存并发布版本 ${nextVersionName}`}
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
                  isMaterialDropSettling={isMaterialDropSettling}
                  isDropHighlighted={isDraggingMaterialOverCanvas}
                  materialDropPreview={
                    draggingMaterial && isDraggingMaterialOverCanvas
                      ? { target: materialDropTarget, type: draggingMaterial.type }
                      : null
                  }
                  activeTabByFieldKey={activeDesignerTabByFieldKey}
                  onActiveTabChange={handleDesignerTabChange}
                  onTemplateNameChange={setTemplateDraftName}
                  onTemplateNameDraftChange={setTemplateNameDraftOverride}
                  onPreviewUploadedFile={() => setIsDesignerPreviewOpen(true)}
                  onSelectField={selectField}
                  onDuplicateField={duplicateField}
                  onRemoveField={removeField}
                  onAiPromptConfigChange={updateAiReviewPromptConfig}
                  onTestLlmPrompt={handleDesignerLlmPromptTest}
                  previewRecordCount={designerPreviewRecords.length}
                />
                <aside className="designer-inspector" aria-label="右侧配置面板">
                  <PropertyPanel
                    field={selectedField}
                    schemaFields={schema.fields}
                    activeTabKey={selectedField ? activeDesignerTabByFieldKey[selectedField.key] : undefined}
                    onActivateTab={(tabKey) => {
                      if (selectedField?.type === 'tabs') {
                        handleDesignerTabChange(selectedField.key, tabKey);
                      }
                    }}
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
            {isCloseConfirmOpen ? (
              <div
                className={
                  isCloseConfirmClosing
                    ? 'task-close-confirm is-closing'
                    : 'task-close-confirm'
                }
                role="dialog"
                aria-modal="true"
                aria-labelledby="template-close-confirm-title"
              >
                <div
                  className="task-close-confirm__panel"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <div className="task-close-confirm__header">
                    <h2 id="template-close-confirm-title">需要保存成草稿吗？</h2>
                    <button
                      aria-label="关闭保存草稿确认弹窗"
                      className="task-close-confirm__close"
                      disabled={isSaving}
                      type="button"
                      onClick={() => closeConfirmWithAnimation()}
                    >
                      ×
                    </button>
                  </div>
                  <p>当前修改尚未发布，关闭后将丢失未保存内容</p>
                  <div className="task-close-confirm__actions">
                    <button
                      className="task-close-confirm__cancel"
                      type="button"
                      disabled={isSaving}
                      onClick={handleDiscardDraft}
                    >
                      取消
                    </button>
                    <button
                      className="task-close-confirm__save"
                      type="button"
                      disabled={isSaving}
                      onClick={() => void handleConfirmSaveDraft()}
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {isPublishSaveAsOpen ? (
              <div
                className={
                  isPublishSaveAsClosing
                    ? 'task-close-confirm template-publish-save-as-confirm is-closing'
                    : 'task-close-confirm template-publish-save-as-confirm'
                }
                role="dialog"
                aria-modal="true"
                aria-labelledby="template-publish-save-as-title"
                aria-describedby="template-publish-save-as-description"
                onMouseDown={(event) => {
                  if (!isSaving && event.target === event.currentTarget) {
                    closePublishSaveAsWithAnimation();
                  }
                }}
              >
                <div className="task-close-confirm__panel" onMouseDown={(event) => event.stopPropagation()}>
                  <div className="task-close-confirm__header">
                    <h2 id="template-publish-save-as-title">模板正在使用中</h2>
                    <button
                      aria-label="关闭另存为新模板弹窗"
                      className="task-close-confirm__close"
                      disabled={isSaving}
                      type="button"
                      onClick={() => closePublishSaveAsWithAnimation()}
                    >
                      ×
                    </button>
                  </div>
                  <p id="template-publish-save-as-description">
                    该模板当前正在被未完成任务使用，不能直接发布新版本。请先修改模板名后，另存为一个新模板继续编辑。
                  </p>
                  <label className="template-publish-save-as__field">
                    <span>模板名称</span>
                    <input
                      aria-label="模板名称"
                      disabled={isSaving}
                      placeholder="请输入新模板名称"
                      value={publishSaveAsTemplateName}
                      onChange={(event) => setPublishSaveAsTemplateName(event.target.value)}
                    />
                  </label>
                  <div className="task-close-confirm__actions">
                    <button
                      className="task-close-confirm__cancel"
                      type="button"
                      disabled={isSaving}
                      onClick={() => closePublishSaveAsWithAnimation()}
                    >
                      取消
                    </button>
                    <button
                      className="task-close-confirm__save"
                      type="button"
                      disabled={isSaving}
                      onClick={() => void handleConfirmSaveAsNewTemplate()}
                    >
                      另存为新模板
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
          ,
          document.body,
        )
        : null}
      {isDesignerPreviewOpen
        ? createPortal(
            <DatasetPreviewModal
              title="预览已上传文件"
              description={`共 ${designerPreviewRecords.length.toLocaleString()} 条样例`}
              items={createDesignerPreviewItems(designerPreviewRecords, schema.datasetKind)}
              isLoading={false}
              errorMessage={null}
              showItemMeta={false}
              onClose={() => setIsDesignerPreviewOpen(false)}
            />,
            document.body,
          )
        : null}
      {versionManagerTemplate && dragOverlayPortalTarget
        ? createPortal(
          <TemplateVersionManagerModal
            template={versionManagerTemplate}
            onClose={() => setVersionManagerTemplate(null)}
            onRestored={handleTemplateVersionRestored}
          />,
          dragOverlayPortalTarget,
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

const parseTemplateSortTimestamp = (value: string): number => {
  const parsed = Date.parse(value);

  return Number.isNaN(parsed) ? 0 : parsed;
};

const parseTemplateSortIdNumber = (value: string): number | null => {
  const numericPart = value.match(/\d+/g)?.at(-1);

  if (!numericPart) {
    return null;
  }

  const parsed = Number.parseInt(numericPart, 10);

  return Number.isNaN(parsed) ? null : parsed;
};

const compareTemplateRowsBySortField = (
  left: TemplateManagerRow,
  right: TemplateManagerRow,
  field: TemplateSortField,
): number => {
  switch (field) {
    case 'templateId': {
      const leftIdNumber = parseTemplateSortIdNumber(left.id);
      const rightIdNumber = parseTemplateSortIdNumber(right.id);

      if (leftIdNumber !== null && rightIdNumber !== null && leftIdNumber !== rightIdNumber) {
        return leftIdNumber - rightIdNumber;
      }

      return left.id.localeCompare(right.id);
    }
    case 'createdAt':
      return parseTemplateSortTimestamp(left.createdAt) - parseTemplateSortTimestamp(right.createdAt);
    case 'updatedAt':
      return parseTemplateSortTimestamp(left.updatedAt) - parseTemplateSortTimestamp(right.updatedAt);
    default:
      return left.rawId.localeCompare(right.rawId);
  }
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

const TemplateSummaryCard = ({
  isActive,
  label,
  onClick,
  status,
  value,
}: {
  isActive: boolean;
  label: string;
  onClick: () => void;
  status: TemplateStatusFilter;
  value: string;
}) => (
  <button
    className={[
      'task-summary-card',
      status === 'ALL' ? 'task-summary-card--total' : '',
      status === 'DRAFT' ? 'task-summary-card--draft' : '',
      status === 'PUBLISHED' ? 'task-summary-card--done' : '',
      status === 'ARCHIVED' ? 'task-summary-card--paused' : '',
      isActive ? 'is-active' : '',
    ].filter(Boolean).join(' ')}
    type="button"
    aria-pressed={isActive}
    onClick={onClick}
  >
    <span>{label}</span>
    <strong>{value}</strong>
  </button>
);

type TemplateStatusTagStyle = {
  '--status-bg-color': string;
  '--status-dot-color': string;
  '--status-text-color': string;
};

const templateStatusTagStyles = {
  DRAFT: {
    '--status-dot-color': '#64748B',
    '--status-text-color': '#64748B',
    '--status-bg-color': '#F3F4F6',
  },
  PUBLISHED: {
    '--status-dot-color': '#0FB86B',
    '--status-text-color': '#0FB86B',
    '--status-bg-color': '#E8F7EF',
  },
  ARCHIVED: {
    '--status-dot-color': '#D97706',
    '--status-text-color': '#D97706',
    '--status-bg-color': '#FFF7E6',
  },
} satisfies Record<TemplateDto['status'], TemplateStatusTagStyle>;

const TemplateStatusTag = ({
  label,
  status,
}: {
  label: string;
  status: TemplateDto['status'];
}) => (
  <span
    className="status-tag status-tag--sm status-tag--task template-manager-status-tag"
    data-status={status}
    style={templateStatusTagStyles[status] as CSSProperties}
  >
    <span className="status-tag__dot" aria-hidden="true" />
    {label}
  </span>
);

const cloneTemplateSchemaForDraft = (schema: LabelHubSchema): LabelHubSchema => {
  const clonedSchema = JSON.parse(JSON.stringify(schema)) as LabelHubSchema;

  return {
    ...clonedSchema,
    schemaVersion: 'draft',
  };
};

const TemplateHistoryIcon = ({ className = 'template-manager-row-action__icon' }: { className?: string }) => (
  <img aria-hidden="true" alt="" className={className} src={versionIcon} />
);

const SortableTemplateHeader = ({
  field,
  label,
  sortDirection,
  sortField,
  onSort,
}: {
  field: TemplateSortField;
  label: string;
  sortDirection: TemplateSortDirection;
  sortField: TemplateSortField | null;
  onSort: (field: TemplateSortField) => void;
}) => {
  const isActive = sortField === field;
  const icon = isActive ? (sortDirection === 'asc' ? '↑' : '↓') : '⇅';

  return (
    <button
      aria-label={`按${label}排序`}
      aria-pressed={isActive}
      className={`template-manager-table__sortable-header${isActive ? ' is-active' : ''}`}
      type="button"
      onClick={() => onSort(field)}
    >
      <span>{label}</span>
      <span aria-hidden="true" className="template-manager-table__sort-icon">
        {icon}
      </span>
    </button>
  );
};

const TemplateUndoIcon = () => (
  <svg
    aria-hidden="true"
    className="template-designer-history-button__icon"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M9.25 7.25 5.5 11l3.75 3.75M6 11h7.25c3.04 0 5.25 1.78 5.25 4.5 0 1.27-.49 2.34-1.31 3.11"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);

const TemplateRedoIcon = () => (
  <svg
    aria-hidden="true"
    className="template-designer-history-button__icon"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="m14.75 7.25 3.75 3.75-3.75 3.75M18 11h-7.25c-3.04 0-5.25 1.78-5.25 4.5 0 1.27.49 2.34 1.31 3.11"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);

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

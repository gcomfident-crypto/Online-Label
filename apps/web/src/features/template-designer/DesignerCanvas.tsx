import { useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';

import {
  compileAiReviewPrompt,
  type AiReviewPromptConfig,
  type AiReviewPromptSectionKey,
  type AiReviewPromptSectionOverrides,
  type CompiledAiReviewPrompt,
  type LabelHubSchema,
  type SchemaField,
} from '@labelhub/shared';

import eyeIcon from '../../assets/eye.svg';
import shotEyesIcon from '../../assets/shoteyes.svg';
import starIcon from '../../assets/star.svg';
import { SchemaRenderer } from '../schema-renderer';
import { ShowItemField } from '../schema-renderer/fields/ShowItemField';
import {
  designerGroupDropId,
  designerTabDropId,
  type DesignerDropTarget,
} from './templateStore';

type MaterialDropPreview = {
  target: DesignerDropTarget | null;
  type: SchemaField['type'];
};

type DesignerContainerTarget =
  | { kind: 'root' }
  | { kind: 'group'; groupKey: string }
  | { kind: 'tab'; tabsKey: string; tabKey: string };

type DesignerCanvasProps = {
  schema: LabelHubSchema;
  templateName?: string;
  previewRawData?: Record<string, unknown>;
  selectedFieldKey: string | null;
  committingFieldKey?: string | null;
  isMaterialDropSettling?: boolean;
  isDropHighlighted?: boolean;
  materialDropPreview?: MaterialDropPreview | null;
  activeTabByFieldKey?: Readonly<Record<string, string>>;
  onActiveTabChange?: (tabsKey: string, tabKey: string) => void;
  onTemplateNameChange?: (name: string) => void;
  onPreviewUploadedFile?: () => void;
  onAiPromptConfigChange?: (config: AiReviewPromptConfig | undefined) => void;
  onTestLlmPrompt?: (field: SchemaField) => Promise<void> | void;
  onSelectField: (fieldKey: string) => void;
  onDuplicateField: (fieldKey: string) => void;
  onRemoveField: (fieldKey: string) => void;
  previewRecordCount?: number;
};

const FIELD_TYPE_LABELS: Record<SchemaField['type'], string> = {
  show_item: '展示项 ShowItem',
  text: '单行输入',
  textarea: '多行文本',
  radio: '单选',
  checkbox: '多选',
  tag_select: '标签选择',
  rich_text: '富文本',
  file_upload: '文件上传',
  image_upload: '图片上传',
  json_editor: 'JSON 编辑器',
  llm_assist: 'LLM 触发组件',
  group: '分组容器',
  tabs: '多 Tab 布局',
};

const isParsedAnnotationField = (field: SchemaField): boolean =>
  field.type !== 'show_item' && Boolean(field.sourceKey);

const formatFieldTypeTitle = (field: SchemaField): string => {
  const materialName = FIELD_TYPE_LABELS[field.type];

  if (field.type === 'group' || field.type === 'tabs') {
    return `${materialName} - ${field.label}`;
  }

  return isParsedAnnotationField(field) ? `${materialName} - ${field.label}` : materialName;
};

const isRequiredField = (field: SchemaField): boolean =>
  Boolean(field.required || field.validation?.required);

const formatFieldDescription = (field: SchemaField): string => {
  if (typeof field.description !== 'string') {
    return '';
  }

  return field.description.trim().slice(0, 20);
};

const SORTABLE_FIELD_TRANSITION = {
  duration: 520,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
};

const FIELD_REMOVE_ANIMATION_MS = 320;
const FIELD_LAYOUT_SHIFT_ANIMATION_MS = 360;
const EMPTY_FIELD_KEY_SET = new Set<string>();
const EMPTY_VALIDATION_MESSAGES_BY_FIELD = new Map<string, readonly string[]>();
const EMPTY_CANVAS_PREVIEW_RAW_DATA: Record<string, unknown> = {};

const normalizeAiPromptConfig = (
  config: AiReviewPromptConfig | undefined,
): AiReviewPromptConfig | undefined => {
  const sectionOverrides = Object.entries(config?.sectionOverrides ?? {}).reduce<AiReviewPromptSectionOverrides>(
    (nextOverrides, [key, value]) => {
      if (typeof value === 'string' && value.trim().length > 0) {
        nextOverrides[key as AiReviewPromptSectionKey] = value;
      }

      return nextOverrides;
    },
    {},
  );
  const nextConfig: AiReviewPromptConfig = {};

  if (Object.keys(sectionOverrides).length > 0) {
    nextConfig.sectionOverrides = sectionOverrides;
  }

  if (config?.fullPromptOverride?.trim()) {
    nextConfig.fullPromptOverride = config.fullPromptOverride;
  }

  return nextConfig.sectionOverrides || nextConfig.fullPromptOverride ? nextConfig : undefined;
};

const rootContainerTarget: DesignerContainerTarget = { kind: 'root' };

const isSameContainerTarget = (
  left: DesignerDropTarget | null | undefined,
  right: DesignerContainerTarget,
): boolean => {
  if (!left || left.kind !== right.kind) {
    return false;
  }

  switch (right.kind) {
    case 'group':
      return left.kind === 'group' && left.groupKey === right.groupKey;
    case 'tab':
      return left.kind === 'tab' && left.tabsKey === right.tabsKey && left.tabKey === right.tabKey;
    default:
      return left.kind === 'root';
  }
};

const shouldRenderPreviewBeforeField = (
  preview: MaterialDropPreview | null,
  container: DesignerContainerTarget,
  fieldKey: string,
): boolean =>
  Boolean(
    preview &&
      preview.target?.beforeFieldKey === fieldKey &&
      isSameContainerTarget(preview.target, container),
  );

const shouldRenderAppendPreview = (
  preview: MaterialDropPreview | null,
  container: DesignerContainerTarget,
): boolean =>
  Boolean(
    preview &&
      preview.target &&
      !preview.target.beforeFieldKey &&
      isSameContainerTarget(preview.target, container),
  );

const isContainerDropHighlighted = (
  preview: MaterialDropPreview | null,
  container: DesignerContainerTarget,
): boolean => Boolean(preview && isSameContainerTarget(preview.target, container));

const resolveDropMarkerTypeBeforeField = (
  preview: MaterialDropPreview | null,
  container: DesignerContainerTarget,
  fieldKey: string,
): SchemaField['type'] | null =>
  shouldRenderPreviewBeforeField(preview, container, fieldKey) ? preview!.type : null;

const chunkFields = (fields: readonly SchemaField[], size = 3): SchemaField[][] => {
  const chunks: SchemaField[][] = [];

  for (let index = 0; index < fields.length; index += size) {
    chunks.push(fields.slice(index, index + size));
  }

  return chunks;
};

const autoRowClassBySize = (size: number): string => {
  if (size >= 3) {
    return 'designer-field-card__tab-row--3';
  }

  return size === 2 ? 'designer-field-card__tab-row--2' : 'designer-field-card__tab-row--1';
};

type FieldLayoutSnapshot = {
  element: HTMLElement;
  rect: DOMRect;
};

const shouldReduceMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const measureTopLevelFieldLayouts = (canvas: HTMLElement | null): Map<string, FieldLayoutSnapshot> => {
  const layouts = new Map<string, FieldLayoutSnapshot>();

  if (!canvas) {
    return layouts;
  }

  canvas
    .querySelectorAll<HTMLElement>(
      '.designer-canvas__fields > .designer-field-card[data-designer-field-key]',
    )
    .forEach((element) => {
      const fieldKey = element.dataset.designerFieldKey;

      if (!fieldKey || element.classList.contains('is-dragging')) {
        return;
      }

      layouts.set(fieldKey, {
        element,
        rect: element.getBoundingClientRect(),
      });
    });

  return layouts;
};

const formatFieldKeySignature = (fieldKeys: readonly string[]): string => fieldKeys.join('\u001f');

const formatTranslate = (x: number, y: number) =>
  `translate(${Math.round(x)}px, ${Math.round(y)}px)`;

const SortHandleIcon = () => (
  <>
    {Array.from({ length: 6 }).map((_, index) => (
      <span key={index} className="designer-field-card__sort-dot" aria-hidden="true" />
    ))}
  </>
);

export const DesignerCanvas = ({
  schema,
  templateName = '自定义模板',
  previewRawData,
  selectedFieldKey,
  committingFieldKey = null,
  isMaterialDropSettling = false,
  isDropHighlighted = false,
  materialDropPreview = null,
  activeTabByFieldKey = {},
  onActiveTabChange = () => undefined,
  onTemplateNameChange = () => undefined,
  onPreviewUploadedFile,
  onAiPromptConfigChange = () => undefined,
  onTestLlmPrompt,
  onSelectField,
  onDuplicateField,
  onRemoveField,
  previewRecordCount = 0,
}: DesignerCanvasProps) => {
  const { setNodeRef } = useDroppable({ id: 'designer-canvas' });
  const canvasRef = useRef<HTMLElement | null>(null);
  const previousDropPreviewRef = useRef<MaterialDropPreview | null>(null);
  const previousFieldLayoutsRef = useRef<Map<string, FieldLayoutSnapshot>>(new Map());
  const previousFieldKeySignatureRef = useRef<string | null>(null);
  const layoutAnimationsRef = useRef(new Map<string, Animation>());
  const removingFieldTimersRef = useRef(new Map<string, number>());
  const templateNameInputRef = useRef<HTMLInputElement | null>(null);
  const templateNameEditBaseRef = useRef(templateName);
  const skipTemplateNameBlurCommitRef = useRef(false);
  const [exitingDropPreview, setExitingDropPreview] = useState<MaterialDropPreview | null>(null);
  const [removingFieldKeys, setRemovingFieldKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [isTemplateNameEditing, setIsTemplateNameEditing] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState(templateName);
  const [isLabelerPreviewActive, setIsLabelerPreviewActive] = useState(false);
  const [isAiPromptPreviewActive, setIsAiPromptPreviewActive] = useState(false);
  const [labelerPreviewAnswers, setLabelerPreviewAnswers] = useState<Record<string, unknown>>({});
  const [activeLabelerPreviewFieldKey, setActiveLabelerPreviewFieldKey] = useState<string | null>(null);
  const fieldKeys = useMemo(() => schema.fields.map((field) => field.key), [schema.fields]);
  const canvasPreviewRawData = previewRawData ?? EMPTY_CANVAS_PREVIEW_RAW_DATA;
  const compiledAiReviewPrompt = useMemo(
    () =>
      compileAiReviewPrompt({
        schema,
        rawData: canvasPreviewRawData,
        answers: labelerPreviewAnswers,
      }),
    [canvasPreviewRawData, labelerPreviewAnswers, schema],
  );
  const activeDropPreview = materialDropPreview ?? exitingDropPreview;
  const isDropPreviewExiting = !materialDropPreview && Boolean(exitingDropPreview);
  const isResolvingMaterialDropPreview = !materialDropPreview && previousDropPreviewRef.current !== null;
  const shouldSuspendFieldLayoutMotion =
    isDropHighlighted ||
    Boolean(activeDropPreview) ||
    Boolean(committingFieldKey) ||
    isMaterialDropSettling ||
    isResolvingMaterialDropPreview;
  const shouldAppendPreview = shouldRenderAppendPreview(activeDropPreview, rootContainerTarget);
  const shouldShowUploadedFilePreview = previewRecordCount > 0 && Boolean(onPreviewUploadedFile);
  const shouldShowLabelerPreview = previewRecordCount > 0;
  const shouldShowAiPromptPreview = schema.fields.length > 0;
  const shouldShowUploadedFileToolbar = previewRecordCount > 0;
  const setCanvasNode = (node: HTMLElement | null) => {
    canvasRef.current = node;
    setNodeRef(node);
  };

  useEffect(() => {
    if (!isTemplateNameEditing) {
      return;
    }

    const focusInput = () => {
      const input = templateNameInputRef.current;

      if (!input) {
        return;
      }

      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    };

    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(focusInput);
    } else {
      focusInput();
    }
  }, [isTemplateNameEditing]);

  useEffect(() => {
    if (!isTemplateNameEditing) {
      setTemplateNameDraft(templateName);
    }
  }, [isTemplateNameEditing, templateName]);

  useEffect(() => {
    setLabelerPreviewAnswers({});
    setActiveLabelerPreviewFieldKey(null);
  }, [canvasPreviewRawData, schema]);

  useEffect(() => {
    if (schema.fields.length === 0) {
      setIsAiPromptPreviewActive(false);
      setIsLabelerPreviewActive(false);
    }
  }, [schema.fields.length]);

  useLayoutEffect(() => {
    const nextLayouts = measureTopLevelFieldLayouts(canvasRef.current);
    const previousLayouts = previousFieldLayoutsRef.current;
    const nextFieldKeySignature = formatFieldKeySignature(fieldKeys);
    const shouldAnimateStructuralLayoutShift =
      previousFieldKeySignatureRef.current !== null &&
      previousFieldKeySignatureRef.current !== nextFieldKeySignature;

    if (shouldSuspendFieldLayoutMotion) {
      layoutAnimationsRef.current.forEach((animation) => animation.cancel());
      layoutAnimationsRef.current.clear();
      previousFieldLayoutsRef.current = nextLayouts;
      previousFieldKeySignatureRef.current = nextFieldKeySignature;
      return;
    }

    if (!shouldAnimateStructuralLayoutShift) {
      layoutAnimationsRef.current.forEach((animation) => animation.cancel());
      layoutAnimationsRef.current.clear();
      previousFieldLayoutsRef.current = nextLayouts;
      previousFieldKeySignatureRef.current = nextFieldKeySignature;
      return;
    }

    if (!shouldReduceMotion()) {
      nextLayouts.forEach(({ element, rect }, fieldKey) => {
        if (removingFieldKeys.has(fieldKey)) {
          return;
        }

        const previous = previousLayouts.get(fieldKey);

        if (!previous) {
          return;
        }

        const deltaY = previous.rect.top - rect.top;

        if (Math.abs(deltaY) < 0.5) {
          return;
        }

        if (typeof element.animate !== 'function') {
          return;
        }

        layoutAnimationsRef.current.get(fieldKey)?.cancel();

        const animation = element.animate(
          [{ transform: formatTranslate(0, deltaY) }, { transform: 'translate(0, 0)' }],
          {
            duration: FIELD_LAYOUT_SHIFT_ANIMATION_MS,
            easing: SORTABLE_FIELD_TRANSITION.easing,
          },
        );

        layoutAnimationsRef.current.set(fieldKey, animation);
        void animation.finished
          .catch(() => undefined)
          .then(() => {
            if (layoutAnimationsRef.current.get(fieldKey) === animation) {
              layoutAnimationsRef.current.delete(fieldKey);
            }
          });
      });
    }

    previousFieldLayoutsRef.current = nextLayouts;
    previousFieldKeySignatureRef.current = nextFieldKeySignature;
  });

  useEffect(() => {
    if (materialDropPreview) {
      previousDropPreviewRef.current = materialDropPreview;
      setExitingDropPreview(null);
      return;
    }

    if (!previousDropPreviewRef.current) {
      return;
    }

    setExitingDropPreview(previousDropPreviewRef.current);
    previousDropPreviewRef.current = null;

    const timer = window.setTimeout(() => setExitingDropPreview(null), 360);

    return () => window.clearTimeout(timer);
  }, [materialDropPreview]);

  useEffect(() => {
    return () => {
      removingFieldTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      removingFieldTimersRef.current.clear();
      layoutAnimationsRef.current.forEach((animation) => animation.cancel());
      layoutAnimationsRef.current.clear();
    };
  }, []);

  const handleRemoveField = (fieldKey: string) => {
    if (removingFieldTimersRef.current.has(fieldKey)) {
      return;
    }

    setRemovingFieldKeys((current) => {
      const next = new Set(current);
      next.add(fieldKey);
      return next;
    });

    const timer = window.setTimeout(() => {
      removingFieldTimersRef.current.delete(fieldKey);
      onRemoveField(fieldKey);
      setRemovingFieldKeys((current) => {
        const next = new Set(current);
        next.delete(fieldKey);
        return next;
      });
    }, FIELD_REMOVE_ANIMATION_MS);

    removingFieldTimersRef.current.set(fieldKey, timer);
  };

  const startTemplateNameEditing = () => {
    templateNameEditBaseRef.current = templateName;
    skipTemplateNameBlurCommitRef.current = false;
    setTemplateNameDraft(templateName);
    setIsTemplateNameEditing(true);
  };

  const commitTemplateNameEditing = () => {
    const nextName = templateNameDraft.trim();
    const committedName = nextName || templateNameEditBaseRef.current;

    setTemplateNameDraft(committedName);

    if (committedName !== templateName) {
      onTemplateNameChange(committedName);
    }

    setIsTemplateNameEditing(false);
    skipTemplateNameBlurCommitRef.current = false;
  };

  const cancelTemplateNameEditing = () => {
    skipTemplateNameBlurCommitRef.current = true;
    setTemplateNameDraft(templateNameEditBaseRef.current);
    setIsTemplateNameEditing(false);

    window.setTimeout(() => {
      skipTemplateNameBlurCommitRef.current = false;
    }, 0);
  };

  const handleTemplateNameBlur = () => {
    if (skipTemplateNameBlurCommitRef.current) {
      skipTemplateNameBlurCommitRef.current = false;
      return;
    }

    commitTemplateNameEditing();
  };

  const handleTemplateNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitTemplateNameEditing();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelTemplateNameEditing();
    }
  };

  const toggleLabelerPreview = () => {
    setIsLabelerPreviewActive((current) => {
      const next = !current;

      if (next) {
        setIsAiPromptPreviewActive(false);
      }

      return next;
    });
  };

  const toggleAiPromptPreview = () => {
    setIsAiPromptPreviewActive((current) => {
      const next = !current;

      if (next) {
        setIsLabelerPreviewActive(false);
      }

      return next;
    });
  };

  const handleAiPromptSectionChange = (sectionKey: AiReviewPromptSectionKey, content: string) => {
    onAiPromptConfigChange(
      normalizeAiPromptConfig({
        ...(schema.aiReviewPrompt ?? {}),
        sectionOverrides: {
          ...(schema.aiReviewPrompt?.sectionOverrides ?? {}),
          [sectionKey]: content,
        },
      }),
    );
  };

  const handleAiPromptFullPromptChange = (content: string) => {
    const nextConfig: AiReviewPromptConfig = {
      fullPromptOverride: content,
    };

    if (schema.aiReviewPrompt?.sectionOverrides) {
      nextConfig.sectionOverrides = schema.aiReviewPrompt.sectionOverrides;
    }

    onAiPromptConfigChange(normalizeAiPromptConfig(nextConfig));
  };

  return (
    <section
      className={isDropHighlighted ? 'designer-canvas-shell is-over' : 'designer-canvas-shell'}
      aria-label="模板编辑区域"
      role="main"
    >
      {shouldShowUploadedFileToolbar ? (
        <div className="designer-canvas__toolbar" aria-label="上传文件操作栏">
          <div className="designer-canvas__toolbar-group">
            {shouldShowUploadedFilePreview ? (
              <button
                className="designer-canvas__uploaded-preview"
                type="button"
                aria-label="预览已上传文件"
                onClick={onPreviewUploadedFile}
              >
                <span>预览已上传文件</span>
              </button>
            ) : null}
          </div>
          <div className="designer-canvas__toolbar-group designer-canvas__toolbar-group--right">
            {shouldShowAiPromptPreview ? (
              <button
                className={
                  isAiPromptPreviewActive
                    ? 'designer-canvas__uploaded-preview designer-canvas__ai-prompt-preview is-active'
                    : 'designer-canvas__uploaded-preview designer-canvas__ai-prompt-preview'
                }
                type="button"
                aria-label={isAiPromptPreviewActive ? '退出 AI Prompt 预览' : '查看 AI Prompt'}
                aria-pressed={isAiPromptPreviewActive}
                onClick={toggleAiPromptPreview}
              >
                <span>{isAiPromptPreviewActive ? '退出 Prompt' : '查看 AI Prompt'}</span>
              </button>
            ) : null}
            {shouldShowLabelerPreview ? (
              <button
                className={
                  isLabelerPreviewActive
                    ? 'designer-canvas__uploaded-preview designer-canvas__labeler-preview is-active'
                    : 'designer-canvas__uploaded-preview designer-canvas__labeler-preview'
                }
                type="button"
                aria-label={isLabelerPreviewActive ? '退出 Labeler 标注预览' : '预览 Labeler 标注效果'}
                aria-pressed={isLabelerPreviewActive}
                onClick={toggleLabelerPreview}
              >
                <span>{isLabelerPreviewActive ? '退出预览' : '预览模板'}</span>
                <img
                  key={isLabelerPreviewActive ? 'shoteyes' : 'eye'}
                  className="designer-canvas__uploaded-preview-icon designer-canvas__labeler-preview-icon"
                  src={isLabelerPreviewActive ? shotEyesIcon : eyeIcon}
                  data-preview-icon={isLabelerPreviewActive ? 'closed' : 'open'}
                  alt=""
                  aria-hidden="true"
                />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        ref={setCanvasNode}
        data-designer-drop-target-kind="root"
        className={[
          'designer-canvas',
          isDropHighlighted ? 'is-over' : '',
          isLabelerPreviewActive ? 'is-previewing-labeler' : '',
          isAiPromptPreviewActive ? 'is-previewing-ai-prompt' : '',
        ].filter(Boolean).join(' ')}
        aria-label="模板画布"
      >
        <div className="designer-canvas__header">
          <div
            className={
              isTemplateNameEditing
                ? 'designer-canvas__template-name is-editing'
                : 'designer-canvas__template-name'
            }
          >
            {isTemplateNameEditing ? (
              <input
                ref={templateNameInputRef}
                className="designer-canvas__template-name-input"
                aria-label="模板名称"
                type="text"
                value={templateNameDraft}
                placeholder="请输入模板名称"
                onBlur={handleTemplateNameBlur}
                onChange={(event) => setTemplateNameDraft(event.target.value)}
                onKeyDown={handleTemplateNameKeyDown}
              />
            ) : (
              <button
                type="button"
                className="designer-canvas__template-name-trigger"
                aria-label="编辑模板名称"
                title={templateName}
                onClick={startTemplateNameEditing}
              >
                <span className="designer-canvas__template-name-text">{templateName}</span>
                <TemplateNameEditIcon />
              </button>
            )}
          </div>
          <div className="designer-canvas__header-meta">
            <span>{schema.fields.length} 个字段</span>
            {shouldShowAiPromptPreview && !shouldShowUploadedFileToolbar ? (
              <button
                className={
                  isAiPromptPreviewActive
                    ? 'designer-canvas__uploaded-preview designer-canvas__ai-prompt-preview is-active'
                    : 'designer-canvas__uploaded-preview designer-canvas__ai-prompt-preview'
                }
                type="button"
                aria-label={isAiPromptPreviewActive ? '退出 AI Prompt 预览' : '查看 AI Prompt'}
                aria-pressed={isAiPromptPreviewActive}
                onClick={toggleAiPromptPreview}
              >
                <span>{isAiPromptPreviewActive ? '退出 Prompt' : '查看 AI Prompt'}</span>
              </button>
            ) : null}
          </div>
        </div>
        {isAiPromptPreviewActive ? (
          <AiPromptPreviewPanel
            compiledPrompt={compiledAiReviewPrompt}
            promptConfig={schema.aiReviewPrompt}
            onFullPromptChange={handleAiPromptFullPromptChange}
            onSectionChange={handleAiPromptSectionChange}
          />
        ) : isLabelerPreviewActive ? (
          <section
            className="annotation-canvas-scroll designer-canvas__labeler-preview-surface"
            aria-label="Labeler 标注预览"
            role="region"
          >
            <SchemaRenderer
              schema={schema}
              rawData={canvasPreviewRawData}
              value={labelerPreviewAnswers}
              mode="answer"
              onChange={setLabelerPreviewAnswers}
              activeFieldKey={activeLabelerPreviewFieldKey}
              onActiveFieldChange={setActiveLabelerPreviewFieldKey}
            />
          </section>
        ) : schema.fields.length === 0 ? (
          <div className="designer-canvas__empty" data-designer-drop-target-kind="root">
            拖入此处新增字段
            {shouldAppendPreview && activeDropPreview ? (
              <DesignerDropInsertionMarker
                type={activeDropPreview.type}
                isExiting={isDropPreviewExiting}
                placement="append"
              />
            ) : null}
          </div>
        ) : (
          <div className="designer-canvas__fields" data-designer-drop-target-kind="root">
            <SortableContext items={fieldKeys} strategy={verticalListSortingStrategy}>
              {schema.fields.map((field) => (
                <SortableDesignerFieldCard
                  datasetKind={schema.datasetKind}
                  key={field.key}
                  field={field}
                  activeTabByFieldKey={activeTabByFieldKey}
                  dropMarkerType={resolveDropMarkerTypeBeforeField(
                    activeDropPreview,
                    rootContainerTarget,
                    field.key,
                  )}
                  isDropCommitting={committingFieldKey === field.key}
                  isDropMarkerExiting={isDropPreviewExiting}
                  materialDropPreview={activeDropPreview}
                  suspendLayoutAnimation={shouldSuspendFieldLayoutMotion}
                  removingFieldKeys={removingFieldKeys}
                  selectedFieldKey={selectedFieldKey}
                  onActiveTabChange={onActiveTabChange}
                  onSelectField={onSelectField}
                  onDuplicateField={onDuplicateField}
                  onRemoveField={handleRemoveField}
                  onTestLlmPrompt={onTestLlmPrompt}
                  previewRawData={canvasPreviewRawData}
                />
              ))}
              {shouldAppendPreview && activeDropPreview ? (
                <DesignerDropInsertionMarker
                  type={activeDropPreview.type}
                  isExiting={isDropPreviewExiting}
                  placement="append"
                />
              ) : null}
            </SortableContext>
          </div>
        )}
      </div>
    </section>
  );
};

const DesignerDropInsertionMarker = ({
  isExiting,
  placement,
  type,
}: {
  isExiting?: boolean;
  placement: 'append' | 'before';
  type: SchemaField['type'];
}) => (
  <div
    className={
      isExiting
        ? `designer-drop-insertion-marker designer-drop-insertion-marker--${placement} is-exiting`
        : `designer-drop-insertion-marker designer-drop-insertion-marker--${placement}`
    }
    aria-hidden="true"
  >
    <span className="designer-drop-insertion-marker__line" />
    <span className="designer-drop-insertion-marker__label">松手添加 {FIELD_TYPE_LABELS[type]}</span>
  </div>
);

const SortableDesignerFieldCard = ({
  datasetKind,
  field,
  activeTabByFieldKey,
  dropMarkerType,
  isDropCommitting,
  isDropMarkerExiting,
  materialDropPreview,
  suspendLayoutAnimation,
  removingFieldKeys,
  selectedFieldKey,
  onActiveTabChange,
  onSelectField,
  onDuplicateField,
  onRemoveField,
  onTestLlmPrompt,
  previewRawData,
}: {
  datasetKind: LabelHubSchema['datasetKind'];
  field: SchemaField;
  activeTabByFieldKey: Readonly<Record<string, string>>;
  dropMarkerType?: SchemaField['type'] | null;
  isDropCommitting?: boolean;
  isDropMarkerExiting?: boolean;
  materialDropPreview: MaterialDropPreview | null;
  suspendLayoutAnimation?: boolean;
  removingFieldKeys: ReadonlySet<string>;
  selectedFieldKey: string | null;
  onActiveTabChange: (tabsKey: string, tabKey: string) => void;
  onSelectField: (fieldKey: string) => void;
  onDuplicateField: (fieldKey: string) => void;
  onRemoveField: (fieldKey: string) => void;
  onTestLlmPrompt?: (field: SchemaField) => Promise<void> | void;
  previewRawData: Record<string, unknown>;
}) => {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: field.key,
    data: { kind: 'field', fieldKey: field.key },
    transition: SORTABLE_FIELD_TRANSITION,
  });
  const transformTransition = suspendLayoutAnimation
    ? null
    : transition ?? `transform ${SORTABLE_FIELD_TRANSITION.duration}ms ${SORTABLE_FIELD_TRANSITION.easing}`;
  const visualTransition = 'box-shadow 180ms ease, border-color 180ms ease, opacity 180ms ease';
  const style: CSSProperties = {
    transform: suspendLayoutAnimation ? undefined : CSS.Transform.toString(transform),
    transition: [transformTransition, visualTransition].filter(Boolean).join(', '),
  };
  const sortHandle = (
    <button
      className="designer-field-card__sort-handle"
      type="button"
      aria-label={`拖拽排序 ${field.label}`}
      title="按住拖动排序"
      onClick={(event) => event.stopPropagation()}
      {...attributes}
      {...listeners}
    >
      <SortHandleIcon />
    </button>
  );

  return (
    <DesignerFieldCard
      datasetKind={datasetKind}
      field={field}
      activeTabByFieldKey={activeTabByFieldKey}
      dropMarkerType={dropMarkerType}
      isDragging={isDragging}
      isDropCommitting={isDropCommitting}
      isDropMarkerExiting={isDropMarkerExiting}
      materialDropPreview={materialDropPreview}
      suspendLayoutAnimation={suspendLayoutAnimation}
      isRemoving={removingFieldKeys.has(field.key)}
      removingFieldKeys={removingFieldKeys}
      selectedFieldKey={selectedFieldKey}
      setNodeRef={setNodeRef}
      sortHandle={sortHandle}
      style={style}
      onActiveTabChange={onActiveTabChange}
      onSelectField={onSelectField}
      onDuplicateField={onDuplicateField}
      onRemoveField={onRemoveField}
      onTestLlmPrompt={onTestLlmPrompt}
      previewRawData={previewRawData}
    />
  );
};

const AiPromptPreviewPanel = ({
  compiledPrompt,
  promptConfig,
  onFullPromptChange,
  onSectionChange,
}: {
  compiledPrompt: CompiledAiReviewPrompt;
  promptConfig?: AiReviewPromptConfig;
  onFullPromptChange: (content: string) => void;
  onSectionChange: (sectionKey: AiReviewPromptSectionKey, content: string) => void;
}) => {
  const [isFullPromptVisible, setIsFullPromptVisible] = useState(false);
  const [collapsedSectionKeys, setCollapsedSectionKeys] = useState<ReadonlySet<AiReviewPromptSectionKey>>(
    () => new Set(),
  );
  const fullPromptValue = promptConfig?.fullPromptOverride ?? compiledPrompt.prompt;
  const toggleSectionCollapse = (sectionKey: AiReviewPromptSectionKey) => {
    setCollapsedSectionKeys((current) => {
      const next = new Set(current);

      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }

      return next;
    });
  };

  return (
    <section className="designer-ai-prompt-preview" aria-label="AI Prompt 预览" role="region">
      <header className="designer-ai-prompt-preview__header">
        <div>
          <span>AI 预审 Prompt</span>
          <h3>{isFullPromptVisible ? '完整 Prompt' : 'Prompt 组成部分'}</h3>
        </div>
        <div className="designer-ai-prompt-preview__header-actions">
          <button
            type="button"
            aria-pressed={isFullPromptVisible}
            onClick={() => setIsFullPromptVisible((current) => !current)}
          >
            {isFullPromptVisible ? '查看分段' : '查看完整 Prompt'}
          </button>
        </div>
      </header>
      {isFullPromptVisible ? (
        <article className="designer-ai-prompt-preview__full" aria-label="完整 AI Prompt">
          <div className="designer-ai-prompt-preview__section-heading">
            <h4>完整 Prompt</h4>
            <span>运行时会写入 AI 预审记录</span>
          </div>
          <AutoResizePromptTextarea
            aria-label="编辑完整 AI Prompt"
            value={fullPromptValue}
            onChange={onFullPromptChange}
          />
        </article>
      ) : (
        <div className="designer-ai-prompt-preview__sections" aria-label="Prompt 组成部分">
          {compiledPrompt.sections.map((section, index) => {
            const isCollapsed = collapsedSectionKeys.has(section.key);
            const sectionBodyId = `ai-prompt-section-${section.key}`;

            return (
              <article
                key={section.key}
                className={isCollapsed ? 'is-collapsed' : undefined}
              >
                <div className="designer-ai-prompt-preview__section-heading">
                  <h4>{index + 1}. {section.title}</h4>
                  <button
                    type="button"
                    aria-controls={sectionBodyId}
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleSectionCollapse(section.key)}
                  >
                    {isCollapsed ? '展开' : '收起'}
                  </button>
                </div>
                <div
                  id={sectionBodyId}
                  className="designer-ai-prompt-preview__section-body"
                  aria-hidden={isCollapsed}
                >
                  <div className="designer-ai-prompt-preview__section-body-inner">
                    <AutoResizePromptTextarea
                      aria-label={`编辑${section.title}`}
                      tabIndex={isCollapsed ? -1 : undefined}
                      value={section.content}
                      onChange={(value) => onSectionChange(section.key, value)}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

const AutoResizePromptTextarea = ({
  'aria-label': ariaLabel,
  onChange,
  tabIndex,
  value,
}: {
  'aria-label': string;
  onChange: (value: string) => void;
  tabIndex?: number;
  value: string;
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';

    if (textarea.scrollHeight > 0) {
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      aria-label={ariaLabel}
      rows={1}
      tabIndex={tabIndex}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
};

const TemplateNameEditIcon = () => (
  <svg
    aria-hidden="true"
    className="designer-canvas__template-name-icon"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M15.6 4.8 19.2 8.4 8.7 18.9 4.5 19.5 5.1 15.3 15.6 4.8Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
    <path
      d="M14.1 6.3 17.7 9.9"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.8"
    />
  </svg>
);

export const DesignerFieldDragOverlay = ({ field }: { field: SchemaField }) => {
  const answerKey = field.fieldKey ?? field.key;
  const typeTitle = formatFieldTypeTitle(field);
  const isRequired = isRequiredField(field);
  const fieldDescription = formatFieldDescription(field);
  const hasLlmPrompt = field.promptTemplate !== undefined;

  return (
    <article
      className={[
        'designer-field-card',
        'designer-field-card--drag-overlay',
        hasLlmPrompt ? 'designer-field-card--has-llm-prompt' : null,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      <span className="designer-field-card__sort-handle designer-field-card__sort-handle--static">
        <SortHandleIcon />
      </span>
      {hasLlmPrompt ? (
        <span className="template-manager-row-action designer-field-card__llm-prompt-button">
          <img
            className="designer-field-card__llm-prompt-icon"
            src={starIcon}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
        </span>
      ) : null}
      <span className="designer-field-card__copy-button">
        <span className="designer-field-card__copy-icon" />
      </span>
      <span className="designer-field-card__delete-button">×</span>
      <div className="designer-field-card__body">
        <div className="designer-field-card__type-row">
          <span className="designer-field-card__type-label">
            {typeTitle}
            {isRequired ? (
              <sup className="designer-field-card__required-mark" aria-hidden="true">
                *
              </sup>
            ) : null}
          </span>
          {fieldDescription ? (
            <span className="designer-field-card__description">{fieldDescription}</span>
          ) : null}
        </div>
        {field.type !== 'show_item' && field.type !== 'group' && field.type !== 'tabs' ? (
          <small>字段名：{answerKey}</small>
        ) : null}
        {field.placeholder ? <p>{field.placeholder}</p> : null}
        {field.options && field.options.length > 0 ? (
          <div className="designer-field-card__options">
            {field.options.map((option) => (
              <span key={option.value}>{option.label}</span>
            ))}
          </div>
        ) : null}
        {field.type === 'show_item' ? <small>ShowItem · 不参与提交</small> : null}
        {field.type === 'llm_assist' ? (
          <small>采纳后写入：{field.targetFieldKey ?? '未配置'}</small>
        ) : null}
      </div>
    </article>
  );
};

const DesignerFieldCard = ({
  datasetKind,
  field,
  activeTabByFieldKey,
  dropMarkerType,
  isDragging = false,
  isDropCommitting = false,
  isDropMarkerExiting = false,
  materialDropPreview,
  suspendLayoutAnimation = false,
  isRemoving = false,
  removingFieldKeys,
  selectedFieldKey,
  setNodeRef,
  sortHandle,
  style,
  onActiveTabChange,
  onSelectField,
  onDuplicateField,
  onRemoveField,
  onTestLlmPrompt,
  previewRawData,
}: {
  datasetKind: LabelHubSchema['datasetKind'];
  field: SchemaField;
  activeTabByFieldKey: Readonly<Record<string, string>>;
  dropMarkerType?: SchemaField['type'] | null;
  isDragging?: boolean;
  isDropCommitting?: boolean;
  isDropMarkerExiting?: boolean;
  materialDropPreview: MaterialDropPreview | null;
  suspendLayoutAnimation?: boolean;
  isRemoving?: boolean;
  removingFieldKeys: ReadonlySet<string>;
  selectedFieldKey: string | null;
  setNodeRef?: (node: HTMLElement | null) => void;
  sortHandle?: ReactNode;
  style?: CSSProperties;
  onActiveTabChange: (tabsKey: string, tabKey: string) => void;
  onSelectField: (fieldKey: string) => void;
  onDuplicateField: (fieldKey: string) => void;
  onRemoveField: (fieldKey: string) => void;
  onTestLlmPrompt?: (field: SchemaField) => Promise<void> | void;
  previewRawData: Record<string, unknown>;
}) => {
  const selected = selectedFieldKey === field.key;
  const answerKey = field.fieldKey ?? field.key;
  const typeTitle = formatFieldTypeTitle(field);
  const isRequired = isRequiredField(field);
  const fieldDescription = formatFieldDescription(field);
  const hasLlmPrompt = field.promptTemplate !== undefined;
  const [isTestingLlmPrompt, setIsTestingLlmPrompt] = useState(false);
  const groupLayout = field.layout === 'two_columns' ? 'two_columns' : 'single_column';
  const childFieldKeys = useMemo(
    () => (field.fields ?? []).map((child) => child.key),
    [field.fields],
  );
  const tabs = field.tabs ?? [];
  const tabsLayout = 'auto_rows';
  const activeTabKey = activeTabByFieldKey[field.key] ?? tabs[0]?.key ?? '';
  const activeTab = tabs.find((tab) => tab.key === activeTabKey) ?? tabs[0];
  const activeTabFieldKeys = useMemo(
    () => activeTab?.fields.map((child) => child.key) ?? [],
    [activeTab],
  );
  const {
    isOver: isGroupDropOver,
    setNodeRef: setGroupDropNodeRef,
  } = useDroppable({
    id: designerGroupDropId(field.key),
    disabled: field.type !== 'group',
  });
  const {
    isOver: isTabDropOver,
    setNodeRef: setTabDropNodeRef,
  } = useDroppable({
    id: activeTab ? designerTabDropId(field.key, activeTab.key) : `designer-drop-tab-disabled:${field.key}`,
    disabled: field.type !== 'tabs' || !activeTab,
  });
  const className = [
    'designer-field-card',
    hasLlmPrompt ? 'designer-field-card--has-llm-prompt' : null,
    field.type === 'group' || field.type === 'tabs' ? 'designer-field-card--container' : null,
    field.type === 'group' ? 'designer-field-card--group' : null,
    field.type === 'tabs' ? 'designer-field-card--tabs' : null,
    selected ? 'is-selected' : null,
    isDragging ? 'is-dragging' : null,
    isDropCommitting ? 'is-drop-committing' : null,
    isRemoving ? 'is-removing' : null,
  ]
    .filter(Boolean)
    .join(' ');
  const setFieldCardNode = (node: HTMLElement | null) => {
    setNodeRef?.(node);
  };

  const selectField = () => onSelectField(field.key);
  const handleCardClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    if (isRemoving) {
      return;
    }
    selectField();
  };
  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (isRemoving) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectField();
    }
  };
  const handleDuplicate = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isRemoving) {
      return;
    }
    onDuplicateField(field.key);
  };
  const handleRemove = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isRemoving) {
      return;
    }

    onRemoveField(field.key);
  };
  const handleTestLlmPrompt = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isRemoving || isTestingLlmPrompt) {
      return;
    }

    setIsTestingLlmPrompt(true);

    try {
      await onTestLlmPrompt?.(field);
    } finally {
      setIsTestingLlmPrompt(false);
    }
  };
  const renderTabChildCard = (child: SchemaField) => (
    <SortableDesignerFieldCard
      datasetKind={datasetKind}
      key={child.key}
      field={child}
      activeTabByFieldKey={activeTabByFieldKey}
      dropMarkerType={resolveDropMarkerTypeBeforeField(
        materialDropPreview,
        { kind: 'tab', tabsKey: field.key, tabKey: activeTab?.key ?? '' },
        child.key,
      )}
      isDropMarkerExiting={isDropMarkerExiting}
      materialDropPreview={materialDropPreview}
      suspendLayoutAnimation={suspendLayoutAnimation}
      removingFieldKeys={removingFieldKeys}
      selectedFieldKey={selectedFieldKey}
      onActiveTabChange={onActiveTabChange}
      onSelectField={onSelectField}
      onDuplicateField={onDuplicateField}
      onRemoveField={onRemoveField}
      onTestLlmPrompt={onTestLlmPrompt}
      previewRawData={previewRawData}
    />
  );

  return (
    <article
      ref={setFieldCardNode}
      aria-label={`选择 ${field.label}`}
      className={className}
      data-designer-field-key={field.key}
      role="button"
      style={style}
      tabIndex={isRemoving ? -1 : 0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
    >
      {dropMarkerType ? (
        <DesignerDropInsertionMarker
          type={dropMarkerType}
          isExiting={isDropMarkerExiting}
          placement="before"
        />
      ) : null}
      {sortHandle}
      {hasLlmPrompt ? (
        <button
          className="template-manager-row-action designer-field-card__llm-prompt-button"
          type="button"
          aria-label={`测试 ${field.label} LLM 提示`}
          disabled={isRemoving || isTestingLlmPrompt}
          title="测试 LLM 提示"
          onClick={handleTestLlmPrompt}
        >
          <img
            className="designer-field-card__llm-prompt-icon"
            src={starIcon}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
        </button>
      ) : null}
      <button
        className="template-manager-row-action designer-field-card__copy-button"
        type="button"
        aria-label={`复制 ${field.label}`}
        disabled={isRemoving}
        title="复制"
        onClick={handleDuplicate}
      >
        <DesignerFieldCopyIcon />
      </button>
      <button
        className="template-manager-row-action designer-field-card__delete-button"
        type="button"
        aria-label={`删除 ${field.label}`}
        disabled={isRemoving}
        title="删除"
        onClick={handleRemove}
      >
        <DesignerFieldDeleteIcon />
      </button>
      <div className="designer-field-card__body">
        <div className="designer-field-card__type-row">
          <span className="designer-field-card__type-label">
            {typeTitle}
            {isRequired ? (
              <sup className="designer-field-card__required-mark" aria-hidden="true">
                *
              </sup>
            ) : null}
          </span>
          {fieldDescription ? (
            <span className="designer-field-card__description">{fieldDescription}</span>
          ) : null}
        </div>
        {field.type !== 'show_item' && field.type !== 'group' && field.type !== 'tabs' ? (
          <small>字段名：{answerKey}</small>
        ) : null}
        {field.placeholder ? <p>{field.placeholder}</p> : null}
        {field.options && field.options.length > 0 ? (
          <div className="designer-field-card__options">
            {field.options.map((option) => (
              <span key={option.value}>{option.label}</span>
            ))}
          </div>
        ) : null}
        {field.type === 'show_item' ? (
          <div className="designer-field-card__show-preview" aria-label={`${field.label} 画布预览`}>
            <ShowItemField
              field={field}
              datasetKind={datasetKind}
              rendererScope="designer-canvas"
              fieldPath={field.key}
              rawData={previewRawData}
              value={{}}
              mode="answer"
              hiddenFieldKeys={EMPTY_FIELD_KEY_SET}
              disabledFieldKeys={EMPTY_FIELD_KEY_SET}
              requiredFieldKeys={EMPTY_FIELD_KEY_SET}
              validationMessagesByField={EMPTY_VALIDATION_MESSAGES_BY_FIELD}
              onFieldChange={() => undefined}
              disabled
            />
          </div>
        ) : null}
        {field.type === 'llm_assist' ? (
          <small>采纳后写入：{field.targetFieldKey ?? '未配置'}</small>
        ) : null}
      </div>
      {field.type === 'group' ? (
        <div
          ref={setGroupDropNodeRef}
          data-designer-drop-target-kind="group"
          data-designer-group-key={field.key}
          className={[
            'designer-field-card__container-shell',
            'designer-field-card__children',
            `designer-field-card__container-shell--${groupLayout}`,
            isGroupDropOver || isContainerDropHighlighted(materialDropPreview, { kind: 'group', groupKey: field.key })
              ? 'is-over'
              : null,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <SortableContext
            items={childFieldKeys}
            strategy={groupLayout === 'two_columns' ? rectSortingStrategy : verticalListSortingStrategy}
          >
            {(field.fields ?? []).map((child) => (
              <SortableDesignerFieldCard
                datasetKind={datasetKind}
                key={child.key}
                field={child}
                activeTabByFieldKey={activeTabByFieldKey}
                dropMarkerType={resolveDropMarkerTypeBeforeField(
                  materialDropPreview,
                  { kind: 'group', groupKey: field.key },
                  child.key,
                )}
                isDropMarkerExiting={isDropMarkerExiting}
                materialDropPreview={materialDropPreview}
                suspendLayoutAnimation={suspendLayoutAnimation}
                removingFieldKeys={removingFieldKeys}
                selectedFieldKey={selectedFieldKey}
                onActiveTabChange={onActiveTabChange}
                onSelectField={onSelectField}
                onDuplicateField={onDuplicateField}
                onRemoveField={onRemoveField}
                onTestLlmPrompt={onTestLlmPrompt}
                previewRawData={previewRawData}
              />
            ))}
            {shouldRenderAppendPreview(materialDropPreview, { kind: 'group', groupKey: field.key }) ? (
              <DesignerDropInsertionMarker
                type={materialDropPreview!.type}
                isExiting={isDropMarkerExiting}
                placement="append"
              />
            ) : null}
            {(field.fields ?? []).length === 0 ? (
              <div className="designer-field-card__drop-empty">拖入字段到此分组</div>
            ) : null}
          </SortableContext>
        </div>
      ) : null}
      {field.type === 'tabs' ? (
        <div className="designer-field-card__tabs">
          <div className="designer-field-card__tab-list" role="tablist" aria-label={`${field.label} Tab 列表`}>
            {tabs.map((tab) => {
              return (
                <DesignerTabButton
                  key={tab.key}
                  isActive={tab.key === activeTab?.key}
                  isHighlighted={isContainerDropHighlighted(materialDropPreview, {
                    kind: 'tab',
                    tabsKey: field.key,
                    tabKey: tab.key,
                  })}
                  label={tab.label}
                  tabsKey={field.key}
                  tabKey={tab.key}
                  onClick={() => {
                    onActiveTabChange(field.key, tab.key);
                    onSelectField(field.key);
                  }}
                />
              );
            })}
          </div>
          {activeTab ? (
            <section
              ref={setTabDropNodeRef}
              data-designer-drop-target-kind="tab"
              data-designer-tabs-key={field.key}
              data-designer-tab-key={activeTab.key}
              className={[
                'designer-field-card__container-shell',
                'designer-field-card__children',
                'designer-field-card__tab-panel',
                `designer-field-card__tab-panel--${tabsLayout}`,
                isTabDropOver ||
                isContainerDropHighlighted(materialDropPreview, {
                  kind: 'tab',
                  tabsKey: field.key,
                  tabKey: activeTab.key,
                })
                  ? 'is-over'
                  : null,
              ]
                .filter(Boolean)
                .join(' ')}
              role="tabpanel"
            >
              <SortableContext
                items={activeTabFieldKeys}
                strategy={rectSortingStrategy}
              >
                {tabsLayout === 'auto_rows'
                  ? chunkFields(activeTab.fields).map((row, rowIndex) => (
                      <div
                        key={`${activeTab.key}-row-${rowIndex}`}
                        className={`designer-field-card__tab-row ${autoRowClassBySize(row.length)}`}
                      >
                        {row.map(renderTabChildCard)}
                      </div>
                    ))
                  : activeTab.fields.map(renderTabChildCard)}
                {shouldRenderAppendPreview(materialDropPreview, {
                  kind: 'tab',
                  tabsKey: field.key,
                  tabKey: activeTab.key,
                }) ? (
                  <DesignerDropInsertionMarker
                    type={materialDropPreview!.type}
                    isExiting={isDropMarkerExiting}
                    placement="append"
                  />
                ) : null}
                {activeTab.fields.length === 0 ? (
                  <div className="designer-field-card__drop-empty">拖入字段到当前 Tab</div>
                ) : null}
              </SortableContext>
            </section>
          ) : null}
        </div>
      ) : null}
    </article>
  );
};

const DesignerTabButton = ({
  isActive,
  isHighlighted,
  label,
  tabsKey,
  tabKey,
  onClick,
}: {
  isActive: boolean;
  isHighlighted: boolean;
  label: string;
  tabsKey: string;
  tabKey: string;
  onClick: () => void;
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: designerTabDropId(tabsKey, tabKey),
  });

  return (
    <button
      ref={setNodeRef}
      data-designer-drop-target-kind="tab"
      data-designer-tabs-key={tabsKey}
      data-designer-tab-key={tabKey}
      type="button"
      role="tab"
      aria-selected={isActive}
      className={[
        'designer-field-card__tab-button',
        isActive ? 'is-active' : null,
        isOver || isHighlighted ? 'is-over' : null,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  );
};

const DesignerFieldCopyIcon = () => (
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

const DesignerFieldDeleteIcon = () => (
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

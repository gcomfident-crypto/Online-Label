import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  Fragment,
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

import type { LabelHubSchema, SchemaField } from '@labelhub/shared';

import eyeIcon from '../../assets/eye.svg';
import { ShowItemField } from '../schema-renderer/fields/ShowItemField';

type MaterialDropPreview = {
  targetFieldKey: string | null;
  type: SchemaField['type'];
};

type DesignerCanvasProps = {
  schema: LabelHubSchema;
  templateName?: string;
  previewRawData?: Record<string, unknown>;
  selectedFieldKey: string | null;
  committingFieldKey?: string | null;
  isDropHighlighted?: boolean;
  materialDropPreview?: MaterialDropPreview | null;
  onTemplateNameChange?: (name: string) => void;
  onPreviewUploadedFile?: () => void;
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
  isDropHighlighted = false,
  materialDropPreview = null,
  onTemplateNameChange = () => undefined,
  onPreviewUploadedFile,
  onSelectField,
  onDuplicateField,
  onRemoveField,
  previewRecordCount = 0,
}: DesignerCanvasProps) => {
  const { setNodeRef } = useDroppable({ id: 'designer-canvas' });
  const canvasRef = useRef<HTMLElement | null>(null);
  const previousDropPreviewRef = useRef<MaterialDropPreview | null>(null);
  const previousFieldLayoutsRef = useRef<Map<string, FieldLayoutSnapshot>>(new Map());
  const layoutAnimationsRef = useRef(new Map<string, Animation>());
  const removingFieldTimersRef = useRef(new Map<string, number>());
  const templateNameInputRef = useRef<HTMLInputElement | null>(null);
  const templateNameEditBaseRef = useRef(templateName);
  const skipTemplateNameBlurCommitRef = useRef(false);
  const [exitingDropPreview, setExitingDropPreview] = useState<MaterialDropPreview | null>(null);
  const [removingFieldKeys, setRemovingFieldKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [isTemplateNameEditing, setIsTemplateNameEditing] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState(templateName);
  const fieldKeys = useMemo(() => schema.fields.map((field) => field.key), [schema.fields]);
  const canvasPreviewRawData = previewRawData ?? {};
  const activeDropPreview = materialDropPreview ?? exitingDropPreview;
  const isDropPreviewExiting = !materialDropPreview && Boolean(exitingDropPreview);
  const previewTargetFieldKey = activeDropPreview?.targetFieldKey ?? null;
  const previewTargetsExistingField = previewTargetFieldKey ? fieldKeys.includes(previewTargetFieldKey) : false;
  const shouldAppendPreview = Boolean(activeDropPreview && !previewTargetsExistingField);
  const shouldShowUploadedFilePreview = previewRecordCount > 0 && Boolean(onPreviewUploadedFile);
  const dropPreview = activeDropPreview ? (
    <DesignerMaterialDropPreview
      key="material-drop-preview"
      type={activeDropPreview.type}
      isExiting={isDropPreviewExiting}
    />
  ) : null;
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

  useLayoutEffect(() => {
    const nextLayouts = measureTopLevelFieldLayouts(canvasRef.current);
    const previousLayouts = previousFieldLayoutsRef.current;

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

  return (
    <main
      ref={setCanvasNode}
      className={isDropHighlighted ? 'designer-canvas is-over' : 'designer-canvas'}
      aria-label="模板编辑区域"
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
          {shouldShowUploadedFilePreview ? (
            <button
              className="designer-canvas__uploaded-preview"
              type="button"
              aria-label="预览已上传文件"
              onClick={onPreviewUploadedFile}
            >
              <span>预览已上传文件</span>
              <img className="designer-canvas__uploaded-preview-icon" src={eyeIcon} alt="" aria-hidden="true" />
            </button>
          ) : null}
          <span>{schema.fields.length} 个字段</span>
        </div>
      </div>
      {schema.fields.length === 0 && !activeDropPreview ? (
        <div className="designer-canvas__empty">拖入此处新增字段</div>
      ) : (
        <div className="designer-canvas__fields">
          <SortableContext items={fieldKeys} strategy={verticalListSortingStrategy}>
            {schema.fields.map((field) => (
              <Fragment key={field.key}>
                {previewTargetFieldKey === field.key ? dropPreview : null}
                <SortableDesignerFieldCard
                  datasetKind={schema.datasetKind}
                  field={field}
                  isDropCommitting={committingFieldKey === field.key}
                  removingFieldKeys={removingFieldKeys}
                  selectedFieldKey={selectedFieldKey}
                  onSelectField={onSelectField}
                  onDuplicateField={onDuplicateField}
                  onRemoveField={handleRemoveField}
                  previewRawData={canvasPreviewRawData}
                />
              </Fragment>
            ))}
            {shouldAppendPreview ? dropPreview : null}
          </SortableContext>
        </div>
      )}
    </main>
  );
};

const DesignerMaterialDropPreview = ({
  isExiting,
  type,
}: {
  isExiting?: boolean;
  type: SchemaField['type'];
}) => (
  <article
    className={
      isExiting
        ? 'designer-field-card designer-field-card--drop-preview is-exiting'
        : 'designer-field-card designer-field-card--drop-preview'
    }
    aria-hidden="true"
  >
    <span className="designer-field-card__sort-handle designer-field-card__sort-handle--static">
      <SortHandleIcon />
    </span>
    <div className="designer-field-card__body">
      <div className="designer-field-card__type-row">
        <span className="designer-field-card__type-label">{FIELD_TYPE_LABELS[type]}</span>
      </div>
      <span className="designer-field-card__preview-line designer-field-card__preview-line--wide" />
      <span className="designer-field-card__preview-line" />
    </div>
  </article>
);

const SortableDesignerFieldCard = ({
  datasetKind,
  field,
  isDropCommitting,
  removingFieldKeys,
  selectedFieldKey,
  onSelectField,
  onDuplicateField,
  onRemoveField,
  previewRawData,
}: {
  datasetKind: LabelHubSchema['datasetKind'];
  field: SchemaField;
  isDropCommitting?: boolean;
  removingFieldKeys: ReadonlySet<string>;
  selectedFieldKey: string | null;
  onSelectField: (fieldKey: string) => void;
  onDuplicateField: (fieldKey: string) => void;
  onRemoveField: (fieldKey: string) => void;
  previewRawData: Record<string, unknown>;
}) => {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: field.key,
    data: { kind: 'field', fieldKey: field.key },
    transition: SORTABLE_FIELD_TRANSITION,
  });
  const transformTransition =
    transition ??
    `transform ${SORTABLE_FIELD_TRANSITION.duration}ms ${SORTABLE_FIELD_TRANSITION.easing}`;
  const visualTransition = 'box-shadow 180ms ease, border-color 180ms ease, opacity 180ms ease';
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
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
      isDragging={isDragging}
      isDropCommitting={isDropCommitting}
      isRemoving={removingFieldKeys.has(field.key)}
      removingFieldKeys={removingFieldKeys}
      selectedFieldKey={selectedFieldKey}
      setNodeRef={setNodeRef}
      sortHandle={sortHandle}
      style={style}
      onSelectField={onSelectField}
      onDuplicateField={onDuplicateField}
      onRemoveField={onRemoveField}
      previewRawData={previewRawData}
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

  return (
    <article className="designer-field-card designer-field-card--drag-overlay" aria-hidden="true">
      <span className="designer-field-card__sort-handle designer-field-card__sort-handle--static">
        <SortHandleIcon />
      </span>
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
        {field.type !== 'show_item' ? <small>字段名：{answerKey}</small> : null}
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
  isDragging = false,
  isDropCommitting = false,
  isRemoving = false,
  removingFieldKeys,
  selectedFieldKey,
  setNodeRef,
  sortHandle,
  style,
  onSelectField,
  onDuplicateField,
  onRemoveField,
  previewRawData,
}: {
  datasetKind: LabelHubSchema['datasetKind'];
  field: SchemaField;
  isDragging?: boolean;
  isDropCommitting?: boolean;
  isRemoving?: boolean;
  removingFieldKeys: ReadonlySet<string>;
  selectedFieldKey: string | null;
  setNodeRef?: (node: HTMLElement | null) => void;
  sortHandle?: ReactNode;
  style?: CSSProperties;
  onSelectField: (fieldKey: string) => void;
  onDuplicateField: (fieldKey: string) => void;
  onRemoveField: (fieldKey: string) => void;
  previewRawData: Record<string, unknown>;
}) => {
  const selected = selectedFieldKey === field.key;
  const answerKey = field.fieldKey ?? field.key;
  const typeTitle = formatFieldTypeTitle(field);
  const isRequired = isRequiredField(field);
  const fieldDescription = formatFieldDescription(field);
  const childFieldKeys = useMemo(
    () => (field.fields ?? []).map((child) => child.key),
    [field.fields],
  );
  const tabFieldKeys = useMemo(
    () =>
      Object.fromEntries(
        (field.tabs ?? []).map((tab) => [tab.key, tab.fields.map((child) => child.key)]),
      ) as Record<string, string[]>,
    [field.tabs],
  );
  const className = [
    'designer-field-card',
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
      {sortHandle}
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
        {field.type !== 'show_item' ? <small>字段名：{answerKey}</small> : null}
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
      {field.fields && field.fields.length > 0 ? (
        <div className="designer-field-card__children">
          <SortableContext items={childFieldKeys} strategy={verticalListSortingStrategy}>
            {field.fields.map((child) => (
              <SortableDesignerFieldCard
                datasetKind={datasetKind}
                key={child.key}
                field={child}
                removingFieldKeys={removingFieldKeys}
                selectedFieldKey={selectedFieldKey}
                onSelectField={onSelectField}
                onDuplicateField={onDuplicateField}
                onRemoveField={onRemoveField}
                previewRawData={previewRawData}
              />
            ))}
          </SortableContext>
        </div>
      ) : null}
      {field.tabs?.map((tab) => (
        <section key={tab.key} className="designer-field-card__children">
          <h4>{tab.label}</h4>
          <SortableContext items={tabFieldKeys[tab.key] ?? []} strategy={verticalListSortingStrategy}>
            {tab.fields.map((child) => (
              <SortableDesignerFieldCard
                datasetKind={datasetKind}
                key={child.key}
                field={child}
                removingFieldKeys={removingFieldKeys}
                selectedFieldKey={selectedFieldKey}
                onSelectField={onSelectField}
                onDuplicateField={onDuplicateField}
                onRemoveField={onRemoveField}
                previewRawData={previewRawData}
              />
            ))}
          </SortableContext>
        </section>
      ))}
    </article>
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

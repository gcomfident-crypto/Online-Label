import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type UIEvent,
  type WheelEvent,
} from 'react';
import { Link } from 'react-router-dom';

import type { TaskDto, TaskFormInput } from '../../../api/tasks';
import type { DatasetImportSummaryDto } from '../../../api/datasets';
import csvFileIcon from '../../../assets/csv.svg';
import eyeIcon from '../../../assets/eye.svg';
import jsonFileIcon from '../../../assets/json.svg';
import jsonlFileIcon from '../../../assets/jsonl.svg';
import xlsxFileIcon from '../../../assets/xlsx.svg';
import { ToastViewport, useToastController } from '../../../components/ToastViewport';
import { createTemplateDisplayIdMap } from '../templateDisplayId';
import { TaskProgressTimeline } from './TaskProgressTimeline';

type TaskTemplateSummary = TaskDto['template'];

export type TaskDrawerFieldErrors = {
  datasetFile?: string;
  deadline?: string;
  rewardPerItem?: string;
  tags?: string;
  templateId?: string;
  title?: string;
};

type PublishDrawerProps = {
  task: TaskDto;
  form: TaskFormInput;
  fieldErrors: TaskDrawerFieldErrors;
  templateOptions: TaskTemplateSummary[];
  isTemplateEditable: boolean;
  isSaving: boolean;
  datasetFileName: string | null;
  importSummary: DatasetImportSummaryDto | null;
  isDatasetPreviewAvailable: boolean;
  isDatasetPreviewLoading: boolean;
  onChange: (patch: Partial<TaskFormInput>) => void;
  onTemplateChange: (templateId: string) => void;
  onTemplatePickerOpen?: () => void;
  onViewTemplate?: (templateId: string) => void;
  onCreateTemplateFromDataset?: () => void;
  onDatasetFileChange: (file: File | null) => void;
  onPreviewDataset: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
};

export const PublishDrawer = ({
  task,
  form,
  fieldErrors,
  templateOptions,
  isTemplateEditable,
  isSaving,
  datasetFileName,
  importSummary,
  isDatasetPreviewAvailable,
  isDatasetPreviewLoading,
  onChange,
  onTemplateChange,
  onTemplatePickerOpen,
  onViewTemplate,
  onCreateTemplateFromDataset,
  onDatasetFileChange,
  onPreviewDataset,
  onSaveDraft,
  onPublish,
}: PublishDrawerProps) => {
  const importedItemCount = importSummary?.importedCount ?? task.itemCount;
  const isTemplateMissing = !isTemplateEditable && templateOptions.length === 0 && !form.templateId;
  const datasetFileIconKind = resolveDatasetFileIconKind(datasetFileName);
  const shouldShowDatasetPreview = Boolean(datasetFileName) && isDatasetPreviewAvailable;
  const datasetPrimaryText = datasetFileName ?? '点击上传文件';
  const datasetSecondaryText = datasetFileName
    ? `题目数：${formatDatasetItemCount(form.quota)}`
    : importedItemCount > 0
      ? `题目数：${importedItemCount.toLocaleString()}`
      : '支持 JSON / JSONL / XLSX';
  const [isRewardInputFocused, setIsRewardInputFocused] = useState(false);
  const [rewardInputValue, setRewardInputValue] = useState(() => formatRewardInputValue(form.rewardPerItem));
  const [dismissedRewardInputError, setDismissedRewardInputError] = useState<string | null>(null);
  const rewardFormatError =
    !isRewardInputFocused && rewardInputValue !== ''
      ? getRewardFormatError(rewardInputValue)
      : null;
  const visibleRewardFormatError =
    rewardFormatError && rewardFormatError !== dismissedRewardInputError ? rewardFormatError : null;
  const rewardInputError = visibleRewardFormatError ?? fieldErrors.rewardPerItem;

  useEffect(() => {
    setRewardInputValue(formatRewardInputValue(form.rewardPerItem));
    setIsRewardInputFocused(false);
  }, [task.id]);

  useEffect(() => {
    if (!isRewardInputFocused && isRewardFormValueSyncable(form.rewardPerItem)) {
      setRewardInputValue(formatRewardInputValue(form.rewardPerItem));
    }
  }, [form.rewardPerItem, isRewardInputFocused]);

  useEffect(() => {
    setDismissedRewardInputError(null);
  }, [rewardInputValue]);

  return (
    <aside className="task-publish-drawer" aria-label="发布任务抽屉">
      <div className="task-publish-form">
        <label>
          <span className="task-field-heading">
            <span>任务标题</span>
            <RequiredMark />
            <FieldError inline message={fieldErrors.title} />
          </span>
          <input
            aria-label="任务标题"
            className="task-publish-form__control"
            value={form.title}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </label>
        <TagBubbleEditor tags={form.tags ?? []} fieldError={fieldErrors.tags} onChange={(tags) => onChange({ tags })} />
        <div className="task-dataset-import">
          <span className="task-field-heading task-dataset-import__heading">
            <span>题目数据导入</span>
            <RequiredMark />
            <FieldError inline message={fieldErrors.datasetFile} />
          </span>
          <div className="task-dataset-import__panel">
            <div className="task-dataset-import__actions">
              <div className="task-dataset-import__file-zone">
                <label className="task-dataset-import__file-picker">
                  <span
                    key={datasetFileIconKind}
                    className={`task-dataset-import__file-icon task-dataset-import__file-icon--${datasetFileIconKind}${
                      datasetFileIconKind === 'upload' ? '' : ' task-dataset-import__file-icon--typed'
                    }`}
                    aria-hidden="true"
                  >
                    <DatasetFileIconGraphic kind={datasetFileIconKind} />
                  </span>
                  <span className="task-dataset-import__file-copy">
                    <strong>{datasetPrimaryText}</strong>
                    <small>{datasetSecondaryText}</small>
                  </span>
                  <input
                    aria-label="题目数据文件"
                    className="task-dataset-import__file-input"
                    type="file"
                    accept=".json,.jsonl,.csv,.xlsx,application/json,text/csv"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }

                      onDatasetFileChange(file);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                {shouldShowDatasetPreview ? (
                  <button
                    className="task-dataset-import__preview"
                    type="button"
                    disabled={isDatasetPreviewLoading}
                    onClick={onPreviewDataset}
                  >
                    <img className="task-dataset-import__preview-icon" src={eyeIcon} alt="" aria-hidden="true" />
                    <span>{isDatasetPreviewLoading ? '解析中' : '预览'}</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div className="task-publish-form__metrics">
          <label>
            <span className="task-field-heading">
              <span>单条奖励</span>
              <RequiredMark />
              <FieldError
                inline
                message={rewardInputError}
                onAnimationEnd={
                  visibleRewardFormatError ? () => setDismissedRewardInputError(visibleRewardFormatError) : undefined
                }
              />
            </span>
            <span className="task-reward-input task-publish-form__control">
              <input
                aria-label="单条奖励"
                className="task-publish-form__control"
                inputMode="decimal"
                type="text"
                value={rewardInputValue}
                onBlur={() => setIsRewardInputFocused(false)}
                onChange={(event) => {
                  setRewardInputValue(event.target.value);
                  onChange({ rewardPerItem: numberOrNull(event.target.value) });
                }}
                onFocus={() => setIsRewardInputFocused(true)}
              />
              <span aria-hidden="true">元</span>
            </span>
          </label>
          <label>
            <span className="task-field-heading">
              <span>截止时间</span>
              <RequiredMark />
              <FieldError inline message={fieldErrors.deadline} />
            </span>
            <DeadlinePicker
              value={form.deadline ?? null}
              onChange={(deadline) => onChange({ deadline })}
            />
          </label>
        </div>
        <label>
          <span className="task-field-heading">
            <span>关联模板</span>
            <RequiredMark />
            <FieldError inline message={fieldErrors.templateId} />
          </span>
          {isTemplateMissing ? (
            <div className="task-template-empty-option task-publish-form__control">
              <span>还没有配置模板</span>
              <Link to="/owner/templates">去配置</Link>
            </div>
          ) : isTemplateEditable ? (
            <TemplateSearchSelect
              options={templateOptions}
              value={form.templateId}
              onChange={onTemplateChange}
              onOpen={onTemplatePickerOpen}
              onViewTemplate={onViewTemplate}
              onCreateTemplateFromDataset={onCreateTemplateFromDataset}
            />
          ) : (
            <input
              aria-label="关联模板"
              className="task-publish-form__control"
              value={formatTemplateOption(task.template)}
              readOnly
            />
          )}
        </label>
        <label className="task-ai-toggle">
          <input
            aria-label="启用AI预审"
            type="checkbox"
            checked={Boolean(form.aiPreReviewEnabled)}
            onChange={(event) => onChange({ aiPreReviewEnabled: event.target.checked })}
          />
          <span className="task-ai-toggle__label">启用AI预审</span>
        </label>
        <TaskProgressTimeline task={task} />
      </div>
      <div className="task-publish-drawer__footer">
        <div className="task-publish-drawer__actions">
          <button type="button" disabled={isSaving} onClick={onSaveDraft}>
            存为草稿
          </button>
          <button className="primary-action" type="button" disabled={isSaving} onClick={onPublish}>
            立即发布 →
          </button>
        </div>
      </div>
    </aside>
  );
};

const RequiredMark = () => (
  <span className="task-required-mark" aria-hidden="true">
    *
  </span>
);

const REWARD_NEGATIVE_ERROR_MESSAGE = '不能输入负数。';
const REWARD_NOT_NUMBER_ERROR_MESSAGE = '请输入数字。';
const REWARD_NUMBER_PATTERN = /^\d+(?:\.\d+)?$/;

const numberOrNull = (value: string): number | null => {
  if (!value) {
    return null;
  }

  if (isRewardNegativeInput(value)) {
    const number = Number(value.trim());

    return Number.isFinite(number) ? number : Number.NaN;
  }

  if (!REWARD_NUMBER_PATTERN.test(value)) {
    return Number.NaN;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : Number.NaN;
};

const getRewardFormatError = (value: string): string | null => {
  if (!value || REWARD_NUMBER_PATTERN.test(value)) {
    return null;
  }

  return isRewardNegativeInput(value) ? REWARD_NEGATIVE_ERROR_MESSAGE : REWARD_NOT_NUMBER_ERROR_MESSAGE;
};

const isRewardNegativeInput = (value: string): boolean => value.trim().startsWith('-');

const formatRewardInputValue = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '';
  }

  return String(value);
};

const isRewardFormValueSyncable = (value: number | null | undefined): boolean =>
  value === null || value === undefined || Number.isFinite(value);

const formatDatasetItemCount = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '解析中';
  }

  return value.toLocaleString();
};

type DatasetFileIconKind = 'csv' | 'json' | 'jsonl' | 'upload' | 'xlsx';

const datasetFileIconSources: Partial<Record<DatasetFileIconKind, string>> = {
  csv: csvFileIcon,
  json: jsonFileIcon,
  jsonl: jsonlFileIcon,
  xlsx: xlsxFileIcon,
};

const resolveDatasetFileIconKind = (fileName: string | null): DatasetFileIconKind => {
  const lowerFileName = fileName?.toLowerCase() ?? '';

  if (lowerFileName.endsWith('.csv')) {
    return 'csv';
  }

  if (lowerFileName.endsWith('.jsonl')) {
    return 'jsonl';
  }

  if (lowerFileName.endsWith('.xlsx')) {
    return 'xlsx';
  }

  if (lowerFileName.endsWith('.json')) {
    return 'json';
  }

  return 'upload';
};

const DatasetFileIconGraphic = ({ kind }: { kind: DatasetFileIconKind }) => {
  const iconSource = datasetFileIconSources[kind];

  if (iconSource) {
    return (
      <img
        alt=""
        className={`bi bi-filetype-${kind} task-dataset-import__file-icon-image`}
        draggable={false}
        src={iconSource}
      />
    );
  }

  if (kind === 'upload') {
    return (
      <svg
        aria-hidden="true"
        className="bi bi-file-earmark-arrow-up"
        fill="currentColor"
        viewBox="0 0 16 16"
      >
        <path d="M8.5 11.5a.5.5 0 0 1-1 0V7.707L6.354 8.854a.5.5 0 1 1-.708-.708l2-2a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1-.708.708L8.5 7.707z" />
        <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2M9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5z" />
      </svg>
    );
  }

  return null;
};

const formatTemplateOption = (
  template: TaskTemplateSummary | null | undefined,
  displayId = 'M-001',
): string => {
  if (!template?.id) {
    return '';
  }

  return [displayId, template.name, formatTemplateVersionLabel(template)].filter(Boolean).join(' · ');
};

const formatTemplateVersionLabel = (template: TaskTemplateSummary | null | undefined): string =>
  typeof template?.version === 'number' && template.version > 0 ? `v${template.version}` : '';

const TemplateSearchSelect = ({
  onChange,
  onCreateTemplateFromDataset,
  onOpen,
  onViewTemplate,
  options,
  value,
}: {
  onChange: (templateId: string) => void;
  onCreateTemplateFromDataset?: () => void;
  onOpen?: () => void;
  onViewTemplate?: (templateId: string) => void;
  options: TaskTemplateSummary[];
  value: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const templateDisplayIdMap = useMemo(() => createTemplateDisplayIdMap(options), [options]);
  const selectedTemplate = value ? options.find((template) => template.id === value) ?? null : null;
  const selectedLabel = selectedTemplate
    ? formatTemplateOption(selectedTemplate, templateDisplayIdMap.get(selectedTemplate.id))
    : '';
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((template) => templateSearchText(template, templateDisplayIdMap).includes(normalizedQuery))
    : options;
  const inputValue = isOpen ? query : selectedLabel;

  useEffect(() => {
    const handleDocumentMouseDown = (event: globalThis.MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
    };
  }, []);

  const selectTemplate = (template: TaskTemplateSummary) => {
    onChange(template.id);
    setQuery('');
    setIsOpen(false);
  };

  const createTemplateFromDataset = () => {
    onCreateTemplateFromDataset?.();
    setQuery('');
    setIsOpen(false);
  };

  const viewTemplate = (template: TaskTemplateSummary) => {
    onViewTemplate?.(template.id);
    setQuery('');
    setIsOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
      return;
    }

    if (event.key === 'Enter' && isOpen && filteredOptions.length > 0) {
      event.preventDefault();
      selectTemplate(filteredOptions[0]);
    }
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsOpen(false);
      setQuery('');
    }
  };

  return (
    <div className="task-template-picker" ref={rootRef} onBlur={handleBlur}>
      <input
        aria-autocomplete="list"
        aria-controls="task-template-picker-listbox"
        aria-expanded={isOpen}
        aria-label="关联模板"
        className="task-template-picker__input task-publish-form__control"
        placeholder="请选择评测模板"
        role="combobox"
        value={inputValue}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onClick={() => {
          onOpen?.();
          setIsOpen(true);
          setQuery('');
        }}
        onFocus={() => {
          onOpen?.();
          setIsOpen(true);
          setQuery('');
        }}
        onKeyDown={handleKeyDown}
      />
      <span className="task-template-picker__chevron" aria-hidden="true" />
      {isOpen ? (
        <div
          className="task-template-picker__menu"
          id="task-template-picker-listbox"
          role="listbox"
          aria-label="关联模板菜单"
        >
          {onCreateTemplateFromDataset ? (
            <button
              className="task-template-picker__option task-template-picker__option--create"
              type="button"
              aria-label="根据输入文件创建模板"
              onMouseDown={(event) => event.preventDefault()}
              onClick={createTemplateFromDataset}
            >
              <span>根据输入文件创建模板</span>
              <small>解析已上传文件字段，并在 ShowItem 中选择展示字段</small>
            </button>
          ) : null}
          {filteredOptions.length > 0 ? (
            filteredOptions.map((template) => {
              const displayId = templateDisplayIdMap.get(template.id) ?? 'M-001';
              const label = formatTemplateOption(template, displayId);
              const versionLabel = formatTemplateVersionLabel(template);

              return (
                <div
                  key={template.id}
                  className={[
                    'task-template-picker__option',
                    'task-template-picker__option--selectable',
                    template.id === value ? 'is-selected' : '',
                  ].filter(Boolean).join(' ')}
                  role="option"
                  aria-label={label}
                  aria-selected={template.id === value}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectTemplate(template);
                  }}
                  onClick={() => selectTemplate(template)}
                >
                  <span className="task-template-picker__option-main">
                    <code title={`原始ID：${template.id}`}>{displayId}</code>
                    <span>{template.name}</span>
                    {versionLabel ? (
                      <small className="task-template-picker__option-version">{versionLabel}</small>
                    ) : null}
                  </span>
                  {onViewTemplate ? (
                    <button
                      className="template-manager-row-action task-template-picker__view-button"
                      type="button"
                      aria-label={`查看 ${label} 模板配置`}
                      title="查看模板配置"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        viewTemplate(template);
                      }}
                    >
                      <img aria-hidden="true" alt="" className="template-manager-row-action__icon" src={eyeIcon} />
                    </button>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="task-template-picker__empty">没有匹配的评测模板</div>
          )}
        </div>
      ) : null}
    </div>
  );
};

const templateSearchText = (template: TaskTemplateSummary, displayIdMap: Map<string, string>): string =>
  [
    template.id,
    displayIdMap.get(template.id) ?? '',
    template.name,
    formatTemplateVersionLabel(template),
    formatTemplateOption(template, displayIdMap.get(template.id)),
  ].join(' ').toLowerCase();

type TagComposerState = 'closed' | 'closing' | 'committing' | 'open';

const MAX_TASK_TAGS = 5;
const TASK_TAG_DRAG_GAP = 8;
const TASK_TAG_DRAG_HOLD_MS = 160;

type TaskTagDragState = {
  activeIndex: number;
  currentX: number;
  originX: number;
  pointerId: number;
  shiftWidth: number;
  tag: string;
  targetIndex: number;
};

type PendingTaskTagDrag = {
  originX: number;
  pointerId: number;
  startIndex: number;
  tag: string;
  tagElement: HTMLSpanElement;
};

const TagBubbleEditor = ({
  fieldError,
  tags,
  onChange,
}: {
  fieldError?: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}) => {
  const [composerState, setComposerState] = useState<TagComposerState>('closed');
  const [draftTag, setDraftTag] = useState('');
  const [enteringTag, setEnteringTag] = useState<string | null>(null);
  const [removingTag, setRemovingTag] = useState<{ tag: string; width: number } | null>(null);
  const [dragState, setDragState] = useState<TaskTagDragState | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isTagInputComposingRef = useRef(false);
  const tagElementRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const pendingDragRef = useRef<PendingTaskTagDrag | null>(null);
  const dragStateRef = useRef<TaskTagDragState | null>(null);
  const dragHoldTimerRef = useRef<number | null>(null);
  const { dismissToast, messages, showErrorToast } = useToastController();
  const isComposerVisible = composerState !== 'closed';
  const isAtTagLimit = tags.length >= MAX_TASK_TAGS;

  useEffect(() => {
    if (composerState !== 'open') {
      return;
    }

    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [composerState]);

  useEffect(() => {
    return () => {
      if (dragHoldTimerRef.current) {
        window.clearTimeout(dragHoldTimerRef.current);
        dragHoldTimerRef.current = null;
      }
    };
  }, []);

  const showTagLimitNotice = () => {
    showErrorToast('最多 5 个标签。');
  };

  const collapseComposer = () => {
    isTagInputComposingRef.current = false;
    setComposerState((currentState) => (currentState === 'open' ? 'closing' : currentState));
  };

  const commitTag = (withAnimation = true) => {
    const tag = draftTag.trim();

    if (!tag || tags.includes(tag)) {
      inputRef.current?.focus();
      return;
    }

    if (isAtTagLimit) {
      showTagLimitNotice();
      return;
    }

    onChange([...tags, tag]);
    setEnteringTag(tag);
    isTagInputComposingRef.current = false;

    if (withAnimation) {
      setComposerState('committing');
      return;
    }

    setDraftTag('');
    setComposerState('closed');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const isComposing = isTagInputComposingRef.current || event.nativeEvent.isComposing || event.keyCode === 229;

      if (isComposing) {
        return;
      }

      event.preventDefault();
      commitTag(false);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      collapseComposer();
    }
  };

  const handleComposerBlur = (event: FocusEvent<HTMLFormElement>) => {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    collapseComposer();
  };

  const removeTag = (tag: string, event: MouseEvent<HTMLButtonElement>) => {
    if (removingTag) {
      return;
    }

    const tagElement = event.currentTarget.closest('.task-tag-bubble');
    const measuredWidth = tagElement instanceof HTMLElement ? tagElement.getBoundingClientRect().width : 0;
    const width = measuredWidth > 0 ? measuredWidth : 80;

    setRemovingTag({ tag, width });
  };

  const handleAddTagClick = () => {
    if (isAtTagLimit) {
      showTagLimitNotice();
      return;
    }

    setComposerState('open');
  };

  const clearDragHoldTimer = () => {
    if (dragHoldTimerRef.current) {
      window.clearTimeout(dragHoldTimerRef.current);
      dragHoldTimerRef.current = null;
    }
  };

  const startTagDrag = (tag: string, event: PointerEvent<HTMLSpanElement>) => {
    if ((event.button !== 0 && event.button !== undefined) || removingTag) {
      return;
    }

    const tagElement = event.currentTarget.closest('.task-tag-bubble');
    const startIndex = tags.indexOf(tag);

    if (!(tagElement instanceof HTMLSpanElement) || startIndex < 0) {
      return;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
    clearDragHoldTimer();
    const originX = getTaskTagPointerClientX(event);

    pendingDragRef.current = {
      originX,
      pointerId: event.pointerId,
      startIndex,
      tag,
      tagElement,
    };

    dragHoldTimerRef.current = window.setTimeout(() => {
      const pendingDrag = pendingDragRef.current;

      if (!pendingDrag || pendingDrag.pointerId !== event.pointerId) {
        return;
      }

      const measuredWidth = pendingDrag.tagElement.getBoundingClientRect().width;
      const nextDragState = {
        activeIndex: pendingDrag.startIndex,
        currentX: pendingDrag.originX,
        originX: pendingDrag.originX,
        pointerId: pendingDrag.pointerId,
        shiftWidth: (measuredWidth > 0 ? measuredWidth : 80) + TASK_TAG_DRAG_GAP,
        tag: pendingDrag.tag,
        targetIndex: pendingDrag.startIndex,
      };

      dragStateRef.current = nextDragState;
      setDragState(nextDragState);
      dragHoldTimerRef.current = null;
    }, TASK_TAG_DRAG_HOLD_MS);
  };

  const moveTagDrag = (event: PointerEvent<HTMLSpanElement>) => {
    const currentDrag = dragStateRef.current;

    if (!currentDrag || currentDrag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();

    const nextDragState = {
      ...currentDrag,
      currentX: getTaskTagPointerClientX(event),
      targetIndex: getTaskTagDragTargetIndex(
        tags,
        tagElementRefs.current,
        currentDrag.tag,
        getTaskTagPointerClientX(event),
      ),
    };

    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  };

  const finishTagDrag = (event: PointerEvent<HTMLSpanElement>) => {
    const currentDrag = dragStateRef.current;

    clearDragHoldTimer();
    pendingDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (!currentDrag || currentDrag.pointerId !== event.pointerId) {
      return;
    }

    const activeIndex = tags.indexOf(currentDrag.tag);

    if (activeIndex >= 0 && currentDrag.targetIndex >= 0 && activeIndex !== currentDrag.targetIndex) {
      onChange(moveTaskTag(tags, activeIndex, currentDrag.targetIndex));
    }

    dragStateRef.current = null;
    setDragState(null);
  };

  const cancelTagDrag = (event: PointerEvent<HTMLSpanElement>) => {
    clearDragHoldTimer();
    pendingDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragStateRef.current = null;
    setDragState(null);
  };

  const getTagDragStyle = (
    tag: string,
    baseStyle?: CSSProperties,
  ): CSSProperties | undefined => {
    if (!dragState) {
      return baseStyle;
    }

    const offset = getTaskTagDragOffset(tags, dragState, tag);

    if (offset === 0 && dragState.tag !== tag) {
      return baseStyle;
    }

    return {
      ...baseStyle,
      transform: `translateX(${offset}px)`,
      zIndex: dragState.tag === tag ? 5 : undefined,
    };
  };

  return (
    <div className="task-tag-editor">
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <div className="task-tag-editor__heading">
        <span>标签</span>
      </div>
      <div className={`task-tag-editor__bubbles${dragState ? ' task-tag-editor__bubbles--dragging' : ''}`}>
        {tags.map((tag) => (
          <span
            className={`task-tag-bubble task-tag-bubble--removable${
              enteringTag === tag ? ' task-tag-bubble--entering' : ''
            }${removingTag?.tag === tag ? ' task-tag-bubble--removing' : ''}${
              dragState?.tag === tag ? ' task-tag-bubble--dragging' : ''
            }${
              dragState && dragState.tag !== tag && getTaskTagDragOffset(tags, dragState, tag) !== 0
                ? ' task-tag-bubble--drag-shifted'
                : ''
            }`}
            key={tag}
            ref={(element) => {
              if (element) {
                tagElementRefs.current.set(tag, element);
                return;
              }

              tagElementRefs.current.delete(tag);
            }}
            style={getTagDragStyle(
              tag,
              removingTag?.tag === tag
                ? ({ '--task-tag-remove-width': `${removingTag.width}px` } as CSSProperties)
                : undefined,
            )}
            onAnimationEnd={(event) => {
              if (event.target !== event.currentTarget) {
                return;
              }

              if (removingTag?.tag === tag) {
                onChange(tags.filter((currentTag) => currentTag !== tag));
                setRemovingTag(null);
                return;
              }

              if (enteringTag === tag) {
                setEnteringTag(null);
              }
            }}
          >
            <span
              className={`task-tag-bubble__surface${
                removingTag?.tag === tag ? ' task-tag-bubble__surface--removing' : ''
              }`}
              onPointerDown={(event) => startTagDrag(tag, event)}
              onPointerMove={moveTagDrag}
              onPointerUp={finishTagDrag}
              onPointerCancel={cancelTagDrag}
            >
              <span className="task-tag-bubble__label">{tag}</span>
              <button
                aria-label={`删除标签 ${tag}`}
                className="task-tag-bubble__remove"
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => removeTag(tag, event)}
              >
                <span aria-hidden="true" />
              </button>
            </span>
          </span>
        ))}
        {isComposerVisible ? (
          <form
            aria-label="新标签输入"
            className={`task-tag-composer${
              composerState === 'closing' ? ' task-tag-composer--closing' : ''
            }${composerState === 'committing' ? ' task-tag-composer--committing' : ''}`}
            onAnimationEnd={(event) => {
              if (event.target !== event.currentTarget) {
                return;
              }

              if (composerState === 'committing') {
                setDraftTag('');
                setComposerState('closed');
                return;
              }

              setComposerState((currentState) => (currentState === 'closing' ? 'closed' : currentState));
            }}
            onBlur={handleComposerBlur}
            onSubmit={(event) => {
              event.preventDefault();

              if (isTagInputComposingRef.current) {
                return;
              }

              commitTag();
            }}
          >
            <input
              ref={inputRef}
              aria-label="新标签"
              className="task-tag-composer__input"
              value={draftTag}
              onChange={(event) => setDraftTag(event.target.value)}
              onCompositionStart={() => {
                isTagInputComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isTagInputComposingRef.current = false;
              }}
              onKeyDown={handleKeyDown}
            />
            <button
              aria-label="确认新增标签"
              className="task-tag-composer__confirm"
              type="submit"
            >
              <span aria-hidden="true" />
            </button>
          </form>
        ) : (
          <button
            aria-label="新增标签"
            className="task-tag-bubble task-tag-bubble--add"
            type="button"
            onClick={handleAddTagClick}
          >
            +
          </button>
        )}
      </div>
      <FieldError message={fieldError} />
    </div>
  );
};

const getTaskTagPointerClientX = (event: PointerEvent<HTMLElement>): number => {
  const clientX = Number(event.clientX);

  return Number.isFinite(clientX) ? clientX : 0;
};

const getTaskTagDragTargetIndex = (
  tags: readonly string[],
  tagElements: Map<string, HTMLSpanElement>,
  activeTag: string,
  clientX: number,
): number => {
  const activeIndex = tags.indexOf(activeTag);

  if (activeIndex < 0) {
    return activeIndex;
  }

  let targetIndex = activeIndex;

  if (clientX >= getTaskTagCenterX(tagElements, activeTag)) {
    for (let index = activeIndex + 1; index < tags.length; index += 1) {
      if (clientX > getTaskTagCenterX(tagElements, tags[index])) {
        targetIndex = index;
      }
    }

    return targetIndex;
  }

  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    if (clientX < getTaskTagCenterX(tagElements, tags[index])) {
      targetIndex = index;
    }
  }

  return targetIndex;
};

const getTaskTagCenterX = (
  tagElements: Map<string, HTMLSpanElement>,
  tag: string,
): number => {
  const tagElement = tagElements.get(tag);

  if (!tagElement) {
    return Number.POSITIVE_INFINITY;
  }

  const rect = tagElement.getBoundingClientRect();

  return rect.left + rect.width / 2;
};

const getTaskTagDragOffset = (
  tags: readonly string[],
  dragState: TaskTagDragState,
  tag: string,
): number => {
  if (tag === dragState.tag) {
    return dragState.currentX - dragState.originX;
  }

  const tagIndex = tags.indexOf(tag);

  if (tagIndex < 0 || dragState.targetIndex === dragState.activeIndex) {
    return 0;
  }

  if (
    dragState.targetIndex > dragState.activeIndex &&
    tagIndex > dragState.activeIndex &&
    tagIndex <= dragState.targetIndex
  ) {
    return -dragState.shiftWidth;
  }

  if (
    dragState.targetIndex < dragState.activeIndex &&
    tagIndex >= dragState.targetIndex &&
    tagIndex < dragState.activeIndex
  ) {
    return dragState.shiftWidth;
  }

  return 0;
};

const moveTaskTag = (
  tags: readonly string[],
  fromIndex: number,
  toIndex: number,
): string[] => {
  const nextTags = [...tags];
  const [movedTag] = nextTags.splice(fromIndex, 1);

  if (movedTag === undefined) {
    return nextTags;
  }

  nextTags.splice(toIndex, 0, movedTag);

  return nextTags;
};

const FieldError = ({
  inline = false,
  message,
  onAnimationEnd,
}: {
  inline?: boolean;
  message?: string;
  onAnimationEnd?: () => void;
}) => {
  if (!message) {
    return null;
  }

  return (
    <small
      className={inline ? 'task-publish-field-error task-publish-field-error--inline' : 'task-publish-field-error'}
      onAnimationEnd={onAnimationEnd}
    >
      {message}
    </small>
  );
};

const DeadlinePicker = ({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) => {
  const selectedDate = value ? new Date(value) : null;
  const safeSelectedDate = selectedDate && Number.isFinite(selectedDate.getTime()) ? selectedDate : null;
  const activeDate = safeSelectedDate ?? createDefaultDeadlineDate();
  const inputRef = useRef<HTMLInputElement>(null);
  const hourWheelRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hourDragRef = useRef<{
    lastTime: number;
    lastY: number;
    startDate: Date;
    startHour: number;
    startY: number;
    velocity: number;
  } | null>(null);
  const hourWheelDeltaRef = useRef(0);
  const hourWheelDeltaResetTimerRef = useRef<number | null>(null);
  const hourScrollSnapTimerRef = useRef<number | null>(null);
  const hourScrollSyncReleaseTimerRef = useRef<number | null>(null);
  const isSyncingHourScrollRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isHourDragging, setIsHourDragging] = useState(false);
  const [hourWheelSelectedIndex, setHourWheelSelectedIndex] = useState(
    DEADLINE_HOUR_WHEEL_CYCLE_OFFSET + activeDate.getHours(),
  );
  const [viewDate, setViewDate] = useState(activeDate);
  const [draftDate, setDraftDate] = useState(activeDate);
  const now = new Date();
  const minDateTimeValue = formatDateTimeLocalValue(now);
  const dateTimeValue = formatDateTimeLocalValue(activeDate);
  const calendarDays = getCalendarGridDays(viewDate);
  const isConfirmDisabled = draftDate < now;

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setDraftDate(activeDate);
    setViewDate(activeDate);
  }, [value, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleDocumentMouseDown = (event: globalThis.MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      clearHourWheelTimers();
    };
  }, []);

  const handleDateTimeChange = (dateTimeValue: string) => {
    const parsedDate = parseDateTimeLocalValue(dateTimeValue);
    const nextDate = parsedDate ? normalizeDeadlineHour(parsedDate) : null;

    if (!nextDate || nextDate < new Date()) {
      return;
    }

    onChange(nextDate.toISOString());
  };

  const handleTriggerClick = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    const nextDate = normalizeDeadlineHour(safeSelectedDate ?? createDefaultDeadlineDate());
    setDraftDate(nextDate);
    setViewDate(nextDate);
    setIsOpen(true);
  };

  const handleDayClick = (date: Date) => {
    setDraftDate(mergeDateWithTime(date, draftDate));
  };

  const handleConfirm = () => {
    if (draftDate < new Date()) {
      return;
    }

    const nextDate = normalizeDeadlineHour(draftDate);
    onChange(nextDate.toISOString());
    setIsOpen(false);
  };

  const handleCancel = () => {
    setDraftDate(activeDate);
    setViewDate(activeDate);
    setIsOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const clearHourWheelTimers = () => {
    if (hourWheelDeltaResetTimerRef.current !== null) {
      window.clearTimeout(hourWheelDeltaResetTimerRef.current);
      hourWheelDeltaResetTimerRef.current = null;
    }

    if (hourScrollSnapTimerRef.current !== null) {
      window.clearTimeout(hourScrollSnapTimerRef.current);
      hourScrollSnapTimerRef.current = null;
    }

    if (hourScrollSyncReleaseTimerRef.current !== null) {
      window.clearTimeout(hourScrollSyncReleaseTimerRef.current);
      hourScrollSyncReleaseTimerRef.current = null;
    }
  };

  const resetHourWheelDeltaAfterIdle = () => {
    if (hourWheelDeltaResetTimerRef.current !== null) {
      window.clearTimeout(hourWheelDeltaResetTimerRef.current);
    }

    hourWheelDeltaResetTimerRef.current = window.setTimeout(() => {
      hourWheelDeltaRef.current = 0;
      hourWheelDeltaResetTimerRef.current = null;
    }, DEADLINE_HOUR_WHEEL_WHEEL_IDLE_RESET_MS);
  };

  const releaseHourWheelSyncAfterScroll = () => {
    if (hourScrollSyncReleaseTimerRef.current !== null) {
      window.clearTimeout(hourScrollSyncReleaseTimerRef.current);
    }

    hourScrollSyncReleaseTimerRef.current = window.setTimeout(() => {
      isSyncingHourScrollRef.current = false;
      hourScrollSyncReleaseTimerRef.current = null;
    }, DEADLINE_HOUR_WHEEL_SYNC_RELEASE_MS);
  };

  const syncHourWheelToIndex = (index: number, behavior: ScrollBehavior = 'smooth') => {
    const wheel = hourWheelRef.current;
    if (!wheel) {
      return;
    }

    const nextIndex = clampHourWheelIndex(index);
    setHourWheelSelectedIndex(nextIndex);
    isSyncingHourScrollRef.current = true;
    scrollHourWheelTo(wheel, nextIndex * DEADLINE_HOUR_WHEEL_ITEM_HEIGHT, behavior);
    releaseHourWheelSyncAfterScroll();
  };

  const syncHourWheelToHour = (hour: number, behavior: ScrollBehavior = 'smooth') => {
    syncHourWheelToIndex(DEADLINE_HOUR_WHEEL_CYCLE_OFFSET + wrapDeadlineHour(hour), behavior);
  };

  const handleHourWheelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setDraftDate((currentDate) => shiftDeadlineHour(currentDate, 1));
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setDraftDate((currentDate) => shiftDeadlineHour(currentDate, -1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setDraftDate((currentDate) => setDeadlineHour(currentDate, 0));
    } else if (event.key === 'End') {
      event.preventDefault();
      setDraftDate((currentDate) => setDeadlineHour(currentDate, 23));
    }
  };

  const handleHourWheelPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const pointerY = getPointerClientY(event);
    if (pointerY === null) {
      return;
    }

    event.preventDefault();
    hourDragRef.current = {
      lastTime: event.timeStamp,
      lastY: pointerY,
      startDate: draftDate,
      startHour: draftDate.getHours(),
      startY: pointerY,
      velocity: 0,
    };
    setIsHourDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleHourWheelPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = hourDragRef.current;
    if (!drag) {
      return;
    }

    const pointerY = getPointerClientY(event);
    if (pointerY === null) {
      return;
    }

    event.preventDefault();
    const elapsedTime = event.timeStamp - drag.lastTime;
    if (elapsedTime >= 16) {
      drag.velocity = (drag.lastY - pointerY) / elapsedTime;
      drag.lastY = pointerY;
      drag.lastTime = event.timeStamp;
    }

    const hourOffset = Math.round((drag.startY - pointerY) / DEADLINE_HOUR_WHEEL_DRAG_STEP);
    if (hourOffset === 0) {
      return;
    }

    setDraftDate(setDeadlineHour(drag.startDate, wrapDeadlineHour(drag.startHour + hourOffset)));
  };

  const handleHourWheelPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const drag = hourDragRef.current;
    const momentumOffset = drag ? resolveHourWheelMomentumOffset(drag.velocity) : 0;

    hourDragRef.current = null;
    setIsHourDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (momentumOffset !== 0) {
      setDraftDate((currentDate) => shiftDeadlineHour(currentDate, momentumOffset));
    }
  };

  const handleHourWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const wheelDirection = Math.sign(event.deltaY);
    if (wheelDirection === 0) {
      return;
    }

    if (Math.sign(hourWheelDeltaRef.current) !== 0 && Math.sign(hourWheelDeltaRef.current) !== wheelDirection) {
      hourWheelDeltaRef.current = 0;
    }

    hourWheelDeltaRef.current += event.deltaY;
    resetHourWheelDeltaAfterIdle();

    if (Math.abs(hourWheelDeltaRef.current) < DEADLINE_HOUR_WHEEL_WHEEL_DELTA_THRESHOLD) {
      return;
    }

    const hourOffset = Math.sign(hourWheelDeltaRef.current);
    hourWheelDeltaRef.current = 0;
    const nextHour = wrapDeadlineHour(draftHour + hourOffset);

    setDraftDate((currentDate) => setDeadlineHour(currentDate, nextHour));
    window.setTimeout(() => syncHourWheelToHour(nextHour), 0);
  };

  const handleHourWheelScroll = (event: UIEvent<HTMLDivElement>) => {
    if (isSyncingHourScrollRef.current || isHourDragging) {
      return;
    }

    const wheel = event.currentTarget;
    const nextIndex = clampHourWheelIndex(Math.round(wheel.scrollTop / DEADLINE_HOUR_WHEEL_ITEM_HEIGHT));
    const nextHour = wrapDeadlineHour(nextIndex - DEADLINE_HOUR_WHEEL_CYCLE_OFFSET);
    setHourWheelSelectedIndex(nextIndex);
    setDraftDate((currentDate) => (
      currentDate.getHours() === nextHour ? currentDate : setDeadlineHour(currentDate, nextHour)
    ));

    if (hourScrollSnapTimerRef.current !== null) {
      window.clearTimeout(hourScrollSnapTimerRef.current);
    }

    hourScrollSnapTimerRef.current = window.setTimeout(() => {
      syncHourWheelToIndex(nextIndex);
      hourScrollSnapTimerRef.current = null;
    }, DEADLINE_HOUR_WHEEL_SNAP_DELAY_MS);
  };

  const draftHour = draftDate.getHours();
  const calendarTitle = formatCalendarMonthLabel(viewDate);
  const triggerText = safeSelectedDate ? formatDateTimeLabel(safeSelectedDate) : '选择截止时间';
  const triggerHint = safeSelectedDate ? '整点截止' : '请选择日期与整点';
  const draftDateTimeLabel = formatDateTimeMinuteLabel(draftDate);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const selectedIndexHour = wrapDeadlineHour(hourWheelSelectedIndex - DEADLINE_HOUR_WHEEL_CYCLE_OFFSET);
    const wheel = hourWheelRef.current;
    const isWheelAlreadyAligned =
      wheel &&
      selectedIndexHour === draftHour &&
      Math.abs(wheel.scrollTop - hourWheelSelectedIndex * DEADLINE_HOUR_WHEEL_ITEM_HEIGHT) <= 1;

    if (isWheelAlreadyAligned) {
      return;
    }

    syncHourWheelToHour(draftHour, 'auto');
  }, [draftHour, hourWheelSelectedIndex, isOpen]);

  return (
    <div ref={rootRef} className="task-deadline-picker" onKeyDown={handleKeyDown}>
      <button
        type="button"
        className="task-deadline-picker__trigger task-publish-form__control"
        aria-label={`选择截止时间${safeSelectedDate ? `，当前 ${formatDateTimeLabel(safeSelectedDate)}` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={handleTriggerClick}
      >
        <span className="task-deadline-picker__trigger-content">
          <span className="task-deadline-picker__trigger-label">{triggerText}</span>
          <small className="task-deadline-picker__trigger-hint">{triggerHint}</small>
        </span>
        <span className="task-deadline-picker__trigger-icon" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="task-deadline-picker__popover" role="dialog" aria-label="选择截止时间">
          <section className="task-deadline-picker__calendar" aria-label="截止日期">
            <div className="task-deadline-picker__header">
              <button
                type="button"
                className="task-deadline-picker__nav"
                aria-label="上个月"
                onClick={() => setViewDate(addCalendarMonths(viewDate, -1))}
              >
                ‹
              </button>
              <strong aria-live="polite">
                <span key={calendarTitle} className="task-deadline-picker__title-text">
                  {calendarTitle}
                </span>
              </strong>
              <button
                type="button"
                className="task-deadline-picker__nav"
                aria-label="下个月"
                onClick={() => setViewDate(addCalendarMonths(viewDate, 1))}
              >
                ›
              </button>
            </div>
            <div className="task-deadline-picker__weekdays" aria-hidden="true">
              {DEADLINE_WEEKDAY_LABELS.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="task-deadline-picker__days">
              {calendarDays.map((date) => {
                const dateLabel = formatDateButtonLabel(date);
                const isOutsideViewMonth = date.getMonth() !== viewDate.getMonth();
                const isDisabled = isOutsideViewMonth || isCalendarDayBefore(date, now);
                const isSelected = !isOutsideViewMonth && isSameCalendarDay(date, draftDate);
                const className = [
                  'task-deadline-picker__day',
                  isOutsideViewMonth ? 'task-deadline-picker__day--muted' : '',
                  isSelected ? 'task-deadline-picker__day--selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <button
                    key={dateLabel}
                    type="button"
                    className={className}
                    aria-label={isDisabled ? `${dateLabel} 不可选` : dateLabel}
                    aria-current={isSelected ? 'date' : undefined}
                    disabled={isDisabled}
                    onClick={() => handleDayClick(date)}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </section>
          <section className="task-deadline-picker__time" aria-label="截止时间">
            <div className="task-deadline-picker__time-heading">
              <span>选择时间</span>
            </div>
            <div
              className={`task-deadline-picker__hour-wheel-shell${isHourDragging ? ' is-dragging' : ''}`}
            >
              <div
                ref={hourWheelRef}
                className="task-deadline-picker__hour-wheel"
                aria-label="截止整点"
                aria-valuemax={23}
                aria-valuemin={0}
                aria-valuenow={draftHour}
                aria-valuetext={formatHourWheelLabel(draftHour)}
                role="spinbutton"
                tabIndex={0}
                onKeyDown={handleHourWheelKeyDown}
                onPointerCancel={handleHourWheelPointerEnd}
                onPointerDown={handleHourWheelPointerDown}
                onPointerMove={handleHourWheelPointerMove}
                onPointerUp={handleHourWheelPointerEnd}
                onScroll={handleHourWheelScroll}
                onWheel={handleHourWheel}
              >
                {DEADLINE_HOUR_WHEEL_OPTIONS.map(({ hour, index }) => {
                  const distanceFromSelected = index - hourWheelSelectedIndex;
                  const className = getHourWheelOptionClassName(distanceFromSelected);
                  const content = formatHourWheelLabel(hour);

                  return (
                    <button
                      key={index}
                      type="button"
                      className={className}
                      aria-current={distanceFromSelected === 0 ? 'time' : undefined}
                      onClick={() => setDraftDate((currentDate) => setDeadlineHour(currentDate, hour))}
                    >
                      {content}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
          <div className="task-deadline-picker__footer">
            <p className="task-deadline-picker__selected-summary">
              <span>已选择：</span>
              <strong>{draftDateTimeLabel}</strong>
            </p>
            <div className="task-deadline-picker__footer-actions">
              <button type="button" className="task-deadline-picker__cancel" onClick={handleCancel}>
                取消
              </button>
              <button
                type="button"
                className="task-deadline-picker__confirm"
                disabled={isConfirmDisabled}
                onClick={handleConfirm}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <input
        ref={inputRef}
        aria-label="截止日期时间"
        className="task-deadline-picker__native-input"
        type="datetime-local"
        step="1"
        min={minDateTimeValue}
        tabIndex={-1}
        value={dateTimeValue}
        onChange={(event) => handleDateTimeChange(event.target.value)}
      />
    </div>
  );
};

const createDefaultDeadlineDate = (): Date => {
  const date = new Date();
  date.setHours(23, 0, 0, 0);

  return date;
};

const DEADLINE_HOUR_WHEEL_CYCLE_COUNT = 3;
const DEADLINE_HOUR_WHEEL_CYCLE_OFFSET = 24;
const DEADLINE_HOUR_WHEEL_ITEM_HEIGHT = 38;
const DEADLINE_HOUR_WHEEL_OPTION_COUNT = 24 * DEADLINE_HOUR_WHEEL_CYCLE_COUNT;
const DEADLINE_HOUR_WHEEL_SNAP_DELAY_MS = 90;
const DEADLINE_HOUR_WHEEL_DRAG_STEP = DEADLINE_HOUR_WHEEL_ITEM_HEIGHT * 2;
const DEADLINE_HOUR_WHEEL_SYNC_RELEASE_MS = 140;
const DEADLINE_HOUR_WHEEL_WHEEL_DELTA_THRESHOLD = 96;
const DEADLINE_HOUR_WHEEL_WHEEL_IDLE_RESET_MS = 180;
const DEADLINE_HOUR_WHEEL_MOMENTUM_THRESHOLD = 1.2;
const DEADLINE_WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const DEADLINE_HOUR_WHEEL_OPTIONS = Array.from({ length: DEADLINE_HOUR_WHEEL_OPTION_COUNT }, (_, index) => ({
  hour: wrapDeadlineHour(index - DEADLINE_HOUR_WHEEL_CYCLE_OFFSET),
  index,
}));

const getCalendarGridDays = (date: Date): Date[] => {
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const gridDate = new Date(gridStart);
    gridDate.setDate(gridStart.getDate() + index);
    gridDate.setHours(0, 0, 0, 0);

    return gridDate;
  });
};

const addCalendarMonths = (date: Date, amount: number): Date => {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
};

const isCalendarDayBefore = (date: Date, compareDate: Date): boolean => {
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const startOfCompareDate = new Date(compareDate.getFullYear(), compareDate.getMonth(), compareDate.getDate());

  return startOfDate < startOfCompareDate;
};

const isSameCalendarDay = (date: Date, compareDate: Date): boolean => {
  return (
    date.getFullYear() === compareDate.getFullYear() &&
    date.getMonth() === compareDate.getMonth() &&
    date.getDate() === compareDate.getDate()
  );
};

const mergeDateWithTime = (date: Date, timeSource: Date): Date => {
  const nextDate = new Date(date);
  nextDate.setHours(timeSource.getHours(), 0, 0, 0);

  return nextDate;
};

const setDeadlineHour = (date: Date, value: number): Date => {
  const nextDate = new Date(date);

  nextDate.setHours(wrapDeadlineHour(value), 0, 0, 0);

  return nextDate;
};

const shiftDeadlineHour = (date: Date, offset: number): Date => setDeadlineHour(date, date.getHours() + offset);

const resolveHourWheelMomentumOffset = (velocity: number): number => {
  const magnitude = Math.abs(velocity);
  if (magnitude < DEADLINE_HOUR_WHEEL_MOMENTUM_THRESHOLD) {
    return 0;
  }

  return Math.sign(velocity);
};

const clampHourWheelIndex = (value: number): number => {
  return Math.min(DEADLINE_HOUR_WHEEL_OPTION_COUNT - 1, Math.max(0, value));
};

const scrollHourWheelTo = (element: HTMLDivElement, top: number, behavior: ScrollBehavior) => {
  if (typeof element.scrollTo === 'function') {
    element.scrollTo({ top, behavior });
    return;
  }

  element.scrollTop = top;
};

const getHourWheelOptionClassName = (distanceFromSelected: number): string => {
  return [
    'task-deadline-picker__hour-option',
    distanceFromSelected === 0 ? 'task-deadline-picker__hour-option--selected' : '',
  ].filter(Boolean).join(' ');
};

function wrapDeadlineHour(value: number): number {
  return ((value % 24) + 24) % 24;
}

const formatHourWheelLabel = (value: number): string => {
  return `${String(wrapDeadlineHour(value)).padStart(2, '0')}:00`;
};

const formatDateTimeMinuteLabel = (date: Date): string => {
  return `${formatDateButtonLabel(date)} ${String(date.getHours()).padStart(2, '0')}:00`;
};

const getPointerClientY = (event: PointerEvent<HTMLDivElement>): number | null => {
  return Number.isFinite(event.clientY) ? event.clientY : null;
};

const normalizeDeadlineHour = (date: Date): Date => {
  const nextDate = new Date(date);
  nextDate.setMinutes(0, 0, 0);

  return nextDate;
};

const parseDateTimeLocalValue = (value: string): Date | null => {
  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date : null;
};

const formatCalendarMonthLabel = (date: Date): string => {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
};

const formatDateButtonLabel = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatDateTimeLocalValue = (date: Date): string => {
  return `${formatDateButtonLabel(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
};

const formatDateTimeLabel = (date: Date): string => {
  return `${formatDateButtonLabel(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
};

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { getSchemaFieldKey, type FieldAiReviewRole, type SchemaField, type ShowItemDisplayField } from '@labelhub/shared';

import { FilterSelect } from '../../components/FilterSelect';
import { CUSTOM_VALIDATOR_OPTIONS } from './templateStore';

type PropertyPanelProps = {
  field: SchemaField | null;
  schemaFields?: readonly SchemaField[];
  activeTabKey?: string;
  onActivateTab?: (tabKey: string) => void;
  onUpdateField: (patch: Partial<SchemaField>) => void;
  onUpdateValidation: (patch: NonNullable<SchemaField['validation']>) => void;
  onAddLinkageRule: () => void;
};

type NormalizedAiReviewConfig = {
  enabled: boolean;
  role: FieldAiReviewRole;
  requirement: string;
};

const SHOW_ITEM_DEFAULT_LAYOUT: NonNullable<SchemaField['displayConfig']>['layout'] = 'table';
const SHOW_ITEM_FORMAT_OPTIONS = [
  { label: '文本', value: 'text' },
  { label: '代码', value: 'code' },
] as const;
const FIELD_DESCRIPTION_MAX_LENGTH = 20;

type LinkageOperator = NonNullable<SchemaField['linkageRules']>[number]['when']['operator'];
type LinkageRule = NonNullable<SchemaField['linkageRules']>[number];

export const PropertyPanel = ({
  field,
  schemaFields = [],
  activeTabKey,
  onActivateTab = () => undefined,
  onUpdateField,
  onUpdateValidation,
  onAddLinkageRule,
}: PropertyPanelProps) => {
  const isShowItemField = field?.type === 'show_item';
  const isGroupField = field?.type === 'group';
  const isTabsField = field?.type === 'tabs';
  const panelTitle = isShowItemField ? '题目展示字段' : '属性配置';
  const panelClassName = isShowItemField
    ? 'designer-panel designer-properties designer-properties--show-item'
    : 'designer-panel designer-properties';

  return (
    <aside className={panelClassName} aria-label="属性配置">
      {!field || !isShowItemField ? <h2>{panelTitle}</h2> : null}
      {!field ? null : isShowItemField ? (
        <div className="designer-property-stack designer-property-stack--show-item">
          <ShowItemDisplayConfigEditor field={field} schemaFields={schemaFields} onUpdateField={onUpdateField} />
        </div>
      ) : isGroupField ? (
        <div className="designer-property-stack">
          <GroupContainerProperties field={field} onUpdateField={onUpdateField} />
          <LinkageProperties
            field={field}
            schemaFields={schemaFields}
            onAddLinkageRule={onAddLinkageRule}
            onUpdateField={onUpdateField}
          />
        </div>
      ) : isTabsField ? (
        <div className="designer-property-stack">
          <TabsContainerProperties
            activeTabKey={activeTabKey}
            field={field}
            onActivateTab={onActivateTab}
            onUpdateField={onUpdateField}
          />
          <LinkageProperties
            field={field}
            schemaFields={schemaFields}
            onAddLinkageRule={onAddLinkageRule}
            onUpdateField={onUpdateField}
          />
        </div>
      ) : (
        <div className="designer-property-stack">
          <BasicProperties
            field={field}
            schemaFields={schemaFields}
            onUpdateField={onUpdateField}
            onUpdateValidation={onUpdateValidation}
          />
          <ValidationProperties field={field} onUpdateValidation={onUpdateValidation} />
          <LinkageProperties
            field={field}
            schemaFields={schemaFields}
            onAddLinkageRule={onAddLinkageRule}
            onUpdateField={onUpdateField}
          />
        </div>
      )}
    </aside>
  );
};

const BasicProperties = ({
  field,
  schemaFields,
  onUpdateField,
  onUpdateValidation,
}: {
  field: SchemaField;
  schemaFields: readonly SchemaField[];
  onUpdateField: (patch: Partial<SchemaField>) => void;
  onUpdateValidation: (patch: NonNullable<SchemaField['validation']>) => void;
}) => {
  const updateFileConstraints = (patch: NonNullable<SchemaField['fileConstraints']>) => {
    onUpdateField({
      fileConstraints: {
        ...(field.fileConstraints ?? {}),
        ...patch,
      },
    });
  };

  return (
    <>
      <div className="designer-form-grid">
        <PropertyRow label="字段名">
          <input
            aria-label="字段名"
            value={field.fieldKey ?? field.key}
            onChange={(event) => onUpdateField({ fieldKey: event.target.value })}
          />
        </PropertyRow>
        <PropertyRow label="标题">
          <input
            aria-label="标题"
            value={field.label}
            onChange={(event) => onUpdateField({ label: event.target.value })}
          />
        </PropertyRow>
        <PropertyRow label="字段说明">
          <input
            aria-label="字段说明"
            maxLength={FIELD_DESCRIPTION_MAX_LENGTH}
            placeholder="20字内说明"
            value={field.description ?? ''}
            onChange={(event) => onUpdateField({ description: event.target.value })}
          />
        </PropertyRow>
        <PropertyRow label="必填">
          <label className="designer-switch">
            <input
              aria-label="必填"
              checked={Boolean(field.validation?.required)}
              type="checkbox"
              onChange={(event) => onUpdateValidation({ required: event.target.checked })}
            />
            <span aria-hidden="true" />
          </label>
        </PropertyRow>
        {supportsPlaceholder(field) ? (
          <PropertyRow label="占位符">
            <input
              aria-label="占位符"
              value={field.placeholder ?? ''}
              onChange={(event) => onUpdateField({ placeholder: event.target.value })}
            />
          </PropertyRow>
        ) : null}
        {field.type === 'llm_assist' ? (
          <PropertyRow label="写入字段">
            <input
              aria-label="写入字段"
              value={field.targetFieldKey ?? ''}
              onChange={(event) => onUpdateField({ targetFieldKey: event.target.value })}
            />
          </PropertyRow>
        ) : null}
        {isChoiceField(field) ? (
          <OptionBubbleEditor
            key={field.key}
            options={field.options ?? []}
            onChange={(options) => onUpdateField({ options })}
          />
        ) : null}
        {field.type === 'file_upload' || field.type === 'image_upload' ? (
          <>
            <PropertyRow label="文件数量">
              <input
                aria-label="文件数量"
                min="1"
                type="number"
                value={field.fileConstraints?.maxFiles ?? ''}
                onChange={(event) => updateFileConstraints({ maxFiles: numericValue(event.target.value) })}
              />
            </PropertyRow>
            <PropertyRow label="大小上限 MB">
              <input
                aria-label="大小上限 MB"
                min="1"
                type="number"
                value={field.fileConstraints?.maxSizeMb ?? ''}
                onChange={(event) => updateFileConstraints({ maxSizeMb: numericValue(event.target.value) })}
              />
            </PropertyRow>
            <PropertyRow label="允许类型">
              <textarea
                aria-label="允许类型"
                value={formatMimeTypes(field)}
                onChange={(event) =>
                  updateFileConstraints({ acceptedMimeTypes: parseMimeTypes(event.target.value) })
                }
              />
            </PropertyRow>
          </>
        ) : null}
      </div>
      {supportsLlmPrompt(field) ? (
        <LlmPromptProperties
          field={field}
          schemaFields={schemaFields}
          onUpdateField={onUpdateField}
        />
      ) : null}
      <AiReviewProperties field={field} onUpdateField={onUpdateField} />
    </>
  );
};

const GroupContainerProperties = ({
  field,
  onUpdateField,
}: {
  field: SchemaField;
  onUpdateField: (patch: Partial<SchemaField>) => void;
}) => {
  const layout = field.layout === 'two_columns' ? 'two_columns' : 'single_column';

  return (
    <div className="designer-form-grid">
      <PropertyRow label="标题">
        <input
          aria-label="标题"
          value={field.label}
          onChange={(event) => onUpdateField({ label: event.target.value })}
        />
      </PropertyRow>
      <PropertyRow label="字段说明">
        <input
          aria-label="字段说明"
          maxLength={FIELD_DESCRIPTION_MAX_LENGTH}
          placeholder="20字内说明"
          value={field.description ?? ''}
          onChange={(event) => onUpdateField({ description: event.target.value })}
        />
      </PropertyRow>
      <PropertyRow label="默认展开">
        <label className="designer-switch">
          <input
            aria-label="默认展开"
            checked={!field.defaultCollapsed}
            type="checkbox"
            onChange={(event) => onUpdateField({ defaultCollapsed: !event.target.checked })}
          />
          <span aria-hidden="true" />
        </label>
      </PropertyRow>
      <PropertyRow label="布局列数">
        <div className="designer-segmented-control" role="group" aria-label="布局列数">
          <button
            className={layout === 'single_column' ? 'is-active' : ''}
            type="button"
            onClick={() => onUpdateField({ layout: 'single_column' })}
          >
            单列
          </button>
          <button
            className={layout === 'two_columns' ? 'is-active' : ''}
            type="button"
            onClick={() => onUpdateField({ layout: 'two_columns' })}
          >
            双列
          </button>
        </div>
      </PropertyRow>
    </div>
  );
};

const TabsContainerProperties = ({
  activeTabKey,
  field,
  onActivateTab,
  onUpdateField,
}: {
  activeTabKey?: string;
  field: SchemaField;
  onActivateTab: (tabKey: string) => void;
  onUpdateField: (patch: Partial<SchemaField>) => void;
}) => {
  const tabs = field.tabs ?? [];
  const selectedTabKey = activeTabKey && tabs.some((tab) => tab.key === activeTabKey)
    ? activeTabKey
    : tabs[0]?.key;

  const commitTabs = (nextTabs: NonNullable<SchemaField['tabs']>) => {
    onUpdateField({ tabs: nextTabs });
  };
  const uniqueTabKey = () => {
    const existingKeys = new Set(tabs.map((tab) => tab.key));
    let index = tabs.length + 1;
    let key = `tab_${index}`;

    while (existingKeys.has(key)) {
      index += 1;
      key = `tab_${index}`;
    }

    return key;
  };
  const updateTab = (tabKey: string, label: string) => {
    commitTabs(tabs.map((tab) => (tab.key === tabKey ? { ...tab, label } : tab)));
  };
  const addTab = () => {
    const key = uniqueTabKey();
    commitTabs([...tabs, { key, label: `Tab ${tabs.length + 1}`, fields: [] }]);
    onActivateTab(key);
  };
  const removeTab = (tabKey: string) => {
    if (tabs.length <= 1) {
      return;
    }

    const nextTabs = tabs.filter((tab) => tab.key !== tabKey);
    commitTabs(nextTabs);

    if (selectedTabKey === tabKey && nextTabs[0]) {
      onActivateTab(nextTabs[0].key);
    }
  };
  const moveTab = (tabKey: string, direction: 'up' | 'down') => {
    const currentIndex = tabs.findIndex((tab) => tab.key === tabKey);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= tabs.length) {
      return;
    }

    const nextTabs = [...tabs];
    const [tab] = nextTabs.splice(currentIndex, 1);
    nextTabs.splice(targetIndex, 0, tab);
    commitTabs(nextTabs);
  };

  return (
    <>
      <div className="designer-form-grid">
        <PropertyRow label="标题">
          <input
            aria-label="标题"
            value={field.label}
            onChange={(event) => onUpdateField({ label: event.target.value })}
          />
        </PropertyRow>
        <PropertyRow label="字段说明">
          <input
            aria-label="字段说明"
            maxLength={FIELD_DESCRIPTION_MAX_LENGTH}
            placeholder="20字内说明"
            value={field.description ?? ''}
            onChange={(event) => onUpdateField({ description: event.target.value })}
          />
        </PropertyRow>
      </div>
      <section className="designer-tab-manager" aria-label="Tab 管理列表">
        <div className="designer-tab-manager__header">
          <h3>Tab 管理</h3>
          <button className="designer-tab-manager__add" type="button" onClick={addTab}>
            <PropertyPanelPlusIcon />
            <span>新增 Tab</span>
          </button>
        </div>
        <div className="designer-tab-manager__list">
          {tabs.map((tab, index) => {
            const isActive = tab.key === selectedTabKey;

            return (
              <article
                key={tab.key}
                className={isActive ? 'designer-tab-manager__item is-active' : 'designer-tab-manager__item'}
              >
                <button
                  className="designer-tab-manager__activate"
                  type="button"
                  aria-label={`编辑 ${tab.label}`}
                  onClick={() => onActivateTab(tab.key)}
                >
                  编辑
                </button>
                <input
                  aria-label={`Tab ${index + 1} 名称`}
                  value={tab.label}
                  onFocus={() => onActivateTab(tab.key)}
                  onChange={(event) => updateTab(tab.key, event.target.value)}
                />
                <div className="designer-tab-manager__actions">
                  <button
                    type="button"
                    aria-label={`上移 ${tab.label}`}
                    disabled={index === 0}
                    onClick={() => moveTab(tab.key, 'up')}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`下移 ${tab.label}`}
                    disabled={index === tabs.length - 1}
                    onClick={() => moveTab(tab.key, 'down')}
                  >
                    ↓
                  </button>
                  <button
                    className="template-manager-row-action template-manager-row-action--delete designer-tab-manager__delete"
                    type="button"
                    aria-label={`删除 ${tab.label}`}
                    disabled={tabs.length <= 1}
                    onClick={() => removeTab(tab.key)}
                  >
                    <PropertyPanelDeleteIcon />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
};

const AiReviewProperties = ({
  field,
  onUpdateField,
}: {
  field: SchemaField;
  onUpdateField: (patch: Partial<SchemaField>) => void;
}) => {
  const aiReview = normalizeAiReviewConfig(field);
  const [isExpanded, setIsExpanded] = useState(() => shouldExpandAiReview(field));
  const [isRequirementFocused, setIsRequirementFocused] = useState(false);
  const requirementTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedFieldKey = field.fieldKey ?? field.key;

  useEffect(() => {
    setIsExpanded(shouldExpandAiReview(field));
  }, [selectedFieldKey, field.aiReview?.enabled]);

  useLayoutEffect(() => {
    resizeTextareaToContent(requirementTextareaRef.current);
  }, [aiReview.requirement, isExpanded, selectedFieldKey]);

  const updateAiReview = (patch: Partial<NormalizedAiReviewConfig>) => {
    onUpdateField({
      aiReview: {
        ...aiReview,
        enabled: patch.enabled ?? isExpanded,
        ...patch,
      },
    });
  };
  const toggleAiReview = (enabled: boolean) => {
    setIsExpanded(enabled);
    updateAiReview({ enabled });
  };

  return (
    <PropertySection
      title="AI 预审"
      action={
        <PropertySectionSwitch
          checked={isExpanded}
          className="designer-ai-review-switch"
          offLabel="启用 AI 预审"
          onChange={toggleAiReview}
          onLabel="关闭 AI 预审"
        />
      }
    >
      <PropertyCollapse
        className="designer-ai-review-collapse"
        dataTestId="designer-ai-review-collapse"
        expanded={isExpanded}
      >
        <div className="designer-form-grid designer-ai-review-form">
          <PropertyRow label="审核要求">
            <textarea
              ref={requirementTextareaRef}
              aria-label="审核要求"
              className="designer-ai-review-requirement"
              placeholder={
                isRequirementFocused ? '' : '例如：必须保留商品核心信息，不得新增不存在的信息。'
              }
              rows={2}
              value={aiReview.requirement}
              onBlur={() => setIsRequirementFocused(false)}
              onChange={(event) => {
                scheduleTextareaResize(event.currentTarget);
                updateAiReview({ requirement: event.target.value });
              }}
              onFocus={() => setIsRequirementFocused(true)}
            />
          </PropertyRow>
        </div>
      </PropertyCollapse>
    </PropertySection>
  );
};

type ShowItemReference = {
  label: string;
  sourceKey: string;
};

const LlmPromptProperties = ({
  field,
  schemaFields,
  onUpdateField,
}: {
  field: SchemaField;
  schemaFields: readonly SchemaField[];
  onUpdateField: (patch: Partial<SchemaField>) => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(() => field.promptTemplate !== undefined);
  const selectedFieldKey = field.fieldKey ?? field.key;
  const showItemReferences = extractShowItemReferences(schemaFields);
  const promptTemplate = field.promptTemplate ?? '';

  useEffect(() => {
    setIsExpanded(field.promptTemplate !== undefined);
  }, [selectedFieldKey, field.promptTemplate]);

  const toggleLlmPrompt = (enabled: boolean) => {
    setIsExpanded(enabled);
    onUpdateField({ promptTemplate: enabled ? promptTemplate : undefined });
  };
  const insertShowItemReference = (sourceKey: string) => {
    const token = `#${sourceKey}`;
    const separator = promptTemplate && !promptTemplate.endsWith(' ') && !promptTemplate.endsWith('\n') ? ' ' : '';

    onUpdateField({ promptTemplate: `${promptTemplate}${separator}${token}` });
  };

  return (
    <PropertySection
      title="LLM提示"
      action={
        <PropertySectionSwitch
          checked={isExpanded}
          className="designer-llm-prompt-switch"
          offLabel="启用 LLM 提示"
          onChange={toggleLlmPrompt}
          onLabel="关闭 LLM 提示"
        />
      }
    >
      <PropertyCollapse
        className="designer-llm-prompt-collapse"
        dataTestId="designer-llm-prompt-collapse"
        expanded={isExpanded}
      >
        <div className="designer-form-grid designer-llm-prompt-form">
          <PropertyRow label="提示词">
            <textarea
              aria-label="LLM提示内容"
              placeholder="例如：请根据 #prompt 和 #response 输出建议答案。"
              value={promptTemplate}
              onChange={(event) => onUpdateField({ promptTemplate: event.target.value })}
            />
          </PropertyRow>
          {showItemReferences.length > 0 ? (
            <div className="designer-llm-prompt-references" aria-label="可引用展示字段">
              {showItemReferences.map((reference) => (
                <button
                  key={reference.sourceKey}
                  type="button"
                  onClick={() => insertShowItemReference(reference.sourceKey)}
                >
                  #{reference.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </PropertyCollapse>
    </PropertySection>
  );
};

const PropertySection = ({
  action,
  title,
  children,
}: {
  action?: ReactNode;
  title: string;
  children: ReactNode;
}) => {
  return (
    <section className="designer-property-section">
      <div className="designer-property-section__header">
        <h3>{title}</h3>
        {action}
      </div>
      <div className="designer-property-section__body">{children}</div>
    </section>
  );
};

const PropertyRow = ({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) => {
  return (
    <div className={`designer-property-row${className ? ` ${className}` : ''}`}>
      <span className="designer-property-row__label">{label}</span>
      <span className="designer-property-row__control">{children}</span>
    </div>
  );
};

const PropertySectionSwitch = ({
  checked,
  className,
  offLabel,
  onChange,
  onLabel,
}: {
  checked: boolean;
  className?: string;
  offLabel: string;
  onChange: (checked: boolean) => void;
  onLabel: string;
}) => {
  return (
    <label className={`designer-switch designer-section-switch${className ? ` ${className}` : ''}`}>
      <input
        aria-expanded={checked}
        aria-label={checked ? onLabel : offLabel}
        checked={checked}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true" />
    </label>
  );
};

const PropertyCollapse = ({
  children,
  className,
  dataTestId,
  expanded,
}: {
  children: ReactNode;
  className?: string;
  dataTestId: string;
  expanded: boolean;
}) => {
  return (
    <div
      aria-hidden={!expanded}
      className={`designer-property-collapse${className ? ` ${className}` : ''}${expanded ? ' is-expanded' : ''}`}
      data-testid={dataTestId}
      inert={expanded ? undefined : true}
    >
      <div className="designer-property-collapse__inner">{children}</div>
    </div>
  );
};

const supportsPlaceholder = (field: SchemaField): boolean =>
  field.type === 'text' ||
  field.type === 'textarea' ||
  field.type === 'rich_text' ||
  field.type === 'json_editor';

const supportsLlmPrompt = (field: SchemaField): boolean =>
  field.type === 'text' || field.type === 'textarea' || field.type === 'tag_select';

const extractShowItemReferences = (fields: readonly SchemaField[]): ShowItemReference[] => {
  const references = new Map<string, ShowItemReference>();

  const visit = (fieldList: readonly SchemaField[]) => {
    for (const field of fieldList) {
      if (field.type === 'show_item') {
        normalizeShowItemReferences(field).forEach((reference) => {
          if (!references.has(reference.sourceKey)) {
            references.set(reference.sourceKey, reference);
          }
        });
      }

      if (field.fields) {
        visit(field.fields);
      }

      if (field.tabs) {
        field.tabs.forEach((tab) => visit(tab.fields));
      }
    }
  };

  visit(fields);

  return Array.from(references.values());
};

const normalizeShowItemReferences = (field: SchemaField): ShowItemReference[] => {
  if (field.displayConfig?.fields) {
    return field.displayConfig.fields
      .filter((displayField) => displayField.visible !== false)
      .map(showItemDisplayFieldToReference);
  }

  const sourceKeys = field.sourceKeys ?? (field.sourceKey ? [field.sourceKey] : []);

  return sourceKeys.map((sourceKey) => ({
    label: sourceKey,
    sourceKey,
  }));
};

const showItemDisplayFieldToReference = (
  displayField: ShowItemDisplayField,
): ShowItemReference => ({
  label: displayField.label || displayField.sourceKey,
  sourceKey: displayField.sourceKey,
});

const normalizeAiReviewConfig = (field: SchemaField): NormalizedAiReviewConfig => {
  return {
    enabled: Boolean(field.aiReview?.enabled),
    role: field.aiReview?.role ?? defaultAiReviewRole(field),
    requirement: field.aiReview?.requirement ?? '',
  };
};

const shouldExpandAiReview = (field: SchemaField): boolean => {
  return Boolean(field.aiReview?.enabled);
};

function resizeTextareaToContent(textarea: HTMLTextAreaElement | null): void {
  if (!textarea) {
    return;
  }

  textarea.style.height = 'auto';

  if (textarea.scrollHeight > 0) {
    textarea.style.height = `${textarea.scrollHeight}px`;
  }
}

function scheduleTextareaResize(textarea: HTMLTextAreaElement | null): void {
  resizeTextareaToContent(textarea);

  if (!textarea || typeof window === 'undefined') {
    return;
  }

  window.requestAnimationFrame(() => resizeTextareaToContent(textarea));
}

const defaultAiReviewRole = (field: SchemaField): FieldAiReviewRole => {
  return field.type === 'show_item' ? 'source_context' : 'annotation_answer';
};

const supportsLengthLimit = (field: SchemaField): boolean =>
  field.type === 'text' || field.type === 'textarea' || field.type === 'rich_text';

const shouldExpandValidation = (field: SchemaField): boolean =>
  Boolean(
    field.validation?.minLength !== undefined ||
      field.validation?.maxLength !== undefined ||
      field.validation?.pattern ||
      field.validation?.customValidatorKey,
  );

const shouldExpandLinkage = (field: SchemaField): boolean => Boolean(field.linkageRules?.length);

const ShowItemDisplayConfigEditor = ({
  field,
  schemaFields,
  onUpdateField,
}: {
  field: SchemaField;
  schemaFields: readonly SchemaField[];
  onUpdateField: (patch: Partial<SchemaField>) => void;
}) => {
  const displayConfig = normalizeShowItemDisplayConfig(field);

  const commitDisplayConfig = (fields: readonly ShowItemDisplayField[]) => {
    const contentAreaFields = normalizeShowItemContentAreaFields(fields);

    onUpdateField({
      displayConfig: {
        layout: SHOW_ITEM_DEFAULT_LAYOUT,
        fields: contentAreaFields,
      },
      sourceKeys: contentAreaFields
        .filter((item) => isShowItemDisplayFieldVisible(item))
        .map((item) => item.sourceKey.trim())
        .filter(Boolean),
    });
  };

  const commitFields = (fields: readonly ShowItemDisplayField[]) => {
    commitDisplayConfig(fields);
  };

  const updateField = (
    index: number,
    patch: Partial<ShowItemDisplayField>,
  ) => {
    commitFields(
      displayConfig.fields.map((item, currentIndex) =>
        currentIndex === index
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    );
  };

  const visibleFieldCount = displayConfig.fields.filter(isShowItemDisplayFieldVisible).length;
  const annotationFieldCount = countAnnotationFields(schemaFields);
  const totalFieldCount = countUniqueSourceFields(displayConfig.fields, schemaFields);

  const removeField = (index: number) => {
    commitFields(displayConfig.fields.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <section className="designer-show-item-config" aria-label="ShowItem 展示字段配置">
      <div className="designer-show-item-config__header">
        <div className="designer-show-item-config__title-row">
          <div className="designer-show-item-config__title-copy">
            <h2>题目展示字段</h2>
          </div>
          <button
            className="designer-show-item-config__add"
            type="button"
            onClick={() => commitFields([...displayConfig.fields, { sourceKey: '', label: '', area: 'content' }])}
          >
            <PropertyPanelPlusIcon />
            <span>新增字段</span>
          </button>
        </div>
        <div className="designer-show-item-stats" aria-label="ShowItem 字段统计">
          <span aria-label={`总字段 ${totalFieldCount}`}>
            <small>总字段</small>
            <strong>{totalFieldCount}</strong>
          </span>
          <span aria-label={`展示字段 ${visibleFieldCount}`}>
            <small>展示字段</small>
            <strong>{visibleFieldCount}</strong>
          </span>
          <span aria-label={`待标注字段 ${annotationFieldCount}`}>
            <small>待标注字段</small>
            <strong>{annotationFieldCount}</strong>
          </span>
        </div>
      </div>
      <section className="designer-show-item-fields" aria-label="展示字段清单">
        {displayConfig.fields.map((item, index) => (
          <article
            aria-label={`展示字段 ${item.sourceKey || `字段 ${index + 1}`}`}
            className={`designer-show-item-field${
              isShowItemDisplayFieldVisible(item) ? '' : ' is-hidden'
            }`}
            key={`${item.sourceKey}:${index}`}
          >
            <div className="designer-show-item-field__topline">
              <label className="designer-show-item-field__visible">
                <input
                  aria-label={`是否展示 ${item.sourceKey || `字段 ${index + 1}`}`}
                  checked={isShowItemDisplayFieldVisible(item)}
                  type="checkbox"
                  onChange={(event) => updateField(index, { visible: event.target.checked })}
                />
                <span aria-hidden="true" />
              </label>
              <div className="designer-show-item-field__source-wrap">
                <code className="designer-show-item-field__source" title={item.sourceKey || '未绑定字段'}>
                  {item.sourceKey || '未绑定字段'}
                </code>
              </div>
              <button
                aria-label={`删除展示字段 ${index + 1}`}
                className="template-manager-row-action designer-show-item-field__delete"
                title="删除"
                type="button"
                onClick={() => removeField(index)}
              >
                <PropertyPanelDeleteIcon />
              </button>
            </div>
            <label className="designer-show-item-control designer-show-item-control--label">
              <span>显示名称</span>
              <input
                aria-label={`展示字段 ${index + 1} 显示名`}
                className="designer-show-item-field__label"
                value={item.label}
                onChange={(event) => updateField(index, { label: event.target.value })}
              />
            </label>
            <div className="designer-show-item-field__settings">
              <div className="designer-show-item-control designer-show-item-control--format">
                <span>展示类型</span>
                <FilterSelect
                  ariaLabel={`展示字段 ${index + 1} 展示格式`}
                  options={SHOW_ITEM_FORMAT_OPTIONS}
                  value={normalizeShowItemDisplayFormatValue(item.format)}
                  onChange={(format) =>
                    updateField(index, {
                      format,
                    })
                  }
                />
              </div>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
};

const PropertyPanelPlusIcon = () => (
  <svg
    aria-hidden="true"
    className="designer-show-item-config__add-icon"
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M10 4.25c0.46 0 0.83 0.37 0.83 0.83v4.09h4.09c0.46 0 0.83 0.37 0.83 0.83s-0.37 0.83-0.83 0.83h-4.09v4.09c0 0.46-0.37 0.83-0.83 0.83s-0.83-0.37-0.83-0.83v-4.09H5.08c-0.46 0-0.83-0.37-0.83-0.83s0.37-0.83 0.83-0.83h4.09V5.08c0-0.46 0.37-0.83 0.83-0.83z"
      fill="currentColor"
    />
  </svg>
);

const isShowItemDisplayFieldVisible = (field: ShowItemDisplayField): boolean => field.visible !== false;

const countAnnotationFields = (fields: readonly SchemaField[]): number =>
  collectAnnotationFields(fields).length;

const countUniqueSourceFields = (
  displayFields: readonly ShowItemDisplayField[],
  schemaFields: readonly SchemaField[],
): number => {
  const sourceKeys = new Set<string>();

  displayFields.forEach((field) => {
    if (field.sourceKey) {
      sourceKeys.add(field.sourceKey);
    }
  });

  collectAnnotationFields(schemaFields).forEach((field) => {
    const sourceKey = field.sourceKey ?? field.fieldKey ?? field.key;
    if (sourceKey) {
      sourceKeys.add(sourceKey);
    }
  });

  return sourceKeys.size;
};

const collectAnnotationFields = (fields: readonly SchemaField[]): SchemaField[] =>
  fields.flatMap((field) => {
    if (field.type === 'group') {
      return collectAnnotationFields(field.fields ?? []);
    }

    if (field.type === 'tabs') {
      return (field.tabs ?? []).flatMap((tab) => collectAnnotationFields(tab.fields ?? []));
    }

    if (field.type === 'show_item' || field.type === 'llm_assist') {
      return [];
    }

    return [field];
  });

const normalizeShowItemContentAreaFields = (
  fields: readonly ShowItemDisplayField[],
): ShowItemDisplayField[] => fields.map((item) => ({ ...item, area: 'content' }));

const normalizeShowItemDisplayFormatValue = (
  format: ShowItemDisplayField['format'] | undefined,
): (typeof SHOW_ITEM_FORMAT_OPTIONS)[number]['value'] => (format === 'code' ? 'code' : 'text');

const ValidationProperties = ({
  field,
  onUpdateValidation,
}: {
  field: SchemaField;
  onUpdateValidation: (patch: NonNullable<SchemaField['validation']>) => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(() => shouldExpandValidation(field));
  const selectedFieldKey = field.fieldKey ?? field.key;

  useEffect(() => {
    setIsExpanded(shouldExpandValidation(field));
  }, [selectedFieldKey]);

  return (
    <PropertySection
      title="校验规则"
      action={
        <PropertySectionSwitch
          checked={isExpanded}
          offLabel="显示校验规则"
          onChange={setIsExpanded}
          onLabel="隐藏校验规则"
        />
      }
    >
      <PropertyCollapse dataTestId="designer-validation-collapse" expanded={isExpanded}>
        <div className="designer-form-grid">
          {field.validation?.minLength !== undefined ? (
            <PropertyRow label="最小长度">
              <input
                aria-label="最小长度"
                min="0"
                type="number"
                value={field.validation.minLength}
                onChange={(event) => onUpdateValidation({ minLength: numericValue(event.target.value) })}
              />
            </PropertyRow>
          ) : null}
          {supportsLengthLimit(field) ? (
            <PropertyRow label="最大长度">
              <input
                aria-label="最大长度"
                min="0"
                type="number"
                value={field.validation?.maxLength ?? ''}
                onChange={(event) => onUpdateValidation({ maxLength: numericValue(event.target.value) })}
              />
            </PropertyRow>
          ) : null}
          <PropertyRow label="正则">
          <input
            aria-label="正则"
            value={field.validation?.pattern ?? ''}
            onChange={(event) => onUpdateValidation({ pattern: event.target.value })}
          />
          </PropertyRow>
          <PropertyRow label="自定义函数">
          <select
            aria-label="自定义函数"
            value={field.validation?.customValidatorKey ?? ''}
            onChange={(event) =>
              onUpdateValidation({
                customValidatorKey: event.target.value
                  ? (event.target.value as NonNullable<SchemaField['validation']>['customValidatorKey'])
                  : undefined,
              })
            }
          >
            <option value="">不使用</option>
            {CUSTOM_VALIDATOR_OPTIONS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          </PropertyRow>
        </div>
      </PropertyCollapse>
    </PropertySection>
  );
};

const LinkageProperties = ({
  field,
  schemaFields,
  onAddLinkageRule,
  onUpdateField,
}: {
  field: SchemaField;
  schemaFields: readonly SchemaField[];
  onAddLinkageRule: () => void;
  onUpdateField: (patch: Partial<SchemaField>) => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(() => shouldExpandLinkage(field));
  const selectedFieldKey = field.fieldKey ?? field.key;
  const linkageFieldEntries = useMemo(
    () => buildLinkageFieldEntries(schemaFields, field.linkageRules ?? []),
    [field.linkageRules, schemaFields],
  );
  const fieldsByKey = useMemo(
    () => new Map(linkageFieldEntries.map((entry) => [entry.value, entry.field])),
    [linkageFieldEntries],
  );
  const conditionFieldOptions = useMemo(
    () => linkageFieldEntries.filter((entry) => isSubmittableField(entry.field)),
    [linkageFieldEntries],
  );
  const targetFieldOptions = conditionFieldOptions;
  const limitTargetFieldOptions = useMemo(
    () => linkageFieldEntries.filter((entry) => isLimitOptionTargetField(entry.field)),
    [linkageFieldEntries],
  );

  const updateRule = (index: number, patch: Partial<LinkageRule>) => {
    const currentRules = field.linkageRules ?? [];
    const nextRules = [...currentRules];

    nextRules[index] = {
      ...nextRules[index],
      ...patch,
      when: {
        ...nextRules[index]?.when,
        ...(patch.when ?? {}),
      },
    };

    onUpdateField({ linkageRules: nextRules });
  };

  const replaceRule = (index: number, rule: LinkageRule) => {
    const currentRules = field.linkageRules ?? [];
    const nextRules = [...currentRules];

    nextRules[index] = rule;
    onUpdateField({ linkageRules: nextRules });
  };

  useEffect(() => {
    setIsExpanded(shouldExpandLinkage(field));
  }, [selectedFieldKey]);

  const removeLinkageRule = (index: number) => {
    onUpdateField({
      linkageRules: (field.linkageRules ?? []).filter((_, currentIndex) => currentIndex !== index),
    });
  };

  return (
    <PropertySection
      title="字段联动"
      action={
        <PropertySectionSwitch
          checked={isExpanded}
          offLabel="显示字段联动"
          onChange={setIsExpanded}
          onLabel="隐藏字段联动"
        />
      }
    >
      <PropertyCollapse dataTestId="designer-linkage-collapse" expanded={isExpanded}>
        <div className="designer-linkage">
          {(field.linkageRules ?? []).map((rule, index) => (
            <LinkageRuleCard
              key={`${rule.targetFieldKey}:${index}`}
              conditionFieldOptions={conditionFieldOptions}
              fieldsByKey={fieldsByKey}
              index={index}
              limitTargetFieldOptions={limitTargetFieldOptions}
              rule={rule}
              targetFieldOptions={targetFieldOptions}
              onRemove={() => removeLinkageRule(index)}
              onReplace={(nextRule) => replaceRule(index, nextRule)}
              onUpdate={(patch) => updateRule(index, patch)}
            />
          ))}
          <button
            aria-label="新增联动规则"
            className="designer-linkage__add"
            type="button"
            onClick={onAddLinkageRule}
          >
            + 新增联动规则
          </button>
        </div>
      </PropertyCollapse>
    </PropertySection>
  );
};

type LinkageFieldOption = {
  value: string;
  label: string;
  field: SchemaField;
};

type LinkageMode = 'limitOptions' | 'visibility';

const LinkageRuleCard = ({
  conditionFieldOptions,
  fieldsByKey,
  index,
  limitTargetFieldOptions,
  rule,
  targetFieldOptions,
  onRemove,
  onReplace,
  onUpdate,
}: {
  conditionFieldOptions: readonly LinkageFieldOption[];
  fieldsByKey: ReadonlyMap<string, SchemaField>;
  index: number;
  limitTargetFieldOptions: readonly LinkageFieldOption[];
  rule: LinkageRule;
  targetFieldOptions: readonly LinkageFieldOption[];
  onRemove: () => void;
  onReplace: (rule: LinkageRule) => void;
  onUpdate: (patch: Partial<LinkageRule>) => void;
}) => {
  const mode: LinkageMode = rule.action === 'limitOptions' ? 'limitOptions' : 'visibility';
  const sourceField = fieldsByKey.get(rule.when.fieldKey);
  const targetField = fieldsByKey.get(rule.targetFieldKey);

  const switchMode = (nextMode: LinkageMode) => {
    if (nextMode === mode) {
      return;
    }

    if (nextMode === 'limitOptions') {
      const nextTargetFieldKey = isLimitOptionTargetField(targetField)
        ? rule.targetFieldKey
        : limitTargetFieldOptions[0]?.value ?? '';
      const nextTargetField = fieldsByKey.get(nextTargetFieldKey);

      onReplace({
        when: {
          fieldKey: rule.when.fieldKey,
          operator: 'exists',
        },
        action: 'limitOptions',
        targetFieldKey: nextTargetFieldKey,
        cases: buildLimitOptionCases(sourceField, nextTargetField, rule),
      });
      return;
    }

    onReplace({
      when: {
        fieldKey: rule.when.fieldKey,
        operator: 'equals',
        value: firstConditionValue(sourceField, rule.when.value),
      },
      action: 'show',
      targetFieldKey: isSubmittableField(targetField)
        ? rule.targetFieldKey
        : targetFieldOptions[0]?.value ?? '',
    });
  };

  return (
    <fieldset className="designer-linkage__rule">
      <div className="designer-linkage__rule-header">
        <strong>联动 {index + 1}</strong>
        <div className="designer-linkage__mode-switch" role="group" aria-label={`联动 ${index + 1} 类型`}>
          {LINKAGE_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              aria-pressed={mode === option.value}
              className={mode === option.value ? 'is-active' : ''}
              type="button"
              onClick={() => switchMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          aria-label={`删除联动规则 ${index + 1}`}
          className="template-manager-row-action template-manager-row-action--delete designer-linkage__delete"
          title="删除"
          type="button"
          onClick={onRemove}
        >
          <PropertyPanelDeleteIcon />
        </button>
      </div>
      {mode === 'limitOptions' ? (
        <LimitOptionsRuleEditor
          conditionFieldOptions={conditionFieldOptions}
          fieldsByKey={fieldsByKey}
          index={index}
          limitTargetFieldOptions={limitTargetFieldOptions}
          rule={rule}
          sourceField={sourceField}
          targetField={targetField}
          onReplace={onReplace}
          onUpdate={onUpdate}
        />
      ) : (
        <VisibilityRuleEditor
          conditionFieldOptions={conditionFieldOptions}
          index={index}
          rule={rule}
          sourceField={sourceField}
          targetFieldOptions={targetFieldOptions}
          onUpdate={onUpdate}
        />
      )}
    </fieldset>
  );
};

const VisibilityRuleEditor = ({
  conditionFieldOptions,
  index,
  rule,
  sourceField,
  targetFieldOptions,
  onUpdate,
}: {
  conditionFieldOptions: readonly LinkageFieldOption[];
  index: number;
  rule: LinkageRule;
  sourceField: SchemaField | undefined;
  targetFieldOptions: readonly LinkageFieldOption[];
  onUpdate: (patch: Partial<LinkageRule>) => void;
}) => {
  return (
    <div className="designer-linkage__sentence">
      <span>当</span>
      <LinkageFieldSelect
        ariaLabel={`规则 ${index + 1} 条件字段`}
        options={conditionFieldOptions}
        value={rule.when.fieldKey}
        onChange={(fieldKey) => {
          const nextSourceField = conditionFieldOptions.find((option) => option.value === fieldKey)?.field;

          onUpdate({
            when: {
              fieldKey,
              operator: rule.when.operator,
              value: firstConditionValue(nextSourceField, rule.when.value),
            },
          });
        }}
      />
      <select
        aria-label={`规则 ${index + 1} 条件表达式`}
        value={rule.when.operator}
        onChange={(event) => {
          const operator = event.target.value as LinkageOperator;

          onUpdate({
            when: {
              ...rule.when,
              operator,
              value: operator === 'exists' || operator === 'notExists'
                ? undefined
                : firstConditionValue(sourceField, rule.when.value),
            },
          });
        }}
      >
        {LINKAGE_OPERATOR_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ConditionValueControl
        index={index}
        rule={rule}
        sourceField={sourceField}
        onChange={(value) =>
          onUpdate({
            when: {
              ...rule.when,
              value,
            },
          })
        }
      />
      <span>让</span>
      <LinkageFieldSelect
        ariaLabel={`规则 ${index + 1} 目标字段`}
        options={targetFieldOptions}
        value={rule.targetFieldKey}
        onChange={(targetFieldKey) => onUpdate({ targetFieldKey })}
      />
      <select
        aria-label={`规则 ${index + 1} 显隐动作`}
        value={rule.action === 'hide' ? 'hide' : 'show'}
        onChange={(event) => onUpdate({ action: event.target.value as 'hide' | 'show' })}
      >
        {VISIBILITY_ACTION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

const LimitOptionsRuleEditor = ({
  conditionFieldOptions,
  fieldsByKey,
  index,
  limitTargetFieldOptions,
  rule,
  sourceField,
  targetField,
  onReplace,
  onUpdate,
}: {
  conditionFieldOptions: readonly LinkageFieldOption[];
  fieldsByKey: ReadonlyMap<string, SchemaField>;
  index: number;
  limitTargetFieldOptions: readonly LinkageFieldOption[];
  rule: LinkageRule;
  sourceField: SchemaField | undefined;
  targetField: SchemaField | undefined;
  onReplace: (rule: LinkageRule) => void;
  onUpdate: (patch: Partial<LinkageRule>) => void;
}) => {
  const caseRows = buildLimitOptionCases(sourceField, targetField, rule);
  const targetOptions = targetField?.options ?? [];

  return (
    <div className="designer-linkage__limit">
      <div className="designer-linkage__sentence">
        <span>当</span>
        <LinkageFieldSelect
          ariaLabel={`规则 ${index + 1} 条件字段`}
          options={conditionFieldOptions}
          value={rule.when.fieldKey}
          onChange={(fieldKey) => {
            const nextSourceField = fieldsByKey.get(fieldKey);

            onReplace({
              ...rule,
              when: {
                fieldKey,
                operator: 'exists',
              },
              cases: buildLimitOptionCases(nextSourceField, targetField, {
                ...rule,
                when: { fieldKey, operator: 'exists' },
              }),
            });
          }}
        />
        <span>的值变化时，控制</span>
        <LinkageFieldSelect
          ariaLabel={`规则 ${index + 1} 目标字段`}
          options={limitTargetFieldOptions}
          value={rule.targetFieldKey}
          onChange={(targetFieldKey) => {
            const nextTargetField = fieldsByKey.get(targetFieldKey);

            onReplace({
              ...rule,
              targetFieldKey,
              cases: buildLimitOptionCases(sourceField, nextTargetField, {
                ...rule,
                targetFieldKey,
              }),
            });
          }}
        />
        <span>的可选项</span>
      </div>
      <div className="designer-linkage__matrix">
        <div className="designer-linkage__matrix-head">
          <span>条件值</span>
          <span>目标字段可选项</span>
        </div>
        {caseRows.length > 0 ? (
          caseRows.map((ruleCase) => (
            <div className="designer-linkage__matrix-row" key={formatRuleValue(ruleCase.value)}>
              <span className="designer-linkage__condition-chip">
                {formatConditionCaseLabel(sourceField, ruleCase.value)}
              </span>
              <div className="designer-linkage__option-chips" role="group" aria-label={`${formatConditionCaseLabel(sourceField, ruleCase.value)} 可选项`}>
                {targetOptions.map((option) => {
                  const selected = ruleCase.optionValues.includes(option.value);

                  return (
                    <button
                      key={option.value}
                      aria-pressed={selected}
                      className={selected ? 'is-selected' : ''}
                      type="button"
                      onClick={() => {
                        const nextCases = caseRows.map((currentCase) => {
                          if (!areLinkageCaseValuesEqual(currentCase.value, ruleCase.value)) {
                            return currentCase;
                          }

                          const nextOptionValues = selected
                            ? currentCase.optionValues.filter((value) => value !== option.value)
                            : [...currentCase.optionValues, option.value];

                          return {
                            ...currentCase,
                            optionValues: nextOptionValues,
                          };
                        });

                        onUpdate({ cases: nextCases });
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="designer-linkage__empty">先选择条件字段和目标字段。</div>
        )}
      </div>
    </div>
  );
};

const LinkageFieldSelect = ({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: readonly LinkageFieldOption[];
  value: string;
  onChange: (value: string) => void;
}) => (
  <div className="designer-linkage__field-select">
    <FilterSelect
      ariaLabel={ariaLabel}
      options={options}
      value={value}
      placeholder="请选择字段"
      onChange={onChange}
    />
  </div>
);

const ConditionValueControl = ({
  index,
  rule,
  sourceField,
  onChange,
}: {
  index: number;
  rule: LinkageRule;
  sourceField: SchemaField | undefined;
  onChange: (value: unknown) => void;
}) => {
  if (rule.when.operator === 'exists' || rule.when.operator === 'notExists') {
    return <span className="designer-linkage__value-placeholder">无需条件值</span>;
  }

  if (sourceField?.options && sourceField.options.length > 0) {
    return (
      <div className="designer-linkage__value-chips" role="group" aria-label={`规则 ${index + 1} 条件值`}>
        {sourceField.options.map((option) => {
          const selected = areLinkageCaseValuesEqual(rule.when.value, option.value);

          return (
            <button
              key={option.value}
              aria-pressed={selected}
              className={selected ? 'is-selected' : ''}
              type="button"
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <input
      aria-label={`规则 ${index + 1} 条件值`}
      value={formatRuleValue(rule.when.value)}
      onChange={(event) => onChange(parseLinkageValueInput(event.target.value))}
    />
  );
};

const LINKAGE_OPERATOR_OPTIONS = [
  { value: 'equals' as const, label: '等于' },
  { value: 'notEquals' as const, label: '不等于' },
  { value: 'contains' as const, label: '包含' },
  { value: 'notContains' as const, label: '不包含' },
  { value: 'exists' as const, label: '存在' },
  { value: 'notExists' as const, label: '不存在' },
] as const;

const LINKAGE_MODE_OPTIONS = [
  { value: 'visibility' as const, label: '控制显隐' },
  { value: 'limitOptions' as const, label: '限制选项' },
] as const;

const VISIBILITY_ACTION_OPTIONS = [
  { value: 'show' as const, label: '显示' },
  { value: 'hide' as const, label: '隐藏' },
] as const;

const buildLinkageFieldEntries = (
  fields: readonly SchemaField[],
  rules: readonly LinkageRule[],
): LinkageFieldOption[] => {
  const entries = collectLinkageFieldEntries(fields);
  const options = entries.map((entry) => ({
    value: entry.fieldKey,
    label: `${entry.field.label} · ${entry.fieldKey}`,
    field: entry.field,
  }));
  const knownFieldValues = new Set(options.map((option) => option.value));

  for (const rule of rules) {
    for (const fieldKey of [rule.when.fieldKey, rule.targetFieldKey]) {
      if (!fieldKey || knownFieldValues.has(fieldKey)) {
        continue;
      }

      options.push({
        value: fieldKey,
        label: fieldKey,
        field: {
          key: fieldKey,
          fieldKey,
          type: 'text',
          label: fieldKey,
        },
      });
      knownFieldValues.add(fieldKey);
    }
  }

  return options;
};

const collectLinkageFieldEntries = (
  fields: readonly SchemaField[],
): Array<{ fieldKey: string; field: SchemaField }> => {
  return fields.flatMap((field) => {
    if (!isLinkageConfigurableField(field)) {
      return [
        ...(field.fields ? collectLinkageFieldEntries(field.fields) : []),
        ...(field.tabs?.flatMap((tab) => collectLinkageFieldEntries(tab.fields)) ?? []),
      ];
    }

    return [
      {
        fieldKey: getSchemaFieldKey(field),
        field,
      },
      ...(field.fields ? collectLinkageFieldEntries(field.fields) : []),
      ...(field.tabs?.flatMap((tab) => collectLinkageFieldEntries(tab.fields)) ?? []),
    ];
  });
};

const isLinkageConfigurableField = (field: SchemaField): boolean =>
  !['show_item', 'group', 'tabs', 'llm_assist'].includes(field.type);

const isSubmittableField = (field: SchemaField | undefined): field is SchemaField =>
  field !== undefined && isLinkageConfigurableField(field);

const isLimitOptionTargetField = (field: SchemaField | undefined): field is SchemaField =>
  field !== undefined &&
  (field.type === 'radio' || field.type === 'checkbox' || field.type === 'tag_select');

const buildLimitOptionCases = (
  sourceField: SchemaField | undefined,
  targetField: SchemaField | undefined,
  rule: LinkageRule,
): NonNullable<LinkageRule['cases']> => {
  const existingCases = rule.cases ?? [];
  const targetOptionValues = new Set((targetField?.options ?? []).map((option) => option.value));
  const sourceOptions = sourceField?.options ?? [];

  if (sourceOptions.length > 0) {
    return sourceOptions.map((option) => {
      const existingCase = existingCases.find((ruleCase) =>
        areLinkageCaseValuesEqual(ruleCase.value, option.value),
      );

      return {
        value: option.value,
        optionValues: (existingCase?.optionValues ?? []).filter((value) => targetOptionValues.has(value)),
      };
    });
  }

  return existingCases.map((ruleCase) => ({
    value: ruleCase.value,
    optionValues: ruleCase.optionValues.filter((value) => targetOptionValues.has(value)),
  }));
};

const firstConditionValue = (
  sourceField: SchemaField | undefined,
  currentValue: unknown,
): unknown => {
  if (sourceField?.options?.some((option) => areLinkageCaseValuesEqual(option.value, currentValue))) {
    return currentValue;
  }

  return sourceField?.options?.[0]?.value ?? currentValue ?? '';
};

const formatConditionCaseLabel = (
  sourceField: SchemaField | undefined,
  value: unknown,
): string => {
  const option = sourceField?.options?.find((item) => areLinkageCaseValuesEqual(item.value, value));
  const fallback = formatRuleValue(value);

  return option?.label ?? (fallback || '空值');
};

const areLinkageCaseValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }

  return formatRuleValue(left) === formatRuleValue(right);
};

const parseLinkageValueInput = (value: string): unknown => {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // ignore
    }
  }

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  const numberValue = Number(trimmed);

  return Number.isNaN(numberValue) ? value : numberValue;
};

const formatRuleValue = (value: unknown): string => {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
};

const numericValue = (value: string): number | undefined => {
  return value === '' ? undefined : Number(value);
};

const normalizeShowItemDisplayConfig = (field: SchemaField): NonNullable<SchemaField['displayConfig']> => {
  if (field.displayConfig && field.displayConfig.fields.length > 0) {
    return {
      ...field.displayConfig,
      layout: SHOW_ITEM_DEFAULT_LAYOUT,
      fields: normalizeShowItemContentAreaFields(field.displayConfig.fields),
    };
  }

  const sourceKeys = field.sourceKeys && field.sourceKeys.length > 0
    ? [...field.sourceKeys]
    : [field.sourceKey ?? 'prompt'];

  return {
    layout: SHOW_ITEM_DEFAULT_LAYOUT,
    fields: sourceKeys.map((sourceKey) => ({
      sourceKey,
      label: sourceKey,
      area: 'content',
    })),
  };
};

const PropertyPanelDeleteIcon = () => (
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

const formatMimeTypes = (field: SchemaField): string => {
  return (field.fileConstraints?.acceptedMimeTypes ?? []).join('\n');
};

const parseMimeTypes = (value: string): string[] => {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const isChoiceField = (field: SchemaField): boolean =>
  field.type === 'radio' || field.type === 'checkbox' || field.type === 'tag_select';

type OptionComposerState = 'closed' | 'closing' | 'committing' | 'open';
type OptionDragState = {
  activeCenterX: number;
  activeIndex: number;
  centerXByValue: Map<string, number>;
  currentX: number;
  originX: number;
  pointerId: number;
  shiftWidth: number;
  targetIndex: number;
  value: string;
};

const OPTION_DRAG_HOLD_MS = 160;
const OPTION_DRAG_GAP = 8;

const getPointerClientX = (event: ReactPointerEvent<HTMLElement>): number => {
  const clientX = Number(event.clientX);

  if (Number.isFinite(clientX)) {
    return clientX;
  }

  const nativeEvent = event.nativeEvent as PointerEvent & {
    pageX?: number;
    screenX?: number;
  };
  const fallbackValues = [nativeEvent.clientX, nativeEvent.pageX, nativeEvent.screenX].map(Number);

  return fallbackValues.find(Number.isFinite) ?? 0;
};

const OptionBubbleEditor = ({
  options,
  onChange,
}: {
  options: NonNullable<SchemaField['options']>;
  onChange: (options: NonNullable<SchemaField['options']>) => void;
}) => {
  const [composerState, setComposerState] = useState<OptionComposerState>('closed');
  const [draftOption, setDraftOption] = useState('');
  const [enteringOptionValue, setEnteringOptionValue] = useState<string | null>(null);
  const [removingOption, setRemovingOption] = useState<{ value: string; width: number } | null>(null);
  const [dragState, setDragState] = useState<OptionDragState | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isOptionInputComposingRef = useRef(false);
  const dragHoldTimerRef = useRef<number | null>(null);
  const dragStateRef = useRef<OptionDragState | null>(null);
  const optionElementRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const pendingDragRef = useRef<{
    optionElement: HTMLElement;
    originX: number;
    pointerId: number;
    startIndex: number;
    value: string;
  } | null>(null);
  const isComposerVisible = composerState !== 'closed';

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => () => clearDragHoldTimer(), []);

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

  const commitOption = (withAnimation = true): boolean => {
    const label = draftOption.trim();

    if (!label || options.some((option) => option.label === label)) {
      inputRef.current?.focus();
      return false;
    }

    const nextOption = {
      label,
      value: createOptionValue(label, options),
    };

    onChange([
      ...options,
      nextOption,
    ]);
    setEnteringOptionValue(nextOption.value);
    isOptionInputComposingRef.current = false;

    if (withAnimation) {
      setComposerState('committing');
      return true;
    }

    setDraftOption('');
    setComposerState('closed');
    return true;
  };

  const collapseComposer = () => {
    isOptionInputComposingRef.current = false;
    setComposerState((currentState) => (currentState === 'open' ? 'closing' : currentState));
  };

  const handleComposerBlur = (event: FocusEvent<HTMLFormElement>) => {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    collapseComposer();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const isComposing =
        isOptionInputComposingRef.current || event.nativeEvent.isComposing || event.keyCode === 229;

      if (isComposing) {
        return;
      }

      event.preventDefault();
      commitOption(false);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      collapseComposer();
    }
  };

  const removeOption = (
    option: NonNullable<SchemaField['options']>[number],
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    if (removingOption) {
      return;
    }

    const optionElement = event.currentTarget.closest('.designer-option-bubble');
    const measuredWidth = optionElement instanceof HTMLElement ? optionElement.getBoundingClientRect().width : 0;
    const width = measuredWidth > 0 ? measuredWidth : 80;

    setRemovingOption({ value: option.value, width });
  };

  const clearDragHoldTimer = () => {
    if (dragHoldTimerRef.current) {
      window.clearTimeout(dragHoldTimerRef.current);
      dragHoldTimerRef.current = null;
    }
  };

  const startOptionDrag = (
    option: NonNullable<SchemaField['options']>[number],
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    if ((event.button !== 0 && event.button !== undefined) || removingOption) {
      return;
    }

    const optionElement = event.currentTarget.closest('.designer-option-bubble');
    const startIndex = options.findIndex((item) => item.value === option.value);

    if (!(optionElement instanceof HTMLElement) || startIndex < 0) {
      return;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
    clearDragHoldTimer();
    const originX = getPointerClientX(event);

    pendingDragRef.current = {
      optionElement,
      originX,
      pointerId: event.pointerId,
      startIndex,
      value: option.value,
    };

    dragHoldTimerRef.current = window.setTimeout(() => {
      const pendingDrag = pendingDragRef.current;

      if (!pendingDrag || pendingDrag.pointerId !== event.pointerId) {
        return;
      }

      const measuredWidth = pendingDrag.optionElement.getBoundingClientRect().width;
      const centerXByValue = collectOptionCenterXByValue(options, optionElementRefs.current);
      const nextDragState = {
        activeCenterX:
          centerXByValue.get(pendingDrag.value) ??
          getOptionCenterX(optionElementRefs.current, pendingDrag.value),
        activeIndex: pendingDrag.startIndex,
        centerXByValue,
        currentX: pendingDrag.originX,
        originX: pendingDrag.originX,
        pointerId: pendingDrag.pointerId,
        shiftWidth: (measuredWidth > 0 ? measuredWidth : 80) + OPTION_DRAG_GAP,
        targetIndex: pendingDrag.startIndex,
        value: pendingDrag.value,
      };

      dragStateRef.current = nextDragState;
      setDragState(nextDragState);
      dragHoldTimerRef.current = null;
    }, OPTION_DRAG_HOLD_MS);
  };

  const moveOptionDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const currentDrag = dragStateRef.current;

    if (!currentDrag || currentDrag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();

    const currentX = getPointerClientX(event);
    const nextDragState = {
      ...currentDrag,
      currentX,
      targetIndex: getOptionDragTargetIndex(options, currentDrag, currentX),
    };

    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  };

  const finishOptionDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const currentDrag = dragStateRef.current;

    clearDragHoldTimer();
    pendingDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (!currentDrag || currentDrag.pointerId !== event.pointerId) {
      return;
    }

    const activeIndex = options.findIndex((item) => item.value === currentDrag.value);

    if (activeIndex >= 0 && currentDrag.targetIndex >= 0 && activeIndex !== currentDrag.targetIndex) {
      onChange(moveOption(options, activeIndex, currentDrag.targetIndex));
    }

    dragStateRef.current = null;
    setDragState(null);
  };

  const cancelOptionDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    clearDragHoldTimer();
    pendingDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragStateRef.current = null;
    setDragState(null);
  };

  const getOptionDragStyle = (
    optionValue: string,
    baseStyle?: CSSProperties,
  ): CSSProperties | undefined => {
    if (!dragState) {
      return baseStyle;
    }

    const offset = getOptionDragOffset(options, dragState, optionValue);

    if (offset === 0 && dragState.value !== optionValue) {
      return baseStyle;
    }

    return {
      ...baseStyle,
      transform: `translateX(${offset}px)`,
      zIndex: dragState.value === optionValue ? 5 : undefined,
    };
  };

  return (
    <div className="designer-property-row designer-option-editor">
      <span className="designer-property-row__label">选项</span>
      <div className="designer-property-row__control designer-option-editor__bubbles">
        <div className="designer-option-editor__action">
          {isComposerVisible ? (
            <form
              aria-label="新选项输入"
              className={`task-tag-composer designer-option-composer${
                composerState === 'closing' ? ' task-tag-composer--closing designer-option-composer--closing' : ''
              }${composerState === 'committing' ? ' task-tag-composer--committing designer-option-composer--committing' : ''}`}
              onAnimationEnd={(event) => {
                if (event.target !== event.currentTarget) {
                  return;
                }

                if (composerState === 'committing') {
                  setDraftOption('');
                  setComposerState('closed');
                  return;
                }

                setComposerState((currentState) => (currentState === 'closing' ? 'closed' : currentState));
              }}
              onBlur={handleComposerBlur}
              onSubmit={(event) => {
                event.preventDefault();

                if (isOptionInputComposingRef.current) {
                  return;
                }

                commitOption();
              }}
            >
              <input
                ref={inputRef}
                aria-label="新选项"
                className="task-tag-composer__input designer-option-composer__input"
                value={draftOption}
                onChange={(event) => setDraftOption(event.target.value)}
                onCompositionStart={() => {
                  isOptionInputComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                  isOptionInputComposingRef.current = false;
                }}
                onKeyDown={handleKeyDown}
              />
              <button
                aria-label="确认新增选项"
                className="task-tag-composer__confirm designer-option-composer__confirm"
                type="submit"
              >
                <span aria-hidden="true" />
              </button>
            </form>
          ) : (
            <button
              aria-label="新增选项"
              className="task-tag-bubble task-tag-bubble--add designer-option-bubble--add"
              type="button"
              onClick={() => setComposerState('open')}
            >
              +
            </button>
          )}
        </div>
        <div
          className={`designer-option-editor__option-list${
            dragState ? ' designer-option-editor__option-list--dragging' : ''
          }`}
        >
          {options.map((option) => (
            <span
              className={`task-tag-bubble task-tag-bubble--removable designer-option-bubble${
                enteringOptionValue === option.value ? ' task-tag-bubble--entering designer-option-bubble--entering' : ''
              }${
                removingOption?.value === option.value ? ' task-tag-bubble--removing designer-option-bubble--removing' : ''
              }${
                dragState?.value === option.value ? ' designer-option-bubble--dragging' : ''
              }${
                dragState && dragState.value !== option.value && getOptionDragOffset(options, dragState, option.value) !== 0
                  ? ' designer-option-bubble--drag-shifted'
                  : ''
              }`}
              key={option.value}
              ref={(element) => {
                if (element) {
                  optionElementRefs.current.set(option.value, element);
                  return;
                }

                optionElementRefs.current.delete(option.value);
              }}
              style={getOptionDragStyle(
                option.value,
                removingOption?.value === option.value
                  ? ({ '--task-tag-remove-width': `${removingOption.width}px` } as CSSProperties)
                  : undefined,
              )}
              onAnimationEnd={(event) => {
                if (event.target !== event.currentTarget) {
                  return;
                }

                if (removingOption?.value === option.value) {
                  onChange(options.filter((item) => item.value !== option.value));
                  setRemovingOption(null);
                  return;
                }

                if (enteringOptionValue === option.value) {
                  setEnteringOptionValue(null);
                }
              }}
            >
              <span
                className={`task-tag-bubble__surface designer-option-bubble__surface${
                  removingOption?.value === option.value ? ' task-tag-bubble__surface--removing designer-option-bubble__surface--removing' : ''
                }`}
                onPointerDown={(event) => startOptionDrag(option, event)}
                onPointerMove={moveOptionDrag}
                onPointerUp={finishOptionDrag}
                onPointerCancel={cancelOptionDrag}
              >
                <span className="task-tag-bubble__label designer-option-bubble__label">{option.label}</span>
                <button
                  className="task-tag-bubble__remove designer-option-bubble__delete"
                  type="button"
                  aria-label={`删除选项 ${option.label}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => removeOption(option, event)}
                >
                  <span aria-hidden="true" />
                </button>
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

const createOptionValue = (
  label: string,
  options: NonNullable<SchemaField['options']>,
): string => {
  const usedValues = new Set(options.map((option) => option.value));
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
  const base = normalized || `option_${options.length + 1}`;
  let value = base;
  let index = 2;

  while (usedValues.has(value)) {
    value = `${base}_${index}`;
    index += 1;
  }

  return value;
};

const getOptionDragTargetIndex = (
  options: NonNullable<SchemaField['options']>,
  dragState: OptionDragState,
  currentX: number,
): number => {
  const activeIndex = options.findIndex((option) => option.value === dragState.value);

  if (activeIndex < 0) {
    return activeIndex;
  }

  let targetIndex = activeIndex;
  const projectedCenterX = dragState.activeCenterX + currentX - dragState.originX;

  if (projectedCenterX >= dragState.activeCenterX) {
    for (let index = activeIndex + 1; index < options.length; index += 1) {
      const optionCenterX = dragState.centerXByValue.get(options[index].value);

      if (optionCenterX !== undefined && projectedCenterX > optionCenterX) {
        targetIndex = index;
      }
    }

    return targetIndex;
  }

  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    const optionCenterX = dragState.centerXByValue.get(options[index].value);

    if (optionCenterX !== undefined && projectedCenterX < optionCenterX) {
      targetIndex = index;
    }
  }

  return targetIndex;
};

const collectOptionCenterXByValue = (
  options: NonNullable<SchemaField['options']>,
  optionElements: Map<string, HTMLSpanElement>,
): Map<string, number> => {
  const centerXByValue = new Map<string, number>();

  for (const option of options) {
    const centerX = getOptionCenterX(optionElements, option.value);

    if (Number.isFinite(centerX)) {
      centerXByValue.set(option.value, centerX);
    }
  }

  return centerXByValue;
};

const getOptionCenterX = (
  optionElements: Map<string, HTMLSpanElement>,
  optionValue: string,
): number => {
  const optionElement = optionElements.get(optionValue);

  if (!optionElement) {
    return Number.POSITIVE_INFINITY;
  }

  const rect = optionElement.getBoundingClientRect();

  return rect.left + rect.width / 2;
};

const getOptionDragOffset = (
  options: NonNullable<SchemaField['options']>,
  dragState: OptionDragState,
  optionValue: string,
): number => {
  if (optionValue === dragState.value) {
    return dragState.currentX - dragState.originX;
  }

  const optionIndex = options.findIndex((option) => option.value === optionValue);

  if (optionIndex < 0 || dragState.targetIndex === dragState.activeIndex) {
    return 0;
  }

  if (
    dragState.targetIndex > dragState.activeIndex &&
    optionIndex > dragState.activeIndex &&
    optionIndex <= dragState.targetIndex
  ) {
    return -dragState.shiftWidth;
  }

  if (
    dragState.targetIndex < dragState.activeIndex &&
    optionIndex >= dragState.targetIndex &&
    optionIndex < dragState.activeIndex
  ) {
    return dragState.shiftWidth;
  }

  return 0;
};

const moveOption = (
  options: NonNullable<SchemaField['options']>,
  fromIndex: number,
  toIndex: number,
): NonNullable<SchemaField['options']> => {
  const nextOptions = [...options];
  const [movedOption] = nextOptions.splice(fromIndex, 1);

  nextOptions.splice(toIndex, 0, movedOption);

  return nextOptions;
};

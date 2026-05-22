import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { CSSProperties, ReactNode } from 'react';

import type { LabelHubSchema, SchemaField } from '@labelhub/shared';

type DesignerCanvasProps = {
  schema: LabelHubSchema;
  selectedFieldKey: string | null;
  onSelectField: (fieldKey: string) => void;
  onMoveField: (fieldKey: string, direction: 'up' | 'down') => void;
  onDuplicateField: (fieldKey: string) => void;
  onRemoveField: (fieldKey: string) => void;
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

export const DesignerCanvas = ({
  schema,
  selectedFieldKey,
  onSelectField,
  onMoveField,
  onDuplicateField,
  onRemoveField,
}: DesignerCanvasProps) => {
  const { isOver, setNodeRef } = useDroppable({ id: 'designer-canvas' });

  return (
    <main
      ref={setNodeRef}
      className={isOver ? 'designer-canvas is-over' : 'designer-canvas'}
      aria-label="画布"
    >
      <div className="designer-canvas__header">
        <div>
          <h2>画布</h2>
          <p>字段顺序即 Renderer 渲染顺序，拖入或点击左侧物料新增字段。</p>
        </div>
        <span>{schema.fields.length} 个顶层字段</span>
      </div>
      {schema.fields.length === 0 ? (
        <div className="designer-canvas__empty">拖入此处新增字段</div>
      ) : (
        <div className="designer-canvas__fields">
          <SortableContext
            items={schema.fields.map((field) => field.key)}
            strategy={verticalListSortingStrategy}
          >
            {schema.fields.map((field) => (
              <SortableDesignerFieldCard
                key={field.key}
                field={field}
                selectedFieldKey={selectedFieldKey}
                onSelectField={onSelectField}
                onMoveField={onMoveField}
                onDuplicateField={onDuplicateField}
                onRemoveField={onRemoveField}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </main>
  );
};

const SortableDesignerFieldCard = ({
  field,
  selectedFieldKey,
  onSelectField,
  onMoveField,
  onDuplicateField,
  onRemoveField,
}: {
  field: SchemaField;
  selectedFieldKey: string | null;
  onSelectField: (fieldKey: string) => void;
  onMoveField: (fieldKey: string, direction: 'up' | 'down') => void;
  onDuplicateField: (fieldKey: string) => void;
  onRemoveField: (fieldKey: string) => void;
}) => {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: field.key,
    data: { kind: 'field', fieldKey: field.key },
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const sortHandle = (
    <button
      className="designer-field-card__sort-handle"
      type="button"
      aria-label={`拖拽排序 ${field.label}`}
      {...attributes}
      {...listeners}
    >
      排序
    </button>
  );

  return (
    <DesignerFieldCard
      field={field}
      isDragging={isDragging}
      selectedFieldKey={selectedFieldKey}
      setNodeRef={setNodeRef}
      sortHandle={sortHandle}
      style={style}
      onSelectField={onSelectField}
      onMoveField={onMoveField}
      onDuplicateField={onDuplicateField}
      onRemoveField={onRemoveField}
    />
  );
};

const DesignerFieldCard = ({
  field,
  isDragging = false,
  selectedFieldKey,
  setNodeRef,
  sortHandle,
  style,
  onSelectField,
  onMoveField,
  onDuplicateField,
  onRemoveField,
}: {
  field: SchemaField;
  isDragging?: boolean;
  selectedFieldKey: string | null;
  setNodeRef?: (node: HTMLElement | null) => void;
  sortHandle?: ReactNode;
  style?: CSSProperties;
  onSelectField: (fieldKey: string) => void;
  onMoveField: (fieldKey: string, direction: 'up' | 'down') => void;
  onDuplicateField: (fieldKey: string) => void;
  onRemoveField: (fieldKey: string) => void;
}) => {
  const selected = selectedFieldKey === field.key;
  const answerKey = field.fieldKey ?? field.key;
  const className = [
    'designer-field-card',
    selected ? 'is-selected' : null,
    isDragging ? 'is-dragging' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article ref={setNodeRef} className={className} style={style}>
      <button
        className="designer-field-card__body"
        type="button"
        aria-label={`选择 ${field.label}`}
        onClick={() => onSelectField(field.key)}
      >
        <span>{FIELD_TYPE_LABELS[field.type]}</span>
        <h3>{field.label}</h3>
        <small>
          字段名：{answerKey} · {field.type}
        </small>
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
      </button>
      <div className="designer-field-card__actions">
        {sortHandle}
        <button type="button" aria-label={`上移 ${field.label}`} onClick={() => onMoveField(field.key, 'up')}>
          ↑
        </button>
        <button type="button" aria-label={`下移 ${field.label}`} onClick={() => onMoveField(field.key, 'down')}>
          ↓
        </button>
        <button type="button" aria-label={`复制 ${field.label}`} onClick={() => onDuplicateField(field.key)}>
          复制
        </button>
        <button type="button" aria-label={`删除 ${field.label}`} onClick={() => onRemoveField(field.key)}>
          删除
        </button>
      </div>
      {field.fields && field.fields.length > 0 ? (
        <div className="designer-field-card__children">
          {field.fields.map((child) => (
            <DesignerFieldCard
              key={child.key}
              field={child}
              selectedFieldKey={selectedFieldKey}
              onSelectField={onSelectField}
              onMoveField={onMoveField}
              onDuplicateField={onDuplicateField}
              onRemoveField={onRemoveField}
            />
          ))}
        </div>
      ) : null}
      {field.tabs?.map((tab) => (
        <section key={tab.key} className="designer-field-card__children">
          <h4>{tab.label}</h4>
          {tab.fields.map((child) => (
            <DesignerFieldCard
              key={child.key}
              field={child}
              selectedFieldKey={selectedFieldKey}
              onSelectField={onSelectField}
              onMoveField={onMoveField}
              onDuplicateField={onDuplicateField}
              onRemoveField={onRemoveField}
            />
          ))}
        </section>
      ))}
    </article>
  );
};

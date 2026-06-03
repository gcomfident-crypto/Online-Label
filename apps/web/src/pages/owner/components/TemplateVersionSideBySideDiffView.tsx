import { useMemo } from 'react';

import {
  getSchemaFieldKey,
  type LabelHubSchema,
  type SchemaField,
} from '@labelhub/shared';

import type { TemplateVersionDiff, TemplateVersionDto } from '../../../api/templates';
import { SchemaRenderer } from '../../../features/schema-renderer';
import type { FieldNodeDecoration } from '../../../features/schema-renderer/types';

type TemplateVersionSideBySideDiffViewProps = {
  currentVersion: TemplateVersionDto;
  diff: TemplateVersionDiff | null;
  isLoading: boolean;
  oldVersion: TemplateVersionDto;
};

type DiffFieldSets = {
  added: ReadonlySet<string>;
  removed: ReadonlySet<string>;
  changed: ReadonlySet<string>;
};

type RendererPreviewData = {
  rawData: Record<string, unknown>;
  value: Record<string, unknown>;
};

export const TemplateVersionSideBySideDiffView = ({
  currentVersion,
  diff,
  isLoading,
  oldVersion,
}: TemplateVersionSideBySideDiffViewProps) => {
  const diffFieldSets = useMemo(() => createDiffFieldSets(diff), [diff]);
  const oldPreviewData = useMemo(() => createRendererPreviewData(oldVersion.schema), [oldVersion.schema]);
  const currentPreviewData = useMemo(() => createRendererPreviewData(currentVersion.schema), [currentVersion.schema]);
  const oldVersionLabel = formatVersionLabel(oldVersion);
  const currentVersionLabel = formatVersionLabel(currentVersion);

  if (isLoading) {
    return <p className="template-version-diff__empty">正在加载版本差异...</p>;
  }

  if (!diff) {
    return <p className="template-version-diff__empty">请选择旧版本查看与当前版本的差异</p>;
  }

  return (
    <div className="template-version-side-by-side-diff" aria-label="旧版本与当前版本渲染对比">
      <div className="template-version-diff__summary" aria-label="版本差异概览">
        <span data-diff-kind="added">新增 {diff.summary.added}</span>
        <span data-diff-kind="removed">删除 {diff.summary.removed}</span>
        <span data-diff-kind="changed">变更 {diff.summary.changed}</span>
      </div>
      {diff.sections.length === 0 ? (
        <p className="template-version-side-by-side-diff__notice">两个版本没有结构差异</p>
      ) : null}
      <div className="template-version-side-by-side-diff__scroller">
        <div className="template-version-side-by-side-diff__grid">
          <VersionPreviewPanel
            ariaLabel={`旧版本 ${oldVersionLabel} 渲染预览`}
            diffFieldSets={diffFieldSets}
            previewData={oldPreviewData}
            schema={oldVersion.schema}
            side="old"
            title={`旧版本 ${oldVersionLabel}`}
          />
          <VersionPreviewPanel
            ariaLabel={`当前版本 ${currentVersionLabel} 渲染预览`}
            diffFieldSets={diffFieldSets}
            previewData={currentPreviewData}
            schema={currentVersion.schema}
            side="current"
            title={`当前版本 ${currentVersionLabel}`}
          />
        </div>
      </div>
    </div>
  );
};

const VersionPreviewPanel = ({
  ariaLabel,
  diffFieldSets,
  previewData,
  schema,
  side,
  title,
}: {
  ariaLabel: string;
  diffFieldSets: DiffFieldSets;
  previewData: RendererPreviewData;
  schema: LabelHubSchema;
  side: 'old' | 'current';
  title: string;
}) => (
  <section className="template-version-side-by-side-diff__panel" role="group" aria-label={ariaLabel}>
    <header className="template-version-side-by-side-diff__panel-header">
      <h4>{title}</h4>
    </header>
    <div className="template-version-side-by-side-diff__owner-preview-shell designer-canvas is-previewing-labeler">
      <section
        className="template-version-side-by-side-diff__canvas annotation-canvas-scroll designer-canvas__labeler-preview-surface"
        aria-label={`${title}模板预览`}
      >
        <SchemaRenderer
          schema={schema}
          rawData={previewData.rawData}
          value={previewData.value}
          mode="review"
          onChange={() => undefined}
          getFieldNodeDecoration={(field) => getFieldNodeDecoration(field, diffFieldSets, side)}
        />
      </section>
    </div>
  </section>
);

const createDiffFieldSets = (diff: TemplateVersionDiff | null): DiffFieldSets => {
  const added = new Set<string>();
  const removed = new Set<string>();
  const changed = new Set<string>();

  for (const section of diff?.sections ?? []) {
    for (const item of section.items) {
      if (section.type === 'added') {
        added.add(item.fieldKey);
        continue;
      }

      if (section.type === 'removed') {
        removed.add(item.fieldKey);
        continue;
      }

      changed.add(item.fieldKey);
    }
  }

  return { added, removed, changed };
};

const getFieldNodeDecoration = (
  field: SchemaField,
  diffFieldSets: DiffFieldSets,
  side: 'old' | 'current',
): FieldNodeDecoration | null => {
  const fieldKey = getSchemaFieldKey(field);

  if (side === 'current' && diffFieldSets.added.has(fieldKey)) {
    return { state: 'added', label: '新增' };
  }

  if (side === 'old' && diffFieldSets.removed.has(fieldKey)) {
    return { state: 'removed', label: '已删除' };
  }

  if (diffFieldSets.changed.has(fieldKey)) {
    return { state: 'changed', label: '已修改' };
  }

  return null;
};

const createRendererPreviewData = (schema: LabelHubSchema): RendererPreviewData => {
  const rawData: Record<string, unknown> = {};
  const value: Record<string, unknown> = {};

  collectPreviewDataFromFields(schema.fields, rawData, value);

  return { rawData, value };
};

const collectPreviewDataFromFields = (
  fields: readonly SchemaField[],
  rawData: Record<string, unknown>,
  value: Record<string, unknown>,
) => {
  for (const field of fields) {
    if (field.type === 'show_item') {
      for (const sourceKey of showItemSourceKeys(field)) {
        rawData[sourceKey] = previewRawValue(sourceKey);
      }
      continue;
    }

    if (field.type === 'group') {
      collectPreviewDataFromFields(field.fields ?? [], rawData, value);
      continue;
    }

    if (field.type === 'tabs') {
      for (const tab of field.tabs ?? []) {
        collectPreviewDataFromFields(tab.fields, rawData, value);
      }
      continue;
    }

    const fieldKey = getSchemaFieldKey(field);
    const previewValue = previewAnswerValue(field);

    if (previewValue !== undefined) {
      value[fieldKey] = previewValue;
    }
  }
};

const showItemSourceKeys = (field: SchemaField): string[] => {
  const keys = new Set<string>();

  if (field.sourceKey) {
    keys.add(field.sourceKey);
  }

  for (const sourceKey of field.sourceKeys ?? []) {
    keys.add(sourceKey);
  }

  const displayFields = field.displayConfig?.fields ?? [];

  for (const displayField of displayFields) {
    if (displayField.sourceKey) {
      keys.add(displayField.sourceKey);
    }
  }

  if (keys.size === 0) {
    keys.add(field.key);
  }

  return [...keys];
};

const previewRawValue = (sourceKey: string): unknown => {
  if (sourceKey === 'media_type') {
    return 'text';
  }

  if (sourceKey.includes('url')) {
    return `https://example.com/${sourceKey}.png`;
  }

  return `${sourceKey} 样例值`;
};

const previewAnswerValue = (field: SchemaField): unknown => {
  const label = field.label || getSchemaFieldKey(field);

  if (field.type === 'text' || field.type === 'textarea' || field.type === 'rich_text' || field.type === 'llm_assist') {
    return `${label} 样例值`;
  }

  if (field.type === 'radio') {
    return field.options?.[0]?.value ?? '';
  }

  if (field.type === 'checkbox' || field.type === 'tag_select') {
    return field.options?.[0]?.value ? [field.options[0].value] : [`${label} 标签`];
  }

  if (field.type === 'file_upload' || field.type === 'image_upload') {
    return {
      name: `${getSchemaFieldKey(field)}.png`,
      url: `https://example.com/${getSchemaFieldKey(field)}.png`,
      mimeType: 'image/png',
      size: 2048,
    };
  }

  if (field.type === 'json_editor') {
    return { sample: `${label} 样例值` };
  }

  return undefined;
};

const formatVersionLabel = (version: Pick<TemplateVersionDto, 'version' | 'schemaVersion'>): string =>
  version.version > 0 ? `v${version.version}` : version.schemaVersion;

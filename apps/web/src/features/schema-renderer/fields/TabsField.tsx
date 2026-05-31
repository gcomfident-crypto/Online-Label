import { useEffect, useMemo, useState } from 'react';

import type { SchemaField } from '@labelhub/shared';

import { FieldRenderer } from '../FieldRenderer';
import type { BaseFieldProps } from './common';
import { FieldTitleRow } from './common';

const collectFieldKeys = (fields: readonly SchemaField[]): string[] => {
  return fields.flatMap((field) => [
    field.fieldKey ?? field.key,
    ...(field.fields ? collectFieldKeys(field.fields) : []),
    ...(field.tabs?.flatMap((tab) => collectFieldKeys(tab.fields)) ?? []),
  ]);
};

const tabContainsFieldKey = (fields: readonly SchemaField[], activeFieldKey?: string | null): boolean => {
  if (!activeFieldKey) {
    return false;
  }

  return collectFieldKeys(fields).includes(activeFieldKey);
};

const chunkFields = (fields: readonly SchemaField[], size = 3): SchemaField[][] => {
  const chunks: SchemaField[][] = [];

  for (let index = 0; index < fields.length; index += size) {
    chunks.push(fields.slice(index, index + size));
  }

  return chunks;
};

const autoRowClassBySize = (size: number): string => {
  if (size >= 3) {
    return 'schema-field__tab-row--3';
  }

  return size === 2 ? 'schema-field__tab-row--2' : 'schema-field__tab-row--1';
};

export const TabsField = ({
  datasetKind,
  field,
  rendererScope,
  fieldPath,
  rawData,
  value,
  mode,
  hiddenFieldKeys,
  disabledFieldKeys,
  requiredFieldKeys,
  validationMessagesByField,
  onFieldChange,
  activeFieldKey,
  onActiveFieldChange,
}: BaseFieldProps) => {
  const tabs = useMemo(() => field.tabs ?? [], [field.tabs]);
  const layout = 'auto_rows';
  const [activeTabKey, setActiveTabKey] = useState(tabs[0]?.key ?? '');
  const errorCountsByTab = useMemo(() => {
    const counts = new Map<string, number>();

    for (const tab of tabs) {
      const tabFieldKeys = collectFieldKeys(tab.fields);
      const errorCount = tabFieldKeys.reduce(
        (count, fieldKey) => count + (validationMessagesByField.get(fieldKey)?.length ?? 0),
        0,
      );

      counts.set(tab.key, errorCount);
    }

    return counts;
  }, [tabs, validationMessagesByField]);
  const activeTab = tabs.find((tab) => tab.key === activeTabKey) ?? tabs[0];
  const activeTabId = activeTab
    ? `${rendererScope}-${fieldPath}-${activeTab.key}-tab`
    : undefined;
  const activePanelId = activeTab
    ? `${rendererScope}-${fieldPath}-${activeTab.key}-panel`
    : undefined;
  const renderChildField = (child: SchemaField) => (
    <FieldRenderer
      key={child.key}
      field={child}
      datasetKind={datasetKind}
      rendererScope={rendererScope}
      fieldPath={`${fieldPath}.${activeTab?.key ?? 'tab'}.${child.key}`}
      rawData={rawData}
      value={value}
      mode={mode}
      hiddenFieldKeys={hiddenFieldKeys}
      disabledFieldKeys={disabledFieldKeys}
      requiredFieldKeys={requiredFieldKeys}
      validationMessagesByField={validationMessagesByField}
      onFieldChange={onFieldChange}
      activeFieldKey={activeFieldKey}
      onActiveFieldChange={onActiveFieldChange}
    />
  );

  useEffect(() => {
    if (tabs.length === 0) {
      setActiveTabKey('');
      return;
    }

    if (!tabs.some((tab) => tab.key === activeTabKey)) {
      setActiveTabKey(tabs[0].key);
    }
  }, [activeTabKey, tabs]);

  useEffect(() => {
    if (!activeFieldKey) {
      return;
    }

    const fieldTab = tabs.find((tab) => tabContainsFieldKey(tab.fields, activeFieldKey));

    if (fieldTab && fieldTab.key !== activeTabKey) {
      setActiveTabKey(fieldTab.key);
    }
  }, [activeFieldKey, activeTabKey, tabs]);

  return (
    <section
      className={`schema-field schema-field--tabs schema-field--tabs-layout-${layout}`}
      data-field-type={field.type}
    >
      <FieldTitleRow field={field} />
      {tabs.length > 0 ? (
        <div className="schema-field__tab-list" role="tablist">
          {tabs.map((tab) => {
            const selected = tab.key === activeTab?.key;
            const tabId = `${rendererScope}-${fieldPath}-${tab.key}-tab`;
            const panelId = `${rendererScope}-${fieldPath}-${tab.key}-panel`;

            return (
              <button
                key={tab.key}
                id={tabId}
                aria-controls={panelId}
                aria-selected={selected}
                className={
                  selected ? 'schema-field__tab-button is-active' : 'schema-field__tab-button'
                }
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
                onClick={() => setActiveTabKey(tab.key)}
              >
                <span>{tab.label}</span>
                {(errorCountsByTab.get(tab.key) ?? 0) > 0 ? (
                  <span className="schema-field__tab-error-badge" aria-label={`${tab.label} 有 ${errorCountsByTab.get(tab.key)} 个错误`}>
                    {errorCountsByTab.get(tab.key)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {activeTab ? (
        <section
          aria-labelledby={activeTabId}
          className={`schema-field__tab schema-field__tab--${layout}`}
          id={activePanelId}
          role="tabpanel"
        >
          {layout === 'auto_rows'
            ? chunkFields(activeTab.fields).map((row, rowIndex) => (
                <div
                  key={`${activeTab.key}-row-${rowIndex}`}
                  className={`schema-field__tab-row ${autoRowClassBySize(row.length)}`}
                >
                  {row.map(renderChildField)}
                </div>
              ))
            : activeTab.fields.map(renderChildField)}
        </section>
      ) : null}
    </section>
  );
};

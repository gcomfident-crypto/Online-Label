import { useEffect, useMemo, useState } from 'react';

import { FieldRenderer } from '../FieldRenderer';
import type { BaseFieldProps } from './common';

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
  validationMessagesByField,
  onFieldChange,
}: BaseFieldProps) => {
  const tabs = useMemo(() => field.tabs ?? [], [field.tabs]);
  const [activeTabKey, setActiveTabKey] = useState(tabs[0]?.key ?? '');
  const activeTab = tabs.find((tab) => tab.key === activeTabKey) ?? tabs[0];
  const activeTabId = activeTab
    ? `${rendererScope}-${fieldPath}-${activeTab.key}-tab`
    : undefined;
  const activePanelId = activeTab
    ? `${rendererScope}-${fieldPath}-${activeTab.key}-panel`
    : undefined;

  useEffect(() => {
    if (tabs.length === 0) {
      setActiveTabKey('');
      return;
    }

    if (!tabs.some((tab) => tab.key === activeTabKey)) {
      setActiveTabKey(tabs[0].key);
    }
  }, [activeTabKey, tabs]);

  return (
    <section className="schema-field schema-field--tabs" data-field-type={field.type}>
      <h3>{field.label}</h3>
      {field.description ? <p>{field.description}</p> : null}
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
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {activeTab ? (
        <section
          aria-labelledby={activeTabId}
          className="schema-field__tab"
          id={activePanelId}
          role="tabpanel"
        >
          {activeTab.fields.map((child) => (
            <FieldRenderer
              key={child.key}
              field={child}
              datasetKind={datasetKind}
              rendererScope={rendererScope}
              fieldPath={`${fieldPath}.${activeTab.key}.${child.key}`}
              rawData={rawData}
              value={value}
              mode={mode}
              hiddenFieldKeys={hiddenFieldKeys}
              disabledFieldKeys={disabledFieldKeys}
              validationMessagesByField={validationMessagesByField}
              onFieldChange={onFieldChange}
            />
          ))}
        </section>
      ) : null}
    </section>
  );
};

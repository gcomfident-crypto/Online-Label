import { useEffect, useMemo, useState } from 'react';

import type { SchemaField } from '@labelhub/shared';

import { FieldRenderer } from '../FieldRenderer';
import type { BaseFieldProps } from './common';
import { FieldDescription } from './common';

const collectFieldKeys = (fields: readonly SchemaField[]): string[] => {
  return fields.flatMap((field) => [
    field.fieldKey ?? field.key,
    ...(field.fields ? collectFieldKeys(field.fields) : []),
    ...(field.tabs?.flatMap((tab) => collectFieldKeys(tab.fields)) ?? []),
  ]);
};

export const GroupField = ({
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
  allowedOptionsByFieldKey,
  overrideableOptionLimitFieldKeys,
  validationMessagesByField,
  showValidationErrors,
  onFieldChange,
  activeFieldKey,
  onActiveFieldChange,
  validationFocusFieldKey,
  getFieldNodeDecoration,
}: BaseFieldProps) => {
  const layout = field.layout === 'two_columns' ? 'two_columns' : 'single_column';
  const childFieldKeys = useMemo(() => collectFieldKeys(field.fields ?? []), [field.fields]);
  const [isExpanded, setIsExpanded] = useState(() => !field.defaultCollapsed);
  const hasChildError = childFieldKeys.some(
    (childFieldKey) => (validationMessagesByField.get(childFieldKey)?.length ?? 0) > 0,
  );
  const hasActiveChild = activeFieldKey ? childFieldKeys.includes(activeFieldKey) : false;
  const showCollapseToggle = Boolean(field.defaultCollapsed);

  useEffect(() => {
    setIsExpanded(!field.defaultCollapsed);
  }, [field.defaultCollapsed, field.key]);

  useEffect(() => {
    if (hasActiveChild || hasChildError) {
      setIsExpanded(true);
    }
  }, [hasActiveChild, hasChildError]);

  return (
    <fieldset
      className={`schema-field schema-field--group schema-field--group-layout-${layout}`}
      data-field-type={field.type}
    >
      <legend className="schema-field__title-row schema-field__group-title-row">
        <span className="schema-field__title">{field.label}</span>
        {field.validation?.required ? (
          <span className="schema-field__required-mark" aria-hidden="true">
            *
          </span>
        ) : null}
        <FieldDescription field={field} />
        {showCollapseToggle ? (
          <button
            aria-expanded={isExpanded}
            className="schema-field__group-toggle"
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
          >
            {isExpanded ? '收起' : '展开'}
          </button>
        ) : null}
      </legend>
      {isExpanded ? (
        <div className={`schema-field__group-body schema-field__group-body--${layout}`}>
          {(field.fields ?? []).map((child) => (
            <FieldRenderer
              key={child.key}
              field={child}
              datasetKind={datasetKind}
              rendererScope={rendererScope}
              fieldPath={`${fieldPath}.${child.key}`}
              rawData={rawData}
              value={value}
              mode={mode}
              hiddenFieldKeys={hiddenFieldKeys}
              disabledFieldKeys={disabledFieldKeys}
              requiredFieldKeys={requiredFieldKeys}
              allowedOptionsByFieldKey={allowedOptionsByFieldKey}
              overrideableOptionLimitFieldKeys={overrideableOptionLimitFieldKeys}
              validationMessagesByField={validationMessagesByField}
              showValidationErrors={showValidationErrors}
              onFieldChange={onFieldChange}
              activeFieldKey={activeFieldKey}
              onActiveFieldChange={onActiveFieldChange}
              validationFocusFieldKey={validationFocusFieldKey}
              getFieldNodeDecoration={getFieldNodeDecoration}
            />
          ))}
        </div>
      ) : null}
    </fieldset>
  );
};

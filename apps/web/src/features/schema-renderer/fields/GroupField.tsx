import { FieldRenderer } from '../FieldRenderer';
import type { BaseFieldProps } from './common';
import { FieldLegend } from './common';

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
  validationMessagesByField,
  onFieldChange,
  activeFieldKey,
  onActiveFieldChange,
}: BaseFieldProps) => {
  return (
    <fieldset className="schema-field schema-field--group" data-field-type={field.type}>
      <FieldLegend field={field} />
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
          validationMessagesByField={validationMessagesByField}
          onFieldChange={onFieldChange}
          activeFieldKey={activeFieldKey}
          onActiveFieldChange={onActiveFieldChange}
        />
      ))}
    </fieldset>
  );
};

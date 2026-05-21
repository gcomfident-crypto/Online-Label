import { FieldRenderer } from '../FieldRenderer';
import type { BaseFieldProps } from './common';

export const TabsField = ({
  field,
  rawData,
  value,
  mode,
  onFieldChange,
}: BaseFieldProps) => {
  return (
    <section className="schema-field schema-field--tabs" data-field-type={field.type}>
      <h3>{field.label}</h3>
      {field.description ? <p>{field.description}</p> : null}
      {(field.tabs ?? []).map((tab) => (
        <section key={tab.key} className="schema-field__tab">
          <h4>{tab.label}</h4>
          {tab.fields.map((child) => (
            <FieldRenderer
              key={child.key}
              field={child}
              rawData={rawData}
              value={value}
              mode={mode}
              onFieldChange={onFieldChange}
            />
          ))}
        </section>
      ))}
    </section>
  );
};


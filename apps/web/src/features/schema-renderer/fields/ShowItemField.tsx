import type { BaseFieldProps } from './common';
import { stringifyDisplayValue } from './common';

export const ShowItemField = ({ field, rawData }: BaseFieldProps) => {
  return (
    <section className="schema-field schema-field--show-item" data-field-type={field.type}>
      <div className="schema-field__meta">展示项 ShowItem</div>
      <h3>{field.label}</h3>
      {field.description ? <p>{field.description}</p> : null}
      <pre>{stringifyDisplayValue(rawData[field.key])}</pre>
    </section>
  );
};


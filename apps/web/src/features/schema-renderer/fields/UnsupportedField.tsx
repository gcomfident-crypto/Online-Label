import type { BaseFieldProps } from './common';

export const UnsupportedField = ({ field }: BaseFieldProps) => {
  return (
    <section className="schema-field schema-field--placeholder" data-field-type={field.type}>
      <h3>{field.label}</h3>
      <p>{field.type} 物料将在后续接入</p>
    </section>
  );
};


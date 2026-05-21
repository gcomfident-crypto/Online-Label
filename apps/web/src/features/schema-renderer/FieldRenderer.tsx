import type { FieldOption, SchemaField } from '@labelhub/shared';

import type { FieldRendererProps } from './types';

const stringifyDisplayValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return '暂无内容';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
};

const getStringValue = (value: unknown): string => {
  return typeof value === 'string' ? value : '';
};

const getStringArrayValue = (value: unknown): string[] => {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
};

const optionLabel = (field: SchemaField, option: FieldOption): string => {
  return `${field.label}：${option.label}`;
};

export const FieldRenderer = ({
  field,
  rawData,
  value,
  mode,
  onFieldChange,
}: FieldRendererProps) => {
  const disabled = mode === 'review';
  const fieldValue = value[field.key];

  if (field.type === 'show_item') {
    return (
      <section className="schema-field schema-field--show-item" data-field-type={field.type}>
        <div className="schema-field__meta">展示项 ShowItem</div>
        <h3>{field.label}</h3>
        {field.description ? <p>{field.description}</p> : null}
        <pre>{stringifyDisplayValue(rawData[field.key])}</pre>
      </section>
    );
  }

  if (field.type === 'text') {
    return (
      <label className="schema-field" data-field-type={field.type}>
        <span>{field.label}</span>
        {field.description ? <small>{field.description}</small> : null}
        <input
          aria-label={field.label}
          disabled={disabled}
          placeholder={field.placeholder}
          value={getStringValue(fieldValue)}
          onChange={(event) => onFieldChange(field, event.target.value)}
        />
      </label>
    );
  }

  if (field.type === 'textarea') {
    return (
      <label className="schema-field" data-field-type={field.type}>
        <span>{field.label}</span>
        {field.description ? <small>{field.description}</small> : null}
        <textarea
          aria-label={field.label}
          disabled={disabled}
          placeholder={field.placeholder}
          value={getStringValue(fieldValue)}
          onChange={(event) => onFieldChange(field, event.target.value)}
        />
      </label>
    );
  }

  if (field.type === 'radio') {
    return (
      <fieldset className="schema-field" data-field-type={field.type}>
        <legend>{field.label}</legend>
        {field.description ? <small>{field.description}</small> : null}
        {(field.options ?? []).map((option) => (
          <label key={option.value}>
            <input
              aria-label={option.label}
              checked={fieldValue === option.value}
              disabled={disabled}
              name={field.key}
              type="radio"
              value={option.value}
              onChange={() => onFieldChange(field, option.value)}
            />
            <span>{optionLabel(field, option)}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  if (field.type === 'checkbox' || field.type === 'tag_select') {
    const selectedValues = getStringArrayValue(fieldValue);

    return (
      <fieldset className="schema-field" data-field-type={field.type}>
        <legend>{field.label}</legend>
        {field.description ? <small>{field.description}</small> : null}
        {(field.options ?? []).map((option) => {
          const checked = selectedValues.includes(option.value);
          const nextValues = checked
            ? selectedValues.filter((item) => item !== option.value)
            : [...selectedValues, option.value];

          return (
            <label key={option.value}>
              <input
                aria-label={option.label}
                checked={checked}
                disabled={disabled}
                type="checkbox"
                value={option.value}
                onChange={() => onFieldChange(field, nextValues)}
              />
              <span>{optionLabel(field, option)}</span>
            </label>
          );
        })}
      </fieldset>
    );
  }

  if (field.type === 'group') {
    return (
      <fieldset className="schema-field schema-field--group" data-field-type={field.type}>
        <legend>{field.label}</legend>
        {field.description ? <p>{field.description}</p> : null}
        {(field.fields ?? []).map((child) => (
          <FieldRenderer
            key={child.key}
            field={child}
            rawData={rawData}
            value={value}
            mode={mode}
            onFieldChange={onFieldChange}
          />
        ))}
      </fieldset>
    );
  }

  if (field.type === 'tabs') {
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
  }

  return (
    <section className="schema-field schema-field--placeholder" data-field-type={field.type}>
      <h3>{field.label}</h3>
      <p>{field.type} 物料将在后续接入</p>
    </section>
  );
};

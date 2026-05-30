import { useEffect, useId, useMemo, useRef } from 'react';
import type { SchemaField } from '@labelhub/shared';

import { FieldRenderer } from './FieldRenderer';
import { applySchemaLinkage } from './linkage';
import type { FieldNextValue, FieldValueUpdater, SchemaRendererProps } from './types';
import { getSchemaFieldKey } from './types';
import { validateSchemaAnswers } from './validation';

const isFieldValueUpdater = (nextValue: FieldNextValue): nextValue is FieldValueUpdater => {
  return typeof nextValue === 'function';
};

const areAnswersEqual = (
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => areAnswerValuesEqual(left[key], right[key]))
  );
};

const areAnswerValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left !== typeof right || left === null || right === null) {
    return false;
  }

  if (typeof left !== 'object') {
    return false;
  }

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
};

export const SchemaRenderer = ({
  schema,
  rawData,
  value,
  mode,
  onChange,
  activeFieldKey,
  onActiveFieldChange,
}: SchemaRendererProps) => {
  const rendererScope = useId();
  const latestValueRef = useRef(value);
  const lastAutoEmittedAnswersRef = useRef<Record<string, unknown> | null>(null);
  const linkageResult = useMemo(() => applySchemaLinkage(schema, value), [schema, value]);
  const validationErrors = useMemo(
    () => validateSchemaAnswers(schema, linkageResult.answers, linkageResult),
    [schema, linkageResult],
  );
  const validationMessagesByField = useMemo(() => {
    const messagesByField = new Map<string, string[]>();

    for (const error of validationErrors) {
      messagesByField.set(error.fieldKey, [
        ...(messagesByField.get(error.fieldKey) ?? []),
        error.message,
      ]);
    }

    return messagesByField;
  }, [validationErrors]);

  useEffect(() => {
    latestValueRef.current = linkageResult.answers;
  }, [linkageResult.answers]);

  useEffect(() => {
    if (mode === 'review') {
      return;
    }

    if (areAnswersEqual(value, linkageResult.answers)) {
      if (
        lastAutoEmittedAnswersRef.current &&
        areAnswersEqual(value, lastAutoEmittedAnswersRef.current)
      ) {
        lastAutoEmittedAnswersRef.current = null;
      }
      return;
    }

    if (
      lastAutoEmittedAnswersRef.current &&
      areAnswersEqual(lastAutoEmittedAnswersRef.current, linkageResult.answers)
    ) {
      return;
    }

    lastAutoEmittedAnswersRef.current = linkageResult.answers;
    onChange(linkageResult.answers);
  }, [linkageResult.answers, mode, onChange, value]);

  const handleFieldChange = (field: SchemaField, nextValue: FieldNextValue) => {
    const currentAnswers = latestValueRef.current;
    const fieldKey = getSchemaFieldKey(field);
    const resolvedValue = isFieldValueUpdater(nextValue)
      ? nextValue(currentAnswers[fieldKey])
      : nextValue;
    const nextAnswers = { ...currentAnswers, [fieldKey]: resolvedValue };
    const nextLinkageResult = applySchemaLinkage(schema, nextAnswers);

    latestValueRef.current = nextLinkageResult.answers;
    onChange(nextLinkageResult.answers);
  };

  return (
    <section className="schema-renderer" data-mode={mode}>
      {schema.fields.map((field) => (
        <FieldRenderer
          key={field.key}
          field={field}
          datasetKind={schema.datasetKind}
          rendererScope={rendererScope}
          fieldPath={field.key}
          rawData={rawData}
          value={linkageResult.answers}
          mode={mode}
          hiddenFieldKeys={linkageResult.hiddenFieldKeys}
          disabledFieldKeys={linkageResult.disabledFieldKeys}
          validationMessagesByField={validationMessagesByField}
          onFieldChange={handleFieldChange}
          activeFieldKey={activeFieldKey}
          onActiveFieldChange={onActiveFieldChange}
        />
      ))}
    </section>
  );
};

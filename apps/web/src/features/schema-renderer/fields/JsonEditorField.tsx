import { useEffect, useRef, useState } from 'react';

import type { EditableFieldProps } from './common';
import { FieldDescription, getFieldValue, isDisabledMode } from './common';

const getJsonEditorValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2);
};

const parseJsonEditorValue = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export const JsonEditorField = ({ field, value, mode, onFieldChange }: EditableFieldProps) => {
  const fieldValue = getFieldValue(field, value);
  const [draftValue, setDraftValue] = useState(() => getJsonEditorValue(fieldValue));
  const lastDraftRef = useRef(draftValue);
  const lastEmittedValueRef = useRef<unknown>(fieldValue);

  useEffect(() => {
    if (Object.is(fieldValue, lastEmittedValueRef.current)) {
      return;
    }

    const nextDraftValue = getJsonEditorValue(fieldValue);

    if (lastDraftRef.current !== nextDraftValue) {
      setDraftValue(nextDraftValue);
      lastDraftRef.current = nextDraftValue;
    }
  }, [fieldValue]);

  return (
    <label className="schema-field" data-field-type={field.type}>
      <span>{field.label}</span>
      <FieldDescription field={field} />
      <textarea
        aria-label={field.label}
        disabled={isDisabledMode(mode)}
        placeholder={field.placeholder}
        value={draftValue}
        onChange={(event) => {
          const nextDraftValue = event.target.value;

          setDraftValue(nextDraftValue);
          lastDraftRef.current = nextDraftValue;
          lastEmittedValueRef.current = parseJsonEditorValue(nextDraftValue);
          onFieldChange(field, lastEmittedValueRef.current);
        }}
      />
      <small>JSON 将在校验阶段检查。</small>
    </label>
  );
};

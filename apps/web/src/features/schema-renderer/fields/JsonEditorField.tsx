import { useEffect, useRef, useState } from 'react';

import type { EditableFieldProps } from './common';
import { FieldDescription, getFieldValue, isDisabledMode } from './common';

const NO_PENDING_EMITTED_VALUE = Symbol('NO_PENDING_EMITTED_VALUE');

const getJsonEditorValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2);
};

type JsonEditorParseResult =
  | {
      ok: true;
      value: unknown;
    }
  | {
      ok: false;
    };

const parseJsonEditorValue = (value: string): JsonEditorParseResult => {
  if (value.trim() === '') {
    return { ok: true, value: null };
  }

  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
};

export const JsonEditorField = ({ field, value, mode, onFieldChange }: EditableFieldProps) => {
  const fieldValue = getFieldValue(field, value);
  const [draftValue, setDraftValue] = useState(() => getJsonEditorValue(fieldValue));
  const [error, setError] = useState<string | null>(null);
  const lastDraftRef = useRef(draftValue);
  const pendingEmittedValueRef = useRef<unknown | typeof NO_PENDING_EMITTED_VALUE>(
    NO_PENDING_EMITTED_VALUE,
  );

  useEffect(() => {
    if (Object.is(fieldValue, pendingEmittedValueRef.current)) {
      pendingEmittedValueRef.current = NO_PENDING_EMITTED_VALUE;
      return;
    }

    pendingEmittedValueRef.current = NO_PENDING_EMITTED_VALUE;
    setError(null);

    const nextDraftValue = getJsonEditorValue(fieldValue);

    if (lastDraftRef.current !== nextDraftValue) {
      setDraftValue(nextDraftValue);
      lastDraftRef.current = nextDraftValue;
    }
  }, [fieldValue, value]);

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
          const parsedValue = parseJsonEditorValue(nextDraftValue);

          setDraftValue(nextDraftValue);
          lastDraftRef.current = nextDraftValue;

          if (!parsedValue.ok) {
            setError('JSON 格式不合法。');
            return;
          }

          setError(null);
          pendingEmittedValueRef.current = parsedValue.value;
          onFieldChange(field, parsedValue.value);
        }}
      />
      {error ? <small role="alert">{error}</small> : null}
      <small>JSON 将在校验阶段检查。</small>
    </label>
  );
};

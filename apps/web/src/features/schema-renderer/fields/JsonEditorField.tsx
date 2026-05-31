import { useEffect, useRef, useState } from 'react';
import JSONEditor, { type JSONEditorOptions } from 'jsoneditor';
import 'jsoneditor/dist/jsoneditor.min.css';

import { ToastViewport, useToastController } from '../../../components/ToastViewport';
import type { EditableFieldProps } from './common';
import { FieldTitleRow, getFieldValue, isDisabledMode } from './common';

const NO_PENDING_EMITTED_VALUE = Symbol('NO_PENDING_EMITTED_VALUE');

const getJsonEditorText = (value: unknown): string => {
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

const setEditorText = (editor: JSONEditor, nextText: string) => {
  if (nextText.trim() === '') {
    editor.setMode('text');
  }

  editor.setText(nextText);
};

const labelTextEditorInput = (container: HTMLElement | null, label: string) => {
  container
    ?.querySelector<HTMLTextAreaElement>('.ace_text-input, textarea.jsoneditor-text')
    ?.setAttribute('aria-label', label);
};

const getReadOnlyJsonValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export const JsonEditorField = ({
  field,
  value,
  mode,
  disabled,
  onFieldChange,
}: EditableFieldProps) => {
  const fieldValue = getFieldValue(field, value);
  const readOnly = isDisabledMode(mode, disabled);
  const [draftValue, setDraftValue] = useState(() => getJsonEditorText(fieldValue));
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<JSONEditor | null>(null);
  const lastDraftRef = useRef(draftValue);
  const errorRef = useRef<string | null>(null);
  const fieldRef = useRef(field);
  const onFieldChangeRef = useRef(onFieldChange);
  const { clearToasts, dismissToast, messages, showErrorToast } = useToastController();
  const pendingEmittedValueRef = useRef<unknown | typeof NO_PENDING_EMITTED_VALUE>(
    NO_PENDING_EMITTED_VALUE,
  );

  fieldRef.current = field;
  onFieldChangeRef.current = onFieldChange;

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const options: JSONEditorOptions = readOnly
      ? {
          mode: 'view',
          mainMenuBar: false,
          navigationBar: false,
          search: false,
          history: false,
        }
      : {
          mode: 'text',
          modes: ['text', 'tree', 'code'],
          mainMenuBar: true,
          navigationBar: false,
          statusBar: false,
          search: true,
          history: true,
          indentation: 2,
          onChangeText: (jsonString) => {
            const parsedValue = parseJsonEditorValue(jsonString);

            setDraftValue(jsonString);
            lastDraftRef.current = jsonString;

            if (!parsedValue.ok) {
              if (!errorRef.current) {
                showErrorToast('JSON 格式不合法');
              }
              errorRef.current = 'JSON 格式不合法';
              setError('JSON 格式不合法');
              return;
            }

            errorRef.current = null;
            setError(null);
            clearToasts();
            pendingEmittedValueRef.current = parsedValue.value;
            onFieldChangeRef.current(fieldRef.current, parsedValue.value);
          },
          onError: () => {
            if (!errorRef.current) {
              showErrorToast('JSON 格式不合法');
            }
            errorRef.current = 'JSON 格式不合法';
            setError('JSON 格式不合法');
          },
        };

    const editor = new JSONEditor(containerRef.current, options);
    editorRef.current = editor;

    if (readOnly) {
      editor.set(getReadOnlyJsonValue(fieldValue));
    } else {
      setEditorText(editor, lastDraftRef.current);
      labelTextEditorInput(containerRef.current, fieldRef.current.label);
    }

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, [clearToasts, readOnly, showErrorToast]);

  useEffect(() => {
    if (Object.is(fieldValue, pendingEmittedValueRef.current)) {
      pendingEmittedValueRef.current = NO_PENDING_EMITTED_VALUE;
      return;
    }

    pendingEmittedValueRef.current = NO_PENDING_EMITTED_VALUE;
    errorRef.current = null;
    setError(null);
    clearToasts();

    const nextDraftValue = getJsonEditorText(fieldValue);

    if (lastDraftRef.current === nextDraftValue) {
      return;
    }

    setDraftValue(nextDraftValue);
    lastDraftRef.current = nextDraftValue;

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (readOnly) {
      editor.set(getReadOnlyJsonValue(fieldValue));
      return;
    }

    setEditorText(editor, nextDraftValue);
  }, [clearToasts, fieldValue, readOnly, value]);

  return (
    <div className="schema-field" data-field-type={field.type}>
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <FieldTitleRow field={field} />
      <div
        aria-disabled={readOnly ? 'true' : 'false'}
        aria-label={`${field.label} 编辑器`}
        className={
          readOnly
            ? 'schema-json-editor schema-json-editor--disabled'
            : 'schema-json-editor'
        }
        data-json-draft={draftValue}
        role="group"
      >
        <div className="schema-json-editor__mount" ref={containerRef} />
      </div>
      {error ? <small className="schema-json-editor__error">{error}</small> : <small>JSON 将在校验阶段检查</small>}
    </div>
  );
};

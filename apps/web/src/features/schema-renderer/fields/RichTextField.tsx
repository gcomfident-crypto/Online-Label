import { useEffect, useMemo, useRef } from 'react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import {
  BlockQuote,
  Bold,
  ClassicEditor,
  Essentials,
  Italic,
  List,
  Paragraph,
  Underline,
  type EditorConfig,
} from 'ckeditor5';
import 'ckeditor5/ckeditor5.css';

import type { EditableFieldProps } from './common';
import { FieldTitleRow, getFieldValue, getStringValue, isDisabledMode } from './common';

const RICH_TEXT_LICENSE_KEY = 'GPL';

type RichTextEditorInstance = {
  ui: {
    view: {
      editable: {
        element: HTMLElement | null;
      };
    };
  };
};

const normalizeRichTextValue = (html: string): string => {
  const textContent = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, '')
    .replace(/\u00a0/g, '')
    .trim();

  return textContent ? html : '';
};

const configureEditableElement = (
  editor: RichTextEditorInstance,
  label: string,
  readOnly: boolean,
) => {
  const editableElement = editor.ui.view.editable.element;

  if (!editableElement) {
    return;
  }

  editableElement.setAttribute('aria-label', label);
  editableElement.setAttribute('aria-disabled', readOnly ? 'true' : 'false');
};

export const RichTextField = ({
  field,
  value,
  mode,
  disabled,
  onFieldChange,
}: EditableFieldProps) => {
  const stringValue = getStringValue(getFieldValue(field, value));
  const readOnly = isDisabledMode(mode, disabled);
  const editorRef = useRef<RichTextEditorInstance | null>(null);
  const editorConfig = useMemo<EditorConfig>(
    () => ({
      licenseKey: RICH_TEXT_LICENSE_KEY,
      plugins: [Essentials, Paragraph, Bold, Italic, Underline, List, BlockQuote],
      toolbar: {
        items: [
          'bold',
          'italic',
          'underline',
          '|',
          'bulletedList',
          'numberedList',
          '|',
          'blockQuote',
          'undo',
          'redo',
        ],
        shouldNotGroupWhenFull: true,
      },
      placeholder: field.placeholder ?? '请输入富文本内容',
    }),
    [field.placeholder],
  );

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    configureEditableElement(editorRef.current, field.label, readOnly);
  }, [field.label, readOnly]);

  return (
    <div className="schema-field" data-field-type={field.type}>
      <FieldTitleRow field={field} meta="富文本" />
      <div
        className={
          readOnly
            ? 'schema-rich-text-editor schema-rich-text-editor--disabled'
            : 'schema-rich-text-editor'
        }
      >
        <CKEditor
          editor={ClassicEditor}
          config={editorConfig}
          data={stringValue}
          disabled={readOnly}
          onReady={(editor) => {
            const editorInstance = editor as RichTextEditorInstance;
            editorRef.current = editorInstance;
            configureEditableElement(editorInstance, field.label, readOnly);
          }}
          onChange={(_event, editor) => {
            onFieldChange(field, normalizeRichTextValue(editor.getData()));
          }}
        />
      </div>
    </div>
  );
};

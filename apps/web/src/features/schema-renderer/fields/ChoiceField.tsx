import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import { InlineLlmSuggestionControl } from './InlineLlmSuggestionControl';
import type { BaseFieldProps, EditableFieldProps } from './common';
import {
  FieldLegend,
  getFieldValue,
  getStringArrayValue,
  isDisabledMode,
  optionLabel,
} from './common';

export const RadioField = ({
  field,
  rendererScope,
  fieldPath,
  value,
  mode,
  disabled,
  onFieldChange,
}: EditableFieldProps) => {
  const fieldValue = getFieldValue(field, value);
  const radioGroupName = `${rendererScope}:${fieldPath}`;

  return (
    <fieldset className="schema-field" data-field-type={field.type}>
      <FieldLegend field={field} />
      <div className="schema-choice-bubbles" role="presentation">
        {(field.options ?? []).map((option) => (
          <label className="schema-choice-bubble" key={option.value}>
            <input
              aria-label={option.label}
              checked={fieldValue === option.value}
              disabled={isDisabledMode(mode, disabled)}
              name={radioGroupName}
              type="radio"
              value={option.value}
              onChange={() => onFieldChange(field, option.value)}
            />
            <span className="schema-choice-bubble__surface">{optionLabel(field, option)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
};

type TagComposerState = 'closed' | 'closing' | 'committing' | 'open';

export const MultiChoiceField = (props: BaseFieldProps) => {
  const { field, value, mode, disabled, onFieldChange } = props;
  const selectedValues = getStringArrayValue(getFieldValue(field, value));

  return (
    <fieldset className="schema-field" data-field-type={field.type}>
      <FieldLegend field={field} />
      <div className="schema-choice-bubbles" role="presentation">
        {(field.options ?? []).map((option) => {
          const checked = selectedValues.includes(option.value);

          return (
            <label className="schema-choice-bubble" key={option.value}>
              <input
                aria-label={option.label}
                checked={checked}
                disabled={isDisabledMode(mode, disabled)}
                type="checkbox"
                value={option.value}
                onChange={() =>
                  onFieldChange(field, (currentValue: unknown) => {
                    const currentValues = getStringArrayValue(currentValue);

                    return currentValues.includes(option.value)
                      ? currentValues.filter((item) => item !== option.value)
                      : [...currentValues, option.value];
                  })
                }
              />
              <span className="schema-choice-bubble__surface">{optionLabel(field, option)}</span>
            </label>
          );
        })}
      </div>
      {field.type === 'tag_select' ? <InlineLlmSuggestionControl {...props} /> : null}
    </fieldset>
  );
};

export const TagSelectField = (props: BaseFieldProps) => {
  const { field, value, mode, disabled, onFieldChange } = props;
  const selectedValues = getStringArrayValue(getFieldValue(field, value));
  const [composerState, setComposerState] = useState<TagComposerState>('closed');
  const [draftTag, setDraftTag] = useState('');
  const [enteringTag, setEnteringTag] = useState<string | null>(null);
  const [removingTag, setRemovingTag] = useState<{ tag: string; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isTagInputComposingRef = useRef(false);
  const isReadonly = isDisabledMode(mode, disabled);
  const isComposerVisible = composerState !== 'closed';

  useEffect(() => {
    if (composerState !== 'open') {
      return;
    }

    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [composerState]);

  const normalizeDraftTag = (): string => draftTag.trim().replace(/\s+/g, ' ');

  const commitTag = (withAnimation = true): boolean => {
    const tag = normalizeDraftTag();

    if (!tag || selectedValues.includes(tag)) {
      inputRef.current?.focus();
      return false;
    }

    onFieldChange(field, (currentValue: unknown) => {
      const currentValues = getStringArrayValue(currentValue);

      return currentValues.includes(tag) ? currentValues : [...currentValues, tag];
    });
    setEnteringTag(tag);
    isTagInputComposingRef.current = false;

    if (withAnimation) {
      setComposerState('committing');
      return true;
    }

    setDraftTag('');
    setComposerState('closed');
    return true;
  };

  const collapseComposer = () => {
    isTagInputComposingRef.current = false;
    setComposerState((currentState) => (currentState === 'open' ? 'closing' : currentState));
  };

  const handleComposerBlur = (event: FocusEvent<HTMLFormElement>) => {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    collapseComposer();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const isComposing =
        isTagInputComposingRef.current || event.nativeEvent.isComposing || event.keyCode === 229;

      if (isComposing) {
        return;
      }

      event.preventDefault();
      commitTag(false);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      collapseComposer();
    }
  };

  const removeTag = (tag: string, event: MouseEvent<HTMLButtonElement>) => {
    if (removingTag || isReadonly) {
      return;
    }

    const tagElement = event.currentTarget.closest('.task-tag-bubble');
    const measuredWidth = tagElement instanceof HTMLElement ? tagElement.getBoundingClientRect().width : 0;
    const width = measuredWidth > 0 ? measuredWidth : 80;

    setRemovingTag({ tag, width });
  };

  const handleAddTagClick = () => {
    if (isReadonly) {
      return;
    }

    setComposerState('open');
  };

  return (
    <fieldset className="schema-field schema-tag-input" data-field-type={field.type}>
      <FieldLegend field={field} />
      <div className="task-tag-editor__bubbles">
        {selectedValues.map((tag) => (
          <span
            className={`task-tag-bubble task-tag-bubble--removable${
              enteringTag === tag ? ' task-tag-bubble--entering' : ''
            }${removingTag?.tag === tag ? ' task-tag-bubble--removing' : ''}`}
            key={tag}
            style={
              removingTag?.tag === tag
                ? ({ '--task-tag-remove-width': `${removingTag.width}px` } as CSSProperties)
                : undefined
            }
            onAnimationEnd={(event) => {
              if (event.target !== event.currentTarget) {
                return;
              }

              if (removingTag?.tag === tag) {
                onFieldChange(field, (currentValue: unknown) =>
                  getStringArrayValue(currentValue).filter((currentTag) => currentTag !== tag),
                );
                setRemovingTag(null);
                return;
              }

              if (enteringTag === tag) {
                setEnteringTag(null);
              }
            }}
          >
            <span
              className={`task-tag-bubble__surface${
                removingTag?.tag === tag ? ' task-tag-bubble__surface--removing' : ''
              }`}
            >
              <span className="task-tag-bubble__label">{tag}</span>
              {!isReadonly ? (
                <button
                  aria-label={`删除标签 ${tag}`}
                  className="task-tag-bubble__remove"
                  type="button"
                  onClick={(event) => removeTag(tag, event)}
                >
                  <span aria-hidden="true" />
                </button>
              ) : null}
            </span>
          </span>
        ))}
        {!isReadonly && isComposerVisible ? (
          <form
            aria-label="新标签输入"
            className={`task-tag-composer${
              composerState === 'closing' ? ' task-tag-composer--closing' : ''
            }${composerState === 'committing' ? ' task-tag-composer--committing' : ''}`}
            onAnimationEnd={(event) => {
              if (event.target !== event.currentTarget) {
                return;
              }

              if (composerState === 'committing') {
                setDraftTag('');
                setComposerState('closed');
                return;
              }

              setComposerState((currentState) => (currentState === 'closing' ? 'closed' : currentState));
            }}
            onBlur={handleComposerBlur}
            onSubmit={(event) => {
              event.preventDefault();

              if (isTagInputComposingRef.current) {
                return;
              }

              commitTag();
            }}
          >
            <input
              ref={inputRef}
              aria-label="新标签"
              className="task-tag-composer__input"
              value={draftTag}
              onChange={(event) => setDraftTag(event.target.value)}
              onCompositionStart={() => {
                isTagInputComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isTagInputComposingRef.current = false;
              }}
              onKeyDown={handleKeyDown}
            />
            <button
              aria-label="确认新增标签"
              className="task-tag-composer__confirm"
              type="submit"
            >
              <span aria-hidden="true" />
            </button>
          </form>
        ) : null}
        {!isReadonly && !isComposerVisible ? (
          <button
            aria-label="新增标签"
            className="task-tag-bubble task-tag-bubble--add"
            type="button"
            onClick={handleAddTagClick}
          >
            +
          </button>
        ) : null}
      </div>
      <InlineLlmSuggestionControl {...props} />
    </fieldset>
  );
};

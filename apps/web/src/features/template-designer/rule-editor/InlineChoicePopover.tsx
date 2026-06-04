import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';

type InlineChoiceOption<TValue extends string> = {
  description?: string;
  label: string;
  triggerLabel?: string;
  value: TValue;
};

export const InlineChoicePopover = <TValue extends string>({
  ariaLabel,
  emptyLabel = '暂无可选项',
  options,
  placeholder,
  tone = 'neutral',
  value,
  onChange,
}: {
  ariaLabel: string;
  emptyLabel?: string;
  options: ReadonlyArray<InlineChoiceOption<TValue>>;
  placeholder?: string;
  tone?: 'action' | 'field' | 'keyword' | 'neutral' | 'operator' | 'value';
  value: TValue;
  onChange: (value: TValue) => void;
}) => {
  const menuId = useId();
  const containerRef = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? (placeholder ? undefined : options[0]),
    [options, placeholder, value],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  const close = () => setIsOpen(false);

  const handleBlur = (event: FocusEvent<HTMLSpanElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }

    close();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
    }
  };

  return (
    <span
      ref={containerRef}
      className={`designer-linkage-rule-editor__inline-choice designer-linkage-rule-editor__inline-choice--${tone}`}
      onBlur={handleBlur}
    >
      <button
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="designer-linkage-rule-editor__inline-choice-trigger"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        {selectedOption?.triggerLabel ?? selectedOption?.label ?? placeholder ?? value}
      </button>
      {isOpen ? (
        <div
          aria-label={`${ariaLabel}选项`}
          className="designer-linkage-rule-editor__inline-choice-menu"
          id={menuId}
          role="listbox"
        >
          {options.length === 0 ? (
            <div className="designer-linkage-rule-editor__inline-choice-empty">{emptyLabel}</div>
          ) : null}
          {options.map((option) => {
            const selected = option.value === value;

            return (
              <button
                key={option.value}
                aria-selected={selected}
                className={selected ? 'is-selected' : ''}
                role="option"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
              >
                <span className="designer-linkage-rule-editor__inline-choice-option-label">{option.label}</span>
                {option.description ? (
                  <span className="designer-linkage-rule-editor__inline-choice-option-meta">
                    {' '}
                    · {option.description}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </span>
  );
};

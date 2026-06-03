import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export type FilterSelectOption<TValue extends string> = {
  label: string;
  value: TValue;
};

type FilterSelectProps<TValue extends string> = {
  ariaLabel: string;
  options: ReadonlyArray<FilterSelectOption<TValue>>;
  value: TValue;
  onChange: (value: TValue) => void;
  menuHiddenValues?: ReadonlyArray<TValue>;
  placeholder?: string;
};

export function FilterSelect<TValue extends string>({
  ariaLabel,
  options,
  value,
  onChange,
  menuHiddenValues = [],
  placeholder,
}: FilterSelectProps<TValue>) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);
  const displayedLabel = selectedOption?.label ?? placeholder ?? options[0]?.label ?? '';
  const menuOptions = options.filter((option) => !menuHiddenValues.includes(option.value));

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleDocumentMouseDown = (event: globalThis.MouseEvent) => {
      if (event.target instanceof Node && !selectRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleDocumentKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [isOpen]);

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen(true);
    }
  };

  return (
    <div className="task-filter-select" ref={selectRef}>
      <button
        className="task-filter-select__trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span key={selectedOption?.value ?? '__placeholder__'} className="task-filter-select__label">
          {displayedLabel}
        </span>
        <span className="task-filter-select__chevron" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="task-filter-select__menu" role="listbox" aria-label={`${ariaLabel}选项`}>
          {menuOptions.map((option) => (
            <button
              key={option.value}
              className={option.value === value ? 'is-selected' : ''}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

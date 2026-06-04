import type { CSSProperties } from 'react';

type MentionOption = {
  value: string;
  label: string;
  description?: string;
};

export const MentionPopover = ({
  activeIndex,
  ariaLabel,
  isClosing = false,
  isOpen,
  listboxId,
  maxHeightPx,
  options,
  onHover,
  onSelect,
}: {
  activeIndex: number;
  ariaLabel: string;
  isClosing?: boolean;
  isOpen: boolean;
  listboxId?: string;
  maxHeightPx: number;
  options: ReadonlyArray<MentionOption>;
  onHover: (index: number) => void;
  onSelect: (option: MentionOption) => void;
}) => {
  return (
    <div
      aria-hidden={!isOpen}
      aria-label={isOpen ? ariaLabel : undefined}
      className={`designer-field-mention__menu${isClosing ? ' is-closing' : ''}`}
      id={isOpen ? listboxId : undefined}
      role={isOpen ? 'listbox' : undefined}
      style={{
        '--designer-field-mention-max-height': `${maxHeightPx}px`,
      } as CSSProperties}
    >
      {options.length > 0 ? (
        options.map((option, optionIndex) => {
          const isActive = optionIndex === activeIndex;

          return (
            <button
              key={option.value}
              aria-selected={isOpen ? isActive : undefined}
              className={isActive ? 'is-active' : ''}
              id={isOpen && listboxId ? `${listboxId}-${option.value}` : undefined}
              role={isOpen ? 'option' : undefined}
              tabIndex={isOpen ? 0 : -1}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHover(optionIndex)}
              onClick={() => onSelect(option)}
            >
              <span className="designer-field-mention__option-label">{option.label}</span>
              {option.description ? (
                <span className="designer-field-mention__option-meta"> · {option.description}</span>
              ) : null}
            </button>
          );
        })
      ) : (
        <div className="designer-field-mention__empty">未找到匹配字段</div>
      )}
    </div>
  );
};

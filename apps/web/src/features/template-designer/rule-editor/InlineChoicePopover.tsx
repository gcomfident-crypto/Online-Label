import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

type InlineChoiceOption<TValue extends string> = {
  description?: string;
  label: string;
  triggerLabel?: string;
  value: TValue;
};

const MENU_GAP_PX = 8;
const MENU_MAX_HEIGHT_PX = 108;
const MENU_MAX_WIDTH_PX = 260;
const MENU_VIEWPORT_MARGIN_PX = 16;

type MenuPosition = {
  left: number;
  minWidth: number;
  top: number;
};

const resolveMenuPosition = (anchor: HTMLElement | null): MenuPosition | null => {
  if (!anchor || typeof window === 'undefined') {
    return null;
  }

  const rect = anchor.getBoundingClientRect();
  const maxLeft = Math.max(MENU_VIEWPORT_MARGIN_PX, window.innerWidth - MENU_MAX_WIDTH_PX - MENU_VIEWPORT_MARGIN_PX);
  const left = Math.min(Math.max(MENU_VIEWPORT_MARGIN_PX, rect.left), maxLeft);
  const preferredTop = rect.bottom + MENU_GAP_PX;
  const top =
    preferredTop + MENU_MAX_HEIGHT_PX > window.innerHeight - MENU_VIEWPORT_MARGIN_PX
      ? Math.max(MENU_VIEWPORT_MARGIN_PX, rect.top - MENU_GAP_PX - MENU_MAX_HEIGHT_PX)
      : preferredTop;

  return {
    left,
    minWidth: rect.width,
    top,
  };
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
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? (placeholder ? undefined : options[0]),
    [options, placeholder, value],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePosition = () => setMenuPosition(resolveMenuPosition(containerRef.current));

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  const close = () => setIsOpen(false);
  const open = () => {
    setMenuPosition(resolveMenuPosition(containerRef.current));
    setIsOpen(true);
  };

  const handleBlur = (event: FocusEvent<HTMLSpanElement>) => {
    const nextTarget = event.relatedTarget as Node | null;

    if (nextTarget && (event.currentTarget.contains(nextTarget) || menuRef.current?.contains(nextTarget))) {
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
      open();
    }
  };

  const menu = isOpen ? (
    <div
      ref={menuRef}
      aria-label={`${ariaLabel}选项`}
      className="designer-linkage-rule-editor__inline-choice-menu designer-linkage-rule-editor__inline-choice-menu--portal"
      id={menuId}
      role="listbox"
      style={{
        left: `${menuPosition?.left ?? 0}px`,
        minWidth: `${menuPosition?.minWidth ?? 0}px`,
        top: `${menuPosition?.top ?? 0}px`,
        visibility: menuPosition ? 'visible' : 'hidden',
      } as CSSProperties}
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
  ) : null;

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
        onClick={() => {
          if (isOpen) {
            close();
            return;
          }

          open();
        }}
        onKeyDown={handleKeyDown}
      >
        {selectedOption?.triggerLabel ?? selectedOption?.label ?? placeholder ?? value}
      </button>
      {menu && typeof document !== 'undefined' ? createPortal(menu, document.body) : null}
    </span>
  );
};

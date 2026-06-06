import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';

import { MentionPopover } from '../rule-editor/MentionPopover';

export type FieldMentionInputOption = {
  value: string;
  label: string;
  description?: string;
};

type FieldMentionInputProps = {
  ariaLabel: string;
  options: ReadonlyArray<FieldMentionInputOption>;
  value: string | null;
  variant?: 'boxed' | 'inline';
  placeholder?: string;
  onChange: (value: string | null) => void;
};

const PANEL_MAX_VISIBLE_OPTIONS = 3;
const PANEL_OPTION_HEIGHT_PX = 36;
const PANEL_VERTICAL_PADDING_PX = 12;
const TOKEN_ANIMATION_MS = 160;
const MENU_ANIMATION_MS = 160;

export function FieldMentionInput({
  ariaLabel,
  options,
  value,
  variant = 'boxed',
  placeholder = '输入 # 搜索字段',
  onChange,
}: FieldMentionInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTokenTimerRef = useRef<number | null>(null);
  const closeMenuTimerRef = useRef<number | null>(null);
  const listboxId = useId();
  const selectedOption = options.find((option) => option.value === (value ?? '')) ?? null;
  const [query, setQuery] = useState('');
  const [isEditing, setIsEditing] = useState(() => !selectedOption);
  const [isComposing, setIsComposing] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [closingToken, setClosingToken] = useState<FieldMentionInputOption | null>(null);
  const [closingMenu, setClosingMenu] = useState<{
    highlightedIndex: number;
    options: ReadonlyArray<FieldMentionInputOption>;
  } | null>(null);
  const normalizedQuery = query.startsWith('#') ? query.slice(1).trim().toLocaleLowerCase() : '';
  const filteredOptions = useMemo(() => {
    if (!query.startsWith('#')) {
      return [];
    }

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => {
      const searchableText = `${option.label} ${option.description ?? ''}`.toLocaleLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [normalizedQuery, options, query]);
  const isOpen = query.startsWith('#') && isEditing;
  const activeOptionId = isOpen && filteredOptions[highlightedIndex]
    ? `${listboxId}-${filteredOptions[highlightedIndex]?.value}`
    : undefined;

  useEffect(() => {
    return () => {
      if (closeTokenTimerRef.current !== null) {
        window.clearTimeout(closeTokenTimerRef.current);
      }

      if (closeMenuTimerRef.current !== null) {
        window.clearTimeout(closeMenuTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedOption) {
      setIsEditing(true);
      return;
    }

    if (!isEditing) {
      setQuery('');
    }
  }, [isEditing, selectedOption]);

  useEffect(() => {
    if (!isOpen) {
      setHighlightedIndex(0);
      return;
    }

    const selectedIndex = selectedOption
      ? filteredOptions.findIndex((option) => option.value === selectedOption.value)
      : -1;

    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [filteredOptions, isOpen, selectedOption]);

  const focusInput = (nextQuery = query) => {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextQuery.length, nextQuery.length);
    });
  };

  const scheduleClosingToken = (option: FieldMentionInputOption | null) => {
    if (closeTokenTimerRef.current !== null) {
      window.clearTimeout(closeTokenTimerRef.current);
    }

    setClosingToken(option);

    if (!option) {
      return;
    }

    closeTokenTimerRef.current = window.setTimeout(() => {
      setClosingToken((current) => (current?.value === option.value ? null : current));
      closeTokenTimerRef.current = null;
    }, TOKEN_ANIMATION_MS);
  };

  const scheduleClosingMenu = () => {
    if (!isOpen) {
      return;
    }

    if (closeMenuTimerRef.current !== null) {
      window.clearTimeout(closeMenuTimerRef.current);
    }

    setClosingMenu({
      highlightedIndex,
      options: filteredOptions,
    });

    closeMenuTimerRef.current = window.setTimeout(() => {
      setClosingMenu(null);
      closeMenuTimerRef.current = null;
    }, MENU_ANIMATION_MS);
  };

  const closeEditor = () => {
    scheduleClosingMenu();
    setIsEditing(!selectedOption);
    setQuery('');
  };

  const openEditor = (nextQuery = '') => {
    if (selectedOption) {
      scheduleClosingToken(selectedOption);
    }

    setIsEditing(true);
    setQuery(nextQuery);
    focusInput(nextQuery);
  };

  const commitSelection = (nextOption: FieldMentionInputOption) => {
    scheduleClosingMenu();
    onChange(nextOption.value);
    setIsEditing(false);
    setQuery('');
    scheduleClosingToken(null);
  };

  const clearSelection = () => {
    if (!selectedOption) {
      setQuery('');
      setIsEditing(true);
      focusInput('');
      return;
    }

    scheduleClosingToken(selectedOption);
    onChange(null);
    setIsEditing(true);
    setQuery('');
    focusInput('');
  };

  const handleRootBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }

    closeEditor();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeEditor();
      return;
    }

    if (event.key === 'ArrowDown') {
      if (!isOpen || filteredOptions.length === 0) {
        return;
      }

      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % filteredOptions.length);
      return;
    }

    if (event.key === 'ArrowUp' && isOpen && filteredOptions.length > 0) {
      event.preventDefault();
      setHighlightedIndex((current) => (current - 1 + filteredOptions.length) % filteredOptions.length);
      return;
    }

    if (event.key === 'Enter' && isOpen && filteredOptions.length > 0 && !isComposing) {
      event.preventDefault();
      const nextOption = filteredOptions[highlightedIndex] ?? filteredOptions[0];

      if (nextOption) {
        commitSelection(nextOption);
      }
    }
  };

  return (
    <div
      className={`designer-field-mention designer-field-mention--${variant}${isOpen ? ' is-open' : ''}${selectedOption ? ' has-value' : ''}${isEditing ? ' is-editing' : ''}`}
      onBlur={handleRootBlur}
    >
      {selectedOption && !isEditing ? (
        <button
          aria-label={ariaLabel}
          className="designer-field-mention__token"
          type="button"
          onClick={() => openEditor('')}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' || event.key === 'Delete') {
              event.preventDefault();
              clearSelection();
              return;
            }

            if (
              event.key.length === 1 &&
              !event.altKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              event.preventDefault();
              openEditor(event.key);
            }
          }}
        >
          <span className="designer-field-mention__token-label">{selectedOption.label}</span>
        </button>
      ) : null}
      {closingToken ? (
        <span aria-hidden="true" className="designer-field-mention__ghost-token">
          <span className="designer-field-mention__token-label">{closingToken.label}</span>
        </span>
      ) : null}
      {!selectedOption || isEditing ? (
        <input
          ref={inputRef}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          aria-controls={isOpen ? listboxId : undefined}
          aria-expanded={isOpen}
          aria-label={ariaLabel}
          autoComplete="off"
          className="designer-field-mention__input"
          placeholder={placeholder}
          role="combobox"
          value={query}
          onChange={(event) => {
            setIsEditing(true);
            setQuery(event.target.value);
          }}
          onCompositionEnd={() => setIsComposing(false)}
          onCompositionStart={() => setIsComposing(true)}
          onFocus={() => {
            if (!selectedOption) {
              setIsEditing(true);
            }
          }}
          onKeyDown={handleInputKeyDown}
        />
      ) : null}
      {isOpen || closingMenu ? (
        <MentionPopover
          activeIndex={isOpen ? highlightedIndex : closingMenu?.highlightedIndex ?? 0}
          ariaLabel={`${ariaLabel}选项`}
          isClosing={!isOpen}
          isOpen={isOpen}
          listboxId={isOpen ? listboxId : undefined}
          maxHeightPx={(PANEL_MAX_VISIBLE_OPTIONS * PANEL_OPTION_HEIGHT_PX) + PANEL_VERTICAL_PADDING_PX}
          options={isOpen ? filteredOptions : closingMenu?.options ?? []}
          onHover={setHighlightedIndex}
          onSelect={commitSelection}
        />
      ) : null}
    </div>
  );
}

import { useLayoutEffect, useRef, useState } from 'react';

export type AiPromptPreviewSection<TKey extends string = string> = {
  key: TKey;
  title: string;
  content: string;
};

type AiPromptPreviewPanelProps<TKey extends string = string> = {
  fullPrompt: string;
  sections: readonly AiPromptPreviewSection<TKey>[];
  eyebrow?: string;
  fullPromptMeta?: string;
  fullPromptAriaLabel?: string;
  readOnly?: boolean;
  sectionAriaLabel?: (section: AiPromptPreviewSection<TKey>) => string;
  sectionPlaceholder?: (section: AiPromptPreviewSection<TKey>) => string | undefined;
  onFullPromptChange?: (content: string) => void;
  onSectionChange?: (sectionKey: TKey, content: string) => void;
};

export const AiPromptPreviewPanel = <TKey extends string = string>({
  eyebrow = 'AI 预审 Prompt',
  fullPrompt,
  fullPromptAriaLabel,
  fullPromptMeta = '运行时会写入 AI 预审记录',
  onFullPromptChange,
  onSectionChange,
  readOnly = false,
  sectionAriaLabel,
  sectionPlaceholder,
  sections,
}: AiPromptPreviewPanelProps<TKey>) => {
  const [isFullPromptVisible, setIsFullPromptVisible] = useState(false);
  const [collapsedSectionKeys, setCollapsedSectionKeys] = useState<ReadonlySet<TKey>>(() => new Set());
  const toggleSectionCollapse = (sectionKey: TKey) => {
    setCollapsedSectionKeys((current) => {
      const next = new Set(current);

      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }

      return next;
    });
  };

  return (
    <section className="designer-ai-prompt-preview" aria-label="AI Prompt 预览" role="region">
      <header className="designer-ai-prompt-preview__header">
        <div>
          <span>{eyebrow}</span>
          <h3>{isFullPromptVisible ? '完整 Prompt' : 'Prompt 组成部分'}</h3>
        </div>
        <div className="designer-ai-prompt-preview__header-actions">
          <button
            type="button"
            aria-pressed={isFullPromptVisible}
            onClick={() => setIsFullPromptVisible((current) => !current)}
          >
            {isFullPromptVisible ? '查看分段' : '查看完整 Prompt'}
          </button>
        </div>
      </header>
      {isFullPromptVisible ? (
        <article className="designer-ai-prompt-preview__full" aria-label="完整 AI Prompt">
          <div className="designer-ai-prompt-preview__section-heading">
            <h4>完整 Prompt</h4>
            <span>{fullPromptMeta}</span>
          </div>
          <AutoResizePromptTextarea
            aria-label={fullPromptAriaLabel ?? (readOnly ? '查看完整 AI Prompt' : '编辑完整 AI Prompt')}
            readOnly={readOnly}
            value={fullPrompt}
            onChange={onFullPromptChange}
          />
        </article>
      ) : (
        <div className="designer-ai-prompt-preview__sections" aria-label="Prompt 组成部分">
          {sections.map((section, index) => {
            const isCollapsed = collapsedSectionKeys.has(section.key);
            const sectionBodyId = `ai-prompt-section-${section.key}`;

            return (
              <article
                key={section.key}
                className={isCollapsed ? 'is-collapsed' : undefined}
              >
                <div className="designer-ai-prompt-preview__section-heading">
                  <h4>{index + 1}. {section.title}</h4>
                  <button
                    type="button"
                    aria-controls={sectionBodyId}
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleSectionCollapse(section.key)}
                  >
                    {isCollapsed ? '展开' : '收起'}
                  </button>
                </div>
                <div
                  id={sectionBodyId}
                  className="designer-ai-prompt-preview__section-body"
                  aria-hidden={isCollapsed}
                >
                  <div className="designer-ai-prompt-preview__section-body-inner">
                    <AutoResizePromptTextarea
                      aria-label={sectionAriaLabel?.(section) ?? `${readOnly ? '查看' : '编辑'}${section.title}`}
                      placeholder={sectionPlaceholder?.(section)}
                      readOnly={readOnly}
                      tabIndex={isCollapsed ? -1 : undefined}
                      value={section.content}
                      onChange={(value) => onSectionChange?.(section.key, value)}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

const AutoResizePromptTextarea = ({
  'aria-label': ariaLabel,
  onChange,
  placeholder,
  readOnly,
  tabIndex,
  value,
}: {
  'aria-label': string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  tabIndex?: number;
  value: string;
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';

    if (textarea.scrollHeight > 0) {
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      aria-label={ariaLabel}
      placeholder={placeholder}
      readOnly={readOnly}
      rows={1}
      tabIndex={tabIndex}
      value={value}
      onChange={readOnly ? undefined : (event) => onChange?.(event.target.value)}
    />
  );
};

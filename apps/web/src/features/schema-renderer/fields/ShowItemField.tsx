import type { ReactNode } from 'react';

import type { BaseFieldProps } from './common';
import { stringifyDisplayValue } from './common';

const SOURCE_LABELS: Record<string, string> = {
  prompt: '用户问题',
  model_answer: '模型回答',
  reference: '参考答案',
  response_a: '回答 A',
  response_b: '回答 B',
  model_a: '模型 A',
  model_b: '模型 B',
  raw_title: '原始标题',
  seller_category: '卖家类目',
  shop_name: '店铺名称',
  media_type: '媒体类型',
  media_url: '媒体链接',
  content_markdown: 'Markdown 内容',
};

const MEDIA_TYPES = ['text', 'image', 'video', 'markdown'] as const;
const MEDIA_CONTROL_KEYS = new Set(['media_type', 'media_url', 'content_markdown']);

type MediaType = (typeof MEDIA_TYPES)[number];

type MediaRenderResult = {
  consumedKeys: Set<string>;
  element: ReactNode;
};

const getSourceKeys = (field: BaseFieldProps['field']): string[] => {
  if (field.sourceKeys && field.sourceKeys.length > 0) {
    return [...field.sourceKeys];
  }

  return [field.sourceKey ?? field.key];
};

const getSourceLabel = (key: string): string => {
  return SOURCE_LABELS[key] ?? key;
};

const getRawString = (rawData: Record<string, unknown>, key: string): string => {
  const value = rawData[key];

  return typeof value === 'string' ? value : '';
};

const getMediaType = (rawData: Record<string, unknown>): MediaType | null => {
  const mediaType = rawData.media_type;

  return typeof mediaType === 'string' && MEDIA_TYPES.includes(mediaType as MediaType)
    ? (mediaType as MediaType)
    : null;
};

const hasDisplayValue = (value: unknown): boolean => {
  return value !== null && value !== undefined && value !== '';
};

const isSafeResourceUrl = (url: string, kind: 'image' | 'link'): boolean => {
  if (url.startsWith('/')) {
    return true;
  }

  if (kind === 'image' && url.startsWith('data:image/')) {
    return true;
  }

  try {
    const parsedUrl = new URL(url);

    return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:';
  } catch {
    return false;
  }
};

const renderInlineMarkdown = (value: string, keyPrefix: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const pattern = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) {
      nodes.push(value.slice(lastIndex, match.index));
    }

    const [token, imageAlt, imageUrl, linkText, linkUrl, codeText, boldText] = match;
    const nodeKey = `${keyPrefix}:${match.index}`;

    if (imageAlt !== undefined && imageUrl && isSafeResourceUrl(imageUrl, 'image')) {
      nodes.push(<img key={nodeKey} alt={imageAlt} src={imageUrl} />);
    } else if (linkText !== undefined && linkUrl && isSafeResourceUrl(linkUrl, 'link')) {
      nodes.push(
        <a key={nodeKey} href={linkUrl}>
          {linkText}
        </a>,
      );
    } else if (codeText !== undefined) {
      nodes.push(<code key={nodeKey}>{codeText}</code>);
    } else if (boldText !== undefined) {
      nodes.push(<strong key={nodeKey}>{boldText}</strong>);
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return nodes;
};

const MarkdownText = ({ value }: { value: string }) => {
  const blocks = value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return <pre>{stringifyDisplayValue(value)}</pre>;
  }

  return (
    <div className="schema-field__markdown">
      {blocks.map((block, index) => {
        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);

        if (lines.every((line) => line.startsWith('- '))) {
          return (
            <ul key={`${block}:${index}`}>
              {lines.map((line, lineIndex) => (
                <li key={`${index}:${lineIndex}:${line}`}>
                  {renderInlineMarkdown(line.slice(2), `${index}:${lineIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        const heading = block.match(/^#{1,6}\s+(.+)$/);

        if (heading) {
          return <h4 key={`${block}:${index}`}>{heading[1]}</h4>;
        }

        return <p key={`${block}:${index}`}>{renderInlineMarkdown(lines.join('\n'), `${index}`)}</p>;
      })}
    </div>
  );
};

const SourceValue = ({
  sourceKey,
  rawData,
  showEmpty = false,
}: {
  sourceKey: string;
  rawData: Record<string, unknown>;
  showEmpty?: boolean;
}) => {
  const value = rawData[sourceKey];

  if (!showEmpty && !hasDisplayValue(value)) {
    return null;
  }

  return (
    <div className="schema-field__source">
      <span>{getSourceLabel(sourceKey)}</span>
      <pre>{stringifyDisplayValue(value)}</pre>
    </div>
  );
};

const resolveMediaRender = (
  sourceKeys: readonly string[],
  rawData: Record<string, unknown>,
): MediaRenderResult => {
  const consumedKeys = new Set<string>();

  if (!sourceKeys.includes('media_type')) {
    return { consumedKeys, element: null };
  }

  consumedKeys.add('media_type');

  const mediaType = getMediaType(rawData);
  const mediaUrl = getRawString(rawData, 'media_url');
  const contentMarkdown = getRawString(rawData, 'content_markdown');

  if (
    mediaType === 'image' &&
    sourceKeys.includes('media_url') &&
    mediaUrl &&
    isSafeResourceUrl(mediaUrl, 'image')
  ) {
    consumedKeys.add('media_url');

    return {
      consumedKeys,
      element: <img alt="题目媒体" className="schema-field__media" src={mediaUrl} />,
    };
  }

  if (
    mediaType === 'video' &&
    sourceKeys.includes('media_url') &&
    mediaUrl &&
    isSafeResourceUrl(mediaUrl, 'link')
  ) {
    consumedKeys.add('media_url');

    return {
      consumedKeys,
      element: (
        <video className="schema-field__media" controls src={mediaUrl}>
          当前浏览器不支持视频播放。
        </video>
      ),
    };
  }

  if (mediaType === 'markdown' && sourceKeys.includes('content_markdown') && contentMarkdown) {
    consumedKeys.add('content_markdown');

    return {
      consumedKeys,
      element: <MarkdownText value={contentMarkdown} />,
    };
  }

  return { consumedKeys, element: null };
};

const CompareLayout = ({
  mediaRender,
  sourceKeys,
  rawData,
}: {
  mediaRender: MediaRenderResult;
  sourceKeys: readonly string[];
  rawData: Record<string, unknown>;
}) => {
  const prompt = rawData.prompt;
  const responseA = rawData.response_a;
  const responseB = rawData.response_b;
  const modelA = getRawString(rawData, 'model_a');
  const modelB = getRawString(rawData, 'model_b');

  return (
    <div className="schema-field__compare">
      {hasDisplayValue(prompt) ? (
        <div className="schema-field__source">
          <span>{getSourceLabel('prompt')}</span>
          <pre>{stringifyDisplayValue(prompt)}</pre>
        </div>
      ) : null}
      {mediaRender.element}
      <div className="schema-field__compare-grid">
        <article className="schema-field__compare-panel" data-testid="preference-compare-panel-a">
          <h4>回答 A</h4>
          {modelA ? <small>模型：{modelA}</small> : null}
          <pre>{stringifyDisplayValue(responseA)}</pre>
        </article>
        <article className="schema-field__compare-panel" data-testid="preference-compare-panel-b">
          <h4>回答 B</h4>
          {modelB ? <small>模型：{modelB}</small> : null}
          <pre>{stringifyDisplayValue(responseB)}</pre>
        </article>
      </div>
      {sourceKeys
        .filter(
          (sourceKey) =>
            !mediaRender.consumedKeys.has(sourceKey) &&
            !['prompt', 'response_a', 'response_b', 'model_a', 'model_b'].includes(sourceKey),
        )
        .map((sourceKey) => (
          <SourceValue key={sourceKey} sourceKey={sourceKey} rawData={rawData} />
        ))}
    </div>
  );
};

export const ShowItemField = ({ field, rawData }: BaseFieldProps) => {
  const sourceKeys = getSourceKeys(field);
  const isPreferenceCompare =
    sourceKeys.includes('response_a') && sourceKeys.includes('response_b');
  const mediaRender = resolveMediaRender(sourceKeys, rawData);
  const singleSource = sourceKeys.length === 1;

  return (
    <section className="schema-field schema-field--show-item" data-field-type={field.type}>
      <div className="schema-field__meta">展示项 ShowItem</div>
      <h3>{field.label}</h3>
      {field.description ? <p>{field.description}</p> : null}
      {isPreferenceCompare ? (
        <CompareLayout mediaRender={mediaRender} sourceKeys={sourceKeys} rawData={rawData} />
      ) : (
        <>
          {sourceKeys
            .filter((sourceKey) => !mediaRender.consumedKeys.has(sourceKey))
            .map((sourceKey) => (
              <SourceValue
                key={sourceKey}
                sourceKey={sourceKey}
                rawData={rawData}
                showEmpty={singleSource && !MEDIA_CONTROL_KEYS.has(sourceKey)}
              />
            ))}
          {mediaRender.element}
        </>
      )}
    </section>
  );
};

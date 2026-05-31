import type { CSSProperties, ReactNode } from 'react';

import type { ShowItemDisplayField } from '@labelhub/shared';

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
const UPLOADED_DATA_FILE_NAME_PATTERN = /(?:^|[/\\])[^/\\]+\.(?:csv|jsonl?|xlsx?|tsv)$/i;
const SHOW_ITEM_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'];
const SHOW_ITEM_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov'];

type MediaType = (typeof MEDIA_TYPES)[number];

type MediaRenderResult = {
  consumedKeys: Set<string>;
  element: ReactNode;
};

type ShowItemResource = {
  kind: 'image' | 'link' | 'video';
  url: string;
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
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return value !== null && value !== undefined && value !== '';
};

const hasShowItemDisplayValue = (
  field: ShowItemDisplayField,
  rawData: Record<string, unknown>,
): boolean => hasDisplayValue(rawData[field.sourceKey]);

const isDisplayFieldVisible = (field: ShowItemDisplayField): boolean => field.visible !== false;

const isUploadedDataFileNameLabel = (label: string): boolean => {
  return UPLOADED_DATA_FILE_NAME_PATTERN.test(label.trim());
};

const getShowItemDisplayLabel = (label: string): string => {
  return isUploadedDataFileNameLabel(label) ? '展示项' : label;
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

const resolveShowItemResource = (value: unknown): ShowItemResource | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const url = value.trim();

  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return null;
    }

    const pathname = parsedUrl.pathname.toLowerCase();

    if (SHOW_ITEM_IMAGE_EXTENSIONS.some((extension) => pathname.endsWith(extension))) {
      return { kind: 'image', url };
    }

    if (SHOW_ITEM_VIDEO_EXTENSIONS.some((extension) => pathname.endsWith(extension))) {
      return { kind: 'video', url };
    }

    return { kind: 'link', url };
  } catch {
    return null;
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
}: {
  sourceKey: string;
  rawData: Record<string, unknown>;
}) => {
  const value = rawData[sourceKey];

  if (!hasDisplayValue(value)) {
    return null;
  }

  return (
    <div className="schema-field__source">
      <span>{getSourceLabel(sourceKey)}</span>
      <pre>{stringifyDisplayValue(value)}</pre>
    </div>
  );
};

const ShowItemTable = ({
  fields,
  label,
  rawData,
}: {
  fields: readonly ShowItemDisplayField[];
  label: string;
  rawData: Record<string, unknown>;
}) => {
  const visibleFields = fields.filter(
    (item) =>
      isDisplayFieldVisible(item) &&
      item.sourceKey.trim() &&
      hasShowItemDisplayValue(item, rawData),
  );

  if (visibleFields.length === 0) {
    return null;
  }

  return (
    <div className="schema-field__show-table-wrap">
      <table className="schema-field__show-table" aria-label={`${label}展示字段`}>
        <tbody>
          {visibleFields.map((field, index) => (
            <tr key={`${field.sourceKey}:${index}`}>
              <th scope="row">{field.label || getSourceLabel(field.sourceKey)}</th>
              <td>
                <ShowItemDisplayValue
                  field={field.format === 'badge' ? { ...field, format: 'text' } : field}
                  value={rawData[field.sourceKey]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ShowItemCard = ({
  fields,
  label,
  rawData,
}: {
  fields: readonly ShowItemDisplayField[];
  label: string;
  rawData: Record<string, unknown>;
}) => {
  const visibleFields = fields.filter(
    (item) =>
      isDisplayFieldVisible(item) &&
      item.sourceKey.trim() &&
      hasShowItemDisplayValue(item, rawData),
  );
  const primaryField =
    visibleFields.find((item) => item.area === 'primary') ??
    visibleFields.find((item) => item.area !== 'meta') ??
    visibleFields[0];

  if (!primaryField) {
    return null;
  }

  const metaFields = visibleFields.filter(
    (item) => item !== primaryField && item.area === 'meta',
  );
  const contentFields = visibleFields.filter(
    (item) => item !== primaryField && item.area !== 'meta',
  );

  return (
    <article className="schema-field__show-card" aria-label={`${label}卡片展示`}>
      <header className="schema-field__show-card-header">
        <div className="schema-field__show-card-primary">
          <span>{primaryField.label || getSourceLabel(primaryField.sourceKey)}</span>
          <ShowItemDisplayValue field={primaryField} value={rawData[primaryField.sourceKey]} />
        </div>
        {metaFields.length > 0 ? (
          <dl className="schema-field__show-card-meta">
            {metaFields.map((field, index) => (
              <div key={`${field.sourceKey}:${index}`}>
                <dt>{field.label || getSourceLabel(field.sourceKey)}</dt>
                <dd>
                  <ShowItemDisplayValue field={field} value={rawData[field.sourceKey]} />
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>
      {contentFields.length > 0 ? (
        <div className="schema-field__show-card-grid">
          {contentFields.map((field, index) => (
            <section className="schema-field__show-card-block" key={`${field.sourceKey}:${index}`}>
              <span>{field.label || getSourceLabel(field.sourceKey)}</span>
              <ShowItemDisplayValue field={field} value={rawData[field.sourceKey]} />
            </section>
          ))}
        </div>
      ) : null}
    </article>
  );
};

const ShowItemFieldList = ({
  fields,
  label,
  rawData,
}: {
  fields: readonly ShowItemDisplayField[];
  label: string;
  rawData: Record<string, unknown>;
}) => {
  const visibleFields = fields.filter(
    (item) =>
      isDisplayFieldVisible(item) &&
      item.sourceKey.trim() &&
      hasShowItemDisplayValue(item, rawData),
  );

  if (visibleFields.length === 0) {
    return null;
  }

  return (
    <dl className="schema-field__show-field-list" aria-label={`${label}字段列表展示`}>
      {visibleFields.map((field, index) => (
        <div className="schema-field__show-field-row" key={`${field.sourceKey}:${index}`} role="listitem">
          <dt>{field.label || getSourceLabel(field.sourceKey)}</dt>
          <dd>
            <ShowItemDisplayValue field={field} value={rawData[field.sourceKey]} />
          </dd>
        </div>
      ))}
    </dl>
  );
};

const ShowItemDisplayValue = ({
  field,
  value,
}: {
  field: ShowItemDisplayField;
  value: unknown;
}) => {
  const displayValue = formatShowItemValue(value, field.format);
  const className = [
    'schema-field__show-value',
    field.format ? `schema-field__show-value--${field.format}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (field.format === 'code' || field.format === 'json') {
    return (
      <pre className={className} style={maxLinesStyle(field.maxLines)}>
        {displayValue}
      </pre>
    );
  }

  const resource = resolveShowItemResource(value);

  if (resource) {
    return (
      <span
        className={`${className} schema-field__show-value--resource schema-field__show-value--resource-${resource.kind}`}
        style={maxLinesStyle(field.maxLines)}
      >
        {resource.kind === 'image' ? (
          <img
            alt={field.label || getSourceLabel(field.sourceKey)}
            className="schema-field__show-resource-media"
            loading="lazy"
            src={resource.url}
          />
        ) : null}
        {resource.kind === 'video' ? (
          <video className="schema-field__show-resource-media" controls preload="metadata" src={resource.url}>
            当前浏览器不支持视频播放。
          </video>
        ) : null}
        {resource.kind === 'link' ? (
          <a
            className="schema-field__show-resource-link"
            href={resource.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            {resource.url}
          </a>
        ) : null}
      </span>
    );
  }

  if (field.format === 'badge') {
    return <span className={className}>{displayValue}</span>;
  }

  return (
    <span className={className} style={maxLinesStyle(field.maxLines)}>
      {displayValue}
    </span>
  );
};

const ShowItemComparison = ({
  fields,
  label,
  rawData,
}: {
  fields: readonly ShowItemDisplayField[];
  label: string;
  rawData: Record<string, unknown>;
}) => {
  const visibleFields = fields.filter(
    (item) =>
      isDisplayFieldVisible(item) &&
      item.sourceKey.trim() &&
      hasShowItemDisplayValue(item, rawData),
  );
  const promptField =
    visibleFields.find((field) => field.sourceKey === 'prompt') ??
    visibleFields.find((field) => field.area === 'primary');
  const responseAField = visibleFields.find((field) => field.sourceKey === 'response_a');
  const responseBField = visibleFields.find((field) => field.sourceKey === 'response_b');
  const modelAField = visibleFields.find((field) => field.sourceKey === 'model_a');
  const modelBField = visibleFields.find((field) => field.sourceKey === 'model_b');
  const consumedKeys = new Set(
    [promptField, responseAField, responseBField, modelAField, modelBField]
      .map((field) => field?.sourceKey)
      .filter((key): key is string => Boolean(key)),
  );
  const metaFields = visibleFields.filter((field) => field.area === 'meta' && !consumedKeys.has(field.sourceKey));
  const extraFields = visibleFields.filter((field) => !consumedKeys.has(field.sourceKey) && !metaFields.includes(field));

  return (
    <article className="schema-field__show-comparison" aria-label={`${label}偏好对比展示`}>
      {metaFields.length > 0 ? (
        <div className="schema-field__show-comparison-meta">
          {metaFields.map((field, index) => (
            <span key={`${field.sourceKey}:${index}`}>
              <b>{field.label || getSourceLabel(field.sourceKey)}</b>
              <ShowItemDisplayValue field={{ ...field, format: field.format ?? 'badge' }} value={rawData[field.sourceKey]} />
            </span>
          ))}
        </div>
      ) : null}
      {promptField ? (
        <section className="schema-field__show-comparison-prompt">
          <span>{promptField.label || getSourceLabel(promptField.sourceKey)}</span>
          <ShowItemDisplayValue
            field={{ ...promptField, format: promptField.format ?? 'long_text', maxLines: promptField.maxLines ?? 8 }}
            value={rawData[promptField.sourceKey]}
          />
        </section>
      ) : null}
      <div className="schema-field__compare-grid schema-field__show-comparison-grid">
        <ShowItemComparisonPanel
          fallbackTitle="回答 A"
          modelField={modelAField}
          rawData={rawData}
          responseField={responseAField}
          testId="preference-compare-panel-a"
        />
        <ShowItemComparisonPanel
          fallbackTitle="回答 B"
          modelField={modelBField}
          rawData={rawData}
          responseField={responseBField}
          testId="preference-compare-panel-b"
        />
      </div>
      {extraFields.length > 0 ? (
        <dl className="schema-field__show-comparison-extra">
          {extraFields.map((field, index) => (
            <div key={`${field.sourceKey}:${index}`}>
              <dt>{field.label || getSourceLabel(field.sourceKey)}</dt>
              <dd>
                <ShowItemDisplayValue field={field} value={rawData[field.sourceKey]} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
};

const ShowItemComparisonPanel = ({
  fallbackTitle,
  modelField,
  rawData,
  responseField,
  testId,
}: {
  fallbackTitle: string;
  modelField: ShowItemDisplayField | undefined;
  rawData: Record<string, unknown>;
  responseField: ShowItemDisplayField | undefined;
  testId: string;
}) => {
  const responseLabel = responseField?.label || fallbackTitle;

  return (
    <article className="schema-field__compare-panel schema-field__show-comparison-panel" data-testid={testId}>
      <header>
        <h4>{responseLabel}</h4>
        {modelField ? (
          <small>
            {modelField.label || getSourceLabel(modelField.sourceKey)}：
            {stringifyDisplayValue(rawData[modelField.sourceKey])}
          </small>
        ) : null}
      </header>
      {responseField ? (
        <ShowItemDisplayValue
          field={{ ...responseField, format: responseField.format ?? 'long_text', maxLines: responseField.maxLines ?? 12 }}
          value={rawData[responseField.sourceKey]}
        />
      ) : (
        <span className="schema-field__show-value">暂无内容</span>
      )}
    </article>
  );
};

const formatShowItemValue = (
  value: unknown,
  format: ShowItemDisplayField['format'],
): string => {
  if (!hasDisplayValue(value)) {
    return '';
  }

  if (format === 'json') {
    if (typeof value === 'string') {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }

    return JSON.stringify(value, null, 2);
  }

  return stringifyDisplayValue(value);
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

export const ShowItemField = ({ field, rawData, rendererScope }: BaseFieldProps) => {
  const displayConfig = field.displayConfig;
  const displayFields = displayConfig?.fields ?? [];
  const sourceKeys = getSourceKeys(field);
  const showItemDisplayLabel = getShowItemDisplayLabel(field.label);
  const shouldRenderTitle =
    rendererScope !== 'designer-canvas' && !isUploadedDataFileNameLabel(field.label);
  const isPreferenceCompare =
    sourceKeys.includes('response_a') && sourceKeys.includes('response_b');
  const mediaRender = resolveMediaRender(sourceKeys, rawData);

  return (
    <section className="schema-field schema-field--show-item" data-field-type={field.type}>
      <div className="schema-field__meta">展示项 ShowItem</div>
      {shouldRenderTitle ? <h3>{field.label}</h3> : null}
      {field.description ? <p>{field.description}</p> : null}
      {displayFields.length > 0 ? (
        <ShowItemTable fields={displayFields} label={showItemDisplayLabel} rawData={rawData} />
      ) : isPreferenceCompare ? (
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
              />
            ))}
          {mediaRender.element}
        </>
      )}
    </section>
  );
};

const maxLinesStyle = (maxLines: number | undefined): CSSProperties | undefined => {
  if (!maxLines || maxLines <= 0) {
    return undefined;
  }

  return {
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: maxLines,
  };
};

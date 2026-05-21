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
  media_type: '媒体类型',
  media_url: '媒体链接',
  content_markdown: 'Markdown 内容',
};

const MEDIA_TYPES = ['text', 'image', 'video', 'markdown'] as const;

type MediaType = (typeof MEDIA_TYPES)[number];

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

const getMediaType = (rawData: Record<string, unknown>): MediaType => {
  const mediaType = rawData.media_type;

  return typeof mediaType === 'string' && MEDIA_TYPES.includes(mediaType as MediaType)
    ? (mediaType as MediaType)
    : 'text';
};

const hasDisplayValue = (value: unknown): boolean => {
  return value !== null && value !== undefined && value !== '';
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
              {lines.map((line) => (
                <li key={line}>{line.slice(2)}</li>
              ))}
            </ul>
          );
        }

        const heading = block.match(/^#{1,6}\s+(.+)$/);

        if (heading) {
          return <h4 key={`${block}:${index}`}>{heading[1]}</h4>;
        }

        return <p key={`${block}:${index}`}>{lines.join('\n')}</p>;
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

const MediaValue = ({ rawData }: { rawData: Record<string, unknown> }) => {
  const mediaType = getMediaType(rawData);
  const mediaUrl = getRawString(rawData, 'media_url');
  const contentMarkdown = getRawString(rawData, 'content_markdown');

  if (mediaType === 'image' && mediaUrl) {
    return <img alt="题目媒体" className="schema-field__media" src={mediaUrl} />;
  }

  if (mediaType === 'video' && mediaUrl) {
    return (
      <video className="schema-field__media" controls src={mediaUrl}>
        当前浏览器不支持视频播放。
      </video>
    );
  }

  if (mediaType === 'markdown' && contentMarkdown) {
    return <MarkdownText value={contentMarkdown} />;
  }

  return null;
};

const CompareLayout = ({
  sourceKeys,
  rawData,
}: {
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
  const hiddenMediaSourceKeys = new Set(['media_url']);

  if (getMediaType(rawData) === 'markdown') {
    hiddenMediaSourceKeys.add('content_markdown');
  }

  return (
    <section className="schema-field schema-field--show-item" data-field-type={field.type}>
      <div className="schema-field__meta">展示项 ShowItem</div>
      <h3>{field.label}</h3>
      {field.description ? <p>{field.description}</p> : null}
      {isPreferenceCompare ? (
        <CompareLayout sourceKeys={sourceKeys} rawData={rawData} />
      ) : (
        <>
          {sourceKeys
            .filter((sourceKey) => !hiddenMediaSourceKeys.has(sourceKey))
            .map((sourceKey) => (
              <SourceValue key={sourceKey} sourceKey={sourceKey} rawData={rawData} />
            ))}
          <MediaValue rawData={rawData} />
        </>
      )}
    </section>
  );
};

import { useMemo, useState } from 'react';

import type { LabelHubSchema } from '@labelhub/shared';
import {
  SchemaRenderer,
  applySchemaLinkage,
  preferenceCompareRawData,
  preferenceCompareSchema,
  qaQualityRawDataSamples,
  qaQualitySchema,
  titleCleanupRawData,
  titleCleanupSchema,
  validateSchemaAnswers,
  type SchemaRendererMode,
} from '../../features/schema-renderer';

type PlaygroundExample = {
  id: string;
  label: string;
  schema: LabelHubSchema;
  rawData: Record<string, unknown>;
};

const EXAMPLES: readonly PlaygroundExample[] = [
  {
    id: 'qa_quality',
    label: '问答质量',
    schema: qaQualitySchema,
    rawData: qaQualityRawDataSamples[0],
  },
  {
    id: 'preference_compare',
    label: '偏好对比',
    schema: preferenceCompareSchema,
    rawData: preferenceCompareRawData,
  },
  {
    id: 'title_cleanup',
    label: '商品标题清洗 v3',
    schema: titleCleanupSchema,
    rawData: titleCleanupRawData,
  },
] as const;

const MODES: readonly { label: string; value: SchemaRendererMode }[] = [
  { label: '预览', value: 'preview' },
  { label: '作答', value: 'answer' },
  { label: '复核', value: 'review' },
] as const;

export const RendererPlaygroundPage = () => {
  const [selectedExampleId, setSelectedExampleId] = useState(EXAMPLES[0].id);
  const [mode, setMode] = useState<SchemaRendererMode>('answer');
  const [answersByExample, setAnswersByExample] = useState<Record<string, Record<string, unknown>>>(
    {},
  );
  const selectedExample = EXAMPLES.find((example) => example.id === selectedExampleId) ?? EXAMPLES[0];
  const answers = answersByExample[selectedExample.id] ?? {};
  const linkageResult = useMemo(
    () => applySchemaLinkage(selectedExample.schema, answers),
    [answers, selectedExample.schema],
  );
  const validationErrors = useMemo(
    () => validateSchemaAnswers(selectedExample.schema, linkageResult.answers, linkageResult),
    [linkageResult, selectedExample.schema],
  );

  return (
    <main className="playground-page">
      <header className="playground-header">
        <div>
          <p className="eyebrow">Dev / Schema Renderer</p>
          <h1>Renderer 调试台</h1>
          <p>切换官方 Schema 示例，检查展示项 ShowItem、字段联动和 LLM 触发组件。</p>
        </div>
        <div className="segmented-control" aria-label="Renderer 模式">
          {MODES.map((item) => (
            <button
              className={mode === item.value ? 'is-active' : undefined}
              key={item.value}
              type="button"
              onClick={() => setMode(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <section className="playground-layout">
        <aside className="playground-sidebar" aria-label="Schema 示例">
          {EXAMPLES.map((example) => (
            <button
              className={selectedExample.id === example.id ? 'is-active' : undefined}
              key={example.id}
              type="button"
              onClick={() => setSelectedExampleId(example.id)}
            >
              {example.label}
            </button>
          ))}
        </aside>

        <section className="playground-workbench" aria-label="Renderer 预览">
          <SchemaRenderer
            schema={selectedExample.schema}
            rawData={selectedExample.rawData}
            value={answers}
            mode={mode}
            onChange={(nextAnswers) => {
              setAnswersByExample((current) => ({
                ...current,
                [selectedExample.id]: nextAnswers,
              }));
            }}
          />
        </section>

        <aside className="playground-inspector" aria-label="调试输出">
          <section>
            <h2>Answers JSON</h2>
            <pre>{JSON.stringify(linkageResult.answers, null, 2)}</pre>
          </section>
          <section>
            <h2>提交前校验</h2>
            {validationErrors.length === 0 ? (
              <p>当前 answers 可通过校验。</p>
            ) : (
              <ul>
                {validationErrors.map((error) => (
                  <li key={`${error.fieldKey}:${error.message}`}>{error.message}</li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
};

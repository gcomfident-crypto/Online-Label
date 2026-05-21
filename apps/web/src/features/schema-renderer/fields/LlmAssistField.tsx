import { useState } from 'react';

import type { SchemaField } from '@labelhub/shared';

import type { BaseFieldProps } from './common';
import { FieldDescription, isDisabledMode, stringifyDisplayValue } from './common';

type LlmAssistResult = {
  datasetKind: string;
  targetFieldKey: string;
  summary: string;
  suggestion: unknown;
};

type LlmAssistEnvelope = {
  data?: Partial<LlmAssistResult>;
  error?: {
    message?: string;
  };
};

const DEFAULT_ERROR_MESSAGE = 'LLM 辅助暂时不可用，请稍后重试。';

export const LlmAssistField = ({
  datasetKind,
  field,
  rawData,
  value,
  mode,
  disabled,
  onFieldChange,
}: BaseFieldProps) => {
  const [assistResult, setAssistResult] = useState<LlmAssistResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const targetFieldKey = field.targetFieldKey;
  const isReadonly = isDisabledMode(mode, disabled);

  const generateSuggestion = async () => {
    if (!targetFieldKey) {
      setErrorMessage('LLM 触发组件缺少目标字段。');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(resolveLlmAssistEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetKind,
          rawData,
          answers: value,
          targetFieldKey,
          promptTemplate: field.promptTemplate,
        }),
      });
      const envelope = await parseAssistEnvelope(response);

      if (!response.ok) {
        throw new Error(envelope.error?.message ?? DEFAULT_ERROR_MESSAGE);
      }

      setAssistResult(resolveAssistResult(envelope.data, datasetKind, targetFieldKey));
    } catch (error) {
      setAssistResult(null);
      setErrorMessage(error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  };

  const adoptSuggestion = () => {
    if (!assistResult || !targetFieldKey) {
      return;
    }

    const targetField: SchemaField = {
      ...field,
      key: targetFieldKey,
      fieldKey: targetFieldKey,
    };

    onFieldChange(targetField, assistResult.suggestion);
  };

  return (
    <section className="schema-field schema-field--llm-assist" data-field-type={field.type}>
      <div className="schema-field__meta">LLM 触发组件</div>
      <h3>{field.label}</h3>
      <FieldDescription field={field} />
      {targetFieldKey ? <small>采纳后写入：{targetFieldKey}</small> : <small>未配置目标字段</small>}
      <div className="schema-field__actions">
        <button disabled={isReadonly || isLoading} type="button" onClick={generateSuggestion}>
          {assistResult ? '重新生成' : '生成建议'}
        </button>
        <button
          disabled={isReadonly || !assistResult || !targetFieldKey}
          type="button"
          onClick={adoptSuggestion}
        >
          采纳
        </button>
      </div>
      {errorMessage ? (
        <small className="schema-field__error-text" role="alert">
          {errorMessage}
        </small>
      ) : null}
      {assistResult ? (
        <div className="schema-field__assist-result">
          <span>{assistResult.summary}</span>
          <pre>{stringifyDisplayValue(assistResult.suggestion)}</pre>
        </div>
      ) : null}
    </section>
  );
};

function resolveLlmAssistEndpoint(): string {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

  return `${apiBaseUrl}/llm/assist/mock`;
}

async function parseAssistEnvelope(response: Response): Promise<LlmAssistEnvelope> {
  try {
    return (await response.json()) as LlmAssistEnvelope;
  } catch {
    return {};
  }
}

function resolveAssistResult(
  data: Partial<LlmAssistResult> | undefined,
  datasetKind: string,
  targetFieldKey: string,
): LlmAssistResult {
  if (!data || typeof data.summary !== 'string' || !('suggestion' in data)) {
    throw new Error('LLM 辅助返回格式不正确。');
  }

  if (typeof data.targetFieldKey === 'string' && data.targetFieldKey !== targetFieldKey) {
    throw new Error('LLM 辅助返回目标字段不一致。');
  }

  return {
    datasetKind: typeof data.datasetKind === 'string' ? data.datasetKind : datasetKind,
    targetFieldKey,
    summary: data.summary,
    suggestion: data.suggestion,
  };
}

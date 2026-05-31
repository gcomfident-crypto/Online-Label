import { useState } from 'react';

import type { SchemaField } from '@labelhub/shared';

import { requestApi } from '../../../api/request';
import starIcon from '../../../assets/star.svg';
import { ToastViewport, useToastController } from '../../../components/ToastViewport';
import type { BaseFieldProps } from './common';
import { getStringArrayValue, stringifyDisplayValue } from './common';
import { getSchemaFieldKey } from '../types';

type LlmAssistResult = {
  datasetKind: string;
  targetFieldKey: string;
  summary: string;
  suggestion: unknown;
};

const DEFAULT_ERROR_MESSAGE = 'LLM 辅助暂时不可用，请稍后重试。';

export const InlineLlmSuggestionControl = ({
  datasetKind,
  disabled,
  field,
  mode,
  rawData,
  value,
  onFieldChange,
}: BaseFieldProps) => {
  const promptTemplate = field.promptTemplate?.trim() ?? '';
  const isPromptEnabled = field.promptTemplate !== undefined;
  const targetFieldKey = getSchemaFieldKey(field);
  const [assistResult, setAssistResult] = useState<LlmAssistResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { dismissToast, messages, showErrorToast } = useToastController();
  const isReadonly = mode === 'review' || disabled;

  if (!isPromptEnabled) {
    return null;
  }

  const generateSuggestion = async () => {
    setIsLoading(true);

    try {
      const data = await requestApi<Partial<LlmAssistResult>>(
        '/llm/assist/mock',
        {
          method: 'POST',
          body: JSON.stringify({
            datasetKind,
            rawData,
            answers: value,
            targetFieldKey,
            promptTemplate,
          }),
        },
        DEFAULT_ERROR_MESSAGE,
      );

      setAssistResult(resolveAssistResult(data, datasetKind, targetFieldKey));
    } catch (error) {
      setAssistResult(null);
      showErrorToast(error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  };

  const adoptSuggestion = () => {
    if (!assistResult) {
      return;
    }

    onFieldChange(field, coerceSuggestionForField(field, assistResult.suggestion));
  };

  return (
    <section className="schema-field__inline-llm" aria-label={`${field.label} LLM 建议`}>
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <div className="schema-field__actions">
        <button
          className="schema-field__llm-trigger-button"
          disabled={isReadonly || isLoading || !promptTemplate}
          type="button"
          onClick={generateSuggestion}
        >
          <img src={starIcon} alt="" aria-hidden="true" draggable={false} />
          {assistResult ? '重新生成' : '生成建议'}
        </button>
        <button disabled={isReadonly || !assistResult} type="button" onClick={adoptSuggestion}>
          采纳建议
        </button>
      </div>
      {assistResult ? (
        <div className="schema-field__assist-result">
          <span>{assistResult.summary}</span>
          <pre>{stringifyDisplayValue(coerceSuggestionForField(field, assistResult.suggestion))}</pre>
        </div>
      ) : null}
    </section>
  );
};

const resolveAssistResult = (
  data: Partial<LlmAssistResult> | undefined,
  datasetKind: string,
  targetFieldKey: string,
): LlmAssistResult => {
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
};

const coerceSuggestionForField = (field: SchemaField, suggestion: unknown): unknown => {
  if (field.type === 'tag_select') {
    return coerceTagSuggestion(field, suggestion);
  }

  if (field.type === 'text' || field.type === 'textarea') {
    return coerceTextSuggestion(field, suggestion);
  }

  return suggestion;
};

const coerceTextSuggestion = (field: SchemaField, suggestion: unknown): string => {
  const fieldKey = getSchemaFieldKey(field);
  const direct = readObjectValue(suggestion, fieldKey);

  if (typeof direct === 'string') {
    return direct;
  }

  if (typeof suggestion === 'string') {
    return suggestion;
  }

  return stringifyDisplayValue(suggestion);
};

const coerceTagSuggestion = (field: SchemaField, suggestion: unknown): string[] => {
  const fieldKey = getSchemaFieldKey(field);
  const direct = readObjectValue(suggestion, fieldKey);
  const candidateValues = getStringArrayValue(direct).length > 0
    ? getStringArrayValue(direct)
    : getStringArrayValue(suggestion);

  if (candidateValues.length > 0) {
    return normalizeTagValues(field, candidateValues);
  }

  if (typeof direct === 'string') {
    return normalizeTagValues(field, splitTagSuggestion(direct));
  }

  if (typeof suggestion === 'string') {
    return normalizeTagValues(field, splitTagSuggestion(suggestion));
  }

  return [];
};

const readObjectValue = (value: unknown, key: string): unknown => {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined;
};

const splitTagSuggestion = (value: string): string[] =>
  value
    .split(/[,\n，、|]/)
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeTagValues = (field: SchemaField, values: readonly string[]): string[] => {
  const options = field.options ?? [];

  if (options.length === 0) {
    return Array.from(new Set(values));
  }

  const valueByLabel = new Map(options.map((option) => [option.label, option.value]));
  const allowedValues = new Set(options.map((option) => option.value));

  return Array.from(
    new Set(
      values
        .map((value) => (allowedValues.has(value) ? value : valueByLabel.get(value)))
        .filter((value): value is string => Boolean(value)),
    ),
  );
};

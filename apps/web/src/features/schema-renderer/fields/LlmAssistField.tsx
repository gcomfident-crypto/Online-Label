import { useState } from 'react';

import type { SchemaField } from '@labelhub/shared';

import { requestApi } from '../../../api/request';
import { ToastViewport, useToastController } from '../../../components/ToastViewport';
import type { BaseFieldProps } from './common';
import { createLlmAssistPayload, FieldTitleRow, isDisabledMode } from './common';

type LlmAssistResult = {
  datasetKind: string;
  targetFieldKey: string;
  summary: string;
  suggestion: unknown;
};

const DEFAULT_ERROR_MESSAGE = 'LLM 辅助暂时不可用，请稍后重试。';

export const LlmAssistField = ({
  datasetKind,
  field,
  modelRawDataContext,
  rawData,
  value,
  mode,
  disabled,
  onFieldChange,
}: BaseFieldProps) => {
  const [assistResult, setAssistResult] = useState<LlmAssistResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { dismissToast, messages, showErrorToast, showStatusToast } = useToastController();
  const targetFieldKey = field.targetFieldKey;
  const isReadonly = isDisabledMode(mode, disabled);

  const generateSuggestion = async () => {
    if (!targetFieldKey) {
      showErrorToast('LLM 触发组件缺少目标字段。');
      return;
    }

    setIsLoading(true);

    try {
      const data = await requestApi<Partial<LlmAssistResult>>(
        '/llm/assist',
        {
          method: 'POST',
          body: JSON.stringify(createLlmAssistPayload({
            datasetKind,
            modelRawDataContext,
            rawData,
            answers: value,
            targetFieldKey,
            promptTemplate: field.promptTemplate,
          })),
        },
        DEFAULT_ERROR_MESSAGE,
      );

      const nextAssistResult = resolveAssistResult(data, datasetKind, targetFieldKey);
      const targetField: SchemaField = {
        ...field,
        key: targetFieldKey,
        fieldKey: targetFieldKey,
      };

      setAssistResult(nextAssistResult);
      onFieldChange(targetField, nextAssistResult.suggestion);
      showStatusToast('模型生成完毕');
    } catch (error) {
      setAssistResult(null);
      showErrorToast(error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="schema-field schema-field--llm-assist" data-field-type={field.type}>
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <div className="schema-field__meta">LLM 触发组件</div>
      <FieldTitleRow field={field} />
      {targetFieldKey ? <small>生成后写入：{targetFieldKey}</small> : <small>未配置目标字段</small>}
      <div className="schema-field__actions">
        <button disabled={isReadonly || isLoading} type="button" onClick={generateSuggestion}>
          {assistResult ? '重新生成' : '生成建议'}
        </button>
      </div>
    </section>
  );
};

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

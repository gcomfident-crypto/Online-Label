import type {
  AutoTemplateFieldClassificationRequest,
  AutoTemplateFieldClassificationResult,
} from '@labelhub/shared';

import { requestApi } from './request';

export async function classifyTemplateFields(
  input: AutoTemplateFieldClassificationRequest,
): Promise<AutoTemplateFieldClassificationResult> {
  const result = await requestApi<AutoTemplateFieldClassificationResult>(
    '/llm/template-fields/classify',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    '字段分类接口暂时不可用。',
  );

  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('字段分类接口返回格式不正确。');
  }

  return result;
}

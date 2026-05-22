import type { DatasetKind } from '../llm/LlmProvider.ts';

export type BuildAiReviewPromptInput = {
  datasetKind: DatasetKind;
  rawData: Record<string, unknown>;
  answers: Record<string, unknown>;
  rulePromptTemplate: string;
};

export function buildAiReviewPrompt(input: BuildAiReviewPromptInput): string {
  const fields = fieldsForDataset(input.datasetKind, input.rawData);

  return [
    input.rulePromptTemplate,
    '',
    '请只输出 JSON，字段必须包含 verdict、scores、reason、suggestions。',
    `datasetKind: ${input.datasetKind}`,
    '官方题目字段:',
    JSON.stringify(fields, null, 2),
    '标注员 answers:',
    JSON.stringify(input.answers, null, 2),
  ].join('\n');
}

function fieldsForDataset(datasetKind: DatasetKind, rawData: Record<string, unknown>): Record<string, unknown> {
  if (datasetKind === 'qa_quality') {
    return pick(rawData, ['prompt', 'model_answer', 'reference', 'expected_dimensions', 'media_type', 'media_url']);
  }

  if (datasetKind === 'preference_compare') {
    return pick(rawData, ['prompt', 'response_a', 'response_b', 'dimensions', 'safety_flag']);
  }

  return rawData;
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, source[key] ?? null]));
}

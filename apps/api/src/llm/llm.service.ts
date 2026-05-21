import { BadRequestException, Injectable } from '@nestjs/common';
import { DATASET_KINDS, type DatasetKind } from '@labelhub/shared';

type LlmAssistMockBody = {
  answers?: unknown;
  datasetKind?: unknown;
  promptTemplate?: unknown;
  rawData?: unknown;
  targetFieldKey?: unknown;
};

export type LlmAssistMockResult = {
  datasetKind: DatasetKind;
  targetFieldKey: string;
  summary: string;
  suggestion: unknown;
};

@Injectable()
export class LlmService {
  createMockAssist(body: LlmAssistMockBody): LlmAssistMockResult {
    const datasetKind = resolveDatasetKind(body.datasetKind);
    const targetFieldKey = resolveTargetFieldKey(body.targetFieldKey);

    if (!datasetKind) {
      throw new BadRequestException({
        code: 'INVALID_LLM_ASSIST_REQUEST',
        message: 'LLM 辅助请求缺少有效的数据集类型。',
      });
    }

    if (!targetFieldKey) {
      throw new BadRequestException({
        code: 'INVALID_LLM_ASSIST_REQUEST',
        message: 'LLM 辅助请求缺少目标字段。',
      });
    }

    return createDatasetSuggestion(datasetKind, targetFieldKey);
  }
}

function resolveDatasetKind(value: unknown): DatasetKind | null {
  return typeof value === 'string' && DATASET_KINDS.includes(value as DatasetKind)
    ? (value as DatasetKind)
    : null;
}

function resolveTargetFieldKey(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function createDatasetSuggestion(
  datasetKind: DatasetKind,
  targetFieldKey: string,
): LlmAssistMockResult {
  if (datasetKind === 'qa_quality') {
    return {
      datasetKind,
      targetFieldKey,
      summary: '建议补充关键依据，并复核准确性与完整性评分。',
      suggestion: {
        relevance_score_reference: 5,
        accuracy_score_reference: 4,
        format_score_reference: 4,
        safety_score_reference: 5,
        issue_tags: ['missing_info'],
        comment: '模型回答覆盖核心方向，但建议对照参考答案补充关键限定。',
      },
    };
  }

  if (datasetKind === 'preference_compare') {
    return {
      datasetKind,
      targetFieldKey,
      summary: '建议优先选择回答 B，并检查是否存在安全风险。',
      suggestion: {
        preferred: 'B',
        margin: 'clear',
        safety_flag: 'safe',
        dimensions: ['helpfulness', 'completeness', 'style'],
        rationale: '回答 B 结构更完整，包含结论、操作路径和注意事项。',
      },
    };
  }

  return {
    datasetKind,
    targetFieldKey,
    summary: '已生成通用结构化参考，请结合原始数据复核后采纳。',
    suggestion: {
      note: '模拟建议：请结合原始数据补充结构化答案。',
      confidence: 'mock',
    },
  };
}

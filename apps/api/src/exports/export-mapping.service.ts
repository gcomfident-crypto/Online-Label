import { Injectable } from '@nestjs/common';
import type { DatasetKind } from '@labelhub/shared';

export type ExportFieldMapping = {
  source: string;
  target: string;
  enabled: boolean;
};

export type ExportSourceRow = {
  externalId: string;
  rawData: Record<string, unknown>;
  answers: Record<string, unknown>;
  review: Record<string, unknown>;
};

const QA_QUALITY_PRESET: ExportFieldMapping[] = [
  { source: 'item.externalId', target: 'id', enabled: true },
  { source: 'rawData.prompt', target: 'prompt', enabled: true },
  { source: 'rawData.model_answer', target: 'model_answer', enabled: true },
  { source: 'answers.relevance_score', target: 'relevance_score', enabled: true },
  { source: 'answers.accuracy_score', target: 'accuracy_score', enabled: true },
  { source: 'answers.format_score', target: 'format_score', enabled: true },
  { source: 'answers.safety_score', target: 'safety_score', enabled: true },
  { source: 'answers.issue_tags', target: 'issue_tags', enabled: true },
  { source: 'answers.comment', target: 'comment', enabled: true },
  { source: 'review.ai_overall', target: 'ai_overall', enabled: true },
  { source: 'review.human_verdict', target: 'human_verdict', enabled: true },
];

const PREFERENCE_COMPARE_PRESET: ExportFieldMapping[] = [
  { source: 'item.externalId', target: 'id', enabled: true },
  { source: 'rawData.prompt', target: 'prompt', enabled: true },
  { source: 'rawData.response_a', target: 'response_a', enabled: true },
  { source: 'rawData.response_b', target: 'response_b', enabled: true },
  { source: 'answers.preferred', target: 'preferred', enabled: true },
  { source: 'answers.margin', target: 'margin', enabled: true },
  { source: 'answers.dimensions', target: 'dimensions', enabled: true },
  { source: 'answers.safety_flag', target: 'safety_flag', enabled: true },
  { source: 'answers.annotator_note', target: 'annotator_note', enabled: true },
  { source: 'review.human_verdict', target: 'human_verdict', enabled: true },
];

@Injectable()
export class ExportMappingService {
  getPreset(datasetKind: DatasetKind): ExportFieldMapping[] {
    if (datasetKind === 'preference_compare') {
      return cloneMapping(PREFERENCE_COMPARE_PRESET);
    }

    return cloneMapping(QA_QUALITY_PRESET);
  }

  normalizeMapping(
    value: unknown,
    datasetKind: DatasetKind,
    fallbackMapping: ExportFieldMapping[] = this.getPreset(datasetKind),
  ): ExportFieldMapping[] {
    if (!Array.isArray(value)) {
      return cloneMapping(fallbackMapping);
    }

    const normalized = value
      .map((item) => normalizeMappingItem(item))
      .filter((item): item is ExportFieldMapping => Boolean(item));

    return normalized.length > 0 ? normalized : cloneMapping(fallbackMapping);
  }

  buildRows(
    sources: ExportSourceRow[],
    fieldMapping: ExportFieldMapping[],
    includeReviews: boolean,
  ): Array<Record<string, unknown>> {
    const enabledMapping = fieldMapping.filter((field) => field.enabled && (includeReviews || !field.source.startsWith('review.')));

    return sources.map((source) => {
      const row: Record<string, unknown> = {};
      for (const field of enabledMapping) {
        row[field.target] = resolveSourceValue(source, field.source);
      }

      return row;
    });
  }
}

function normalizeMappingItem(value: unknown): ExportFieldMapping | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const item = value as Record<string, unknown>;
  const source = typeof item.source === 'string' ? item.source.trim() : '';
  const target = typeof item.target === 'string' ? item.target.trim() : '';
  if (!source || !target) {
    return null;
  }

  return { source, target, enabled: item.enabled !== false };
}

function cloneMapping(mapping: ExportFieldMapping[]): ExportFieldMapping[] {
  return mapping.map((field) => ({ ...field }));
}

function resolveSourceValue(source: ExportSourceRow, path: string): unknown {
  if (path === 'item.externalId') {
    return source.externalId;
  }
  if (path.startsWith('rawData.')) {
    return source.rawData[path.slice('rawData.'.length)];
  }
  if (path.startsWith('answers.')) {
    return source.answers[path.slice('answers.'.length)];
  }
  if (path.startsWith('review.')) {
    return source.review[path.slice('review.'.length)];
  }

  return undefined;
}

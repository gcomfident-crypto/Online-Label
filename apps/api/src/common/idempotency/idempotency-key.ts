export type IdempotencyKeySource = {
  headerValue?: unknown;
  bodyValue?: unknown;
  fallbackParts?: Array<string | number | null | undefined>;
};

export function resolveIdempotencyKey(source: IdempotencyKeySource): string | undefined {
  return (
    normalizeIdempotencyKey(source.headerValue) ??
    normalizeIdempotencyKey(source.bodyValue) ??
    fallbackIdempotencyKey(source.fallbackParts)
  );
}

export function normalizeIdempotencyKey(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 128) : undefined;
}

export function aiReviewIdempotencyKey(submissionId: string, round: number): string {
  return `${submissionId}:${round}:ai-review`;
}

function fallbackIdempotencyKey(parts: IdempotencyKeySource['fallbackParts']): string | undefined {
  if (!parts || parts.length === 0 || parts.some((part) => part === undefined || part === null || part === '')) {
    return undefined;
  }

  return parts.map((part) => String(part)).join(':').slice(0, 128);
}

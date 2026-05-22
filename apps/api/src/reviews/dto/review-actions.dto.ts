export type ReviewActionDto = {
  actorId?: unknown;
  comment?: unknown;
};

export type RejectReviewDto = {
  actorId?: unknown;
  reason?: unknown;
};

export type ReviseAndPassDto = {
  actorId?: unknown;
  comment?: unknown;
  revisedAnswers?: unknown;
};

export type BatchReviewDto = {
  actorId?: unknown;
  submissionIds?: unknown;
  comment?: unknown;
  reason?: unknown;
};

export type AssignReviewsDto = {
  actorId?: unknown;
  reviewerId?: unknown;
  submissionIds?: unknown;
};

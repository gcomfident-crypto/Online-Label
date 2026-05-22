export type OfficialTemplateProfile = 'qa_quality' | 'preference_compare' | 'title_cleanup';

export type CreateTemplateFromProfileDto = {
  profile?: unknown;
  actorId?: unknown;
};

export type CreateTemplateFromProfileInput = {
  profile: OfficialTemplateProfile;
  actorId?: string;
};

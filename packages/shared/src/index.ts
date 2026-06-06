export const LABELHUB_SHARED_VERSION = '0.0.0';

export {
  ROLE_HOME_METADATA,
  USER_ROLE,
  USER_ROLES,
  getRoleHomePath,
  isUserRole,
  type RoleHomeMetadata,
  type UserRole,
} from './roles.ts';

export {
  PORTAL_ROUTE_PREFIX,
  ROUTE_PERMISSIONS,
  getRoutePermission,
  type PortalRoutePrefix,
  type RoutePermission,
} from './routes.ts';

export { canAccessRoute } from './rbac.ts';

export {
  AI_REVIEW_PROMPT_SECTION_KEYS,
  DATASET_IMPORT_FORMATS,
  DATASET_KINDS,
  FIELD_AI_REVIEW_ROLES,
  FIELD_LINKAGE_ACTIONS,
  FIELD_TYPES,
  CUSTOM_VALIDATOR_KEYS,
  createLabelHubSchema,
  collectFieldLinkageRuleFieldKeys,
  expandFieldLinkageRule,
  isAllowedCustomValidatorKey,
  isLegacyFieldLinkageRule,
  isStructuredFieldLinkageRule,
  type AiReviewPromptConfig,
  type AiReviewPromptSectionKey,
  type AiReviewPromptSectionOverrides,
  type CustomValidatorKey,
  type DatasetImportFormat,
  type DatasetKind,
  type FieldAiReviewConfig,
  type FieldAiReviewRole,
  type FieldLinkageAction,
  type FieldLinkageRuleCombinator,
  type FieldLinkageCondition,
  type LegacyFieldLinkageRule,
  type FieldLinkageRule,
  type FieldOption,
  type FieldType,
  type FieldValidation,
  type LabelHubSchemaMetadata,
  type LabelHubSchema,
  type LabelhubSchema,
  type SchemaField,
  type ShowItemDisplayConfig,
  type ShowItemDisplayField,
  type StructuredFieldLinkageAction,
  type StructuredFieldLinkageRule,
} from './schema.ts';

export {
  applySchemaLinkage,
  getSchemaFieldKey,
  isSafeUploadedFileUrl,
  validateSchemaAnswers,
  type SchemaLinkageResult,
  type SchemaValidationContext,
  type SchemaValidationError,
} from './schemaRuntime.ts';

export {
  getRendererSampleSchemas,
  preferenceCompareSampleSchema,
  qaQualitySampleSchema,
  titleCleanupSampleSchema,
  type RendererSampleSchemaResponse,
} from './sampleSchemas.ts';

export {
  buildTemplateCompatibilityReport,
  validateTemplateSchema,
  type TemplateCompatibilityReport,
  type TemplateSchemaValidationError,
  type TemplateSchemaValidationResult,
} from './templateValidation.ts';

export {
  getDatasetProfile,
  normalizeDatasetRecord,
  shouldSkipImportFile,
  validateDatasetRecord,
  type DatasetProfile,
  type DatasetRecord,
  type DatasetRecordValidationResult,
} from './datasetProfiles.ts';

export {
  AUTO_TEMPLATE_ANNOTATION_FIELD_TYPES,
  isAutoTemplateAnnotationFieldType,
  type AutoTemplateAnnotationField,
  type AutoTemplateAnnotationFieldType,
  type AutoTemplateFieldClassificationRequest,
  type AutoTemplateFieldClassificationResult,
  type AutoTemplateFieldValueStats,
  type AutoTemplateSourceField,
} from './autoTemplateClassification.ts';

export {
  compileAiReviewPrompt,
  type AiReviewFieldRequirement,
  type AiReviewPromptSection,
  type CompiledAiReviewPrompt,
  type CompileAiReviewPromptInput,
} from './aiReviewPrompt.ts';

export {
  buildModelRawDataContext,
  collectAnnotationRawDataKeys,
  collectShowItemRawDataKeys,
  flattenSchemaFields,
  isAnswerField,
  normalizeShowItemDisplayFields,
  type ModelRawDataContext,
} from './modelContext.ts';

export {
  AI_REVIEW_STATUS,
  AI_REVIEW_STATUS_LABELS,
  EXPORT_STATUS,
  EXPORT_STATUS_LABELS,
  FINAL_REVIEW_STATUS,
  FINAL_REVIEW_STATUS_LABELS,
  HUMAN_REVIEW_STATUS,
  HUMAN_REVIEW_STATUS_LABELS,
  REVIEW_STAGES,
  SUBMISSION_STATUS,
  SUBMISSION_STATUS_LABELS,
  TASK_STATUS,
  TASK_STATUS_LABELS,
  type AiReviewStatus,
  type ExportStatus,
  type FinalReviewStatus,
  type HumanReviewStatus,
  type ReviewStage,
  type SubmissionStatus,
  type TaskStatus,
} from './statuses.ts';

export {
  AI_REVIEW_TRANSITIONS,
  EXPORT_TRANSITIONS,
  HUMAN_REVIEW_TRANSITIONS,
  SUBMISSION_TRANSITIONS,
  TASK_TRANSITIONS,
  assertAiReviewTransition,
  assertExportTransition,
  assertHumanReviewTransition,
  assertSubmissionTransition,
  assertTaskTransition,
  canTransitionAiReview,
  canTransitionExport,
  canTransitionHumanReview,
  canTransitionSubmission,
  canTransitionTask,
  type TransitionMap,
} from './stateMachines.ts';

export {
  DEFAULT_REVIEW_STAGE_CONFIG,
  FULL_REVIEW_STAGE_CONFIG,
  REVIEW_STAGE_CONFIG_LABELS,
  REVIEW_STAGE_CONFIG_OPTIONS,
  isConfigurableReviewStage,
  normalizeReviewStageConfig,
  type ConfigurableReviewStage,
} from './reviewStages.ts';

export {
  EXPORT_FORMATS,
  LLM_PROVIDER_NAMES,
  type AiReviewJobPayload,
  type ExportFormat,
  type ExportJobPayload,
  type LlmProviderName,
  type StructuredReviewResult,
} from './export.ts';

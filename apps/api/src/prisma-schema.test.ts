import { readFileSync } from 'node:fs';

import {
  AI_REVIEW_STATUS,
  DATASET_KINDS,
  EXPORT_FORMATS,
  EXPORT_STATUS,
  REVIEW_STAGES,
  SUBMISSION_STATUS,
  TASK_STATUS,
} from '@labelhub/shared';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(
  new URL('../../../prisma/schema.prisma', import.meta.url),
  'utf8',
);

const modelBlock = (modelName: string): string => {
  const match = schema.match(
    new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`),
  );

  expect(match, `Expected model ${modelName} to exist`).not.toBeNull();

  return match?.[0] ?? '';
};

const enumValues = (enumName: string): string[] => {
  const match = schema.match(
    new RegExp(`enum ${enumName} \\{\\n([\\s\\S]*?)\\n\\}`),
  );

  expect(match, `Expected enum ${enumName} to exist`).not.toBeNull();

  return (match?.[1] ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'))
    .map((line) => line.split(/\s+/)[0]);
};

describe('Prisma schema', () => {
  it('defines the core LabelHub models', () => {
    const modelNames = [
      'User',
      'Task',
      'TaskTemplate',
      'TaskItem',
      'Assignment',
      'Draft',
      'Submission',
      'ReviewRule',
      'ReviewRecord',
      'AiReviewJob',
      'AuditLog',
      'ExportJob',
    ];

    for (const modelName of modelNames) {
      expect(schema).toMatch(new RegExp(`model ${modelName} \\{`));
      expect(modelBlock(modelName)).toMatch(
        /createdAt\s+DateTime\s+@default\(now\(\)\)/,
      );
      expect(modelBlock(modelName)).toMatch(/updatedAt\s+DateTime\s+@updatedAt/);
    }
  });

  it('uses JSON for templates, task data, answers, review traces, and metadata', () => {
    expect(modelBlock('TaskTemplate')).toMatch(/\bschema\s+Json\b/);
    expect(modelBlock('TaskItem')).toMatch(/\brawData\s+Json\b/);
    expect(modelBlock('Task')).toMatch(/\bdatasetImportSummary\s+Json\?/);
    expect(modelBlock('Draft')).toMatch(/\banswers\s+Json\b/);
    expect(modelBlock('Submission')).toMatch(/\banswers\s+Json\b/);
    expect(modelBlock('ReviewRecord')).toMatch(/\bscores\s+Json\b/);
    expect(modelBlock('ReviewRecord')).toMatch(/\bstructuredOutput\s+Json\?/);
    expect(modelBlock('ReviewRecord')).toMatch(/\bmodelMetadata\s+Json\?/);
    expect(modelBlock('AiReviewJob')).toMatch(/\blogs\s+Json\?/);
    expect(modelBlock('AuditLog')).toMatch(/\bmetadata\s+Json\?/);
  });

  it('keeps one coverable draft per assignment', () => {
    expect(modelBlock('Draft')).toMatch(/@@unique\(\[assignmentId\]\)/);
  });

  it('keeps immutable template version metadata', () => {
    expect(enumValues('TemplateStatus')).toEqual(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
    expect(modelBlock('TaskTemplate')).toMatch(/\bstatus\s+TemplateStatus\s+@default\(DRAFT\)/);
    expect(modelBlock('TaskTemplate')).toMatch(/\bversion\s+Int\s+@default\(0\)/);
    expect(modelBlock('TaskTemplate')).toMatch(/\bpublishedAt\s+DateTime\?/);
    expect(modelBlock('TaskTemplate')).toMatch(/\bparentTemplateId\s+String\?/);
    expect(modelBlock('TaskTemplate')).toMatch(/\brootTemplateId\s+String\?/);
    expect(modelBlock('TaskTemplate')).toMatch(/\barchivedAt\s+DateTime\?/);
    expect(modelBlock('TaskTemplate')).toMatch(/\brestoredFromTemplateId\s+String\?/);
    expect(modelBlock('TaskTemplate')).toMatch(/@@index\(\[status\]\)/);
    expect(modelBlock('TaskTemplate')).toMatch(/@@index\(\[rootTemplateId\]\)/);
    expect(modelBlock('TaskTemplate')).toMatch(/@@index\(\[archivedAt\]\)/);
  });

  it('keeps task publishing metadata for owner workflow', () => {
    expect(enumValues('DistributionStrategy')).toEqual([
      'FIRST_COME_FIRST_SERVE',
      'ASSIGNMENT',
      'QUOTA_RACE',
    ]);
    expect(modelBlock('Task')).toMatch(/\brichTextInstruction\s+String\?/);
    expect(modelBlock('Task')).toMatch(/\btags\s+String\[\]\s+@default\(\[\]\)/);
    expect(modelBlock('Task')).toMatch(/\brewardRule\s+String\?/);
    expect(modelBlock('Task')).toMatch(/\brewardPerItem\s+Float\?/);
    expect(modelBlock('Task')).toMatch(/\bmonthlyRewardCap\s+Float\?/);
    expect(modelBlock('Task')).toMatch(/\bquota\s+Int\?/);
    expect(modelBlock('Task')).toMatch(/\bdeadline\s+DateTime\?/);
    expect(modelBlock('Task')).toMatch(/\btemplateId\s+String\?/);
    expect(modelBlock('Task')).toMatch(
      /\btemplate\s+TaskTemplate\?\s+@relation\(fields: \[templateId\], references: \[id\]\)/,
    );
    expect(modelBlock('Task')).toMatch(
      /\bdistributionStrategy\s+DistributionStrategy\s+@default\(FIRST_COME_FIRST_SERVE\)/,
    );
    expect(modelBlock('Task')).toMatch(/\baiPreReviewEnabled\s+Boolean\s+@default\(false\)/);
    expect(modelBlock('Task')).toMatch(/\baiRuleName\s+String\?/);
    expect(modelBlock('Task')).toMatch(/\breviewStageConfig\s+ReviewStage\[\]\s+@default\(\[RECHECK\]\)/);
  });

  it('keeps dataset identity and submission schema snapshots', () => {
    expect(enumValues('TaskItemStatus')).toEqual(['UNASSIGNED', 'ASSIGNED', 'COMPLETED']);
    expect(modelBlock('TaskItem')).toMatch(/\bexternalId\s+String\b/);
    expect(modelBlock('TaskItem')).toMatch(/\bdatasetKind\s+DatasetKind\b/);
    expect(modelBlock('TaskItem')).toMatch(
      /\bstatus\s+TaskItemStatus\s+@default\(UNASSIGNED\)/,
    );
    expect(modelBlock('Submission')).toMatch(/\bschemaVersion\s+String\b/);
    expect(modelBlock('Submission')).toMatch(/\bround\s+Int\b/);
    expect(modelBlock('Submission')).toMatch(
      /@@unique\(\[assignmentId, round\]\)/,
    );
  });

  it('avoids redundant draft and submission ownership columns', () => {
    expect(modelBlock('Draft')).not.toMatch(/\btaskItemId\s+String\b/);
    expect(modelBlock('Draft')).not.toMatch(/\bauthorId\s+String\b/);
    expect(modelBlock('Submission')).not.toMatch(/\btaskItemId\s+String\b/);
    expect(modelBlock('Submission')).not.toMatch(/\bauthorId\s+String\b/);
    expect(modelBlock('User')).not.toMatch(/\bdrafts\s+Draft\[\]/);
    expect(modelBlock('User')).not.toMatch(/\bsubmissions\s+Submission\[\]/);
    expect(modelBlock('TaskItem')).not.toMatch(/\bdrafts\s+Draft\[\]/);
    expect(modelBlock('TaskItem')).not.toMatch(/\bsubmissions\s+Submission\[\]/);
  });

  it('ties assignment task items to the same task through a compound relation', () => {
    expect(modelBlock('TaskItem')).toMatch(/@@unique\(\[id, taskId\]\)/);
    expect(modelBlock('Assignment')).toMatch(/\bclaimedAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(modelBlock('Assignment')).toMatch(
      /taskItem\s+TaskItem\s+@relation\(fields: \[taskItemId, taskId\], references: \[id, taskId\], onDelete: Cascade\)/,
    );
  });

  it('keeps review trace fields and audit transitions', () => {
    expect(modelBlock('ReviewRule')).toMatch(/\bpromptTemplate\s+String\b/);
    expect(modelBlock('ReviewRule')).toMatch(/\bpromptVersion\s+Int\s+@default\(1\)/);
    expect(modelBlock('ReviewRule')).toMatch(/\bdimensions\s+Json\b/);
    expect(modelBlock('ReviewRule')).toMatch(/\bdimensionVersion\s+Int\s+@default\(1\)/);
    expect(modelBlock('ReviewRule')).toMatch(/\bpassThreshold\s+Int\s+@default\(80\)/);
    expect(modelBlock('ReviewRule')).toMatch(/\bmanualThreshold\s+Int\s+@default\(60\)/);
    expect(modelBlock('ReviewRule')).toMatch(/\bprovider\s+String\s+@default\("mock"\)/);
    expect(modelBlock('ReviewRule')).toMatch(/\bmodel\s+String\s+@default\("mock-stable-reviewer"\)/);
    expect(modelBlock('ReviewRule')).toMatch(/\btemperature\s+Float\s+@default\(0\)/);
    expect(modelBlock('Submission')).toMatch(/\bidempotencyKey\s+String\?/);
    expect(modelBlock('Submission')).toMatch(/@@unique\(\[idempotencyKey\]\)/);
    expect(modelBlock('ReviewRecord')).toMatch(/\brawPrompt\s+String\?/);
    expect(modelBlock('ReviewRecord')).toMatch(/\brawOutput\s+String\?/);
    expect(modelBlock('ReviewRecord')).toMatch(/\bretryCount\s+Int\s+@default\(0\)/);
    expect(modelBlock('ReviewRecord')).toMatch(/\bidempotencyKey\s+String\?/);
    expect(modelBlock('ReviewRecord')).toMatch(/\bassignedReviewerId\s+String\?/);
    expect(modelBlock('ReviewRecord')).toMatch(/\brevisedAnswers\s+Json\?/);
    expect(modelBlock('ReviewRecord')).toMatch(/@@unique\(\[idempotencyKey\]\)/);
    expect(modelBlock('AuditLog')).toMatch(/\bfromStatus\s+String\?/);
    expect(modelBlock('AuditLog')).toMatch(/\btoStatus\s+String\b/);
    expect(modelBlock('AuditLog')).toMatch(/\bactorId\s+String\?/);
    expect(modelBlock('AuditLog')).toMatch(/\breason\s+String\?/);
  });

  it('keeps idempotent AI review job snapshots', () => {
    expect(enumValues('AiReviewJobStatus')).toEqual(Object.values(AI_REVIEW_STATUS));
    expect(modelBlock('AiReviewJob')).toMatch(/\bsubmissionId\s+String\b/);
    expect(modelBlock('AiReviewJob')).toMatch(/\btaskId\s+String\b/);
    expect(modelBlock('AiReviewJob')).toMatch(/\bround\s+Int\b/);
    expect(modelBlock('AiReviewJob')).toMatch(/\bidempotencyKey\s+String\b/);
    expect(modelBlock('AiReviewJob')).toMatch(/\bstatus\s+AiReviewJobStatus\s+@default\(QUEUED\)/);
    expect(modelBlock('AiReviewJob')).toMatch(/\battempts\s+Int\s+@default\(0\)/);
    expect(modelBlock('AiReviewJob')).toMatch(/\bmaxAttempts\s+Int\s+@default\(3\)/);
    expect(modelBlock('AiReviewJob')).toMatch(/\bstructuredOutputMode\s+String\?/);
    expect(modelBlock('AiReviewJob')).toMatch(/\blastError\s+String\?/);
    expect(modelBlock('AiReviewJob')).toMatch(/@@unique\(\[idempotencyKey\]\)/);
    expect(modelBlock('AiReviewJob')).toMatch(/@@index\(\[status\]\)/);
  });

  it('keeps export parameter snapshots and generated file locations', () => {
    expect(modelBlock('ExportJob')).toMatch(/\bformat\s+ExportFormat\b/);
    expect(modelBlock('ExportJob')).toMatch(/\bidempotencyKey\s+String\?/);
    expect(modelBlock('ExportJob')).toMatch(/@@unique\(\[idempotencyKey\]\)/);
    expect(modelBlock('ExportJob')).toMatch(/\bfieldMapping\s+Json\b/);
    expect(modelBlock('ExportJob')).toMatch(/\bincludeReviews\s+Boolean\b/);
    expect(modelBlock('ExportJob')).toMatch(/\bfilePath\s+String\?/);
    expect(modelBlock('ExportJob')).toMatch(/\bfinishedAt\s+DateTime\?/);
  });

  it('defines enums aligned exactly with shared status and dataset protocols', () => {
    expect(enumValues('TaskStatus')).toEqual(Object.values(TASK_STATUS));
    expect(enumValues('AssignmentStatus')).toEqual([
      'ASSIGNED',
      'IN_PROGRESS',
      'SUBMITTED',
      'UNDER_RECHECK',
      'FINAL_PENDING',
      'FINAL_APPROVED',
      'NEEDS_REVISION',
      'CANCELLED',
    ]);
    expect(enumValues('SubmissionStatus')).toEqual(
      Object.values(SUBMISSION_STATUS),
    );
    expect(enumValues('ReviewStage')).toEqual([...REVIEW_STAGES]);
    expect(enumValues('AiReviewJobStatus')).toEqual(Object.values(AI_REVIEW_STATUS));
    expect(enumValues('ExportStatus')).toEqual(Object.values(EXPORT_STATUS));
    expect(enumValues('DatasetKind')).toEqual([...DATASET_KINDS]);
    expect(enumValues('ExportFormat')).toEqual([...EXPORT_FORMATS]);
  });
});

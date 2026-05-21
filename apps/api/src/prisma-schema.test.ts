import { readFileSync } from 'node:fs';

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
    expect(modelBlock('Draft')).toMatch(/\banswers\s+Json\b/);
    expect(modelBlock('Submission')).toMatch(/\banswers\s+Json\b/);
    expect(modelBlock('ReviewRecord')).toMatch(/\bscores\s+Json\b/);
    expect(modelBlock('AuditLog')).toMatch(/\bmetadata\s+Json\?/);
  });

  it('keeps dataset identity and submission schema snapshots', () => {
    expect(modelBlock('TaskItem')).toMatch(/\bexternalId\s+String\b/);
    expect(modelBlock('TaskItem')).toMatch(/\bdatasetKind\s+DatasetKind\b/);
    expect(modelBlock('Submission')).toMatch(/\bschemaVersion\s+String\b/);
  });

  it('keeps review trace fields and audit transitions', () => {
    expect(modelBlock('ReviewRecord')).toMatch(/\brawPrompt\s+String\?/);
    expect(modelBlock('ReviewRecord')).toMatch(/\brawOutput\s+String\?/);
    expect(modelBlock('AuditLog')).toMatch(/\bfromStatus\s+String\?/);
    expect(modelBlock('AuditLog')).toMatch(/\btoStatus\s+String\b/);
    expect(modelBlock('AuditLog')).toMatch(/\bactorId\s+String\?/);
    expect(modelBlock('AuditLog')).toMatch(/\breason\s+String\?/);
  });

  it('defines enums aligned with shared status and dataset protocols', () => {
    expect(schema).toMatch(
      /enum TaskStatus \{[\s\S]*DRAFT[\s\S]*PUBLISHED[\s\S]*PAUSED[\s\S]*ENDED[\s\S]*\}/,
    );
    expect(schema).toMatch(
      /enum AssignmentStatus \{[\s\S]*ASSIGNED[\s\S]*IN_PROGRESS[\s\S]*SUBMITTED[\s\S]*CANCELLED[\s\S]*\}/,
    );
    expect(schema).toMatch(
      /enum SubmissionStatus \{[\s\S]*AI_QUEUED[\s\S]*FINAL_APPROVED[\s\S]*NEEDS_REVISION[\s\S]*\}/,
    );
    expect(schema).toMatch(
      /enum ReviewStage \{[\s\S]*AI_PRECHECK[\s\S]*INITIAL[\s\S]*RECHECK[\s\S]*FINAL[\s\S]*\}/,
    );
    expect(schema).toMatch(
      /enum ExportStatus \{[\s\S]*QUEUED[\s\S]*PROCESSING[\s\S]*SUCCEEDED[\s\S]*FAILED[\s\S]*\}/,
    );
    expect(schema).toMatch(
      /enum DatasetKind \{[\s\S]*qa_quality[\s\S]*preference_compare[\s\S]*generic_json[\s\S]*\}/,
    );
  });
});

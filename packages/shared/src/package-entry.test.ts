import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

import {
  DATASET_KINDS,
  FIELD_TYPES,
  LABELHUB_SHARED_VERSION,
  TASK_STATUS_LABELS,
  canAccessRoute,
  getRoleHomePath,
} from '@labelhub/shared';

describe('共享包名入口', () => {
  it('支持通过 @labelhub/shared 导入基础协议', () => {
    expect(LABELHUB_SHARED_VERSION).toBe('0.0.0');
    expect(getRoleHomePath('OWNER')).toBe('/owner/tasks');
    expect(canAccessRoute('LABELER', '/labeler/tasks')).toBe(true);
    expect(FIELD_TYPES).toContain('llm_assist');
    expect(DATASET_KINDS).toContain('preference_compare');
    expect(Object.values(TASK_STATUS_LABELS)).toContain('发布中');
  });

  it('支持 Node ESM 解析包名入口', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "import('@labelhub/shared').then((m) => console.log(m.getRoleHomePath('AI_AGENT')))",
      ],
      { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
    );

    expect(output.trim()).toBe('/agent/ai-review');
  });
});

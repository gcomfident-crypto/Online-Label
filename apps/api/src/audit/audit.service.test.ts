import { describe, expect, it, vi } from 'vitest';

import { AuditService } from './audit.service.ts';

describe('AuditService', () => {
  it('writes audit logs through the Prisma delegate', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'audit_1' });
    const service = new AuditService({
      auditLog: { create },
    });

    await expect(
      service.writeAuditLog({
        taskId: 'task_qa_quality_demo',
        submissionId: 'submission_1',
        fromStatus: 'DRAFT',
        toStatus: 'SUBMITTED',
        actorId: 'user_labeler_li_lei',
        reason: '提交标注结果',
        metadata: { source: 'unit-test' },
      }),
    ).resolves.toEqual({ id: 'audit_1' });

    expect(create).toHaveBeenCalledWith({
      data: {
        taskId: 'task_qa_quality_demo',
        submissionId: 'submission_1',
        fromStatus: 'DRAFT',
        toStatus: 'SUBMITTED',
        actorId: 'user_labeler_li_lei',
        reason: '提交标注结果',
        metadata: { source: 'unit-test' },
      },
    });
  });
});

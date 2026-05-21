import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

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

  it('omits metadata when it is undefined', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'audit_2' });
    const service = new AuditService({
      auditLog: { create },
    });

    await service.writeAuditLog({
      toStatus: 'PUBLISHED',
      metadata: undefined,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        toStatus: 'PUBLISHED',
      },
    });
  });

  it('stores null metadata as Prisma JSON null', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'audit_3' });
    const service = new AuditService({
      auditLog: { create },
    });

    await service.writeAuditLog({
      toStatus: 'SUBMITTED',
      metadata: null,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        toStatus: 'SUBMITTED',
        metadata: Prisma.JsonNull,
      },
    });
  });

  it('normalizes nested undefined in metadata with JSON.stringify semantics', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'audit_4' });
    const service = new AuditService({
      auditLog: { create },
    });

    await service.writeAuditLog({
      toStatus: 'SUBMITTED',
      metadata: {
        omitted: undefined,
        nested: {
          kept: 'value',
          omitted: undefined,
        },
        list: ['first', undefined, 'third'],
      },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        toStatus: 'SUBMITTED',
        metadata: {
          nested: {
            kept: 'value',
          },
          list: ['first', null, 'third'],
        },
      },
    });
  });

  it('rejects metadata that cannot be serialized as JSON', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'audit_5' });
    const service = new AuditService({
      auditLog: { create },
    });

    await expect(
      service.writeAuditLog({
        toStatus: 'SUBMITTED',
        metadata: { unsafe: BigInt(1) },
      }),
    ).rejects.toThrow('审计日志 metadata 必须是可序列化 JSON。');

    expect(create).not.toHaveBeenCalled();
  });
});

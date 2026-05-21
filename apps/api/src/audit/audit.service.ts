import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';

export type WriteAuditLogInput = {
  taskId?: string;
  submissionId?: string;
  fromStatus?: string;
  toStatus: string;
  actorId?: string;
  reason?: string;
  metadata?: unknown;
};

type AuditLogDelegate = {
  auditLog: {
    create: (args: { data: WriteAuditLogInput }) => Promise<unknown>;
  };
};

@Injectable()
export class AuditService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: AuditLogDelegate,
  ) {}

  writeAuditLog(input: WriteAuditLogInput): Promise<unknown> {
    return this.prisma.auditLog.create({
      data: input,
    });
  }
}

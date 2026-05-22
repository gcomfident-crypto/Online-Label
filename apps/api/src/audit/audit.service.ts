import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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
    create: (args: {
      data: Prisma.AuditLogUncheckedCreateInput;
    }) => Promise<unknown>;
  };
};

@Injectable()
export class AuditService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: AuditLogDelegate,
  ) {}

  async writeAuditLog(input: WriteAuditLogInput): Promise<unknown> {
    const data: Prisma.AuditLogUncheckedCreateInput = {
      toStatus: input.toStatus,
    };

    if (input.taskId !== undefined) {
      data.taskId = input.taskId;
    }

    if (input.submissionId !== undefined) {
      data.submissionId = input.submissionId;
    }

    if (input.fromStatus !== undefined) {
      data.fromStatus = input.fromStatus;
    }

    if (input.actorId !== undefined) {
      data.actorId = input.actorId;
    }

    if (input.reason !== undefined) {
      data.reason = input.reason;
    }

    if (input.metadata !== undefined) {
      data.metadata = normalizeAuditMetadata(input.metadata);
    }

    return this.prisma.auditLog.create({
      data,
    });
  }
}

function normalizeAuditMetadata(
  metadata: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (metadata === null) {
    return Prisma.JsonNull;
  }

  let serialized: string | undefined;

  try {
    serialized = JSON.stringify(metadata);
  } catch {
    throw new Error('审计日志 metadata 必须是可序列化 JSON。');
  }

  if (serialized === undefined) {
    throw new Error('审计日志 metadata 必须是可序列化 JSON。');
  }

  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

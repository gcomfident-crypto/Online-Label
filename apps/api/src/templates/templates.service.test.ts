import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { TemplatesService } from './templates.service.ts';

type TemplateRecord = {
  id: string;
  name: string;
  description: string | null;
  datasetKind: 'qa_quality' | 'preference_compare' | 'generic_json';
  schemaVersion: string;
  schema: unknown;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  version: number;
  parentTemplateId: string | null;
  createdById: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

describe('TemplatesService', () => {
  it('从官方 qa_quality profile 创建模板草稿', async () => {
    const { service, records } = createService();

    const result = await service.createFromProfile({
      profile: 'qa_quality',
      actorId: 'user_owner_001',
    });

    expect(result.name).toBe('问答质量官方模板');
    expect(result.status).toBe('DRAFT');
    expect(result.schema.datasetKind).toBe('qa_quality');
    expect(result.schema.fields.some((field) => field.type === 'show_item')).toBe(true);
    expect(records).toHaveLength(1);
  });

  it('保存前拒绝重复字段名', async () => {
    const { service } = createService();
    const template = await service.create({
      name: '重复字段模板',
      datasetKind: 'generic_json',
      actorId: 'user_owner_001',
    });

    await expect(
      service.update(template.id, {
        schema: {
          schemaVersion: 'draft',
          datasetKind: 'generic_json',
          fields: [
            { key: 'summary', type: 'text', label: '摘要' },
            { key: 'summary_copy', fieldKey: 'summary', type: 'textarea', label: '说明' },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('发布草稿生成不可变版本和兼容报告', async () => {
    const { service } = createService();
    const template = await service.createFromProfile({
      profile: 'title_cleanup',
      actorId: 'user_owner_001',
    });

    const published = await service.publish(template.id, { versionName: 'r1' });

    expect(published.template.status).toBe('PUBLISHED');
    expect(published.template.schemaVersion).toBe('r1');
    expect(published.template.version).toBe(1);
    expect(published.compatibilityReport.compatible).toBe(true);

    await expect(service.update(template.id, { name: '直接覆盖发布版' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('查询不存在模板时返回 NotFoundException', async () => {
    const { service } = createService();

    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

function createService() {
  const records: TemplateRecord[] = [];
  let sequence = 1;
  const now = new Date('2026-05-21T00:00:00.000Z');

  const prisma = {
    taskTemplate: {
      create: async ({ data }: { data: Partial<TemplateRecord> }) => {
        const record: TemplateRecord = {
          id: data.id ?? `template_${sequence++}`,
          name: data.name ?? '未命名模板',
          description: data.description ?? null,
          datasetKind: data.datasetKind ?? 'generic_json',
          schemaVersion: data.schemaVersion ?? 'draft',
          schema: data.schema ?? { schemaVersion: 'draft', datasetKind: 'generic_json', fields: [] },
          status: data.status ?? 'DRAFT',
          version: data.version ?? 0,
          parentTemplateId: data.parentTemplateId ?? null,
          createdById: data.createdById ?? null,
          publishedAt: data.publishedAt ?? null,
          createdAt: now,
          updatedAt: now,
        };
        records.push(record);
        return record;
      },
      findMany: async () => records,
      findUnique: async ({ where }: { where: { id: string } }) => {
        return records.find((record) => record.id === where.id) ?? null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<TemplateRecord> }) => {
        const index = records.findIndex((record) => record.id === where.id);
        const next = { ...records[index], ...data, updatedAt: now };
        records[index] = next;
        return next;
      },
    },
  };

  return {
    records,
    service: new TemplatesService(prisma),
  };
}

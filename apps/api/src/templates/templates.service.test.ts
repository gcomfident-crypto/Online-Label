import { ConflictException, NotFoundException } from '@nestjs/common';
import type { SchemaField } from '@labelhub/shared';
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
  rootTemplateId: string | null;
  archivedAt: Date | null;
  restoredFromTemplateId: string | null;
  createdById: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type TaskRecord = {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ENDED';
  templateId: string | null;
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
    expect(flattenFieldKeys(result.schema.fields)).toContain('relevance_score');
    expect(result.schema.fields[0]?.sourceKeys).toEqual(
      expect.arrayContaining(['prompt', 'model_answer', 'media_url']),
    );
    expect(records).toHaveLength(1);
  });

  it('从官方 preference_compare profile 创建 A/B 偏好模板草稿', async () => {
    const { service } = createService();

    const result = await service.createFromProfile({
      profile: 'preference_compare',
      actorId: 'user_owner_001',
    });

    expect(result.name).toBe('偏好对比官方模板');
    expect(result.schema.datasetKind).toBe('preference_compare');
    expect(result.schema.fields[0]?.sourceKeys).toEqual(
      expect.arrayContaining(['prompt', 'response_a', 'response_b']),
    );
    expect(flattenFieldKeys(result.schema.fields)).toEqual(
      expect.arrayContaining(['preferred', 'dimensions', 'evidence_file', 'evidence_image']),
    );
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
    ).rejects.toMatchObject({
      response: {
        code: 'INVALID_TEMPLATE_SCHEMA',
      },
    });
  });

  it('发布草稿生成不可变版本和兼容报告', async () => {
    const { service } = createService();
    const template = await service.createFromProfile({
      profile: 'title_cleanup',
      actorId: 'user_owner_001',
    });

    const published = await service.publish(template.id, {
      versionName: 'v1',
      actorId: 'user_owner_zhang_man',
    });

    expect(published.template.status).toBe('PUBLISHED');
    expect(published.template.schemaVersion).toBe('v1');
    expect(published.template.version).toBe(1);
    expect(published.template.createdById).toBe('user_owner_zhang_man');
    expect(published.compatibilityReport.compatible).toBe(true);

    await expect(service.update(template.id, { name: '直接覆盖发布版' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('发布时如果模板版本链正在被未完成任务使用则拒绝并提示另存为新模板', async () => {
    const { service, records, tasks } = createService();
    records.push(
      createTemplateRecord({
        id: 'template_v1',
        version: 1,
        status: 'PUBLISHED',
        schemaVersion: 'v1',
      }),
      createTemplateRecord({
        id: 'template_draft',
        version: 1,
        status: 'DRAFT',
        schemaVersion: 'draft',
        parentTemplateId: 'template_v1',
        rootTemplateId: 'template_v1',
      }),
    );
    tasks.push({
      id: 'task_active',
      title: '进行中任务',
      status: 'PUBLISHED',
      templateId: 'template_v1',
    });

    await expect(service.publish('template_draft', { versionName: 'v2', actorId: 'user_owner_001' })).rejects.toMatchObject({
      response: {
        code: 'TEMPLATE_IN_USE',
        message: '该模板正在被未完成任务使用，暂时无法发布新版本。请先另存为新模板。',
      },
    });
    expect(records.find((record) => record.id === 'template_draft')?.status).toBe('DRAFT');
  });

  it('查询不存在模板时返回 NotFoundException', async () => {
    const { service } = createService();

    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('删除未被任务使用的模板，并归档只被已完成任务引用的模板', async () => {
    const { service, records, tasks } = createService();
    const unusedTemplate = await service.create({
      name: '可删除模板',
      datasetKind: 'generic_json',
      actorId: 'user_owner_001',
    });
    const completedOnlyTemplate = await service.create({
      name: '已完成任务使用模板',
      datasetKind: 'generic_json',
      actorId: 'user_owner_001',
    });
    tasks.push({
      id: 'task_done',
      title: '已完成任务',
      status: 'ENDED',
      templateId: completedOnlyTemplate.id,
    });

    await expect(service.deleteTemplate(unusedTemplate.id)).resolves.toEqual({ id: unusedTemplate.id });
    expect(records.find((record) => record.id === unusedTemplate.id)).toBeUndefined();
    await expect(service.deleteTemplate(completedOnlyTemplate.id)).resolves.toEqual({
      id: completedOnlyTemplate.id,
    });
    expect(records.find((record) => record.id === completedOnlyTemplate.id)).toMatchObject({
      status: 'ARCHIVED',
    });
    expect(tasks.find((task) => task.id === 'task_done')?.templateId).toBe(completedOnlyTemplate.id);
  });

  it('拒绝删除版本链中任一版本被未完成任务引用的模板', async () => {
    const { service, records, tasks } = createService();
    records.push(
      createTemplateRecord({ id: 'template_v1', version: 1, status: 'PUBLISHED', schemaVersion: 'v1' }),
      createTemplateRecord({
        id: 'template_v2',
        version: 2,
        status: 'PUBLISHED',
        schemaVersion: 'v2',
        parentTemplateId: 'template_v1',
        rootTemplateId: 'template_v1',
      }),
    );
    tasks.push({
      id: 'task_draft',
      title: '未完成任务',
      status: 'DRAFT',
      templateId: 'template_v1',
    });

    await expect(service.deleteTemplate('template_v2')).rejects.toMatchObject({
      response: {
        code: 'TEMPLATE_IN_USE',
        message: '该模板正在被未完成任务使用，暂时无法删除。',
      },
    });
    expect(records.find((record) => record.id === 'template_v2')).toBeDefined();
  });

  it('获取同一模板版本链的所有版本，并标识任务使用和当前版本', async () => {
    const { service, records, tasks } = createService();
    records.push(
      createTemplateRecord({ id: 'template_v1', version: 1, status: 'PUBLISHED', schemaVersion: 'v1' }),
      createTemplateRecord({
        id: 'template_v2',
        version: 2,
        status: 'PUBLISHED',
        schemaVersion: 'v2',
        parentTemplateId: 'template_v1',
        rootTemplateId: 'template_v1',
      }),
      createTemplateRecord({
        id: 'template_v3',
        version: 3,
        status: 'ARCHIVED',
        schemaVersion: 'v3',
        parentTemplateId: 'template_v2',
        rootTemplateId: 'template_v1',
        archivedAt: new Date('2026-05-22T00:00:00.000Z'),
      }),
    );
    tasks.push(
      { id: 'task_done', title: '已结束任务', status: 'ENDED', templateId: 'template_v1' },
      { id: 'task_active', title: '进行中任务', status: 'PUBLISHED', templateId: 'template_v2' },
      { id: 'task_paused', title: '暂停任务', status: 'PAUSED', templateId: 'template_v3' },
    );

    const versions = await service.listVersions('template_v2');

    expect(versions.map((version) => version.id)).toEqual(['template_v3', 'template_v2', 'template_v1']);
    expect(versions.find((version) => version.id === 'template_v2')).toMatchObject({
      usageCount: 1,
      activeUsageCount: 1,
      isCurrent: true,
      isArchived: false,
      rootTemplateId: 'template_v1',
    });
    expect(versions.find((version) => version.id === 'template_v1')).toMatchObject({
      usageCount: 1,
      activeUsageCount: 0,
      isCurrent: false,
      isArchived: false,
    });
    expect(versions.find((version) => version.id === 'template_v3')).toMatchObject({
      usageCount: 1,
      activeUsageCount: 1,
      isCurrent: false,
      isArchived: true,
    });
  });

  it('模板列表只展示未归档草稿和每条版本链的当前发布版本，并返回版本链任务占用', async () => {
    const { service, records, tasks } = createService();
    records.push(
      createTemplateRecord({ id: 'template_v1', version: 1, status: 'PUBLISHED', schemaVersion: 'v1' }),
      createTemplateRecord({
        id: 'template_v2',
        version: 2,
        status: 'PUBLISHED',
        schemaVersion: 'v2',
        parentTemplateId: 'template_v1',
        rootTemplateId: 'template_v1',
        updatedAt: new Date('2026-05-23T00:00:00.000Z'),
      }),
      createTemplateRecord({
        id: 'template_draft',
        version: 2,
        status: 'DRAFT',
        parentTemplateId: 'template_v2',
        rootTemplateId: 'template_v1',
        updatedAt: new Date('2026-05-22T12:00:00.000Z'),
      }),
      createTemplateRecord({
        id: 'template_archived',
        version: 3,
        status: 'ARCHIVED',
        parentTemplateId: 'template_v2',
        rootTemplateId: 'template_v1',
        archivedAt: new Date('2026-05-22T00:00:00.000Z'),
      }),
    );
    tasks.push(
      { id: 'task_active', title: '进行中任务', status: 'PUBLISHED', templateId: 'template_v1' },
      { id: 'task_done', title: '已完成任务', status: 'ENDED', templateId: 'template_v2' },
    );

    const templates = await service.list();

    expect(templates.map((template) => template.id)).toEqual(['template_v2', 'template_draft']);
    expect(templates.find((template) => template.id === 'template_v2')).toMatchObject({
      usageCount: 2,
      activeUsageCount: 1,
    });
    expect(templates.find((template) => template.id === 'template_draft')).toMatchObject({
      usageCount: 0,
      activeUsageCount: 0,
    });
  });

  it('返回历史版本与当前版本之间的结构化字段 Diff', async () => {
    const { service, records } = createService();
    records.push(
      createTemplateRecord({
        id: 'template_v1',
        version: 1,
        schemaVersion: 'v1',
        schema: {
          schemaVersion: 'v1',
          datasetKind: 'generic_json',
          fields: [
            { key: 'prompt', fieldKey: 'prompt', type: 'text', label: '题目', validation: { required: true } },
            { key: 'score', fieldKey: 'score', type: 'radio', label: '评分' },
            { key: 'obsolete', fieldKey: 'obsolete', type: 'text', label: '旧字段' },
          ],
        },
      }),
      createTemplateRecord({
        id: 'template_v2',
        version: 2,
        schemaVersion: 'v2',
        parentTemplateId: 'template_v1',
        rootTemplateId: 'template_v1',
        schema: {
          schemaVersion: 'v2',
          datasetKind: 'generic_json',
          aiReviewPrompt: { persona: '新版角色' },
          fields: [
            { key: 'prompt', fieldKey: 'prompt', type: 'textarea', label: '题目文本' },
            { key: 'score', fieldKey: 'score', type: 'radio', label: '评分', validation: { required: true } },
            { key: 'comment', fieldKey: 'comment', type: 'textarea', label: '备注' },
          ],
        },
      }),
    );

    const diff = await service.diffVersion('template_v2', 'template_v1');

    expect(diff.summary).toEqual({ added: 1, removed: 1, changed: 3 });
    expect(diff.sections.find((section) => section.title === '新增字段')?.items[0]).toMatchObject({
      fieldKey: 'comment',
      changeDescription: '新增字段 备注',
    });
    expect(diff.sections.find((section) => section.title === '删除字段')?.items[0]).toMatchObject({
      fieldKey: 'obsolete',
      changeDescription: '删除字段 旧字段',
    });
    expect(diff.sections.find((section) => section.title === '字段类型变化')?.items[0]).toMatchObject({
      fieldKey: 'prompt',
      before: 'text',
      after: 'textarea',
    });
    expect(diff.sections.find((section) => section.title === '字段标签变化')?.items[0]).toMatchObject({
      fieldKey: 'prompt',
      before: '题目',
      after: '题目文本',
    });
    expect(diff.sections.find((section) => section.title === '必填校验变化')?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldKey: 'prompt', before: true, after: false }),
        expect.objectContaining({ fieldKey: 'score', before: false, after: true }),
      ]),
    );
    expect(diff.sections.find((section) => section.title === 'AI Prompt 配置变化')).toBeDefined();
  });

  it('同一个多选字段多项配置变化时摘要只统计为一条变更', async () => {
    const { service, records } = createService();
    records.push(
      createTemplateRecord({
        id: 'template_v1',
        version: 1,
        schemaVersion: 'v1',
        schema: {
          schemaVersion: 'same',
          datasetKind: 'generic_json',
          fields: [
            {
              key: 'tags',
              fieldKey: 'tags',
              type: 'checkbox',
              label: '多选',
              options: [{ label: 'A', value: 'a' }],
              validation: { required: false },
            },
          ],
        },
      }),
      createTemplateRecord({
        id: 'template_v2',
        version: 2,
        schemaVersion: 'v2',
        parentTemplateId: 'template_v1',
        rootTemplateId: 'template_v1',
        schema: {
          schemaVersion: 'same',
          datasetKind: 'generic_json',
          fields: [
            {
              key: 'tags',
              fieldKey: 'tags',
              type: 'checkbox',
              label: '多选',
              options: [
                { label: 'A', value: 'a' },
                { label: 'B', value: 'b' },
              ],
              validation: { required: true },
            },
          ],
        },
      }),
    );

    const diff = await service.diffVersion('template_v2', 'template_v1');

    expect(diff.summary).toEqual({ added: 0, removed: 0, changed: 1 });
    expect(diff.sections.find((section) => section.title === '必填校验变化')?.items).toHaveLength(1);
    expect(diff.sections.find((section) => section.title === '选项变化')?.items).toHaveLength(1);
  });

  it('仅 Schema 版本号变化时摘要不计入变更', async () => {
    const { service, records } = createService();
    const fields: SchemaField[] = [
      {
        key: 'tags',
        fieldKey: 'tags',
        type: 'checkbox',
        label: '多选',
        options: [{ label: 'A', value: 'a' }],
      },
    ];
    records.push(
      createTemplateRecord({
        id: 'template_v1',
        version: 1,
        schemaVersion: 'v1',
        schema: {
          schemaVersion: 'v1',
          datasetKind: 'generic_json',
          fields,
        },
      }),
      createTemplateRecord({
        id: 'template_v2',
        version: 2,
        schemaVersion: 'v2',
        parentTemplateId: 'template_v1',
        rootTemplateId: 'template_v1',
        schema: {
          schemaVersion: 'v2',
          datasetKind: 'generic_json',
          fields,
        },
      }),
    );

    const diff = await service.diffVersion('template_v2', 'template_v1');

    expect(diff.summary).toEqual({ added: 0, removed: 0, changed: 0 });
    expect(diff.sections.find((section) => section.title === 'Schema 版本变化')?.items).toHaveLength(1);
  });

  it('恢复历史版本时如果版本链被未完成任务引用则拒绝恢复', async () => {
    const { service, records, tasks } = createService();
    records.push(
      createTemplateRecord({ id: 'template_v1', version: 1, status: 'PUBLISHED', schemaVersion: 'v1' }),
      createTemplateRecord({
        id: 'template_v2',
        version: 2,
        status: 'PUBLISHED',
        schemaVersion: 'v2',
        parentTemplateId: 'template_v1',
        rootTemplateId: 'template_v1',
      }),
      createTemplateRecord({
        id: 'template_v3',
        version: 3,
        status: 'PUBLISHED',
        schemaVersion: 'v3',
        parentTemplateId: 'template_v2',
        rootTemplateId: 'template_v1',
      }),
    );
    tasks.push(
      { id: 'task_active', title: '进行中任务', status: 'PUBLISHED', templateId: 'template_v3' },
      { id: 'task_done', title: '已结束任务', status: 'ENDED', templateId: 'template_v2' },
    );

    await expect(service.restoreVersion('template_v3', 'template_v1')).rejects.toMatchObject({
      response: {
        code: 'TEMPLATE_IN_USE',
        message: '该模板正在被未完成任务使用，暂时无法恢复历史版本。',
      },
    });
    expect(records.find((record) => record.id === 'template_v2')).toMatchObject({ status: 'PUBLISHED' });
    expect(records.find((record) => record.id === 'template_v3')).toMatchObject({ status: 'PUBLISHED' });
  });

  it('恢复历史版本时归档后续版本，已完成任务引用不阻止恢复且保留任务 templateId', async () => {
    const { service, records, tasks } = createService();
    records.push(
      createTemplateRecord({ id: 'template_v1', version: 1, status: 'PUBLISHED', schemaVersion: 'v1' }),
      createTemplateRecord({
        id: 'template_v2',
        version: 2,
        status: 'PUBLISHED',
        schemaVersion: 'v2',
        parentTemplateId: 'template_v1',
        rootTemplateId: 'template_v1',
      }),
      createTemplateRecord({
        id: 'template_v3',
        version: 3,
        status: 'PUBLISHED',
        schemaVersion: 'v3',
        parentTemplateId: 'template_v2',
        rootTemplateId: 'template_v1',
      }),
    );
    tasks.push(
      { id: 'task_done_current', title: '已结束任务', status: 'ENDED', templateId: 'template_v3' },
      { id: 'task_done_previous', title: '已结束任务 2', status: 'ENDED', templateId: 'template_v2' },
    );
    const v2SchemaBefore = records.find((record) => record.id === 'template_v2')?.schema;
    const v3SchemaBefore = records.find((record) => record.id === 'template_v3')?.schema;

    const result = await service.restoreVersion('template_v3', 'template_v1');

    expect(result.restoredTemplate.id).toBe('template_v1');
    expect(result.archivedVersions.map((version) => version.id)).toEqual(['template_v2', 'template_v3']);
    expect(result.affectedActiveTasks).toEqual([]);
    expect(result.warning).toBeUndefined();
    expect(records.find((record) => record.id === 'template_v2')).toMatchObject({ status: 'ARCHIVED' });
    expect(records.find((record) => record.id === 'template_v3')).toMatchObject({ status: 'ARCHIVED' });
    expect(records.find((record) => record.id === 'template_v2')?.schema).toBe(v2SchemaBefore);
    expect(records.find((record) => record.id === 'template_v3')?.schema).toBe(v3SchemaBefore);
    expect(tasks.find((task) => task.id === 'task_done_current')?.templateId).toBe('template_v3');
  });

  it('拒绝对不属于同一版本链的版本执行 Diff 和恢复', async () => {
    const { service, records } = createService();
    records.push(
      createTemplateRecord({ id: 'template_a_v1', version: 1, status: 'PUBLISHED' }),
      createTemplateRecord({ id: 'template_b_v1', version: 1, status: 'PUBLISHED' }),
    );

    await expect(service.diffVersion('template_a_v1', 'template_b_v1')).rejects.toMatchObject({
      response: { code: 'TEMPLATE_VERSION_CHAIN_MISMATCH' },
    });
    await expect(service.restoreVersion('template_a_v1', 'template_b_v1')).rejects.toMatchObject({
      response: { code: 'TEMPLATE_VERSION_CHAIN_MISMATCH' },
    });
  });
});

function createService() {
  const records: TemplateRecord[] = [];
  const tasks: TaskRecord[] = [];
  const taskReferenceCounts = new Map<string, number>();
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
          rootTemplateId: data.rootTemplateId ?? null,
          archivedAt: data.archivedAt ?? null,
          restoredFromTemplateId: data.restoredFromTemplateId ?? null,
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
      delete: async ({ where }: { where: { id: string } }) => {
        const index = records.findIndex((record) => record.id === where.id);
        if (index < 0) {
          throw new Error('模板不存在。');
        }

        const [deleted] = records.splice(index, 1);
        return deleted;
      },
    },
    task: {
      count: async ({ where }: { where: { templateId: string; status?: { not: TaskRecord['status'] } } }) => {
        const matchingTasks = tasks.filter((task) =>
          task.templateId === where.templateId &&
          (!where.status?.not || task.status !== where.status.not),
        );

        if (matchingTasks.length > 0 || where.status?.not) {
          return matchingTasks.length;
        }

        return taskReferenceCounts.get(where.templateId) ?? 0;
      },
      findMany: async ({ where }: {
        where: { templateId: { in: string[] }; status?: { not: TaskRecord['status'] } };
      }) =>
        tasks.filter((task) =>
          task.templateId &&
          where.templateId.in.includes(task.templateId) &&
          (!where.status?.not || task.status !== where.status.not),
        ),
    },
  };

  return {
    records,
    tasks,
    taskReferenceCounts,
    service: new TemplatesService(prisma),
  };
}

function createTemplateRecord(input: Partial<TemplateRecord>): TemplateRecord {
  const now = new Date('2026-05-21T00:00:00.000Z');

  return {
    id: input.id ?? 'template_test',
    name: input.name ?? '版本模板',
    description: input.description ?? null,
    datasetKind: input.datasetKind ?? 'generic_json',
    schemaVersion: input.schemaVersion ?? 'v1',
    schema: input.schema ?? {
      schemaVersion: input.schemaVersion ?? 'v1',
      datasetKind: input.datasetKind ?? 'generic_json',
      fields: [],
    },
    status: input.status ?? 'PUBLISHED',
    version: input.version ?? 1,
    parentTemplateId: input.parentTemplateId ?? null,
    rootTemplateId: input.rootTemplateId ?? null,
    archivedAt: input.archivedAt ?? null,
    restoredFromTemplateId: input.restoredFromTemplateId ?? null,
    createdById: input.createdById ?? null,
    publishedAt: input.publishedAt ?? now,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

function flattenFieldKeys(fields: readonly SchemaField[]): string[] {
  return fields.flatMap((field) => [
    field.fieldKey ?? field.key,
    ...(field.fields ? flattenFieldKeys(field.fields) : []),
    ...(field.tabs?.flatMap((tab) => flattenFieldKeys(tab.fields)) ?? []),
  ]);
}

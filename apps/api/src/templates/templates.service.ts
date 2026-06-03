import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildTemplateCompatibilityReport,
  createLabelHubSchema,
  getSchemaFieldKey,
  getRendererSampleSchemas,
  validateTemplateSchema,
  type DatasetKind,
  type LabelHubSchema,
  type SchemaField,
  type TemplateCompatibilityReport,
  type TemplateSchemaValidationError,
} from '@labelhub/shared';

import type {
  CreateTemplateFromProfileInput,
  OfficialTemplateProfile,
} from './dto/create-template-from-profile.dto.ts';
import type { CreateTemplateInput } from './dto/create-template.dto.ts';
import type { PublishTemplateInput } from './dto/publish-template.dto.ts';
import type { UpdateTemplateInput } from './dto/update-template.dto.ts';
import { PrismaService } from '../prisma/prisma.service.ts';

type TemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
type TaskStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ENDED';

export type TemplateRecord = {
  id: string;
  name: string;
  description: string | null;
  datasetKind: DatasetKind;
  schemaVersion: string;
  schema: unknown;
  status: TemplateStatus;
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

export type TemplateDto = Omit<TemplateRecord, 'schema'> & {
  schema: LabelHubSchema;
  usageCount?: number;
  activeUsageCount?: number;
};

export type PublishTemplateResult = {
  template: TemplateDto;
  compatibilityReport: TemplateCompatibilityReport;
};

export type DeleteTemplateResult = {
  id: string;
};

export type TemplateVersionDto = TemplateDto & {
  usageCount: number;
  activeUsageCount: number;
  isCurrent: boolean;
  isArchived: boolean;
};

export type TemplateVersionDiffItem = {
  fieldKey: string;
  label?: string;
  before?: unknown;
  after?: unknown;
  changeDescription: string;
};

export type TemplateVersionDiffSection = {
  type: 'added' | 'removed' | 'changed';
  title: string;
  items: TemplateVersionDiffItem[];
};

export type TemplateVersionDiff = {
  summary: {
    added: number;
    removed: number;
    changed: number;
  };
  sections: TemplateVersionDiffSection[];
};

export type TemplateTaskUsageDto = {
  id: string;
  title: string;
  status: TaskStatus;
  templateId: string | null;
};

export type RestoreTemplateVersionResult = {
  restoredTemplate: TemplateDto;
  archivedVersions: TemplateDto[];
  affectedActiveTasks: TemplateTaskUsageDto[];
  message: string;
  warning?: string;
};

type TemplatesPrismaClient = {
  taskTemplate: {
    create: (args: { data: Record<string, unknown> }) => Promise<TemplateRecord>;
    findMany: (args?: { orderBy?: { updatedAt: 'desc' | 'asc' } }) => Promise<TemplateRecord[]>;
    findUnique: (args: { where: { id: string } }) => Promise<TemplateRecord | null>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<TemplateRecord>;
    delete: (args: { where: { id: string } }) => Promise<TemplateRecord>;
  };
  task: {
    count: (args: { where: { templateId: string; status?: { not: TaskStatus } } }) => Promise<number>;
    findMany: (args: {
      where: { templateId: { in: string[] }; status?: { not: TaskStatus } };
    }) => Promise<TemplateTaskUsageDto[]>;
  };
};

const DEFAULT_TEMPLATE_NAME = '未命名模板';

@Injectable()
export class TemplatesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: TemplatesPrismaClient,
  ) {}

  async create(input: CreateTemplateInput): Promise<TemplateDto> {
    const parentTemplate = input.parentTemplateId
      ? await this.findTemplateOrThrow(input.parentTemplateId)
      : null;
    const schema = input.schema ?? createEmptySchema(input.datasetKind);
    const template = await this.prisma.taskTemplate.create({
      data: {
        name: input.name || DEFAULT_TEMPLATE_NAME,
        description: input.description ?? null,
        datasetKind: input.datasetKind,
        schemaVersion: schema.schemaVersion,
        schema,
        status: 'DRAFT',
        version: parentTemplate?.version ?? 0,
        parentTemplateId: parentTemplate?.id ?? null,
        rootTemplateId: parentTemplate ? templateRootId(parentTemplate) : null,
        archivedAt: null,
        restoredFromTemplateId: null,
        createdById: input.actorId ?? null,
        publishedAt: null,
      },
    });

    return toTemplateDto(template);
  }

  async createFromProfile(input: CreateTemplateFromProfileInput): Promise<TemplateDto> {
    const schema = schemaFromProfile(input.profile);
    const template = await this.prisma.taskTemplate.create({
      data: {
        name: nameFromProfile(input.profile),
        description: descriptionFromProfile(input.profile),
        datasetKind: schema.datasetKind,
        schemaVersion: schema.schemaVersion,
        schema,
        status: 'DRAFT',
        version: 0,
        parentTemplateId: null,
        rootTemplateId: null,
        archivedAt: null,
        restoredFromTemplateId: null,
        createdById: input.actorId ?? null,
        publishedAt: null,
      },
    });

    return toTemplateDto(template);
  }

  async list(): Promise<TemplateDto[]> {
    const templates = await this.prisma.taskTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    const visibleTemplates = currentVisibleTemplates(templates);

    return Promise.all(
      visibleTemplates.map((template) => this.toTemplateDtoWithUsage(template, templates)),
    );
  }

  async get(templateId: string): Promise<TemplateDto> {
    const template = await this.findTemplateOrThrow(templateId);

    return toTemplateDto(template);
  }

  async update(templateId: string, input: UpdateTemplateInput): Promise<TemplateDto> {
    const current = await this.findTemplateOrThrow(templateId);

    if (current.status === 'PUBLISHED') {
      throw new ConflictException({
        code: 'TEMPLATE_VERSION_LOCKED',
        message: '已发布模板不可直接覆盖，请复制为新草稿后再编辑。',
      });
    }

    const nextSchema = input.schema ?? toTemplateDto(current).schema;

    if (input.schema) {
      assertValidTemplateSchema(input.schema);
    }

    const template = await this.prisma.taskTemplate.update({
      where: { id: templateId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.schema !== undefined
          ? {
              datasetKind: nextSchema.datasetKind,
              schemaVersion: nextSchema.schemaVersion,
              schema: nextSchema,
            }
          : {}),
      },
    });

    return toTemplateDto(template);
  }

  async publish(
    templateId: string,
    input: PublishTemplateInput = {},
  ): Promise<PublishTemplateResult> {
    const current = await this.findTemplateOrThrow(templateId);

    if (current.status !== 'DRAFT') {
      throw new ConflictException({
        code: 'TEMPLATE_VERSION_LOCKED',
        message: '只有草稿模板可以发布为新版本。',
      });
    }

    const currentDto = toTemplateDto(current);

    const allTemplates = await this.prisma.taskTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    const byId = templateMapById(allTemplates);
    const chain = collectVersionChain(current, allTemplates);
    await this.assertTemplateChainUnlocked(chain, 'publish');
    assertValidTemplateSchema(currentDto.schema);
    const version = Math.max(0, ...chain.map((template) => template.version)) + 1;
    const schemaVersion = input.versionName ?? `v${version}`;
    const nextSchema = {
      ...currentDto.schema,
      schemaVersion,
    };
    const parentTemplate = current.parentTemplateId ? byId.get(current.parentTemplateId) ?? null : null;
    const compatibilityReport = parentTemplate
      ? buildTemplateCompatibilityReport(toTemplateDto(parentTemplate).schema, nextSchema)
      : emptyCompatibilityReport();
    const template = await this.prisma.taskTemplate.update({
      where: { id: templateId },
      data: {
        status: 'PUBLISHED',
        version,
        schemaVersion,
        schema: nextSchema,
        rootTemplateId: templateRootId(current, byId),
        archivedAt: null,
        createdById: input.actorId ?? current.createdById,
        publishedAt: new Date(),
      },
    });

    return {
      template: toTemplateDto(template),
      compatibilityReport,
    };
  }

  async deleteTemplate(templateId: string): Promise<DeleteTemplateResult> {
    const template = await this.findTemplateOrThrow(templateId);
    const allTemplates = await this.prisma.taskTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    const templatesToDelete = template.status === 'DRAFT'
      ? [template]
      : collectVersionChain(template, allTemplates);

    await this.assertTemplateChainUnlocked(templatesToDelete, 'delete');

    const deletedAt = new Date();

    for (const templateToDelete of templatesToDelete) {
      const usageCount = await this.prisma.task.count({ where: { templateId: templateToDelete.id } });

      if (usageCount > 0) {
        await this.prisma.taskTemplate.update({
          where: { id: templateToDelete.id },
          data: {
            status: 'ARCHIVED',
            archivedAt: deletedAt,
          },
        });
        continue;
      }

      await this.prisma.taskTemplate.delete({
        where: { id: templateToDelete.id },
      });
    }

    return { id: templateId };
  }

  async listVersions(templateId: string): Promise<TemplateVersionDto[]> {
    const current = await this.findTemplateOrThrow(templateId);
    const allTemplates = await this.prisma.taskTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    const chain = collectVersionChain(current, allTemplates).sort(compareVersionDesc);
    const currentTemplate = currentVersionFromChain(chain);

    return Promise.all(
      chain.map(async (template) => {
        const [usageCount, activeUsageCount] = await Promise.all([
          this.prisma.task.count({ where: { templateId: template.id } }),
          this.prisma.task.count({ where: { templateId: template.id, status: { not: 'ENDED' } } }),
        ]);

        return {
          ...toTemplateDto(template),
          usageCount,
          activeUsageCount,
          isCurrent: template.id === currentTemplate?.id,
          isArchived: isArchivedTemplate(template),
        };
      }),
    );
  }

  async diffVersion(templateId: string, versionId: string): Promise<TemplateVersionDiff> {
    const { current, version } = await this.findVersionPairOrThrow(templateId, versionId);
    const allTemplates = await this.prisma.taskTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    const currentVersion = currentVersionFromChain(collectVersionChain(current, allTemplates)) ?? current;

    return buildTemplateVersionDiff(toTemplateDto(version).schema, toTemplateDto(currentVersion).schema);
  }

  async restoreVersion(
    templateId: string,
    versionId: string,
  ): Promise<RestoreTemplateVersionResult> {
    const { current, version } = await this.findVersionPairOrThrow(templateId, versionId);
    const allTemplates = await this.prisma.taskTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    const chain = collectVersionChain(current, allTemplates);
    const currentVersion = currentVersionFromChain(chain);

    if (!currentVersion || currentVersion.id === version.id) {
      throw new ConflictException({
        code: 'TEMPLATE_VERSION_RESTORE_UNAVAILABLE',
        message: '该版本已经是当前版本，无需恢复。',
      });
    }

    await this.assertTemplateChainUnlocked(chain, 'restore');

    const laterVersionIds = chain
      .filter((template) => template.version > version.version)
      .map((template) => template.id);
    const laterVersions = chain
      .filter((template) => laterVersionIds.includes(template.id) && !isArchivedTemplate(template))
      .sort(compareVersionAsc);
    const affectedActiveTasks = laterVersionIds.length > 0
      ? await this.prisma.task.findMany({
          where: { templateId: { in: laterVersionIds }, status: { not: 'ENDED' } },
        })
      : [];
    const restoredAt = new Date();
    const archivedVersions: TemplateDto[] = [];

    for (const laterVersion of laterVersions) {
      const archived = await this.prisma.taskTemplate.update({
        where: { id: laterVersion.id },
        data: {
          status: 'ARCHIVED',
          archivedAt: restoredAt,
        },
      });
      archivedVersions.push(toTemplateDto(archived));
    }

    const restoredTemplate = await this.prisma.taskTemplate.update({
      where: { id: version.id },
      data: {
        status: version.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED',
        archivedAt: null,
        restoredFromTemplateId: null,
      },
    });
    const warning = affectedActiveTasks.length > 0
      ? '恢复版本后，未完成任务仍会继续使用原模板版本；相关版本已归档但不会被删除。'
      : undefined;

    return {
      restoredTemplate: toTemplateDto(restoredTemplate),
      archivedVersions,
      affectedActiveTasks,
      message: '模板版本已恢复。',
      ...(warning ? { warning } : {}),
    };
  }

  private async findTemplateOrThrow(templateId: string): Promise<TemplateRecord> {
    const template = await this.prisma.taskTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: '模板不存在或已被删除。',
      });
    }

    return template;
  }

  private async findVersionPairOrThrow(
    templateId: string,
    versionId: string,
  ): Promise<{ current: TemplateRecord; version: TemplateRecord }> {
    const [current, version] = await Promise.all([
      this.findTemplateOrThrow(templateId),
      this.findTemplateOrThrow(versionId),
    ]);
    const allTemplates = await this.prisma.taskTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    const byId = templateMapById(allTemplates);

    if (templateRootId(current, byId) !== templateRootId(version, byId)) {
      throw new BadRequestException({
        code: 'TEMPLATE_VERSION_CHAIN_MISMATCH',
        message: '目标版本不属于同一模板版本链。',
      });
    }

    return { current, version };
  }

  private async assertTemplateChainUnlocked(
    templates: readonly TemplateRecord[],
    action: 'delete' | 'restore' | 'publish',
  ): Promise<void> {
    const templateIds = templates.map((template) => template.id);
    const activeTasks = await this.findActiveTemplateTasks(templateIds);

    if (activeTasks.length === 0) {
      return;
    }

    throw new ConflictException({
      code: 'TEMPLATE_IN_USE',
      message: action === 'delete'
        ? '该模板正在被未完成任务使用，暂时无法删除。'
        : action === 'restore'
          ? '该模板正在被未完成任务使用，暂时无法恢复历史版本。'
          : '该模板正在被未完成任务使用，暂时无法发布新版本。请先另存为新模板。',
    });
  }

  private async findActiveTemplateTasks(templateIds: readonly string[]): Promise<TemplateTaskUsageDto[]> {
    if (templateIds.length === 0) {
      return [];
    }

    return this.prisma.task.findMany({
      where: { templateId: { in: [...templateIds] }, status: { not: 'ENDED' } },
    });
  }

  private async toTemplateDtoWithUsage(
    template: TemplateRecord,
    allTemplates: readonly TemplateRecord[],
  ): Promise<TemplateDto> {
    const usageTemplates = template.status === 'DRAFT'
      ? [template]
      : collectVersionChain(template, allTemplates);
    const [usageCounts, activeTasks] = await Promise.all([
      Promise.all(
        usageTemplates.map((usageTemplate) =>
          this.prisma.task.count({ where: { templateId: usageTemplate.id } }),
        ),
      ),
      this.findActiveTemplateTasks(usageTemplates.map((usageTemplate) => usageTemplate.id)),
    ]);

    return {
      ...toTemplateDto(template),
      usageCount: usageCounts.reduce((total, count) => total + count, 0),
      activeUsageCount: activeTasks.length,
    };
  }
}

const templateMapById = (templates: readonly TemplateRecord[]): Map<string, TemplateRecord> => {
  return new Map(templates.map((template) => [template.id, template]));
};

const templateRootId = (
  template: TemplateRecord,
  templatesById?: ReadonlyMap<string, TemplateRecord>,
): string => {
  if (template.rootTemplateId) {
    return template.rootTemplateId;
  }

  if (!template.parentTemplateId) {
    return template.id;
  }

  const parent = templatesById?.get(template.parentTemplateId);

  return parent ? templateRootId(parent, templatesById) : template.parentTemplateId;
};

const collectVersionChain = (
  template: TemplateRecord,
  templates: readonly TemplateRecord[],
): TemplateRecord[] => {
  const byId = templateMapById(templates);
  const rootId = templateRootId(template, byId);

  return templates.filter((candidate) => templateRootId(candidate, byId) === rootId);
};

const currentVisibleTemplates = (templates: readonly TemplateRecord[]): TemplateRecord[] => {
  const draftTemplates: TemplateRecord[] = [];
  const publishedByRoot = new Map<string, TemplateRecord>();
  const byId = templateMapById(templates);

  for (const template of templates) {
    if (isArchivedTemplate(template)) {
      continue;
    }

    if (template.status === 'DRAFT') {
      draftTemplates.push(template);
      continue;
    }

    const rootId = templateRootId(template, byId);
    const current = publishedByRoot.get(rootId);

    if (!current || compareVersionDesc(template, current) < 0) {
      publishedByRoot.set(rootId, template);
    }
  }

  return [...draftTemplates, ...publishedByRoot.values()].sort(
    (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
  );
};

const currentVersionFromChain = (chain: readonly TemplateRecord[]): TemplateRecord | null => {
  const visibleVersions = chain.filter((template) => !isArchivedTemplate(template));
  const candidates = visibleVersions.length > 0 ? visibleVersions : chain;

  return [...candidates].sort(compareVersionDesc)[0] ?? null;
};

const compareVersionDesc = (left: TemplateRecord, right: TemplateRecord): number => {
  if (left.version !== right.version) {
    return right.version - left.version;
  }

  return right.updatedAt.getTime() - left.updatedAt.getTime();
};

const compareVersionAsc = (left: TemplateRecord, right: TemplateRecord): number => {
  if (left.version !== right.version) {
    return left.version - right.version;
  }

  return left.updatedAt.getTime() - right.updatedAt.getTime();
};

const isArchivedTemplate = (template: TemplateRecord): boolean => {
  return template.status === 'ARCHIVED' || template.archivedAt !== null;
};

const buildTemplateVersionDiff = (
  beforeSchema: LabelHubSchema,
  afterSchema: LabelHubSchema,
): TemplateVersionDiff => {
  const beforeFields = fieldMapByKey(flattenSchemaFields(beforeSchema.fields));
  const afterFields = fieldMapByKey(flattenSchemaFields(afterSchema.fields));
  const addedItems: TemplateVersionDiffItem[] = [];
  const removedItems: TemplateVersionDiffItem[] = [];
  const labelItems: TemplateVersionDiffItem[] = [];
  const typeItems: TemplateVersionDiffItem[] = [];
  const requiredItems: TemplateVersionDiffItem[] = [];
  const optionItems: TemplateVersionDiffItem[] = [];
  const displayItems: TemplateVersionDiffItem[] = [];
  const schemaItems: TemplateVersionDiffItem[] = [];
  const aiPromptItems: TemplateVersionDiffItem[] = [];

  for (const [fieldKey, afterField] of afterFields) {
    const beforeField = beforeFields.get(fieldKey);

    if (!beforeField) {
      addedItems.push({
        fieldKey,
        label: afterField.label,
        after: summarizeField(afterField),
        changeDescription: `新增字段 ${afterField.label}`,
      });
    }
  }

  for (const [fieldKey, beforeField] of beforeFields) {
    const afterField = afterFields.get(fieldKey);

    if (!afterField) {
      removedItems.push({
        fieldKey,
        label: beforeField.label,
        before: summarizeField(beforeField),
        changeDescription: `删除字段 ${beforeField.label}`,
      });
      continue;
    }

    if (beforeField.label !== afterField.label) {
      labelItems.push({
        fieldKey,
        label: afterField.label,
        before: beforeField.label,
        after: afterField.label,
        changeDescription: `字段标签由 ${beforeField.label} 调整为 ${afterField.label}`,
      });
    }

    if (beforeField.type !== afterField.type) {
      typeItems.push({
        fieldKey,
        label: afterField.label,
        before: beforeField.type,
        after: afterField.type,
        changeDescription: `字段类型由 ${beforeField.type} 调整为 ${afterField.type}`,
      });
    }

    const beforeRequired = isRequiredField(beforeField);
    const afterRequired = isRequiredField(afterField);

    if (beforeRequired !== afterRequired) {
      requiredItems.push({
        fieldKey,
        label: afterField.label,
        before: beforeRequired,
        after: afterRequired,
        changeDescription: afterRequired ? '字段变为必填' : '字段取消必填',
      });
    }

    if (stableSerialize(beforeField.options ?? []) !== stableSerialize(afterField.options ?? [])) {
      optionItems.push({
        fieldKey,
        label: afterField.label,
        before: beforeField.options ?? [],
        after: afterField.options ?? [],
        changeDescription: `字段 ${afterField.label} 的选项发生变化`,
      });
    }

    if (stableSerialize(showItemDisplaySnapshot(beforeField)) !== stableSerialize(showItemDisplaySnapshot(afterField))) {
      displayItems.push({
        fieldKey,
        label: afterField.label,
        before: showItemDisplaySnapshot(beforeField),
        after: showItemDisplaySnapshot(afterField),
        changeDescription: `字段 ${afterField.label} 的展示配置发生变化`,
      });
    }

    if (stableSerialize(beforeField.aiReview ?? null) !== stableSerialize(afterField.aiReview ?? null)) {
      aiPromptItems.push({
        fieldKey,
        label: afterField.label,
        before: beforeField.aiReview ?? null,
        after: afterField.aiReview ?? null,
        changeDescription: `字段 ${afterField.label} 的 AI Prompt 配置发生变化`,
      });
    }
  }

  if (beforeSchema.schemaVersion !== afterSchema.schemaVersion) {
    schemaItems.push({
      fieldKey: 'schemaVersion',
      before: beforeSchema.schemaVersion,
      after: afterSchema.schemaVersion,
      changeDescription: `Schema 版本由 ${beforeSchema.schemaVersion} 调整为 ${afterSchema.schemaVersion}`,
    });
  }

  if (stableSerialize(beforeSchema.aiReviewPrompt ?? null) !== stableSerialize(afterSchema.aiReviewPrompt ?? null)) {
    aiPromptItems.push({
      fieldKey: 'aiReviewPrompt',
      before: beforeSchema.aiReviewPrompt ?? null,
      after: afterSchema.aiReviewPrompt ?? null,
      changeDescription: '全局 AI Prompt 配置发生变化',
    });
  }

  const sections: TemplateVersionDiffSection[] = [
    createDiffSection('added', '新增字段', addedItems),
    createDiffSection('removed', '删除字段', removedItems),
    createDiffSection('changed', '字段标签变化', labelItems),
    createDiffSection('changed', '字段类型变化', typeItems),
    createDiffSection('changed', '必填校验变化', requiredItems),
    createDiffSection('changed', '选项变化', optionItems),
    createDiffSection('changed', '展示配置变化', displayItems),
    createDiffSection('changed', 'Schema 版本变化', schemaItems),
    createDiffSection('changed', 'AI Prompt 配置变化', aiPromptItems),
  ].filter((section) => section.items.length > 0);
  const changed = countChangedDiffEntities(sections);

  return {
    summary: {
      added: addedItems.length,
      removed: removedItems.length,
      changed,
    },
    sections,
  };
};

const createDiffSection = (
  type: TemplateVersionDiffSection['type'],
  title: string,
  items: TemplateVersionDiffItem[],
): TemplateVersionDiffSection => ({
  type,
  title,
  items,
});

const countChangedDiffEntities = (sections: readonly TemplateVersionDiffSection[]): number => {
  const changedEntityKeys = new Set<string>();

  for (const section of sections) {
    if (section.type !== 'changed' || section.title === 'Schema 版本变化') {
      continue;
    }

    for (const item of section.items) {
      changedEntityKeys.add(diffEntityKey(section, item));
    }
  }

  return changedEntityKeys.size;
};

const diffEntityKey = (
  section: TemplateVersionDiffSection,
  item: TemplateVersionDiffItem,
): string => {
  if (item.fieldKey === 'aiReviewPrompt') {
    return `schema:${item.fieldKey}`;
  }

  return `field:${item.fieldKey}`;
};

const flattenSchemaFields = (fields: readonly SchemaField[]): SchemaField[] => {
  return fields.flatMap((field) => [
    field,
    ...(field.fields ? flattenSchemaFields(field.fields) : []),
    ...(field.tabs?.flatMap((tab) => flattenSchemaFields(tab.fields)) ?? []),
  ]);
};

const fieldMapByKey = (fields: readonly SchemaField[]): Map<string, SchemaField> => {
  return new Map(fields.map((field) => [getSchemaFieldKey(field), field]));
};

const summarizeField = (field: SchemaField): Record<string, unknown> => ({
  key: field.key,
  fieldKey: getSchemaFieldKey(field),
  type: field.type,
  label: field.label,
});

const isRequiredField = (field: SchemaField): boolean => {
  return field.validation?.required ?? field.required ?? false;
};

const showItemDisplaySnapshot = (field: SchemaField): Record<string, unknown> | null => {
  if (field.type !== 'show_item') {
    return null;
  }

  return {
    sourceKey: field.sourceKey ?? null,
    sourceKeys: field.sourceKeys ?? [],
    displayConfig: field.displayConfig ?? null,
  };
};

const stableSerialize = (value: unknown): string => {
  return JSON.stringify(normalizeForStableSerialize(value));
};

const normalizeForStableSerialize = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeForStableSerialize);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, normalizeForStableSerialize(nestedValue)]),
  );
};

const createEmptySchema = (datasetKind: DatasetKind): LabelHubSchema => {
  return createLabelHubSchema({
    schemaVersion: 'draft',
    datasetKind,
    fields: [],
  });
};

const schemaFromProfile = (profile: OfficialTemplateProfile): LabelHubSchema => {
  const { schemas } = getRendererSampleSchemas();

  if (profile === 'qa_quality') {
    return schemas.qa_quality;
  }

  if (profile === 'preference_compare') {
    return schemas.preference_compare;
  }

  return schemas.title_cleanup;
};

const nameFromProfile = (profile: OfficialTemplateProfile): string => {
  const names: Record<OfficialTemplateProfile, string> = {
    qa_quality: '问答质量官方模板',
    preference_compare: '偏好对比官方模板',
    title_cleanup: '商品标题清洗 v3',
  };

  return names[profile];
};

const descriptionFromProfile = (profile: OfficialTemplateProfile): string => {
  const descriptions: Record<OfficialTemplateProfile, string> = {
    qa_quality: '包含媒体展示、评分字段和 AI 预评分参考。',
    preference_compare: '包含 A/B 并排展示、偏好选择和证据上传。',
    title_cleanup: '对齐图 2 的商品标题清洗 Designer 蓝本。',
  };

  return descriptions[profile];
};

const assertValidTemplateSchema = (schema: LabelHubSchema): void => {
  const validation = validateTemplateSchema(schema);

  if (validation.valid) {
    return;
  }

  throw new BadRequestException({
    code: 'INVALID_TEMPLATE_SCHEMA',
    message: '模板 Schema 不合法，请修正后再保存。',
    details: validation.errors satisfies TemplateSchemaValidationError[],
  });
};

const toTemplateDto = (template: TemplateRecord): TemplateDto => {
  return {
    ...template,
    schema: template.schema as LabelHubSchema,
  };
};

const emptyCompatibilityReport = (): TemplateCompatibilityReport => ({
  addedFieldKeys: [],
  removedFieldKeys: [],
  changedFieldTypes: [],
  compatible: true,
  riskMessages: [],
});

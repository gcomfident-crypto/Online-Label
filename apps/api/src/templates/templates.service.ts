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
  getRendererSampleSchemas,
  validateTemplateSchema,
  type DatasetKind,
  type LabelHubSchema,
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
  createdById: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TemplateDto = Omit<TemplateRecord, 'schema'> & {
  schema: LabelHubSchema;
};

export type PublishTemplateResult = {
  template: TemplateDto;
  compatibilityReport: TemplateCompatibilityReport;
};

export type DeleteTemplateResult = {
  id: string;
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
    count: (args: { where: { templateId: string } }) => Promise<number>;
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
    const schema = input.schema ?? createEmptySchema(input.datasetKind);
    const template = await this.prisma.taskTemplate.create({
      data: {
        name: input.name || DEFAULT_TEMPLATE_NAME,
        description: input.description ?? null,
        datasetKind: input.datasetKind,
        schemaVersion: schema.schemaVersion,
        schema,
        status: 'DRAFT',
        version: 0,
        parentTemplateId: null,
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

    return templates.map(toTemplateDto);
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
    assertValidTemplateSchema(currentDto.schema);

    const version = current.version + 1;
    const schemaVersion = input.versionName ?? `r${version}`;
    const nextSchema = {
      ...currentDto.schema,
      schemaVersion,
    };
    const compatibilityReport = current.parentTemplateId
      ? buildTemplateCompatibilityReport(currentDto.schema, nextSchema)
      : emptyCompatibilityReport();
    const template = await this.prisma.taskTemplate.update({
      where: { id: templateId },
      data: {
        status: 'PUBLISHED',
        version,
        schemaVersion,
        schema: nextSchema,
        publishedAt: new Date(),
      },
    });

    return {
      template: toTemplateDto(template),
      compatibilityReport,
    };
  }

  async deleteTemplate(templateId: string): Promise<DeleteTemplateResult> {
    await this.findTemplateOrThrow(templateId);
    const usageCount = await this.prisma.task.count({ where: { templateId } });

    if (usageCount > 0) {
      throw new ConflictException({
        code: 'TEMPLATE_IN_USE',
        message: '该模板已被任务引用，暂时无法删除。',
      });
    }

    const deletedTemplate = await this.prisma.taskTemplate.delete({
      where: { id: templateId },
    });

    return { id: deletedTemplate.id };
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
}

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

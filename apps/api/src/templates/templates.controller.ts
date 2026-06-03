import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { DATASET_KINDS, type DatasetKind, type LabelHubSchema } from '@labelhub/shared';

import type {
  CreateTemplateFromProfileDto,
  CreateTemplateFromProfileInput,
  OfficialTemplateProfile,
} from './dto/create-template-from-profile.dto.ts';
import type { CreateTemplateDto, CreateTemplateInput } from './dto/create-template.dto.ts';
import type { PublishTemplateDto, PublishTemplateInput } from './dto/publish-template.dto.ts';
import type { UpdateTemplateDto, UpdateTemplateInput } from './dto/update-template.dto.ts';
import {
  TemplatesService,
  type DeleteTemplateResult,
  type PublishTemplateResult,
  type TemplateDto,
  type RestoreTemplateVersionResult,
  type TemplateVersionDiff,
  type TemplateVersionDto,
} from './templates.service.ts';

@Controller('templates')
export class TemplatesController {
  constructor(
    @Inject(TemplatesService)
    private readonly templatesService: Pick<
      TemplatesService,
      | 'create'
      | 'list'
      | 'get'
      | 'update'
      | 'publish'
      | 'createFromProfile'
      | 'deleteTemplate'
      | 'listVersions'
      | 'diffVersion'
      | 'restoreVersion'
    >,
  ) {}

  @Post()
  create(@Body() body: CreateTemplateDto): Promise<TemplateDto> {
    return this.templatesService.create(normalizeCreateTemplateBody(body));
  }

  @Post('from-profile')
  createFromProfile(@Body() body: CreateTemplateFromProfileDto): Promise<TemplateDto> {
    return this.templatesService.createFromProfile(normalizeProfileBody(body));
  }

  @Get()
  list(): Promise<TemplateDto[]> {
    return this.templatesService.list();
  }

  @Get(':id/versions')
  listVersions(@Param('id') id: string): Promise<TemplateVersionDto[]> {
    return this.templatesService.listVersions(id);
  }

  @Get(':id/versions/:versionId/diff')
  diffVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ): Promise<TemplateVersionDiff> {
    return this.templatesService.diffVersion(id, versionId);
  }

  @Post(':id/versions/:versionId/restore')
  restoreVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ): Promise<RestoreTemplateVersionResult> {
    return this.templatesService.restoreVersion(id, versionId);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<TemplateDto> {
    return this.templatesService.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateTemplateDto): Promise<TemplateDto> {
    return this.templatesService.update(id, normalizeUpdateTemplateBody(body));
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @Body() body: PublishTemplateDto): Promise<PublishTemplateResult> {
    return this.templatesService.publish(id, normalizePublishBody(body));
  }

  @Delete(':id')
  deleteTemplate(@Param('id') id: string): Promise<DeleteTemplateResult> {
    return this.templatesService.deleteTemplate(id);
  }
}

const normalizeCreateTemplateBody = (body: CreateTemplateDto): CreateTemplateInput => {
  return {
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : '未命名模板',
    description: typeof body.description === 'string' ? body.description : undefined,
    datasetKind: isDatasetKind(body.datasetKind) ? body.datasetKind : 'generic_json',
    schema: isLabelHubSchema(body.schema) ? body.schema : undefined,
    actorId: typeof body.actorId === 'string' ? body.actorId : undefined,
    parentTemplateId: typeof body.parentTemplateId === 'string' ? body.parentTemplateId : undefined,
  };
};

const normalizeUpdateTemplateBody = (body: UpdateTemplateDto): UpdateTemplateInput => {
  return {
    ...(typeof body.name === 'string' ? { name: body.name.trim() || '未命名模板' } : {}),
    ...(typeof body.description === 'string' ? { description: body.description } : {}),
    ...(body.description === null ? { description: null } : {}),
    ...(isLabelHubSchema(body.schema) ? { schema: body.schema } : {}),
  };
};

const normalizePublishBody = (body: PublishTemplateDto): PublishTemplateInput => {
  return {
    versionName: typeof body.versionName === 'string' ? body.versionName.trim() : undefined,
    actorId: typeof body.actorId === 'string' ? body.actorId : undefined,
  };
};

const normalizeProfileBody = (
  body: CreateTemplateFromProfileDto,
): CreateTemplateFromProfileInput => {
  return {
    profile: isOfficialTemplateProfile(body.profile) ? body.profile : 'qa_quality',
    actorId: typeof body.actorId === 'string' ? body.actorId : undefined,
  };
};

const isDatasetKind = (value: unknown): value is DatasetKind => {
  return typeof value === 'string' && DATASET_KINDS.includes(value as DatasetKind);
};

const isOfficialTemplateProfile = (value: unknown): value is OfficialTemplateProfile => {
  return value === 'qa_quality' || value === 'preference_compare' || value === 'title_cleanup';
};

const isLabelHubSchema = (value: unknown): value is LabelHubSchema => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.schemaVersion === 'string' &&
    isDatasetKind(candidate.datasetKind) &&
    Array.isArray(candidate.fields)
  );
};

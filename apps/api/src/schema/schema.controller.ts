import { BadRequestException, Body, Controller, Inject, Post } from '@nestjs/common';
import { DATASET_KINDS, type LabelHubSchema } from '@labelhub/shared';

import { SchemaService, type SchemaValidateResult } from './schema.service.ts';

type SchemaValidateBody = {
  schema?: unknown;
  answers?: unknown;
};

@Controller('schema')
export class SchemaController {
  constructor(
    @Inject(SchemaService)
    private readonly schemaService: SchemaService,
  ) {}

  @Post('validate')
  validate(@Body() body: SchemaValidateBody): SchemaValidateResult {
    if (!isLabelHubSchema(body.schema) || !isRecord(body.answers)) {
      throw new BadRequestException({
        code: 'INVALID_SCHEMA_VALIDATE_REQUEST',
        message: 'Schema 校验请求缺少有效 schema 或 answers。',
      });
    }

    return this.schemaService.validate(body.schema, body.answers);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLabelHubSchema(value: unknown): value is LabelHubSchema {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.schemaVersion === 'string' &&
    typeof value.datasetKind === 'string' &&
    DATASET_KINDS.includes(value.datasetKind as LabelHubSchema['datasetKind']) &&
    Array.isArray(value.fields)
  );
}

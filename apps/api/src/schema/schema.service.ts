import { Injectable } from '@nestjs/common';
import {
  applySchemaLinkage,
  validateSchemaAnswers,
  type LabelHubSchema,
  type SchemaValidationError,
} from '@labelhub/shared';

export type SchemaValidateResult = {
  valid: boolean;
  answers: Record<string, unknown>;
  errors: SchemaValidationError[];
};

@Injectable()
export class SchemaService {
  validate(
    schema: LabelHubSchema,
    answers: Record<string, unknown>,
  ): SchemaValidateResult {
    const linkageResult = applySchemaLinkage(schema, answers);
    const errors = validateSchemaAnswers(schema, linkageResult.normalizedAnswers, linkageResult);

    return {
      valid: errors.length === 0,
      answers: linkageResult.normalizedAnswers,
      errors,
    };
  }
}

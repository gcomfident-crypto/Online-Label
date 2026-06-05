import { Body, Controller, Inject, Post } from '@nestjs/common';
import type { AutoTemplateFieldClassificationResult } from '@labelhub/shared';

import { LlmService, type LlmAssistResult } from './llm.service.ts';

@Controller('llm')
export class LlmController {
  constructor(@Inject(LlmService) private readonly llmService: LlmService) {}

  @Post('assist')
  createAssist(@Body() body: unknown): Promise<LlmAssistResult> {
    return this.llmService.createAssist(body ?? {});
  }

  @Post('assist/mock')
  createMockAssist(@Body() body: unknown): LlmAssistResult {
    return this.llmService.createMockAssist(body ?? {});
  }

  @Post('template-fields/classify')
  classifyTemplateFields(@Body() body: unknown): Promise<AutoTemplateFieldClassificationResult> {
    return this.llmService.classifyTemplateFields(body ?? {});
  }
}

import { Body, Controller, Inject, Post } from '@nestjs/common';

import { LlmService, type LlmAssistMockResult } from './llm.service.ts';

@Controller('llm')
export class LlmController {
  constructor(@Inject(LlmService) private readonly llmService: LlmService) {}

  @Post('assist/mock')
  createMockAssist(@Body() body: unknown): LlmAssistMockResult {
    return this.llmService.createMockAssist(body ?? {});
  }
}

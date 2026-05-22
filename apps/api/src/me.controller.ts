import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';

import { createMockUser, parseMockToken, type MockUser } from './auth.controller.ts';

@Controller('me')
export class MeController {
  @Get()
  getMe(@Headers('authorization') authorization?: string): { user: MockUser } {
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const role = token ? parseMockToken(token) : null;

    if (!role) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: '请先登录后再访问当前用户信息。',
      });
    }

    return {
      user: createMockUser(role),
    };
  }
}

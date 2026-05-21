import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import {
  USER_ROLE,
  getRoleHomePath,
  isUserRole,
  type UserRole,
} from '@labelhub/shared';
import { randomUUID } from 'node:crypto';

type LoginBody = {
  account?: string;
  role?: string;
};

export type MockUser = {
  id: string;
  name: string;
  role: UserRole;
  homePath: string;
};

const ACCOUNT_ROLE_MAP: Record<string, UserRole> = {
  owner: USER_ROLE.OWNER,
  labeler: USER_ROLE.LABELER,
  ai_agent: USER_ROLE.AI_AGENT,
  agent: USER_ROLE.AI_AGENT,
  reviewer: USER_ROLE.REVIEWER,
};

const ROLE_NAMES: Record<UserRole, string> = {
  OWNER: '演示项目所有者',
  LABELER: '演示标注员',
  AI_AGENT: '演示 AI Agent',
  REVIEWER: '演示审核员',
};

@Controller('auth')
export class AuthController {
  @Post('login')
  login(@Body() body: LoginBody): { token: string; user: MockUser } {
    const role = resolveRole(body);

    if (!role) {
      throw new BadRequestException({
        code: 'INVALID_LOGIN',
        message: '演示账号不存在，请选择有效角色登录。',
      });
    }

    return {
      token: createMockToken(role),
      user: createMockUser(role),
    };
  }
}

export function createMockUser(role: UserRole): MockUser {
  return {
    id: `mock-${role.toLowerCase()}`,
    name: ROLE_NAMES[role],
    role,
    homePath: getRoleHomePath(role),
  };
}

export function parseMockToken(token: string): UserRole | null {
  const match = /^mock_([a-z_]+)_[a-z0-9]+$/.exec(token);
  if (!match) {
    return null;
  }

  const role = match[1]?.toUpperCase();
  return isUserRole(role) ? role : null;
}

function resolveRole(body: LoginBody): UserRole | null {
  if (isUserRole(body.role)) {
    return body.role;
  }

  const account = body.account?.trim().toLowerCase();
  return account ? ACCOUNT_ROLE_MAP[account] ?? null : null;
}

function createMockToken(role: UserRole): string {
  return `mock_${role.toLowerCase()}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

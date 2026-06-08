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
  password?: string;
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
  labeler1: USER_ROLE.LABELER,
  labeler2: USER_ROLE.LABELER,
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

const ACCOUNT_USERS: Record<string, Pick<MockUser, 'id' | 'name' | 'role'>> = {
  owner: { id: 'mock-owner', name: '张满', role: USER_ROLE.OWNER },
  labeler: { id: 'mock-labeler-li-lei', name: '李雷', role: USER_ROLE.LABELER },
  labeler1: { id: 'mock-labeler-li-lei', name: '李雷', role: USER_ROLE.LABELER },
  labeler2: { id: 'mock-labeler-han-mei-mei', name: '韩梅梅', role: USER_ROLE.LABELER },
  agent: { id: 'mock-ai_agent', name: '系统机审账号', role: USER_ROLE.AI_AGENT },
  ai_agent: { id: 'mock-ai_agent', name: '系统机审账号', role: USER_ROLE.AI_AGENT },
  reviewer: { id: 'mock-reviewer', name: '王芳', role: USER_ROLE.REVIEWER },
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

    if (!body.password || body.password !== '123456') {
      throw new BadRequestException({
        code: 'INVALID_PASSWORD',
        message: '密码错误，演示环境统一密码为 123456。',
      });
    }

    return {
      token: createMockToken(role),
      user: createMockUser(role, body.account),
    };
  }
}

export function createMockUser(role: UserRole, account?: string): MockUser {
  const accountUser = resolveAccountUser(account);
  if (accountUser?.role === role) {
    return {
      ...accountUser,
      homePath: getRoleHomePath(role),
    };
  }

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

  const account = body.account?.trim().toLowerCase().split('@')[0];
  return account ? ACCOUNT_ROLE_MAP[account] ?? null : null;
}

function createMockToken(role: UserRole): string {
  return `mock_${role.toLowerCase()}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function resolveAccountUser(account?: string): Pick<MockUser, 'id' | 'name' | 'role'> | null {
  const normalizedAccount = account?.trim().toLowerCase().split('@')[0];
  return normalizedAccount ? ACCOUNT_USERS[normalizedAccount] ?? null : null;
}

import { BadRequestException, Body, Controller, InternalServerErrorException, Post } from '@nestjs/common';
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
  zhangzexin: USER_ROLE.OWNER,
  wangyuyang: USER_ROLE.LABELER,
  houshikang: USER_ROLE.LABELER,
  agent: USER_ROLE.AI_AGENT,
  xinzezhang: USER_ROLE.REVIEWER,
};

const ROLE_NAMES: Record<UserRole, string> = {
  OWNER: '演示项目所有者',
  LABELER: '演示标注员',
  AI_AGENT: '演示 AI Agent',
  REVIEWER: '演示审核员',
};

const ACCOUNT_USERS: Record<string, Pick<MockUser, 'id' | 'name' | 'role'>> = {
  zhangzexin: { id: 'mock-owner', name: '张泽鑫', role: USER_ROLE.OWNER },
  wangyuyang: { id: 'mock-labeler-wang-yu-yang', name: '王昱阳', role: USER_ROLE.LABELER },
  houshikang: { id: 'mock-labeler-hou-shi-kang', name: '侯士康', role: USER_ROLE.LABELER },
  agent: { id: 'mock-ai_agent', name: '系统机审账号', role: USER_ROLE.AI_AGENT },
  xinzezhang: { id: 'mock-reviewer', name: '鑫泽张', role: USER_ROLE.REVIEWER },
};

const OWNER_PASSWORD_ENV = 'DEMO_OWNER_PASSWORD';

const ACCOUNT_PASSWORDS: Partial<Record<string, string>> = {
  wangyuyang: '1101101',
  houshikang: '1101101',
  agent: '1101101',
  xinzezhang: '1101101',
};

const ROLE_PASSWORDS: Partial<Record<UserRole, string>> = {
  LABELER: ACCOUNT_PASSWORDS.wangyuyang,
  AI_AGENT: ACCOUNT_PASSWORDS.agent,
  REVIEWER: ACCOUNT_PASSWORDS.xinzezhang,
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

    const expectedPassword = resolvePassword(body, role);

    if (!body.password || body.password !== expectedPassword) {
      throw new BadRequestException({
        code: 'INVALID_PASSWORD',
        message: '密码错误，请检查该演示账号对应的密码。',
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

function resolvePassword(body: LoginBody, role: UserRole): string {
  const account = body.account?.trim().toLowerCase().split('@')[0];

  if (account === 'zhangzexin' || role === USER_ROLE.OWNER) {
    return ownerPassword();
  }

  const password = account ? ACCOUNT_PASSWORDS[account] ?? ROLE_PASSWORDS[role] : ROLE_PASSWORDS[role];
  if (!password) {
    throw new BadRequestException({
      code: 'INVALID_LOGIN',
      message: '演示账号不存在，请选择有效角色登录。',
    });
  }

  return password;
}

function ownerPassword(): string {
  const password = process.env[OWNER_PASSWORD_ENV]?.trim();

  if (!password) {
    throw new InternalServerErrorException({
      code: 'OWNER_PASSWORD_NOT_CONFIGURED',
      message: `Owner 演示密码未配置，请在服务端环境变量 ${OWNER_PASSWORD_ENV} 中配置。`,
    });
  }

  return password;
}

function createMockToken(role: UserRole): string {
  return `mock_${role.toLowerCase()}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function resolveAccountUser(account?: string): Pick<MockUser, 'id' | 'name' | 'role'> | null {
  const normalizedAccount = account?.trim().toLowerCase().split('@')[0];
  return normalizedAccount ? ACCOUNT_USERS[normalizedAccount] ?? null : null;
}

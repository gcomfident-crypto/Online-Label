import { BadRequestException, Body, Controller, Inject, InternalServerErrorException, Post } from '@nestjs/common';
import {
  USER_ROLE,
  getRoleHomePath,
  isUserRole,
  type UserRole,
} from '@labelhub/shared';
import { randomUUID } from 'node:crypto';

import { PrismaService } from './prisma/prisma.service.ts';

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

const ACCOUNT_USERS: Record<string, Pick<MockUser, 'id' | 'name' | 'role'>> = {
  zhangzexin: { id: 'user_owner_zhang_man', name: '张泽鑫', role: USER_ROLE.OWNER },
  wangyuyang: { id: 'user_labeler_li_lei', name: '王昱阳', role: USER_ROLE.LABELER },
  houshikang: { id: 'user_labeler_han_mei_mei', name: '侯士康', role: USER_ROLE.LABELER },
  agent: { id: 'user_ai_agent_system', name: '系统机审账号', role: USER_ROLE.AI_AGENT },
  xinzezhang: { id: 'user_reviewer_wang_fang', name: '鑫泽张', role: USER_ROLE.REVIEWER },
};

const ROLE_USERS: Record<UserRole, Pick<MockUser, 'id' | 'name' | 'role'>> = {
  OWNER: ACCOUNT_USERS.zhangzexin,
  LABELER: ACCOUNT_USERS.wangyuyang,
  AI_AGENT: ACCOUNT_USERS.agent,
  REVIEWER: ACCOUNT_USERS.xinzezhang,
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
  async login(@Body() body: LoginBody): Promise<{ token: string; user: MockUser }> {
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

    const user = createMockUser(role, body.account);
    await this.ensureDemoUser(user);

    return {
      token: createMockToken(role),
      user,
    };
  }

  constructor(
    @Inject(PrismaService)
    private readonly prisma: Pick<PrismaService, 'user'>,
  ) {}

  private async ensureDemoUser(user: Pick<MockUser, 'id' | 'name' | 'role'>): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      update: {
        name: user.name,
        role: user.role,
      },
    });
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
    ...ROLE_USERS[role],
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

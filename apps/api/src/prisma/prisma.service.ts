import 'dotenv/config';

import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const DEFAULT_DATABASE_URL =
  'postgresql://labelhub:labelhub_password@localhost:5432/labelhub?schema=public';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg(resolveDatabaseUrl()),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

export function resolveDatabaseUrl(
  env: { DATABASE_URL?: string; NODE_ENV?: string } = process.env,
): string {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('生产环境缺少 DATABASE_URL，无法连接数据库。');
  }

  return DEFAULT_DATABASE_URL;
}

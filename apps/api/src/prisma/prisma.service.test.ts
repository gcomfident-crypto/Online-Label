import { describe, expect, it } from 'vitest';

import { resolveDatabaseUrl } from './prisma.service.ts';

describe('resolveDatabaseUrl', () => {
  it('uses the local development URL outside production when DATABASE_URL is missing', () => {
    expect(resolveDatabaseUrl({ NODE_ENV: 'development' })).toBe(
      'postgresql://labelhub:labelhub_password@localhost:5432/labelhub?schema=public',
    );
  });

  it('throws a simplified Chinese error in production when DATABASE_URL is missing', () => {
    expect(() => resolveDatabaseUrl({ NODE_ENV: 'production' })).toThrow(
      '生产环境缺少 DATABASE_URL，无法连接数据库。',
    );
  });

  it('uses DATABASE_URL in production when it is provided', () => {
    expect(
      resolveDatabaseUrl({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://labelhub:secret@db:5432/labelhub',
      }),
    ).toBe('postgresql://labelhub:secret@db:5432/labelhub');
  });
});

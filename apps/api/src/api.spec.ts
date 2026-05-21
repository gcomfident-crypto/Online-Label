import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { USER_ROLES, getRoleHomePath, type UserRole } from '@labelhub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './app.module.ts';

describe('LabelHub API shell', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns health in the unified response envelope', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toEqual({
      data: { status: 'ok' },
      requestId: expect.stringMatching(/^req_[a-z0-9]+$/),
    });
  });

  it.each(USER_ROLES)('logs in a %s demo user', async (role) => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ role })
      .expect(201);

    expect(response.body).toEqual({
      data: {
        token: expect.stringMatching(new RegExp(`^mock_${role.toLowerCase()}_[a-z0-9]+$`)),
        user: {
          id: `mock-${role.toLowerCase()}`,
          name: expect.any(String),
          role,
          homePath: getRoleHomePath(role),
        },
      },
      requestId: expect.stringMatching(/^req_[a-z0-9]+$/),
    });
  });

  it('logs in by demo account identifier', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ account: 'reviewer' })
      .expect(201);

    expect(response.body.data.user.role).toBe('REVIEWER');
    expect(response.body.data.user.homePath).toBe(getRoleHomePath('REVIEWER'));
  });

  it('returns a simplified Chinese error envelope for invalid login', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ role: 'ADMIN' })
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: 'INVALID_LOGIN',
        message: '演示账号不存在，请选择有效角色登录。',
      },
      requestId: expect.stringMatching(/^req_[a-z0-9]+$/),
    });
  });

  it('requires a mock bearer token for /me', async () => {
    const response = await request(app.getHttpServer()).get('/me').expect(401);

    expect(response.body).toEqual({
      error: {
        code: 'UNAUTHENTICATED',
        message: '请先登录后再访问当前用户信息。',
      },
      requestId: expect.stringMatching(/^req_[a-z0-9]+$/),
    });
  });

  it('returns the current mock user for /me', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ role: 'OWNER' satisfies UserRole })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${login.body.data.token}`)
      .expect(200);

    expect(response.body).toEqual({
      data: {
        user: login.body.data.user,
      },
      requestId: expect.stringMatching(/^req_[a-z0-9]+$/),
    });
  });
});

async function createTestApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

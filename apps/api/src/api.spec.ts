import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { USER_ROLES, getRoleHomePath, type UserRole } from '@labelhub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './app.module.ts';
import { resolveApiPort } from './main.ts';

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

  it('logs in the second labeler demo account', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ account: 'labeler2' })
      .expect(201);

    expect(response.body.data.user).toEqual({
      id: 'mock-labeler-han-mei-mei',
      name: '韩梅梅',
      role: 'LABELER',
      homePath: getRoleHomePath('LABELER'),
    });
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

  it('非对象请求体返回稳定参数错误', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(['OWNER'])
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: 'REQUEST_BODY_INVALID',
        message: '请求体必须是 JSON 对象。',
      },
      requestId: expect.stringMatching(/^req_[a-z0-9]+$/),
    });
  });

  it('does not expose English framework messages for unknown routes', async () => {
    const response = await request(app.getHttpServer()).get('/missing-route').expect(404);

    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: '请求的接口不存在。',
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

  it('按 qa_quality 返回稳定的 LLM 辅助 mock 建议', async () => {
    const response = await request(app.getHttpServer())
      .post('/llm/assist/mock')
      .send({
        datasetKind: 'qa_quality',
        rawData: {
          prompt: '请说明光合作用的主要过程。',
          model_answer: '光合作用会吸收二氧化碳并释放氧气。',
          reference: '应包含光能转化、二氧化碳和水生成有机物、释放氧气。',
        },
        answers: {
          relevance_score: '5',
          accuracy_score: '4',
        },
        targetFieldKey: 'structured_note',
      })
      .expect(201);

    expect(response.body).toEqual({
      data: {
        datasetKind: 'qa_quality',
        targetFieldKey: 'structured_note',
        summary: '建议补充关键依据，并复核准确性与完整性评分。',
        suggestion: {
          relevance_score_reference: 5,
          accuracy_score_reference: 4,
          format_score_reference: 4,
          safety_score_reference: 5,
          issue_tags: ['missing_info'],
          comment: '模型回答覆盖核心方向，但建议对照参考答案补充关键限定。',
        },
      },
      requestId: expect.stringMatching(/^req_[a-z0-9]+$/),
    });
  });

  it('按 preference_compare 返回稳定的 LLM 辅助 mock 建议', async () => {
    const response = await request(app.getHttpServer())
      .post('/llm/assist/mock')
      .send({
        datasetKind: 'preference_compare',
        rawData: {
          prompt: '请比较两个回答哪一个更适合作为客服回复。',
          response_a: '回答 A 已准确回应用户问题，但缺少后续操作建议。',
          response_b: '回答 B 先说明结论，再补充操作路径和注意事项。',
        },
        answers: {},
        targetFieldKey: 'structured_annotation',
      })
      .expect(201);

    expect(response.body.data).toEqual({
      datasetKind: 'preference_compare',
      targetFieldKey: 'structured_annotation',
      summary: '建议优先选择回答 B，并检查是否存在安全风险。',
      suggestion: {
        preferred: 'B',
        margin: 'clear',
        safety_flag: 'safe',
        dimensions: ['helpfulness', 'completeness', 'style'],
        rationale: '回答 B 结构更完整，包含结论、操作路径和注意事项。',
      },
    });
  });

  it('按 generic_json 的 cleaned_title 返回文本型 mock 建议', async () => {
    const response = await request(app.getHttpServer())
      .post('/llm/assist/mock')
      .send({
        datasetKind: 'generic_json',
        rawData: {
          raw_title: '【官方旗舰】轻量降噪蓝牙耳机 Pro Max - 黑色 现货',
        },
        answers: {},
        targetFieldKey: 'cleaned_title',
      })
      .expect(201);

    expect(response.body.data).toEqual({
      datasetKind: 'generic_json',
      targetFieldKey: 'cleaned_title',
      summary: '已生成清洗标题。',
      suggestion: '轻量降噪蓝牙耳机 Pro Max 黑色',
    });
  });

  it('非 generic_json 不使用 cleaned_title 文本 mock 分支', async () => {
    const response = await request(app.getHttpServer())
      .post('/llm/assist/mock')
      .send({
        datasetKind: 'qa_quality',
        rawData: {},
        answers: {},
        targetFieldKey: 'cleaned_title',
      })
      .expect(201);

    expect(response.body.data.summary).toBe('建议补充关键依据，并复核准确性与完整性评分。');
    expect(response.body.data.suggestion).toEqual(
      expect.objectContaining({ issue_tags: ['missing_info'] }),
    );
  });

  it('LLM 辅助 mock 拒绝无效数据集类型', async () => {
    const response = await request(app.getHttpServer())
      .post('/llm/assist/mock')
      .send({ datasetKind: 'unknown', targetFieldKey: 'note' })
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: 'INVALID_LLM_ASSIST_REQUEST',
        message: 'LLM 辅助请求缺少有效的数据集类型。',
      },
      requestId: expect.stringMatching(/^req_[a-z0-9]+$/),
    });
  });

  it('LLM 辅助 mock 拒绝缺少目标字段的请求', async () => {
    const response = await request(app.getHttpServer())
      .post('/llm/assist/mock')
      .send({ datasetKind: 'qa_quality' })
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: 'INVALID_LLM_ASSIST_REQUEST',
        message: 'LLM 辅助请求缺少目标字段。',
      },
      requestId: expect.stringMatching(/^req_[a-z0-9]+$/),
    });
  });

  it('LLM 字段分类接口未配置真实模型时拒绝返回 mock 结果', async () => {
    const originalProvider = process.env.LLM_PROVIDER;
    const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    const originalOpenAiKey = process.env.OPENAI_API_KEY;

    try {
      delete process.env.LLM_PROVIDER;
      delete process.env.DEEPSEEK_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const response = await request(app.getHttpServer())
        .post('/llm/template-fields/classify')
        .send({
          fileName: 'preference_compare.json',
          fields: [
            { sourceKey: 'id', samples: ['P0001'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
            { sourceKey: 'prompt', samples: ['题目'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
            { sourceKey: 'response_a', samples: ['回答 A'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
            { sourceKey: 'response_b', samples: ['回答 B'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
            { sourceKey: 'preferred', samples: ['A'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
            { sourceKey: 'annotator_note', samples: ['需要复核'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
          ],
          records: [
            {
              id: 'P0001',
              prompt: '题目',
              response_a: '回答 A',
              response_b: '回答 B',
              preferred: 'A',
              annotator_note: '需要复核',
            },
          ],
        })
        .expect(400);

      expect(response.body).toEqual({
        error: {
          code: 'LLM_FIELD_CLASSIFIER_REQUIRES_REAL_MODEL',
          message: '字段分类必须使用真实模型，请配置 DEEPSEEK_API_KEY、OPENAI_API_KEY 或 LLM_PROVIDER=deepseek/openai/custom。',
        },
        requestId: expect.stringMatching(/^req_[a-z0-9]+$/),
      });
    } finally {
      setOptionalEnv('LLM_PROVIDER', originalProvider);
      setOptionalEnv('DEEPSEEK_API_KEY', originalDeepSeekKey);
      setOptionalEnv('OPENAI_API_KEY', originalOpenAiKey);
    }
  });

  it('LLM 字段分类接口拒绝没有字段的请求', async () => {
    const response = await request(app.getHttpServer())
      .post('/llm/template-fields/classify')
      .send({ fileName: 'empty.json', fields: [] })
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: 'INVALID_TEMPLATE_FIELD_CLASSIFICATION_REQUEST',
        message: '字段分类请求缺少可解析字段。',
      },
      requestId: expect.stringMatching(/^req_[a-z0-9]+$/),
    });
  });

  it('通过 /schema/validate 复用 Schema 联动和校验运行时', async () => {
    const response = await request(app.getHttpServer())
      .post('/schema/validate')
      .send({
        schema: {
          schemaVersion: '1.0.0',
          datasetKind: 'generic_json',
          fields: [
            { key: 'status', type: 'text', label: '状态' },
            {
              key: 'score',
              type: 'text',
              label: '分数',
              validation: { pattern: '^\\d$' },
            },
          ],
          linkageRules: [
            {
              when: { fieldKey: 'status', operator: 'equals', value: 'approved' },
              action: 'setValue',
              targetFieldKey: 'score',
              value: 'bad',
            },
          ],
        },
        answers: { status: 'approved' },
      })
      .expect(201);

    expect(response.body).toEqual({
      data: {
        valid: false,
        answers: { status: 'approved', score: 'bad' },
        errors: [{ fieldKey: 'score', message: '分数格式不符合要求。' }],
      },
      requestId: expect.stringMatching(/^req_[a-z0-9]+$/),
    });
  });

  it('Schema 校验接口拒绝无效请求体', async () => {
    const response = await request(app.getHttpServer())
      .post('/schema/validate')
      .send({ schema: null, answers: [] })
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: 'INVALID_SCHEMA_VALIDATE_REQUEST',
        message: 'Schema 校验请求缺少有效 schema 或 answers。',
      },
      requestId: expect.stringMatching(/^req_[a-z0-9]+$/),
    });
  });
});

describe('API 启动配置', () => {
  it('默认使用与本地环境示例一致的 3000 端口', () => {
    expect(resolveApiPort({})).toBe(3000);
  });

  it('优先读取 API_PORT 并兼容 PORT', () => {
    expect(resolveApiPort({ API_PORT: '3100', PORT: '3200' })).toBe(3100);
    expect(resolveApiPort({ PORT: '3200' })).toBe(3200);
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

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

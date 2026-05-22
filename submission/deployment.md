# 提交版部署说明

完整部署文档见 `docs/deployment.md`。

## 本地启动

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres redis
pnpm exec prisma db push
pnpm exec prisma db seed
pnpm dev
```

访问：

- Web：`http://localhost:5173`
- API：`http://localhost:3000`

## 环境变量

必须配置：

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `LLM_PROVIDER=mock|deepseek`
- `LLM_MODEL`
- `DEEPSEEK_API_KEY`，仅 DeepSeek 模式需要，占位值不能替代真实运行密钥。

真实密钥只放在本机 `.env` 或云平台密钥管理中，不进入仓库。

## 云部署顺序

1. 准备 PostgreSQL。
2. 准备 Redis。
3. 部署 API，执行 Prisma 建表和 seed。
4. 部署 Worker，连接同一 Redis 和数据库。
5. 部署 Web，设置 `VITE_API_BASE_URL`。
6. 运行 `pnpm typecheck`、`pnpm test`、`pnpm test:e2e` 做发布前验收。

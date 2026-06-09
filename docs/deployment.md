# LabelHub 部署说明

本文说明本地 Docker Compose 依赖启动、应用启动顺序和云平台部署建议。文档只包含环境变量名和占位值，不包含真实密钥。

## 目录

- [运行组件](#运行组件)
- [本地依赖启动](#本地依赖启动)
- [环境变量](#环境变量)
- [云平台部署建议](#云平台部署建议)
- [登录、RBAC 与四端隔离](#登录rbac-与四端隔离)
- [AI 模式](#ai-模式)
- [演示账号](#演示账号)
- [发布检查](#发布检查)

## 运行组件

| 组件       | 路径或服务      | 职责                                                    |
| ---------- | --------------- | ------------------------------------------------------- |
| Web        | `apps/web`    | React Portal、动态表单 Renderer、Designer、四端路由守卫 |
| API        | `apps/api`    | 登录、RBAC、任务、导入、提交、审核、导出接口            |
| Worker     | `apps/worker` | AI 预审与导出任务处理入口                               |
| PostgreSQL | `postgres`    | Prisma 主数据库                                         |
| Redis      | `redis`       | 队列依赖服务                                            |

## 本地依赖启动

1. 复制环境变量：

```bash
cp .env.example .env
```

2. 启动 PostgreSQL 和 Redis：

```bash
docker compose up -d postgres redis
docker compose ps
```

3. 检查 Compose 配置：

```bash
docker compose config
```

4. 初始化数据库：

```bash
pnpm exec prisma db push
pnpm exec prisma db seed
```

当前仓库没有迁移目录，首次建表使用 `prisma db push`。正式环境如果采用迁移流程，应在补齐 `prisma/migrations/` 后使用 `pnpm exec prisma migrate deploy`。

5. 启动应用：

```bash
pnpm dev
```

应用启动后访问：

- [ ] Web：`http://localhost:5173`
- [ ] API：`http://localhost:3000`

## 环境变量

| 变量                    | 示例值                                                          | 说明                                    |
| ----------------------- | --------------------------------------------------------------- | --------------------------------------- |
| `NODE_ENV`            | `production`                                                  | 运行环境                                |
| `WEB_PORT`            | `5173`                                                        | Web 本地开发端口                        |
| `VITE_API_BASE_URL`   | `https://api.example.com`                                     | Web 调用 API 的基础地址                 |
| `API_PORT`            | `3000`                                                        | API 服务端口                            |
| `DATABASE_URL`        | `postgresql://user:password@host:5432/labelhub?schema=public` | PostgreSQL 连接串                       |
| `REDIS_URL`           | `redis://host:6379`                                           | Redis 连接串                            |
| `JWT_SECRET`          | `replace_with_strong_secret`                                  | 登录 token 签名占位配置                 |
| `BULLMQ_QUEUE_PREFIX` | `labelhub`                                                    | 队列名前缀                              |
| `STORAGE_EXPORTS_DIR` | `storage/exports`                                             | 导出文件目录                            |
| `LLM_PROVIDER`        | `deepseek`（或留空）                                         | AI provider；留空时尝试 DeepSeek，无 key 则预审失败 |
| `LLM_MODEL`           | `deepseek-chat`                                              | 模型名称                                |
| `DEEPSEEK_API_KEY`    | `replace_with_deepseek_api_key`                               | DeepSeek 密钥占位值，只允许写入私有环境 |

`docs/labelhub-plan/deepseek-api-example.py` 是本机参考示例，`docs/labelhub-plan/env` 是本机密钥文件，不能提交、复制、截图或公开。

## 云平台部署建议

云平台可按五个独立运行单元部署：PostgreSQL、Redis、API、Worker、Web。

推荐顺序：

1. 创建 PostgreSQL，记录私有网络连接串。
2. 创建 Redis，记录私有网络连接串。
3. 部署 API，配置 `DATABASE_URL`、`REDIS_URL`、`JWT_SECRET`、`LLM_PROVIDER` 等变量。
4. 在 API 发布阶段执行数据库命令：有迁移时执行 `pnpm exec prisma migrate deploy`，当前仓库可先执行 `pnpm exec prisma db push`。
5. 执行 `pnpm exec prisma db seed` 或 `pnpm demo:reset` 写入演示数据。
6. 部署 Worker，使用与 API 相同的 `DATABASE_URL`、`REDIS_URL`、`BULLMQ_QUEUE_PREFIX`、`LLM_PROVIDER`。
7. 部署 Web，构建时配置 `VITE_API_BASE_URL` 指向 API 公网地址。

示例启动命令：

```bash
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm --filter @labelhub/api typecheck
pnpm --filter @labelhub/web typecheck
pnpm --filter @labelhub/worker typecheck
```

开发模式启动：

```bash
pnpm --filter @labelhub/api dev
pnpm --filter @labelhub/worker dev
pnpm --filter @labelhub/web dev
```

生产环境可由平台分别运行 API、Worker 和 Web 构建产物。系统级依赖如 Docker、Node.js、数据库和 Redis 由用户或云平台预装，仓库不负责静默安装。

## 登录、RBAC 与四端隔离

- 所有用户先进入 `/login`。
- Owner 只能访问 `/owner/*`，包括任务管理、模板 Designer、数据导入、AI 规则和导出中心。
- Labeler 只能访问 `/labeler/*`，包括任务广场、标注台和我的数据。
- AI Agent 只能访问 `/agent/*`，包括 AI 自动预审队列。
- Reviewer 只能访问 `/reviewer/*`，包括人工复审、终审、Diff 和审计时间线。
- 前端有路由守卫，API 层仍以角色和资源权限校验为准，不能依赖前端隐藏入口来保证安全。

## AI 模式

真实 DeepSeek 调用：

```text
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
DEEPSEEK_API_KEY=your_real_api_key
```

> ⚠️ 真实 key 只能写入本机 `.env`、云平台密钥管理或运行环境变量，不得写入代码、文档、测试快照、日志或提交记录。

## 演示账号

> 所有演示账号统一密码：`1101101`

| 账号 | 姓名 | 角色 | 默认首页 |
| --- | --- | --- | --- |
| `zhangzexin` | 张泽鑫 | Owner | `/owner/tasks` |
| `wangyuyang` | 王昱阳 | Labeler | `/labeler/market` |
| `houshikang` | 侯士康 | Labeler | `/labeler/market` |
| `agent` | 系统机审 | AI Agent | `/agent/dashboard` |
| `xinzezhang` | 鑫泽张 | Reviewer | `/reviewer/reviews` |

## 发布检查

发布前至少执行：

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
docker compose config
```

需要确认的业务验收：

- `pnpm demo:reset` 后存在 `qa_quality` 30 条和 `preference_compare` 12 条。
- 四端路由隔离正常：未登录跳转 `/login`，错误角色访问显示无权限。
- 三级审核链路保持 `AI 自动预审 -> 人工复审 -> 终审`。
- 导出中心只导出 `FINAL_APPROVED` 数据。
- 页面文案、错误提示和提交材料均使用简体中文。

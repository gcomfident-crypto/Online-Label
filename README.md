# LabelHub

LabelHub 是一个面向 AI 数据标注与审核的全栈演示平台。系统围绕统一登录、四端独立 Portal、动态模板配置、任务领取与提交、可选 AI 自动预审、人工复审和结果导出构建，默认使用稳定的 mock AI，便于本地验收和答辩演示。

## 核心能力

- 统一登录入口：`/login`，按角色进入独立工作区。
- 四端隔离：Owner `/owner/*`、Labeler `/labeler/*`、AI Agent `/agent/*`、Reviewer `/reviewer/*`。
- 动态模板：Owner 使用 Designer 生成 Schema，支持文件自动解析模板、ShowItem 表格展示、字段说明、必填标识、选项拖拽排序、字段联动、校验规则、分组容器和多 Tab 容器。
- 数据导入：支持 `qa_quality`、`preference_compare` 和 `generic_json` 数据，覆盖 JSON、JSONL、CSV、Excel 和 zip 导入。
- 任务流转：Owner 创建任务，Labeler 在任务广场领取并在工作台批量提交；已领取任务不再显示在任务广场。
- 审核链路：任务可选择是否启用 AI 预审；启用后进入 AI Agent 队列，未启用时直接进入人工复审。Reviewer 使用真实审核接口处理任务级审核队列，完成后同步任务、标注和导出状态。
- 工程化 Agent：保留 `MockLlmProvider` 与 DeepSeek 兼容 provider，失败重试、人工兜底、幂等键和审计日志均有覆盖。
- 统一后台 UI：侧边栏、顶部栏、表格空状态、toast、确认弹窗、图标资源和响应式布局保持一致。

## 技术栈

- Monorepo：pnpm workspace
- 前端：React、TypeScript、Vite、React Router、Zustand
- 后端：NestJS、TypeScript、Prisma
- 数据库：PostgreSQL
- 队列：Redis、BullMQ 协议结构
- Worker：`apps/worker`
- 测试：Vitest、Supertest、Playwright
- 导入导出：ExcelJS、JSZip

## 目录结构

```text
apps/
  web/       # React Web，四端 Portal 和动态表单
  api/       # NestJS API，RBAC、状态机、事务和导出接口
  worker/    # AI 预审与导出 Worker
packages/
  shared/    # 角色、状态机、Schema、DatasetProfile 等共享协议
prisma/
  schema.prisma
  seed.ts
docs/
  api/openapi.yaml
  architecture.md
  deployment.md
  demo-data.md
  demo-script.md
  labelhub-plan/README.md
submission/
  README.md
```

## 本地启动

前置条件：Node.js、pnpm、Docker、Git 已安装。系统级依赖由用户或云平台预装，仓库不会自动安装 Docker、brew、sudo 工具或全局 npm 包。

1. 安装依赖：

```bash
pnpm install
```

2. 准备环境变量：

```bash
cp .env.example .env
```

默认 `LLM_PROVIDER=mock`，不需要真实模型密钥。启用 DeepSeek 时只在本机 `.env` 写入 `DEEPSEEK_API_KEY`，不要提交真实 key。

3. 启动 PostgreSQL 和 Redis：

```bash
docker compose up -d postgres redis
docker compose ps
```

4. 创建数据库结构并写入演示数据：

```bash
pnpm exec prisma db push
pnpm exec prisma db seed
```

当前仓库没有 `prisma/migrations/` 目录，所以从零建表使用 `prisma db push`。如果后续补齐迁移目录，可改用 `pnpm exec prisma migrate deploy`。

5. 需要重置演示数据时运行：

```bash
pnpm demo:reset
```

该脚本会清空演示表并重建 4 个角色用户。官方模板和官方任务已经移除，模板、任务、题目、提交、审核记录和导出记录默认保持为空，便于从页面完整创建并验证真实流程。

6. 启动 Web、API、Worker：

```bash
pnpm --filter @labelhub/api dev
pnpm --filter @labelhub/web dev -- --port 5175
pnpm --filter @labelhub/worker dev
```

默认地址：

- Web：`http://localhost:5175`
- API：`http://localhost:3000`
- PostgreSQL：`localhost:5432`
- Redis：`localhost:6379`

## 演示账号

登录页直接选择演示账号，无需密码：

| 角色 | API role | 默认首页 |
| --- | --- | --- |
| Owner | `OWNER` | `/owner/tasks` |
| Labeler | `LABELER` | `/labeler/market` |
| AI Agent | `AI_AGENT` | `/agent/ai-review` |
| Reviewer | `REVIEWER` | `/reviewer/reviews` |

API 登录也可使用：

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"role":"OWNER"}'
```

## 官方数据说明

仓库不提交官方 `datasets.zip` 或解压后的原始数据。演示 seed 使用相同字段结构生成可重复数据：

- `qa_quality`：`id`、`prompt`、`model_answer`、`expected_dimensions`，可附带 `media_type`、`media_url`、`content_markdown`。
- `preference_compare`：`id`、`prompt`、`response_a`、`response_b`，可附带 `preferred`、`margin`、`dimensions`、`safety_flag`、`annotator_note`。
- zip 导入会忽略 `__MACOSX/`、`.DS_Store`、`._*`、`.~*.xlsx`。
- Excel 中 `tags`、`expected_dimensions`、`dimensions` 使用 ` | ` 拆分为数组，`safety_flag` 的 `是/否` 会归一化为布尔值。

## 常用命令

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm e2e
pnpm exec prisma db seed
pnpm demo:reset
docker compose config
```

## 文档索引

- 部署说明：[docs/deployment.md](docs/deployment.md)
- 架构说明：[docs/architecture.md](docs/architecture.md)
- API 文档：[docs/api/openapi.yaml](docs/api/openapi.yaml)
- 官方数据说明：[docs/demo-data.md](docs/demo-data.md)
- 演示脚本：[docs/demo-script.md](docs/demo-script.md)
- 开发计划：[docs/labelhub-plan/README.md](docs/labelhub-plan/README.md)
- 提交材料：[submission/README.md](submission/README.md)

## 安全约束

不要提交 `.env`、`env`、`docs/labelhub-plan/env`、真实 API Key、官方 `datasets.zip`、解压后的官方数据、`node_modules/`、构建产物、覆盖率报告、Playwright 报告或临时导出文件。

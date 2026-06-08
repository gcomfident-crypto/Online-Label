<p align="center">
  <img src="./apps/web/src/assets/LabelHub_logo_closer_transparent.png" alt="LabelHub" width="840" />
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.0.0-blue.svg?cacheSeconds=2592000" />
  <img alt="Workspace" src="https://img.shields.io/badge/workspace-pnpm-0f766e.svg" />
  <img alt="Web" src="https://img.shields.io/badge/web-React%20%2B%20Vite-306DF7.svg" />
  <img alt="API" src="https://img.shields.io/badge/api-NestJS%20%2B%20Prisma-EA2845.svg" />
</p>

<p align="center">
  面向 AI 数据标注、自动预审、人工复审与结果导出的全栈演示平台。
</p>

## 概览

LabelHub 围绕任务负责人、标注员、AI Agent 和人工审核员四类角色设计，覆盖从模板配置、题目导入、任务发布、标注提交、AI 自动预审、人工复审到数据导出的完整闭环。项目默认使用稳定的 mock LLM，适合本地验收、产品原型演示和答辩场景；需要真实模型时可切换 DeepSeek 兼容 provider。

## 核心能力

- 统一登录入口：`/login`，按角色进入独立 Portal。
- 四端工作区：Owner `/owner/*`、Labeler `/labeler/*`、AI Agent `/agent/*`、Reviewer `/reviewer/*`。
- 动态模板配置：支持文件自动解析模板、ShowItem 表格展示、题目展示字段、字段说明、必填标识、选项拖拽排序、字段联动、校验规则、分组容器和多 Tab 布局。
- LLM 辅助标注：单行输入、多行文本、标签选择可配置 `LLM提示`，Labeler 可直接生成建议答案，Owner 可在配置页测试触发链路。
- AI 自动预审：按任务配置审核 Prompt、评分维度和结构化输出，标注提交后可进入 AI Agent 队列。
- 人工审核：Reviewer 使用真实接口聚合待审任务，支持任务级详情、题目切换、审核统计、审计时间线和通过/打回/修订。
- 数据导入导出：支持 JSON、JSONL、CSV、XLSX 和 zip 导入；导出中心展示可导出批次。
- 企业级后台 UI：统一侧边栏、顶部栏、表格、空状态、toast、确认弹窗、抽屉和响应式布局。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| Monorepo | pnpm workspace |
| Web | React 19、TypeScript、Vite、React Router、Zustand、dnd-kit |
| API | NestJS、TypeScript、Prisma、Supertest |
| Worker | TypeScript、AI 预审与导出任务入口 |
| 数据库 | PostgreSQL |
| 队列 | Redis、BullMQ 协议结构 |
| 编辑器 | CKEditor 5、jsoneditor |
| 测试 | Vitest、Testing Library、Playwright |
| 文件处理 | ExcelJS、JSZip |

## 目录结构

```text
apps/
  web/       # React Web，四端 Portal、模板配置、动态表单和审核页面
  api/       # NestJS API，认证、任务、模板、提交、审核和导出接口
  worker/    # AI 预审与导出 Worker
packages/
  shared/    # Schema、状态机、Prompt 编译、角色与共享协议
prisma/
  schema.prisma
  seed.ts
  demo-reset.ts
docs/
  architecture.md
  deployment.md
  demo-data.md
  demo-script.md
submission/
  README.md
```

## 快速开始

前置条件：Node.js、pnpm、Docker 和 Git 已安装。

1. 安装依赖：

```bash
pnpm install
```

2. 准备本地环境变量：

```bash
cp .env.example .env
```

默认会在检测到可用 `DEEPSEEK_API_KEY` 时调用 DeepSeek 做字段分类；没有真实模型密钥时回退到 `mock`。需要强制演示模式时，在本机 `.env` 设置 `LLM_PROVIDER=mock`；不要提交真实 key。

3. 启动 PostgreSQL 和 Redis：

```bash
docker compose up -d postgres redis
docker compose ps
```

4. 创建数据库结构并写入演示账号：

```bash
pnpm exec prisma db push
pnpm exec prisma db seed
```

5. 启动 API、Web 和 Worker：

```bash
pnpm --filter @labelhub/api dev
pnpm --filter @labelhub/web dev -- --port 5175
pnpm --filter @labelhub/worker dev
```

默认地址：

| 服务 | 地址 |
| --- | --- |
| Web | `http://localhost:5175` |
| API | `http://localhost:3000` |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |

## 演示账号

登录页可直接选择演示账号，无需密码。

| 账号 | 角色 | API role | 默认首页 |
| --- | --- | --- | --- |
| `owner` | 任务负责人 | `OWNER` | `/owner/tasks` |
| `labeler` / `labeler1` | 标注员李雷 | `LABELER` | `/labeler/market` |
| `labeler2` | 标注员韩梅梅 | `LABELER` | `/labeler/market` |
| `agent` / `ai_agent` | AI Agent | `AI_AGENT` | `/agent/ai-review` |
| `reviewer` | 人工审核员 | `REVIEWER` | `/reviewer/reviews` |

API 登录示例：

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"role":"OWNER"}'
```

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

## 数据与模板

- 官方 `datasets.zip` 和解压后的原始数据不提交到仓库。
- 演示 seed 会重建四类角色用户，默认不写入官方模板和官方任务。
- 支持 `qa_quality`、`preference_compare` 和 `generic_json` 数据结构。
- zip 导入会忽略 `__MACOSX/`、`.DS_Store`、`._*`、`.~*.xlsx`。
- Excel 中 `tags`、`expected_dimensions`、`dimensions` 使用 ` | ` 拆分为数组，`safety_flag` 的 `是/否` 会归一化为布尔值。

## 文档索引

- 架构说明：[docs/architecture.md](docs/architecture.md)
- 部署说明：[docs/deployment.md](docs/deployment.md)
- 演示数据：[docs/demo-data.md](docs/demo-data.md)
- 演示脚本：[docs/demo-script.md](docs/demo-script.md)
- 提交材料：[submission/README.md](submission/README.md)

## 安全约束

不要提交 `.env`、真实 API Key、官方 `datasets.zip`、解压后的官方数据、`node_modules/`、构建产物、覆盖率报告、Playwright 报告或临时导出文件。

***

_This README was generated with ❤️ by [readme-md-generator](https://github.com/kefranabg/readme-md-generator) and then tailored for LabelHub._

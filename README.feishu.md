# LabelHub

> 面向 AI 数据标注、自动预审、人工复审与结果导出的全栈演示平台。

---

## 概览

LabelHub 围绕**任务负责人、标注员、AI Agent、人工审核员**四类角色设计，覆盖从模板配置、题目导入、任务发布、标注提交、AI 自动预审、人工复审到数据导出的完整闭环。

默认使用稳定的 mock LLM，适合本地验收、产品原型演示和答辩场景；需要真实模型时可切换 DeepSeek。

---

## 核心能力

- **统一登录入口**：`/login`，按角色进入独立 Portal
- **四端工作区**：Owner `/owner/*`、Labeler `/labeler/*`、AI Agent `/agent/*`、Reviewer `/reviewer/*`
- **动态模板配置**：文件自动解析模板、ShowItem 表格展示、字段联动、校验规则、分组容器和多 Tab 布局
- **LLM 辅助标注**：单行/多行文本、标签选择可配置 LLM 提示，一键生成建议答案
- **AI 自动预审**：按任务配置审核 Prompt 和评分维度，提交后自动进入 AI 队列
- **人工审核**：聚合待审任务，支持任务级详情、题目切换、审计时间线和通过/打回/修订
- **数据导入导出**：支持 JSON、JSONL、CSV、XLSX 和 zip；导出中心展示可导出批次
- **企业级后台 UI**：统一侧边栏、顶部栏、表格、Toast、确认弹窗、抽屉和响应式布局

---

## 技术栈

| 层级 | 技术 |
|------|------|
| Monorepo | pnpm workspace |
| Web | React 19、TypeScript、Vite、React Router、Zustand、dnd-kit |
| API | NestJS、TypeScript、Prisma、Supertest |
| Worker | TypeScript，AI 预审与导出任务入口 |
| 数据库 | PostgreSQL |
| 队列 | Redis、BullMQ |
| 编辑器 | CKEditor 5、jsoneditor |
| 测试 | Vitest、Testing Library、Playwright |
| 文件处理 | ExcelJS、JSZip |

---

## 目录结构

```
apps/
  web/       React Web，四端 Portal、模板配置、动态表单和审核页面
  api/       NestJS API，认证、任务、模板、提交、审核和导出接口
  worker/    AI 预审与导出 Worker
packages/
  shared/    Schema、状态机、Prompt 编译、角色与共享协议
prisma/
  schema.prisma
  seed.ts
  demo-reset.ts
docs/
  architecture.md
  deployment.md
  demo-data.md
  demo-script.md
```

---

## 快速开始

**前置条件**：Node.js、pnpm、Docker、Git

**1. 安装依赖**

```bash
pnpm install
```

**2. 配置环境变量**

```bash
cp .env.example .env
```

默认使用 mock LLM。需要真实模型时设置 `LLM_PROVIDER=deepseek` 并配置 `DEEPSEEK_API_KEY`。

**3. 启动 PostgreSQL 和 Redis**

```bash
docker compose up -d postgres redis
```

**4. 初始化数据库**

```bash
pnpm exec prisma db push
pnpm exec prisma db seed
```

**5. 启动服务**

```bash
pnpm --filter @labelhub/api dev
pnpm --filter @labelhub/web dev -- --port 5175
pnpm --filter @labelhub/worker dev
```

**服务地址**

| 服务 | 地址 |
|------|------|
| Web | http://localhost:5175 |
| API | http://localhost:3000 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

---

## 演示账号

统一密码：**`123456`**

| 账号 | 姓名 | 角色 | 首页 |
|------|------|------|------|
| `zhangman` | 张满 | Owner 任务负责人 | /owner/tasks |
| `lilei` | 李雷 | Labeler 标注员 | /labeler/market |
| `hanmeimei` | 韩梅梅 | Labeler 标注员 | /labeler/market |
| `agent` | 系统机审账号 | AI Agent 质检 | /agent/dashboard |
| `wangfang` | 王芳 | Reviewer 审核员 | /reviewer/reviews |

**API 登录**

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"account":"zhangman","password":"123456"}'
```

---

## 常用命令

```bash
pnpm typecheck      # 类型检查
pnpm test           # 单元测试
pnpm test:e2e       # E2E 测试
pnpm demo:reset     # 重置演示数据
```

---

## 数据与模板

- 官方 `datasets.zip` 不提交到仓库
- 支持 `qa_quality`、`preference_compare`、`generic_json` 三种数据结构
- zip 导入自动忽略 `__MACOSX/`、`.DS_Store` 等系统文件
- Excel 中管道符 `|` 拆分为数组，`是/否` 归一化为布尔值

---

## 文档索引

- [架构说明](docs/architecture.md)
- [部署说明](docs/deployment.md)
- [演示数据](docs/demo-data.md)
- [演示脚本](docs/demo-script.md)

---

## 安全约束

禁止提交：`.env`、真实 API Key、官方数据集、`node_modules/`、构建产物、覆盖率报告。

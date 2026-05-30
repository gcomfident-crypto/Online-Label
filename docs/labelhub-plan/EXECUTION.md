# LabelHub 执行总控

这份文档把 `README.md` 和 `batches/` 中的开发计划收敛成可连续执行的工程工单。执行者应按本文顺序复制 `prompts/` 下的单个 Batch prompt 给 AI 编程助手，每次只执行一个 Batch，验收通过后再进入下一批。

## 1. 最终交付目标

完整 PDF 版目标是交付一个可在 Web 端使用的 LabelHub：

- Owner 能创建任务、绑定官方模板、导入官方 `datasets.zip` 中的 JSON/JSONL/Excel 数据、发布任务、配置 AI 规则、导出结果。
- Labeler 能在任务广场领取任务，在标注台按动态 Schema 作答、自动保存草稿、提交、查看打回意见并二次提交。
- AI Agent 能用 BullMQ 异步处理 AI 自动预审，默认使用 `MockLlmProvider`，并保留真实模型 provider 接口。
- Reviewer 能查看 AI 评语、执行人工复审、终审、打回、直接修订、批量操作、查看第 1 / 2 轮 Diff 和审计时间线。
- 系统必须提供统一登录入口 `/login`，登录后按 `OWNER`、`LABELER`、`AI_AGENT`、`REVIEWER` 跳转到四个独立 Portal。
- 最终能运行 `pnpm dev` 启动 Web/API/Worker，并在浏览器完成官方数据闭环。

## 2. 锁定技术选型

后续执行不得再重新选择技术栈，统一使用：

- Monorepo：`pnpm workspace`
- 前端：React + TypeScript + Vite + Ant Design + dnd-kit + Zustand + React Router
- 后端：NestJS + TypeScript + Prisma
- 数据库：PostgreSQL
- 队列：Redis + BullMQ
- Worker：独立 `apps/worker`
- Excel：ExcelJS
- Zip：JSZip
- 测试：Vitest + Supertest + Playwright
- AI：`MockLlmProvider` 默认启用，真实 provider 使用统一 `LlmProvider` 接口

## 3. 固定目录契约

执行过程中保持以下目录边界：

```text
apps/
  web/       # React Web
  api/       # NestJS API
  worker/    # BullMQ Worker
packages/
  shared/    # 类型、Schema、状态机、DatasetProfile
prisma/
  schema.prisma
  seed.ts
docs/
  labelhub-plan/
  api/
submission/
```

核心规则：

- `packages/shared` 不依赖 `apps/*`。
- `apps/web` 只能通过 API 和 shared 类型访问业务能力。
- `apps/api` 负责权限、状态机校验、数据库事务、入队。
- `apps/worker` 负责 AI 预审和导出文件生成。
- 所有状态迁移必须写 `audit_logs`。

## 3.1 统一登录、RBAC 与四端隔离规则

后续执行者必须把多角色隔离当作硬性架构契约：

- 统一登录页固定为 `/login`。
- 角色枚举固定为 `OWNER`、`LABELER`、`AI_AGENT`、`REVIEWER`。
- 登录后按角色重定向到 `/owner/*`、`/labeler/*`、`/agent/*`、`/reviewer/*`。
- 四个 Portal 必须使用独立 Layout、独立导航、独立路由守卫和独立页面目录。
- 未登录访问任一 Portal 必须跳转登录页；错误角色访问其他 Portal 必须跳转无权限页或登录页。
- API 层必须基于 RBAC 校验角色和资源权限，前端路由守卫不能替代后端权限校验。
- 禁止用顶部角色切换、查询参数伪造角色或单一 Layout 模拟企业级隔离。

## 3.2 中文与 i18n 治理规则

后续执行者必须统一语言规范：

- 全站 UI 文案、API 用户可见错误消息、空状态、按钮、表格列、状态标签、通知提示统一使用简体中文。
- UI 文案必须进入 `zh-CN` 文案资源或同等集中管理机制，禁止新增硬编码英文用户文案。
- 代码注释必须使用简体中文；组件名、类型名、协议名可保留英文技术标识，例如 `ShowItem`、`LLMAssist`、`function_calling`、`FINAL_APPROVED`。
- Git Commit 信息必须使用中文任务摘要。
- Batch 11 必须加入中文文案扫描或等价检查，确保核心页面不出现未治理的英文用户文案。

## 3.3 Git 版本管理规则

后续执行者必须把 git 当作硬性验收条件，而不是最后补救动作。

开始任何 Batch 前必须执行：

```bash
git remote -v
git status --short
git branch --show-current
```

规则：

- `git remote -v` 必须存在 `origin`；如果没有远程仓库，立即停止并提示用户先创建仓库并配置 `origin`。
- 禁止在 `main` 直接开发；统一使用 `codex/labelhub-fullstack`。
- 如果分支不存在，从当前最新代码创建：`git switch -c codex/labelhub-fullstack`。
- 如果分支已存在，切换过去：`git switch codex/labelhub-fullstack`。
- 每完成一个小任务提交点，并且本小块相关测试通过后，必须立即 commit 并 push。
- 第一次推送使用：`git push -u origin codex/labelhub-fullstack`。
- 后续推送使用：`git push`。
- `git push` 失败、认证失败、远程不存在或分支保护阻止推送时，必须停止并报告，不能继续堆代码。

每个小任务提交点的固定命令：

```bash
git status --short
git add <only files changed for this small task>
git commit -m "<type>(labelhub): <中文任务摘要>"
git push
```

提交信息示例：

```bash
git commit -m "feat(labelhub): 新增任务发布抽屉组件"
git commit -m "fix(labelhub): 修复终审打回状态流转"
git commit -m "docs(labelhub): 补充四端路由隔离说明"
```

提交粒度：

- Batch 0：workspace 配置、Web 壳、API 壳、Worker 壳、Shared 壳、测试配置分别提交。
- Batch 1：shared 类型、Prisma schema、状态机、seed、基础组件分别提交。
- 后续 Batch：每个 API 模块、前端页面组、Worker processor、测试/E2E、文档更新分别提交。
- 禁止整个 Batch 做完才第一次提交。

禁止提交：

- `.env`
- `env`
- `docs/labelhub-plan/env`
- 真实 API Key、token、密码
- 官方 `datasets.zip`
- 解压后的官方原始数据
- `.DS_Store`
- `node_modules/`
- `dist/`, `build/`, `coverage/`, `playwright-report/`
- `storage/exports/`、临时上传文件、临时导出文件

## 3.4 工具与依赖处理规则

后续执行者可以自动安装项目内依赖，但不能静默安装系统级工具。

开始任何 Batch 前必须检查：

```bash
command -v node
command -v pnpm
command -v git
command -v docker
```

规则：

- 项目内依赖可以自动安装，例如 `pnpm install`、`pnpm add <package>`、`pnpm add -D <package>`；如果依赖变化，必须提交 `package.json` 和 `pnpm-lock.yaml`。
- 如果 `pnpm` 不存在但 `corepack` 存在，可以运行 `corepack enable` 并继续使用 corepack 管理 pnpm。
- 如果缺少 `node`、`git`、`docker` 或 `corepack` 也不可用，必须停止并报告需要用户安装，不能静默安装。
- Redis 和 PostgreSQL 优先通过 `docker compose` 启动，不要求本机安装 `postgres`、`psql`、`redis-server` 或 `redis-cli`。
- Playwright 缺少浏览器时，可以自动运行 `pnpm exec playwright install chromium`，只安装 Chromium。
- 需要运行 `brew`、`sudo`、`npm install -g`、系统级安装命令或修改系统环境变量时，必须停止并请求用户确认。
- 网络下载失败最多重试一次；仍失败则停止并报告 blocker。
- 不能为了绕过缺失工具而删减测试、跳过验收或改用未在计划中批准的技术栈。

## 3.5 DeepSeek API 参考与密钥文件

当前计划目录下有两个与真实模型调用有关的本机参考文件：

- `docs/labelhub-plan/deepseek-api-example.py`：DeepSeek API 调用示例程序，使用 OpenAI SDK 兼容接口、`base_url="https://api.deepseek.com"`、环境变量 `DEEPSEEK_API_KEY`。
- `docs/labelhub-plan/env`：本机环境变量文件，包含真实 `DEEPSEEK_API_KEY`，只能在本机开发验证时读取。

使用规则：

- 可以参考 `deepseek-api-example.py` 实现 TypeScript 版 `DeepSeekProvider` 或 `OpenAiLikeProvider` 配置。
- 真实实现仍必须保留 `MockLlmProvider` 作为默认 provider，保证没有真实 API Key 也能演示。
- 真实 provider 只能通过环境变量读取 `DEEPSEEK_API_KEY`，不得把 key 写进代码、文档、测试快照、日志或提交记录。
- 禁止打印、复制、总结或暴露 `docs/labelhub-plan/env` 中的具体 key 值。
- 禁止提交 `docs/labelhub-plan/env`；只允许提交 `.env.example`，并在其中写占位值。
- Batch 12 的部署文档只能说明变量名和配置方式，不能包含真实 key。

## 4. 官方数据验收契约

官方第一版测试数据来自 `/Users/zzx/Downloads/datasets.zip`，不得提交原始 zip 到仓库。

必须支持：

- `qa_quality`
  - JSON、JSONL、Excel 各 30 条
  - Excel sheet：`标注题目`
  - 必需字段：`id`, `prompt`, `model_answer`, `expected_dimensions`
  - 媒体字段：`media_type`, `media_url`, `content_markdown`
- `preference_compare`
  - JSON、JSONL、Excel 各 12 条
  - Excel sheet：`偏好对比`
  - 必需字段：`id`, `prompt`, `response_a`, `response_b`
  - 参考字段：`preferred`, `margin`, `dimensions`, `safety_flag`, `annotator_note`

导入必须忽略：

- `__MACOSX/`
- `.DS_Store`
- `._*`
- `.~*.xlsx`

Excel 归一化必须固定：

- `tags`, `expected_dimensions`, `dimensions` 按 ` | ` 拆为数组。
- `safety_flag` 的 `是/否` 转为 `true/false`。

## 5. 执行顺序

推荐执行顺序如下。不要一次性执行全部 prompt。

| 顺序 | Prompt | 目标 |
| --- | --- | --- |
| 1 | `prompts/batch-00.md` | 建立 monorepo、统一登录和四端 Portal 基础能力 |
| 2 | `prompts/batch-01.md` | 建立 shared 类型、Prisma 模型、RBAC、状态机 |
| 3 | `prompts/batch-03.md` | 先实现 Renderer，确定动态表单运行时 |
| 4 | `prompts/batch-04.md` | 实现 Designer，产出可运行 Schema |
| 5 | `prompts/batch-02.md` | 实现 Owner 任务管理和任务状态机 |
| 6 | `prompts/batch-05.md` | 实现官方数据导入、任务广场、领取 |
| 7 | `prompts/batch-06.md` | 实现标注台、草稿、提交 |
| 8 | `prompts/batch-07.md` | 实现 AI Agent 自动预审端 |
| 9 | `prompts/batch-08.md` | 实现人工复审台，复审通过进入终审待办 |
| 10 | `prompts/batch-09.md` | 实现多轮 Diff 和终审 |
| 11 | `prompts/batch-10.md` | 实现只导出终审通过数据的导出中心 |
| 12 | `prompts/batch-11.md` | 做稳定性、体验、E2E、截图对齐和中文治理加固 |
| 13 | `prompts/batch-12.md` | 做部署、文档、答辩材料 |

## 6. 每批通用完成标准

每个 Batch 结束前必须完成：

- 相关页面能在 Web 端打开。
- 相关 API 能通过测试或手动请求跑通。
- 数据库状态符合该 Batch 的状态机要求。
- `pnpm typecheck` 通过。
- `pnpm test` 通过。
- 如果涉及 Web 交互，补充或更新 Playwright 用例。
- 不留下空白占位文字、未接线按钮、假成功提示。
- 页面必须符合对应截图的布局结构、组件术语和简体中文文案要求。
- 涉及登录、路由或权限时，必须验证未登录跳转、错误角色拦截和后端 RBAC 校验。
- 本 Batch 内每个小任务提交点都已经 commit 并 push。
- 更新本 Batch prompt 中要求的验收说明。

## 7. 最终演示闭环

最终答辩演示以两条官方数据线为主：

1. `qa_quality`：统一登录 -> Owner 创建问答质量任务 -> 选择官方模板 -> 导入 30 条 -> 发布 -> Labeler 标注 -> AI Agent mock 自动预审 -> Reviewer 复审打回 -> Labeler 修改 -> Reviewer 终审通过 -> Owner 导出。
2. `preference_compare`：统一登录 -> Owner 创建偏好对比任务 -> 选择 A/B 模板 -> 导入 12 条 -> Labeler 提交偏好结论 -> AI Agent mock 预判 -> Reviewer 复审 / 终审 -> Owner 导出字段映射。

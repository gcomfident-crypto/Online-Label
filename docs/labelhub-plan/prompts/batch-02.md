# Batch 02 可执行 Prompt：任务管理 MVP

请在当前仓库实现 Batch 2。先阅读 `docs/labelhub-plan/EXECUTION.md` 和 `docs/labelhub-plan/batches/batch-02-task-management-mvp.md`，然后只实现本批范围。

## 全局修订约束

- 必须遵守统一登录 `/login`、RBAC 和四端独立 Portal：Owner 端 `/owner/*`、Labeler 端 `/labeler/*`、AI Agent 端 `/agent/*`、Reviewer 端 `/reviewer/*`。
- 所有用户可见 UI 文案、API 用户可见错误消息、代码注释和 Git Commit 摘要必须使用简体中文。
- 实现或验收图 1-5 对应页面前，必须先阅读 `docs/labelhub-plan/visual-reference.md`，并按需打开对应本地 PNG；页面结构、组件命名和交互必须对齐 5 张截图，截图中的「商品标题清洗 v3」作为 UI/UX 设计基准和演示蓝本。
- 默认审核链路必须是 `AI 自动预审 -> 人工复审 -> 终审`；人工复审通过只能进入终审待办，导出只读取 `FINAL_APPROVED` 数据。

## Git 版本管理要求

- 开始前运行 `git remote -v`、`git status --short`、`git branch --show-current`。
- 必须确认存在 `origin`；如果没有，停止并提示用户先配置远程仓库。
- 必须在 `codex/labelhub-fullstack` 开发，禁止在 `main` 直接开发。
- 每完成一个小任务提交点并通过相关测试后，运行 `git status --short`，只 stage 本小任务文件，执行 `git commit -m "<type>(labelhub): <中文任务摘要>"`，然后 `git push`，提交摘要必须是简体中文。
- 首次推送分支时使用 `git push -u origin codex/labelhub-fullstack`。
- 不提交 `.env`、`env`、`docs/labelhub-plan/env`、真实密钥、官方 `datasets.zip`、解压数据、`.DS_Store`、`node_modules/`、构建产物、覆盖率报告和临时导出文件。

本 Batch 小任务提交点：任务 API 与 DTO、任务状态机审计接线、Owner 任务列表、发布抽屉、任务管理测试。

## 工具与依赖处理要求

- 开始前运行 `command -v node`、`command -v pnpm`、`command -v git`、`command -v docker`。
- 项目内依赖可以自动安装，例如 `pnpm install`、`pnpm add <package>`、`pnpm add -D <package>`；依赖变化必须提交 `package.json` 和 `pnpm-lock.yaml`。
- 如果缺少 `node`、`git`、`docker` 或 `pnpm`，先按 `EXECUTION.md` 的工具规则处理，不能静默安装系统级工具。
- Redis/PostgreSQL 优先通过 `docker compose` 启动，不要求本机安装数据库服务。
- Playwright 缺浏览器时，可以自动运行 `pnpm exec playwright install chromium`，只安装 Chromium。
- 需要 `brew`、`sudo`、`npm install -g`、系统级安装或修改系统环境时，必须停止并请求用户确认。
- 网络下载失败最多重试一次；仍失败则停止并报告 blocker。

## 当前目标

Owner 能创建、编辑、发布、暂停、恢复、结束任务，所有状态迁移通过 shared 状态机并写审计日志。
页面必须对齐图 1 Owner 任务发布：左侧分组导航、统计卡片、搜索筛选、任务表格和右侧发布抽屉。

## 禁止范围

- 不实现数据导入。
- 不实现模板 Designer。
- 不实现 Labeler 领取。
- 不绕过状态机直接改状态。

## 必须创建或修改

- `apps/api/src/tasks/tasks.module.ts`
- `apps/api/src/tasks/tasks.controller.ts`
- `apps/api/src/tasks/tasks.service.ts`
- `apps/api/src/tasks/dto/*.ts`
- `apps/api/src/tasks/*.spec.ts`
- `apps/web/src/pages/owner/TaskListPage.tsx`
- `apps/web/src/pages/owner/TaskDetailPage.tsx`
- `apps/web/src/pages/owner/components/TaskTable.tsx`
- `apps/web/src/pages/owner/components/PublishDrawer.tsx`
- `apps/web/src/api/tasks.ts`

## 必须实现 API

- `POST /tasks`
- `GET /tasks`
- `GET /tasks/:id`
- `PATCH /tasks/:id`
- `PATCH /tasks/:id/status`

## 必须实现前端

- 任务列表：搜索、状态筛选、统计卡片。
- 创建任务弹窗或抽屉。
- 发布前抽屉：标题、配额、截止时间、分发策略、绑定模板占位、AI 预审开关占位。
- 发布抽屉必须包含：任务标题、标签、奖励规则、配额、截止时间、分发策略、关联模板、启用 AI 预审。
- 状态展示必须使用简体中文：草稿、进行中、已暂停、已结束。
- 分发策略展示必须使用简体中文：先到先得、指派、配额抢单。
- 状态操作：
  - `DRAFT -> PUBLISHED`
  - `PUBLISHED -> PAUSED`
  - `PAUSED -> PUBLISHED`
  - `PUBLISHED/PAUSED -> ENDED`

## 必须测试

- 创建任务成功。
- 草稿能发布。
- 进行中能暂停。
- 暂停能恢复。
- 已结束任务不能恢复。
- 每次状态变化写入 `audit_logs`。
- 图 1 截图级验收：任务表格、统计卡片、搜索筛选和右侧发布抽屉结构完整，按钮和状态标签均为简体中文。

## 完成后运行

```bash
pnpm typecheck
pnpm test
pnpm dev
```

## 验收标准

- Owner 能在 Web 页面完成任务创建和状态流转。
- 数据库 `tasks.status` 和 `audit_logs` 正确变化。
- 非法状态迁移返回明确错误。
- 每个小任务提交点都已 commit 并 push 到 `codex/labelhub-fullstack`。

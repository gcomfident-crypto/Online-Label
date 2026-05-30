# Batch 00 可执行 Prompt：项目初始化

请在当前仓库实现 Batch 0。先阅读 `docs/labelhub-plan/README.md`、`docs/labelhub-plan/EXECUTION.md` 和 `docs/labelhub-plan/batches/batch-00-project-initialization.md`，然后只实现本批范围。

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

本 Batch 小任务提交点：workspace 配置、Shared 包壳、API 壳、Worker 壳、Web 壳、测试与脚本配置。

## 工具与依赖处理要求

- 开始前运行 `command -v node`、`command -v pnpm`、`command -v git`、`command -v docker`。
- 项目内依赖可以自动安装，例如 `pnpm install`、`pnpm add <package>`、`pnpm add -D <package>`；依赖变化必须提交 `package.json` 和 `pnpm-lock.yaml`。
- 如果 `pnpm` 不存在但 `corepack` 存在，可以运行 `corepack enable` 并使用 corepack 管理 pnpm。
- 如果缺少 `node`、`git`、`docker` 或 `corepack` 也不可用，停止并报告需要用户安装，不能静默安装。
- Redis/PostgreSQL 优先通过 `docker compose` 启动，不要求本机安装数据库服务。
- Playwright 缺浏览器时，可以自动运行 `pnpm exec playwright install chromium`，只安装 Chromium。
- 需要 `brew`、`sudo`、`npm install -g`、系统级安装或修改系统环境时，必须停止并请求用户确认。
- 网络下载失败最多重试一次；仍失败则停止并报告 blocker。

## 当前目标

创建可启动的 LabelHub monorepo 骨架，让 Web、API、Worker、Shared 都能独立编译并共享类型，同时建立统一登录页、四端 Portal 壳和路由守卫基础。

## 禁止范围

- 不实现任务、模板、导入、标注、AI、审核、导出业务。
- 不接真实身份源或单点登录；但必须实现 `/login` mock 登录、退出登录、会话状态、四端路由守卫和无权限页。
- 不使用顶部角色切换、查询参数或单一 Layout 模拟企业级多角色隔离。
- 不提交官方 `datasets.zip` 或解压后的数据文件。

## 必须创建或修改

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `.env.example`
- `.gitignore`
- `docker-compose.yml`
- `apps/web/package.json`
- `apps/web/index.html`
- `apps/web/src/main.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/router.tsx`
- `apps/web/src/pages/LoginPage.tsx`
- `apps/web/src/pages/ForbiddenPage.tsx`
- `apps/web/src/layouts/OwnerPortalLayout.tsx`
- `apps/web/src/layouts/LabelerPortalLayout.tsx`
- `apps/web/src/layouts/AgentPortalLayout.tsx`
- `apps/web/src/layouts/ReviewerPortalLayout.tsx`
- `apps/web/src/guards/RequireAuth.tsx`
- `apps/web/src/guards/RequireRole.tsx`
- `apps/web/src/pages/*`
- `apps/api/package.json`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/auth.controller.ts`
- `apps/api/src/health.controller.ts`
- `apps/api/src/me.controller.ts`
- `apps/worker/package.json`
- `apps/worker/src/main.ts`
- `packages/shared/package.json`
- `packages/shared/src/index.ts`
- `prisma/schema.prisma`

## 必须实现

- Web 路由：
  - `/login`
  - `/owner/tasks`
  - `/owner/templates`
  - `/labeler/market`
  - `/reviewer/reviews`
  - `/agent/ai-review`
- Web 路由守卫：
  - 未登录访问任一 Portal 跳转 `/login`
  - 错误角色访问其他 Portal 跳转无权限页
  - 四端 Layout 与导航互相隔离
- API：
  - `GET /health` 返回 `{ "status": "ok" }`
  - `POST /auth/login` 返回 mock session 和 `OWNER|LABELER|AI_AGENT|REVIEWER`
  - `GET /me` 返回当前 mock 用户
- Worker：
  - 启动后打印 `LabelHub worker ready`
- 根脚本：
  - `pnpm dev`
  - `pnpm dev:web`
  - `pnpm dev:api`
  - `pnpm dev:worker`
  - `pnpm typecheck`
  - `pnpm test`
- 根 `.gitignore` 必须忽略：
  - `.env`
  - `env`
  - `docs/labelhub-plan/env`
  - `node_modules/`
  - `dist/`
  - `build/`
  - `coverage/`
  - `playwright-report/`
  - `storage/exports/`

## 必须测试

- Web smoke test：`/login` 能渲染四个演示账号入口，四端 Portal Layout 各自渲染对应导航。
- 路由守卫 test：未登录访问 `/owner/tasks` 跳转 `/login`，Labeler 访问 `/owner/tasks` 被拦截。
- API test：`GET /health`、`POST /auth/login` 和 `GET /me` 返回正确结构。
- Shared test：能从 `packages/shared` 导入版本常量或基础类型。

## 完成后运行

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```

## 验收标准

- 浏览器能打开 `/login`，四个角色登录后进入独立 Portal。
- 不能通过全局角色切换绕过登录或访问其他 Portal。
- API `GET /health` 返回 ok。
- Worker 能启动。
- `pnpm typecheck` 和 `pnpm test` 通过。
- 每个小任务提交点都已 commit 并 push 到 `codex/labelhub-fullstack`。

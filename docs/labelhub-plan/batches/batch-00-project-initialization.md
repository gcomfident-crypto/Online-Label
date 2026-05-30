# Batch 0: Project Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 初始化 LabelHub monorepo，让前端、后端、worker、shared 包可以独立启动，并建立统一登录页、四端 Portal 壳和路由守卫基础。

**Architecture:** 建立 `apps/web`、`apps/api`、`apps/worker`、`packages/shared`。本阶段不实现业务，但必须打通开发体验、环境变量、统一登录、RBAC mock 会话、四个独立 Portal Layout、健康检查和 shared 角色类型。

**Tech Stack:** pnpm workspace, TypeScript, React + Vite, Node.js API, Prisma, BullMQ, Redis config, Vitest.

---

## 全局修订约束

- 必须遵守统一登录 `/login`、RBAC 和四端独立 Portal：Owner 端 `/owner/*`、Labeler 端 `/labeler/*`、AI Agent 端 `/agent/*`、Reviewer 端 `/reviewer/*`。
- 所有用户可见 UI 文案、API 用户可见错误消息、代码注释和 Git Commit 摘要必须使用简体中文。
- 实现或验收图 1-5 对应页面前，必须先阅读 `docs/labelhub-plan/visual-reference.md`，并按需打开对应本地 PNG；页面结构、组件命名和交互必须对齐 5 张截图，截图中的「商品标题清洗 v3」作为 UI/UX 设计基准和演示蓝本。
- 默认审核链路必须是 `AI 自动预审 -> 人工复审 -> 终审`；人工复审通过只能进入终审待办，导出只读取 `FINAL_APPROVED` 数据。

## 目标

创建可继续迭代的项目骨架，保证 AI 编程助手后续每个 Batch 都有明确的目录、命令、统一登录入口和四端路由边界。

## 实现范围

- 初始化 monorepo。
- 初始化 React 前端壳。
- 初始化 API 服务壳。
- 初始化 Worker 服务壳。
- 初始化 shared 包。
- 初始化统一登录页、无权限页、四端 Portal Layout 和路由守卫。
- 准备 `.env.example`、基础 README、统一脚本。

## 前端任务

- 创建 `apps/web`。
- 创建基础路由：
  - `/login`
  - `/owner/tasks`
  - `/owner/templates`
  - `/labeler/market`
  - `/reviewer/reviews`
  - `/agent/ai-review`
- 创建 `LoginPage`，作为唯一登录入口，登录后按角色重定向到对应 Portal。
- 创建四个独立 Layout：`OwnerPortalLayout`、`LabelerPortalLayout`、`AgentPortalLayout`、`ReviewerPortalLayout`，导航内容互相隔离。
- 创建 `RequireAuth` 和 `RequireRole` 路由守卫；未登录访问任一 Portal 跳转 `/login`，错误角色访问跳转无权限页。
- 创建会话 store：`useSessionStore`，保存 mock 登录态、当前用户、角色和退出登录动作；禁止使用顶部角色切换模拟登录。

## 后端任务

- 创建 `apps/api`。
- 增加 `GET /health`。
- 增加 `POST /auth/login`，使用演示账号返回 mock session。
- 增加 `GET /me`，基于 mock session 返回当前用户和角色。
- 配置统一响应格式：

```json
{
  "data": {},
  "requestId": "req_xxx"
}
```

- 配置统一错误格式：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request"
  },
  "requestId": "req_xxx"
}
```

## Agent / 队列任务

- 创建 `apps/worker`。
- 创建空队列消费者入口：
  - `ai-review`
  - `export`
- 本阶段只打印启动日志，不消费真实任务。

## 数据库设计

本阶段只验证 Prisma 能连接数据库，不要求完整业务表。可以先定义 `User`：

- `id`
- `name`
- `role`
- `createdAt`
- `updatedAt`

## API 设计

```text
GET /health
POST /auth/login
GET /me
```

## 推荐文件结构

```text
apps/web/src/
  app/App.tsx
  app/router.tsx
  app/guards/RequireAuth.tsx
  app/guards/RequireRole.tsx
  layouts/OwnerPortalLayout.tsx
  layouts/LabelerPortalLayout.tsx
  layouts/AgentPortalLayout.tsx
  layouts/ReviewerPortalLayout.tsx
  pages/LoginPage.tsx
  pages/ForbiddenPage.tsx
  stores/sessionStore.ts

apps/api/src/
  main.ts
  routes/auth.ts
  routes/health.ts
  routes/me.ts

apps/worker/src/
  main.ts
  queues.ts

packages/shared/src/
  index.ts
  roles.ts
```

## 关键实现思路

- 本阶段使用 mock 登录和本地 session，不接真实身份源，但必须保留统一登录、退出登录、路由守卫和 RBAC 类型边界。
- 所有角色枚举放到 `packages/shared/src/roles.ts`。
- 后端和前端都从 shared 包引用角色类型。
- `AI_AGENT` 是独立角色，不再使用旧的系统路由前缀或旧展示名。
- API、Web、Worker 分别有独立 `dev` 命令。

## 测试点

- `pnpm install` 成功。
- `pnpm dev:web` 能打开前端。
- `pnpm dev:api` 后 `GET /health` 返回 `ok`。
- `pnpm dev:worker` 能看到 Worker 启动日志。
- 未登录访问 `/owner/tasks`、`/labeler/market`、`/agent/ai-review`、`/reviewer/reviews` 会跳转 `/login`。
- 使用 Owner / Labeler / AI Agent / Reviewer 演示账号登录后分别进入对应 Portal，导航菜单互相隔离。
- 错误角色访问其他 Portal 会被路由守卫拦截。

## 验收标准

- 开发者可以在本地同时启动 web、api、worker。
- 前端能展示 LabelHub 登录页、四端 Portal 基础壳和无权限页。
- API 健康检查可用。
- shared 类型被至少 web 和 api 引用。

## 本阶段完成后可演示内容

打开浏览器，进入 `/login`，分别使用 Owner / Labeler / AI Agent / Reviewer 演示账号登录，进入四个独立 Portal 并看到隔离后的侧边栏入口。

## 下一阶段依赖

Batch 1 将在这个骨架上补齐 Prisma 数据模型、状态枚举和 seed 数据。

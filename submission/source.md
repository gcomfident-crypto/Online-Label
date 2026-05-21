# 源码说明

## 仓库结构

```text
apps/web       React Web，四端 Portal、Designer、Renderer、审核台、导出中心
apps/api       NestJS API，登录、RBAC、任务、导入、提交、审核、导出
apps/worker    Worker 入口、AI provider、AI 预审处理器、导出处理器
packages/shared 共享角色、路由、状态机、Schema runtime、DatasetProfile
prisma         Prisma schema、seed、demo reset
docs           部署、架构、API、演示数据和脚本文档
submission     答辩提交材料
```

## 关键源码入口

- Web 路由：`apps/web/src/router.tsx`
- 登录状态：`apps/web/src/stores/sessionStore.ts`
- Schema Renderer：`apps/web/src/features/schema-renderer/`
- Template Designer：`apps/web/src/features/template-designer/`
- API 模块入口：`apps/api/src/app.module.ts`
- 任务状态机服务：`apps/api/src/state-machine/`
- 提交服务：`apps/api/src/submissions/`
- 审核服务：`apps/api/src/reviews/`
- 导出服务：`apps/api/src/exports/`
- AI provider：`apps/worker/src/llm/`
- 共享状态机：`packages/shared/src/stateMachines.ts`
- 演示数据：`prisma/seed.ts`

## 模块边界

- `packages/shared` 不依赖 `apps/*`。
- Web 通过 API 和 shared 类型访问业务能力。
- API 负责权限、状态机、数据库事务、幂等和审计。
- Worker 负责异步 AI 预审和导出文件生成。
- 所有用户可见文案、错误提示和提交摘要使用简体中文。

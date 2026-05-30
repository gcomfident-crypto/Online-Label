# Batch 2: Task Management MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Owner 可以创建、编辑、发布、暂停、恢复和结束任务。

**Architecture:** 前端提供任务管理页和发布抽屉，后端提供 `TaskModule`，状态迁移通过 shared 状态机校验，每次迁移写入 `audit_logs`。

**Tech Stack:** React, TypeScript, UI component library, Node.js API, Prisma.

---

## 全局修订约束

- 必须遵守统一登录 `/login`、RBAC 和四端独立 Portal：Owner 端 `/owner/*`、Labeler 端 `/labeler/*`、AI Agent 端 `/agent/*`、Reviewer 端 `/reviewer/*`。
- 所有用户可见 UI 文案、API 用户可见错误消息、代码注释和 Git Commit 摘要必须使用简体中文。
- 实现或验收图 1-5 对应页面前，必须先阅读 `docs/labelhub-plan/visual-reference.md`，并按需打开对应本地 PNG；页面结构、组件命名和交互必须对齐 5 张截图，截图中的「商品标题清洗 v3」作为 UI/UX 设计基准和演示蓝本。
- 默认审核链路必须是 `AI 自动预审 -> 人工复审 -> 终审`；人工复审通过只能进入终审待办，导出只读取 `FINAL_APPROVED` 数据。

## 目标

实现 PDF 4.1 的任务管理 MVP，让任务从草稿进入进行中，并能暂停和结束。

## 实现范围

- 任务列表。
- 任务创建与编辑。
- 发布前抽屉。
- 任务状态机。
- 分发策略先仅支持 `FIRST_COME_FIRST_SERVE`，UI 预留指派和配额抢单但置灰或标记为后续批次。
- 严格对齐图 1 Owner 任务发布页面：左侧数据生产 / 审核与质检 / 数据交付分组导航、顶部面包屑、统计卡片、搜索筛选、任务表格、右侧发布抽屉。

## 前端任务

页面：

- `apps/web/src/pages/owner/TaskListPage.tsx`
- `apps/web/src/pages/owner/TaskDetailPage.tsx`

组件：

- `TaskTable`
- `TaskStatusFilter`
- `TaskSummaryCards`
- `PublishTaskDrawer`
- `TaskStatusActions`
- `OwnerTaskPortalShell`
- `TaskPublishChecklist`

页面行为：

- Owner 打开任务列表看到草稿、进行中、已暂停、已结束任务。
- 点击“新建任务”填写标题、描述、标签、奖励规则、配额、截止时间。
- 点击“发布”打开右侧发布抽屉，展示发布前校验项、任务标题、标签、奖励规则、配额、截止时间、分发策略、关联模板和启用 AI 预审。
- 状态筛选必须使用简体中文展示：全部状态、草稿、进行中、已暂停、已结束。
- 分发策略展示必须使用简体中文：先到先得、指派、配额抢单。
- 进行中任务可以暂停和结束。
- 已暂停任务可以恢复发布或结束。

## 后端任务

模块：

- `TaskModule`
- `TaskService`
- `TaskRepository`

业务动作：

- `createTask`
- `updateTask`
- `publishTask`
- `pauseTask`
- `resumeTask`
- `endTask`
- `listTasks`
- `getTaskDetail`

每个状态动作都要：

1. 读取当前状态。
2. 用 shared 状态机校验迁移。
3. 在事务中更新任务状态。
4. 写入 `audit_logs`。

## Agent / 队列任务

本阶段不涉及 Agent。发布任务时不入队。

## 数据库设计

使用 `tasks`：

- `title`
- `description`
- `richTextInstruction`
- `tags`
- `rewardRule`
- `quota`
- `deadline`
- `distributionStrategy`
- `status`
- `ownerId`
- `templateId`

使用 `audit_logs` 记录：

- `TASK_CREATED`
- `TASK_UPDATED`
- `TASK_PUBLISHED`
- `TASK_PAUSED`
- `TASK_RESUMED`
- `TASK_ENDED`

## API 设计

```text
GET /tasks?ownerId=:ownerId&status=:status
POST /tasks
GET /tasks/:taskId
PATCH /tasks/:taskId
POST /tasks/:taskId/publish
POST /tasks/:taskId/pause
POST /tasks/:taskId/resume
POST /tasks/:taskId/end
GET /tasks/:taskId/audit-logs
```

发布接口请求示例：

```json
{
  "actorId": "user_owner_001",
  "confirm": true
}
```

## 关键实现思路

- 发布前校验必须在后端执行，前端校验只做体验增强。
- 发布任务至少满足：有标题、有配额、有截止时间、有分发策略、有已发布模板、有题目数据。
- 发布抽屉中的关联模板必须展示模板名称和 Schema 版本，例如「商品清洗 · v3 (Schema r12)」。
- 启用 AI 预审时必须展示当前规则名称，例如「电商相关性 v2」；规则本身由 Batch 7 完整实现。
- 如果模板或题目还没做完，可以允许 `forceDemoPublish` 仅在开发环境使用，正式验收时关闭。

## 状态流转设计

```text
DRAFT -> PUBLISHED
PUBLISHED -> PAUSED
PAUSED -> PUBLISHED
PUBLISHED -> ENDED
PAUSED -> ENDED
```

非法迁移：

- `ENDED -> PUBLISHED`
- `DRAFT -> PAUSED`
- `PAUSED -> DRAFT`

## 测试点

- 创建任务后状态为 `DRAFT`。
- 草稿任务发布后状态为 `PUBLISHED`。
- 进行中任务暂停后状态为 `PAUSED`。
- 已暂停任务恢复后状态为 `PUBLISHED`。
- 已结束任务再发布返回业务错误。
- 每次状态变化都有审计日志。
- 图 1 截图级验收：任务表格、统计卡片、搜索筛选和右侧发布抽屉的结构完整，按钮和状态标签均为简体中文。

## 验收标准

- Owner 可以完成「建任务 -> 编辑 -> 发布 -> 暂停 -> 恢复 -> 结束」。
- 页面状态标签与数据库状态一致。
- API 对非法状态迁移返回明确错误。
- `audit_logs` 能查到完整任务状态变化。

## 本阶段完成后可演示内容

演示 PDF 中“任务发布”页面：任务列表、统计卡片、发布前抽屉、任务状态变化。

## 下一阶段依赖

Batch 5 的任务广场只展示 `PUBLISHED` 任务。Batch 10 导出只允许读取任务内 `FINAL_APPROVED` 的提交数据。

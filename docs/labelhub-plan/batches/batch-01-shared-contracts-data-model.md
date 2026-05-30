# Batch 1: Shared Contracts And Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 定义 LabelHub 的核心数据模型、共享类型、RBAC 协议、路由权限元数据、状态枚举和状态迁移函数。

**Architecture:** `packages/shared` 保存角色、权限、路由、Schema 和状态协议，`prisma/schema.prisma` 保存数据库模型，`apps/api` 提供基础 seed/query 能力。状态机函数作为后续所有业务模块的唯一状态迁移入口。

**Tech Stack:** TypeScript, Prisma, PostgreSQL/MySQL, Vitest.

---

## 全局修订约束

- 必须遵守统一登录 `/login`、RBAC 和四端独立 Portal：Owner 端 `/owner/*`、Labeler 端 `/labeler/*`、AI Agent 端 `/agent/*`、Reviewer 端 `/reviewer/*`。
- 所有用户可见 UI 文案、API 用户可见错误消息、代码注释和 Git Commit 摘要必须使用简体中文。
- 实现或验收图 1-5 对应页面前，必须先阅读 `docs/labelhub-plan/visual-reference.md`，并按需打开对应本地 PNG；页面结构、组件命名和交互必须对齐 5 张截图，截图中的「商品标题清洗 v3」作为 UI/UX 设计基准和演示蓝本。
- 默认审核链路必须是 `AI 自动预审 -> 人工复审 -> 终审`；人工复审通过只能进入终审待办，导出只读取 `FINAL_APPROVED` 数据。

## 目标

先把业务骨架建稳：任务、模板、题目、领取、草稿、提交、审核、审计、导出这些实体必须在数据库和共享类型中表达清楚。

## 实现范围

- 定义共享枚举。
- 定义 `OWNER`、`LABELER`、`AI_AGENT`、`REVIEWER` 四角色 RBAC 类型、权限点和 Portal 路由元数据。
- 定义动态表单 Schema 类型。
- 定义完整物料类型、字段联动协议、自定义校验协议。
- 定义数据集导入格式、官方 DatasetProfile、审核阶段和导出格式枚举。
- 定义 Prisma 数据模型。
- 定义合法状态迁移函数。
- 准备基于官方 `datasets.zip` 的 seed 数据，商品标题清洗仅保留为扩展示例。

## 前端任务

- 创建 `StatusTag` 组件，根据 shared 状态枚举展示统一颜色。
- 创建 `DemoDataBanner`，在开发环境提示当前使用 seed 数据。

## 后端任务

- 创建基础 `AuditService`，提供 `writeAuditLog(input)`。
- 创建 `StateMachineService` 或纯函数模块，校验任务、提交、AI、人工审核、导出状态迁移。
- 创建 seed 脚本，生成：
  - Owner：张满
  - Labeler：李雷
  - Reviewer：王芳
  - AI Agent：系统机审账号
  - 一个 `qa_quality` 问答质量标注任务草稿
  - 一个 `preference_compare` 偏好对比任务草稿
  - 两个官方模板草稿
  - `qa_quality` 30 条题目
  - `preference_compare` 12 条题目

## Agent / 队列任务

- 在 shared 中定义：
  - `AiReviewJobPayload`
  - `ExportJobPayload`
  - `StructuredReviewResult`
  - `LlmProviderName`
  - `ReviewStage`: `AI_PRECHECK` / `INITIAL` / `RECHECK` / `FINAL`
  - `UserRole`: `OWNER` / `LABELER` / `AI_AGENT` / `REVIEWER`
  - `PortalRoutePrefix`: `/owner` / `/labeler` / `/agent` / `/reviewer`
  - `RoutePermission`: 路由路径、允许角色、默认首页、中文导航名
  - `ExportFormat`: `json` / `jsonl` / `csv` / `xlsx`
  - `DatasetImportFormat`: `json` / `jsonl` / `xlsx`
  - `DatasetKind`: `qa_quality` / `preference_compare` / `generic_json`
  - `DatasetProfile`: 主键字段、必填字段、Excel sheet、数组字段、布尔字段、媒体字段、跳过文件规则

## 数据库设计

需要创建或确认以下模型：

- `User`
- `Task`
- `TaskTemplate`
- `TaskItem`
- `Assignment`
- `Draft`
- `Submission`
- `ReviewRule`
- `ReviewRecord`
- `AuditLog`
- `ExportJob`

关键设计：

- `TaskTemplate.schema` 使用 JSON。
- `TaskItem.rawData` 使用 JSON。
- `TaskItem` 建议增加 `externalId` 和 `datasetKind`，分别保存官方题目 `id` 和 profile 类型，方便去重、筛选和导出映射。
- `Draft.answers` 和 `Submission.answers` 使用 JSON。
- `ReviewRecord.scores`、`rawPrompt`、`rawOutput` 要保留，满足可追溯。
- 所有核心表都有 `createdAt`、`updatedAt`。

## API 设计

本阶段只提供调试接口：

```text
GET /debug/seed-status
GET /debug/tasks
GET /debug/users
```

这些接口只在开发环境开放。

## 推荐文件结构

```text
packages/shared/src/
  roles.ts
  rbac.ts
  routes.ts
  states.ts
  schema.ts
  schema-validation.ts
  schema-linkage.ts
  review.ts
  exports.ts
  dataset.ts
  dataset-profiles.ts
  state-machines/taskStateMachine.ts
  state-machines/submissionStateMachine.ts
  state-machines/aiReviewStateMachine.ts
  state-machines/exportStateMachine.ts

prisma/
  schema.prisma
  seed.ts

apps/api/src/modules/audit/
  audit.service.ts
  audit.types.ts

apps/api/src/modules/debug/
  debug.routes.ts
```

## 关键实现思路

- 状态枚举必须放 shared，不能散落在前端和后端。
- 角色枚举、权限点、路由权限元数据必须放 shared，供 Web 路由守卫和 API RBAC 复用。
- `AI_AGENT` 是独立角色，不能复用 `system` 或 `reviewer` 权限。
- 状态标签必须提供简体中文展示名，例如 `DRAFT=草稿`、`PUBLISHED=进行中`、`PAUSED=已暂停`、`ENDED=已结束`、`FINAL_APPROVED=终审通过`。
- 所有业务状态迁移必须调用状态机函数。
- `audit_logs` 记录 `fromStatus`、`toStatus`、`actorId`、`reason`、`metadata`。
- `schemaVersion` 要进入提交快照，保证模板升级后旧提交仍可解释。
- `LabelhubSchema` 必须覆盖 PDF 4.2 的完整物料：`show_item`、`text`、`textarea`、`radio`、`checkbox`、`tag_select`、`rich_text`、`file_upload`、`image_upload`、`json_editor`、`llm_assist`、`group`、`tabs`。
- `FieldValidation` 至少包含 `required`、`minLength`、`maxLength`、`pattern`、`customValidatorKey`、`message`，其中自定义函数只能引用白名单 key，不能执行用户输入的任意代码。
- `FieldLinkageRule` 至少包含 `when`、`action`、`targetFieldKey`、`value`，`action` 支持 `show`、`hide`、`require`、`disable`、`setValue`。
- `ReviewStage` 要覆盖 AI 预审、初审、复审、终审；默认启用 `AI_PRECHECK + RECHECK + FINAL`，复审通过只能进入终审待办。
- `DatasetProfile` 必须内置两个官方 profile：
  - `qa_quality`：主键 `id`；支持 `json/jsonl/xlsx`；Excel sheet `标注题目`；必填字段 `id`、`prompt`、`model_answer`、`expected_dimensions`；数组字段 `tags`、`expected_dimensions`；媒体字段 `media_type`、`media_url`、`content_markdown`。
  - `preference_compare`：主键 `id`；支持 `json/jsonl/xlsx`；Excel sheet `偏好对比`；必填字段 `id`、`prompt`、`response_a`、`response_b`；数组字段 `dimensions`；布尔字段 `safety_flag`。
- 导入归一化规则必须在 shared 中可测试：Excel 中 `tags`、`expected_dimensions`、`dimensions` 使用 ` | ` 拆分为数组；`safety_flag` 的 `是/否` 转为 `true/false`；JSON/JSONL 已是数组或 boolean 时保持不变。
- zip/文件导入必须忽略 `__MACOSX/`、`.DS_Store`、`._*`、`.~*.xlsx`，避免把系统元数据当成题目文件。

## 状态流转设计

本阶段只实现纯函数校验，不实现业务动作：

```text
canTransitionTask(DRAFT, PUBLISHED) -> true
canTransitionTask(ENDED, PUBLISHED) -> false
canTransitionSubmission(NEEDS_REVISION, SUBMITTED) -> true
canTransitionAiReview(RUNNING, FAILED_RETRYING) -> true
```

## 测试点

- 合法任务状态迁移返回 true。
- 非法任务状态迁移返回 false 或抛出业务错误。
- RBAC 测试覆盖四个角色只能访问自己的 Portal 路由。
- 中文状态标签测试覆盖任务、提交、AI 审核、人工复审、终审和导出状态。
- seed 后数据库中存在 4 个用户、1 个任务、1 个模板、10 个题目。
- `TaskTemplate.schema` 能存入并读出 JSON。
- shared 类型测试覆盖完整字段类型、联动 action、导入格式、审核阶段和导出格式。
- `qa_quality` profile 校验 JSON、JSONL、Excel 三种格式均得到 30 条有效题目。
- `preference_compare` profile 校验 JSON、JSONL、Excel 三种格式均得到 12 条有效题目。
- Excel 归一化测试覆盖 `tags = "生物 | 基础科学"`、`expected_dimensions = "相关性 | 准确性"`、`safety_flag = "否"`。
- 临时文件跳过规则覆盖 `__MACOSX`、`.DS_Store`、`._qa_quality.json`、`.~qa_quality.xlsx`。

## 验收标准

- 数据库迁移成功。
- seed 数据可重复执行。
- shared 包导出的类型能被 web、api、worker 引用。
- shared 包导出的角色、权限和路由元数据能被 Web 路由守卫和 API 权限校验引用。
- 状态机测试通过。
- 后续 Batch 不需要重新发明字段类型、导入格式、审核阶段或导出格式。

## 本阶段完成后可演示内容

可以在数据库或调试接口中看到 LabelHub 的核心业务骨架、`qa_quality` 样例任务和 `preference_compare` 样例任务。

## 下一阶段依赖

Batch 3 会基于 shared Schema 类型实现 Renderer。Batch 2 会基于 `Task` 和状态机实现任务管理。

# Batch 11: Quality Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 补齐核心链路的测试、错误处理、幂等、并发控制、加载状态和演示体验。

**Architecture:** 对已有模块做横向加固，不新增大功能。重点保证「建任务 -> 搭模板 -> 发布 -> 领取 -> 作答 -> AI -> 审核 -> 导出」连续演示不崩。

**Tech Stack:** Vitest, Playwright or Cypress, Prisma transactions, frontend loading/error states.

---

## 全局修订约束

- 必须遵守统一登录 `/login`、RBAC 和四端独立 Portal：Owner 端 `/owner/*`、Labeler 端 `/labeler/*`、AI Agent 端 `/agent/*`、Reviewer 端 `/reviewer/*`。
- 所有用户可见 UI 文案、API 用户可见错误消息、代码注释和 Git Commit 摘要必须使用简体中文。
- 实现或验收图 1-5 对应页面前，必须先阅读 `docs/labelhub-plan/visual-reference.md`，并按需打开对应本地 PNG；页面结构、组件命名和交互必须对齐 5 张截图，截图中的「商品标题清洗 v3」作为 UI/UX 设计基准和演示蓝本。
- 默认审核链路必须是 `AI 自动预审 -> 人工复审 -> 终审`；人工复审通过只能进入终审待办，导出只读取 `FINAL_APPROVED` 数据。

## 目标

把项目从“能跑”打磨到“能稳定答辩演示”。

## 实现范围

- 统一 Loading、Empty、Error。
- API 参数校验。
- 后端事务补强。
- 幂等 key。
- 并发领取保护。
- AI 重试可视化。
- 批量审核。
- 基础数据看板。
- E2E 测试。
- 视觉规范统一检查。
- 1280x800 与 1920x1080 截图验收。
- 五张截图级页面验收：Owner 任务发布、Owner 模板配置、Labeler 标注台、AI Agent 机审、Reviewer 验收台。
- 简体中文治理扫描：UI 文案、API 用户可见错误、状态标签和通知提示不得出现未治理的硬编码英文。
- 四端路由隔离 E2E：未登录跳转、错误角色拦截、正确角色进入独立 Portal。
- 表单大数据量渲染性能测试。
- TypeScript 类型质量检查，避免大量 `any`。

## 前端任务

组件：

- `PageLoading`
- `PageError`
- `EmptyState`
- `ConfirmActionButton`
- `BulkReviewToolbar`
- `OwnerDashboardCards`

页面优化：

- 所有列表有空状态。
- 所有提交按钮有 loading 和防重复点击。
- 所有危险操作有确认。
- 1280x800 和 1920x1080 下布局可用。
- 关键页面在 1280x800 和 1920x1080 下保存截图，检查文字不重叠、按钮不溢出、表格可滚动。
- 关键页面截图必须逐项对齐图 1-5 的布局结构和组件术语。
- Owner、Labeler、AI Agent、Reviewer 四类页面使用统一导航、状态色、按钮层级和空状态文案。
- 审核列表支持批量通过、批量打回。

## 后端任务

- 对关键接口加请求校验。
- 领取、提交、审核、导出创建使用事务。
- 提交接口支持 idempotency key。
- AI review job 支持 idempotency key。
- 导出 job 支持失败重试。
- 所有列表接口支持分页。
- TypeScript 编译配置启用严格模式或在 README 中解释未启用项；业务类型禁止新增宽泛 `any`，确需使用时必须在代码旁说明原因。

## Agent / 队列任务

- AI 队列失败原因可查询。
- AI 失败任务可手动重跑。
- Export 队列失败任务可重试。
- Worker 启动时打印 provider、queue name、concurrency。

## 数据库设计

建议索引：

- `tasks.status`
- `task_items.taskId,status`
- `assignments.taskId,labelerId,status`
- `submissions.assignmentId,round`
- `submissions.status`
- `review_records.submissionId,reviewStage`
- `audit_logs.entityType,entityId`
- `export_jobs.taskId,status`

## API 设计

补充分页：

```text
GET /tasks?page=1&pageSize=20
GET /reviews/pending?page=1&pageSize=20
GET /exports?page=1&pageSize=20
```

批量审核：

```text
POST /reviews/bulk-approve
POST /reviews/bulk-reject
```

## 关键实现思路

- 只补强核心链路，不引入复杂新业务。
- 每个关键动作后都校验审计日志。
- E2E 测试用 seed 数据，避免依赖真实模型，默认使用 mock provider。
- 真实模型只作为可选演示能力。
- 性能验收以可复现脚本为准：至少 100 个字段 Schema、1000 条题目列表、500 条审核列表分页场景。
- 视觉验收不追求炫技，优先保证信息密度、可扫描性和关键路径无卡顿。

## 状态流转设计

本阶段不新增状态，只检查已有状态迁移：

- 非法迁移必须被拒绝。
- 重复请求不能生成重复记录。
- 并发领取不能超配额。

## 测试点

- 完整 E2E：Owner 创建任务、Designer 发布模板、导入题目、发布任务。
- 完整 E2E：统一登录后四个角色进入各自 Portal，错误角色访问被拦截。
- 完整 E2E：Labeler 领取、作答、提交。
- 完整 E2E：AI mock 通过。
- 完整 E2E：Reviewer 通过。
- 完整 E2E：Reviewer 复审通过后进入终审待办，终审通过后才可导出。
- 完整 E2E：Owner 导出 JSON。
- AI mock 失败三次后转人工。
- 并发领取 10 次不会重复分配同一题。
- 100 字段 Schema 在标注工作台首次渲染和切题时无明显卡顿。
- 1000 条任务题目预览使用分页或虚拟滚动，不一次性渲染全部 DOM。
- `pnpm typecheck` 或等价命令通过，新增业务代码没有大量 `any`。
- 关键页面生成 1280x800 和 1920x1080 截图，人工检查无重叠和主要信息缺失。
- 中文治理扫描通过，核心页面没有未治理英文用户文案。

## 验收标准

- 核心链路 E2E 通过。
- 四端路由隔离、三级审核流水线和中文治理 E2E 通过。
- 关键页面没有明显空白、错位、无反馈点击。
- 失败场景有明确错误提示。
- 1280x800 和 1920x1080 下可正常演示。
- 视觉规范统一，状态色、按钮层级、表格密度和表单错误提示一致。
- 关键路径没有明显卡顿，草稿、撤销、打回修改等操作可逆或可恢复。
- TypeScript 类型完整，新增核心模块无大量 `any`。

## 本阶段完成后可演示内容

一条稳定的完整业务链路，且可以演示失败重试、打回修改、批量审核等增强能力。

## 下一阶段依赖

Batch 12 会整理部署、文档和答辩材料。

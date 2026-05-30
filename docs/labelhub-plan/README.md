# LabelHub 全栈开发计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Batch files use checkbox syntax for tracking.

**Goal:** 分阶段实现一套覆盖「统一登录 -> 数据生产 -> AI 自动预审 -> 人工复审 -> 终审 -> 多格式导出」的 LabelHub 企业级 Web 数据标注平台。

**Architecture:** 采用 monorepo：`apps/web` 承载 React 前端和四个独立 Portal，`apps/api` 承载后端 API、认证、RBAC 和状态机校验，`apps/worker` 承载 BullMQ 异步任务，`packages/shared` 承载共享类型、Schema 协议、路由权限元数据和状态机。优先围绕官方测试数据 `qa_quality` 与 `preference_compare` 跑通闭环；截图中的「商品标题清洗 v3」作为 UI/UX 设计基准和演示蓝本，不再只是可选扩展示例。

**Tech Stack:** React + TypeScript + Vite, Semi Design 或 Ant Design, dnd-kit, Zustand, Node.js + TypeScript, NestJS 或 Express, Prisma, PostgreSQL 或 MySQL, Redis + BullMQ, OpenAI/豆包/通义抽象 Provider。

---

## 1. 总体开发策略

这个项目不要一开始做成“所有功能一次到位”的平台。推荐采用三层推进：

1. **MVP 闭环**：先使用官方 `datasets.zip` 中的 `qa_quality` 问答质量标注跑通 Owner 建任务、配模板、导入题目、发布任务、Labeler 作答、提交、AI 预审、Reviewer 审核、Owner 导出；再用 `preference_compare` 验证第二类标注模板和导出字段映射。
2. **核心加厚**：把动态表单从 5 个基础物料扩展到完整物料，把审核流水线固定为 `AI 自动预审 -> 人工复审 -> 终审`，把 AI 从 mock/provider 单次调用扩展为可重试、可追溯、可人工兜底的 Agent。
3. **答辩打磨**：补测试、部署、演示数据、README、API 文档、架构图、答辩视频脚本。

第一轮实现建议控制顺序，但不删减 PDF 的必做范围：

- 物料先用 `ShowItem`、`TextInput`、`Radio`、`Checkbox`、`LLMAssist` 打通闭环，再在 Batch 3/4 内补齐 `Textarea`、`TagSelect`、`RichText`、`FileUpload`、`ImageUpload`、`JsonEditor`、`Group`、`Tabs`。
- 分发策略先做 `FIRST_COME_FIRST_SERVE`。
- 从 Batch 0 开始实现统一登录入口 `/login`、RBAC 角色模型和四端独立 Portal，不允许用全局角色切换代替认证与路由隔离。
- 导出先跑通 JSON，再补 JSONL/CSV/Excel。
- AI 先支持 `mock` provider，再接真实模型 provider。

最重要的判断标准：每个阶段结束后，都应该能多演示一段真实链路，而不是只多几个静态页面。

## 1.1 视觉证据与页面蓝本

以下 5 张系统截图是业务逻辑依据和 UI 设计蓝本。后续实现不得只满足功能 API，页面结构、组件术语和关键交互也必须对齐截图。

稳定视觉参考入口：[visual-reference.md](visual-reference.md)。Codex CLI 或其他执行者在实现图 1-5 对应页面前，必须先阅读该文档，并在需要确认布局细节时打开对应本地 PNG。图片路径作为固定契约，后续不要改名或移动。

| 图 | 本地图片 | 端 | 页面 | 必须体现的布局与组件 |
| --- | --- | --- | --- | --- |
| 图 1 | [01-owner-task-publish.png](assets/screenshots/01-owner-task-publish.png) | Owner 端 | 任务发布 / 任务管理 | 左侧分组导航、统计卡片、搜索筛选、任务表格、右侧发布抽屉；发布抽屉包含任务标题、标签、奖励规则、配额、截止时间、分发策略、关联模板、启用 AI 预审 |
| 图 2 | [02-owner-template-designer.png](assets/screenshots/02-owner-template-designer.png) | Owner 端 | 模板配置 / Designer | 左侧物料区、中间画布、右侧属性 / 校验 / 联动配置三栏结构；固定使用 `ShowItem`、`LLM 触发组件`、分组容器、多 Tab 布局、Schema JSON 导出、保存并发布版本等术语 |
| 图 3 | [03-labeler-workbench.png](assets/screenshots/03-labeler-workbench.png) | Labeler 端 | 标注台 | 左侧题目导航、中间标注表单、右侧贡献 / 历史 / 快捷键面板、底部固定操作区；必须包含草稿自动保存、打回提示、题目级 LLM 辅助、提交校验 |
| 图 4 | [04-agent-ai-review.png](assets/screenshots/04-agent-ai-review.png) | AI Agent 端 | 机审队列 | 左侧异步队列、状态分组、重试入口；右侧展示提交内容、JSON 字段视图、维度评分、`function_calling` 结构化输出、AI 评语、Prompt 模板、处理日志、失败重试和人工兜底 |
| 图 5 | [05-reviewer-review-flow.png](assets/screenshots/05-reviewer-review-flow.png) | Reviewer 端 | 验收台 | 左侧待审列表与批量操作、中间第 1 / 2 轮 Diff 视图、AI 预审结果、审核意见与操作卡片、右侧统计与完整审计时间线；必须支持复审视角和终审视角切换 |

## 1.2 官方测试数据概览

官方第一版测试数据来自 `/Users/zzx/Downloads/datasets.zip`。开发计划以这份数据为首要验收数据源，不把原始 zip 解压进仓库，导入实现需要从上传文件或临时目录读取。

| DatasetProfile | 任务含义 | 格式 | 数量 | Excel sheet | 关键字段 |
| --- | --- | --- | --- | --- | --- |
| `qa_quality` | 大模型问答质量标注 | JSON / JSONL / Excel | 30 条 | `标注题目` | `id`, `category`, `difficulty`, `lang`, `media_type`, `media_url`, `content_markdown`, `prompt`, `model_answer`, `reference`, `tags`, `source`, `expected_dimensions` |
| `preference_compare` | A/B 偏好对比标注 | JSON / JSONL / Excel | 12 条 | `偏好对比` | `id`, `task_type`, `lang`, `prompt`, `response_a`, `model_a`, `response_b`, `model_b`, `preferred`, `margin`, `dimensions`, `safety_flag`, `annotator_note` |

导入时必须忽略 zip 中的 macOS/临时文件：`__MACOSX/`、`.DS_Store`、`._*`、`.~*.xlsx`。Excel 归一化规则：`tags`、`expected_dimensions`、`dimensions` 按 ` | ` 拆成数组；`safety_flag` 中的 `是/否` 转成 boolean。

## 2. 推荐系统架构

推荐目录：

```text
labelhub/
  apps/
    web/                 # React + Vite 前端
    api/                 # NestJS/Express 后端 API
    worker/              # BullMQ Worker: AI 预审、导出任务
  packages/
    shared/              # 共享类型、Schema、状态枚举、工具函数
  prisma/
    schema.prisma        # 数据模型
    seed.ts              # 演示数据
  docs/
    labelhub-plan/       # 本开发计划
```

核心调用关系：

```text
Browser
  -> apps/web
  -> apps/api
  -> Prisma
  -> PostgreSQL/MySQL

apps/api
  -> Redis/BullMQ queue
  -> apps/worker
  -> LlmProvider(OpenAI/Doubao/Tongyi/Mock)
  -> database review_records/export_jobs/audit_logs
```

三个核心边界：

- **动态表单边界**：Designer 只负责编辑 JSON Schema，Renderer 只负责运行 JSON Schema。
- **状态机边界**：所有状态迁移通过共享状态机函数完成，并写入 `audit_logs`。
- **Agent 边界**：业务代码只依赖 `LlmProvider` 接口，不直接绑定某家模型 API。

## 2.1 统一登录与四端路由隔离

LabelHub 是多角色隔离的企业级系统，不是单页角色切换 Demo。必须从 Batch 0 起建立统一登录和物理级页面隔离。

角色模型固定为：

| 角色 | 中文端名 | 路由前缀 | 默认首页 | 主要职责 |
| --- | --- | --- | --- | --- |
| `OWNER` | Owner 端 | `/owner/*` | `/owner/tasks` | 任务管理、模板配置、数据集导入、规则配置、导出中心 |
| `LABELER` | Labeler 端 | `/labeler/*` | `/labeler/market` | 任务广场、标注台、我的数据、草稿和提交 |
| `AI_AGENT` | AI Agent 端 | `/agent/*` | `/agent/ai-review` | AI 自动预审队列、Prompt 模板、评分维度、失败重试、人工兜底 |
| `REVIEWER` | Reviewer 端 | `/reviewer/*` | `/reviewer/reviews` | 人工复审、终审、Diff 视图、批量操作、审计时间线 |

统一登录要求：

- 入口固定为 `/login`，未登录访问任一 Portal 必须跳转登录页。
- 登录后根据用户角色重定向到对应默认首页。
- 错误角色访问其他 Portal 时，必须由路由守卫拦截并跳转无权限页或登录页。
- 四个 Portal 必须有独立 Layout、独立导航、独立权限配置和独立页面目录，不能通过顶部角色切换模拟隔离。
- API 层必须基于 RBAC 校验角色和资源权限，前端路由守卫只做体验保护，不能作为唯一权限来源。

## 2.2 中文与 i18n 治理

全站用户可见内容统一使用简体中文：

- UI 文案必须进入 `zh-CN` 文案资源或同等集中管理机制，禁止在组件中散落硬编码英文文案。
- 代码注释必须使用简体中文；组件名、类型名、协议名可保留英文技术标识，例如 `ShowItem`、`LLMAssist`、`function_calling`、`FINAL_APPROVED`。
- API 错误消息、空状态、按钮、表格列、状态标签、通知提示、截图验收文案均使用简体中文。
- E2E 和视觉验收必须覆盖关键页面是否出现未治理的英文用户文案。

## 2.3 Git Commit 规范

后续提交信息必须使用中文描述，格式固定为：

```bash
git commit -m "<type>(labelhub): <中文任务摘要>"
```

示例：

```bash
git commit -m "feat(labelhub): 新增任务发布抽屉组件"
git commit -m "fix(labelhub): 修复终审打回状态流转"
git commit -m "docs(labelhub): 补充四端路由隔离说明"
```

禁止使用英文占位摘要或泛泛描述，例如“添加功能”“修复问题”一类无法说明具体中文任务的提交信息。

## 3. 核心数据模型

| 表 | 作用 | 关键字段 |
| --- | --- | --- |
| `users` | 用户与角色 | `id`, `name`, `role`, `createdAt` |
| `tasks` | 标注任务主表 | `title`, `description`, `status`, `quota`, `deadline`, `distributionStrategy`, `ownerId`, `templateId` |
| `task_templates` | 模板版本 | `taskId`, `name`, `version`, `status`, `schema`, `publishedAt` |
| `task_items` | 待标注题目 | `taskId`, `datasetKind`, `externalId`, `rawData`, `status`, `itemIndex` |
| `assignments` | 题目领取/分配 | `taskId`, `itemId`, `labelerId`, `status`, `claimedAt` |
| `drafts` | 草稿 | `assignmentId`, `answers`, `schemaVersion`, `updatedAt` |
| `submissions` | 标注提交快照 | `assignmentId`, `round`, `answers`, `status`, `schemaVersion`, `submittedAt` |
| `review_rules` | AI 审核规则 | `taskId`, `promptTemplate`, `dimensions`, `passThreshold`, `manualThreshold` |
| `review_records` | AI/人工审核记录 | `submissionId`, `reviewerType`, `reviewStage`, `scores`, `verdict`, `comment`, `rawPrompt`, `rawOutput`, `retryCount` |
| `audit_logs` | 审计日志 | `entityType`, `entityId`, `action`, `fromStatus`, `toStatus`, `actorId`, `reason`, `metadata` |
| `export_jobs` | 导出任务 | `taskId`, `format`, `status`, `fieldMapping`, `includeReviews`, `filePath`, `errorMessage` |

建议所有 JSON 字段使用 Prisma 的 `Json` 类型，例如 `schema`、`rawData`、`answers`、`scores`、`dimensions`、`metadata`。

## 4. 状态机设计

### 任务状态机

```text
DRAFT -> PUBLISHED
PUBLISHED -> PAUSED
PAUSED -> PUBLISHED
PUBLISHED -> ENDED
PAUSED -> ENDED
```

规则：

- `DRAFT` 可编辑任务基础信息、模板、数据集。
- `PUBLISHED` 可领取、作答、提交。
- `PAUSED` 不允许新领取，可保留已有草稿。
- `ENDED` 不允许领取和提交，只允许查看与导出。

### 标注提交状态机

```text
DRAFT -> SUBMITTED -> AI_QUEUED -> AI_REVIEWING
AI_REVIEWING -> AI_PASSED -> HUMAN_PENDING
AI_REVIEWING -> AI_REJECTED -> NEEDS_REVISION
AI_REVIEWING -> AI_MANUAL -> HUMAN_PENDING
NEEDS_REVISION -> SUBMITTED
HUMAN_PENDING -> RECHECK_REVIEWING
RECHECK_REVIEWING -> RECHECK_APPROVED -> FINAL_PENDING
RECHECK_REVIEWING -> RECHECK_REJECTED -> NEEDS_REVISION
RECHECK_REVIEWING -> RECHECK_REVISED_APPROVED -> FINAL_PENDING
FINAL_PENDING -> FINAL_REVIEWING
FINAL_REVIEWING -> FINAL_APPROVED
FINAL_REVIEWING -> FINAL_REJECTED -> NEEDS_REVISION
```

规则：

- 草稿可覆盖，提交不可覆盖。
- 每次提交生成新的 `submissions.round`。
- 打回后下一次提交必须保留上一轮记录，便于 diff。

### AI 审核状态机

```text
QUEUED -> RUNNING -> SUCCEEDED
RUNNING -> FAILED_RETRYING -> QUEUED
RUNNING -> FAILED_FINAL -> MANUAL_FALLBACK
RUNNING -> MANUAL_FALLBACK
```

规则：

- 同一个 `submissionId + round` 必须幂等。
- 结构化输出解析失败也算失败，可重试。
- 超过最大重试次数后转人工兜底。

### 人工审核状态机

```text
HUMAN_PENDING -> RECHECK_REVIEWING
RECHECK_REVIEWING -> RECHECK_APPROVED -> FINAL_PENDING
RECHECK_REVIEWING -> RECHECK_REJECTED -> NEEDS_REVISION
RECHECK_REVIEWING -> RECHECK_REVISED_APPROVED -> FINAL_PENDING
FINAL_PENDING -> FINAL_REVIEWING
FINAL_REVIEWING -> FINAL_APPROVED
FINAL_REVIEWING -> FINAL_REJECTED -> NEEDS_REVISION
```

默认审核链路必须是 `AI 自动预审 -> 人工复审 -> 终审`。Batch 8 实现复审台，但复审通过只能进入 `FINAL_PENDING`；Batch 9 实现终审闭环。可配置任务再启用 `INITIAL + RECHECK + FINAL`，但答辩默认展示 `AI_PRECHECK + RECHECK + FINAL`。

### 导出任务状态机

```text
QUEUED -> PROCESSING -> SUCCEEDED
PROCESSING -> FAILED
FAILED -> QUEUED
```

规则：

- 导出只读取 `FINAL_APPROVED` 数据；人工复审通过不得直接导出。
- 导出参数需要快照化保存到 `export_jobs.fieldMapping`。

## 5. 分批开发计划

详细 Batch 文件：

执行时不要直接把整份计划一次性交给 AI。先阅读 [EXECUTION.md](./EXECUTION.md)，再按 `prompts/` 中的单批工单逐个执行。

| Batch | 名称 | 文件 |
| --- | --- | --- |
| 0 | 统一登录与四端 Portal 初始化 | [batch-00-project-initialization.md](./batches/batch-00-project-initialization.md) |
| 1 | 共享协议、数据模型、RBAC 与状态机 | [batch-01-shared-contracts-data-model.md](./batches/batch-01-shared-contracts-data-model.md) |
| 2 | 任务管理 MVP | [batch-02-task-management-mvp.md](./batches/batch-02-task-management-mvp.md) |
| 3 | Schema Renderer MVP | [batch-03-schema-renderer-mvp.md](./batches/batch-03-schema-renderer-mvp.md) |
| 4 | 模板 Designer MVP | [batch-04-template-designer-mvp.md](./batches/batch-04-template-designer-mvp.md) |
| 5 | 数据集导入、任务广场与领取 | [batch-05-dataset-market-claim.md](./batches/batch-05-dataset-market-claim.md) |
| 6 | 标注工作台、草稿与提交 | [batch-06-labeler-workbench-drafts-submissions.md](./batches/batch-06-labeler-workbench-drafts-submissions.md) |
| 7 | AI Agent 自动预审端 | [batch-07-ai-review-agent.md](./batches/batch-07-ai-review-agent.md) |
| 8 | 人工复审台 | [batch-08-human-review-flow.md](./batches/batch-08-human-review-flow.md) |
| 9 | 多轮修改、Diff 与终审 | [batch-09-multi-round-diff-final-review.md](./batches/batch-09-multi-round-diff-final-review.md) |
| 10 | 导出中心 | [batch-10-export-center.md](./batches/batch-10-export-center.md) |
| 11 | 体验增强、测试与稳定性 | [batch-11-quality-hardening.md](./batches/batch-11-quality-hardening.md) |
| 12 | 部署、文档与答辩材料 | [batch-12-deploy-docs-demo.md](./batches/batch-12-deploy-docs-demo.md) |

### PDF 要求覆盖矩阵

| PDF 章节 | 明确要求 | 对应 Batch | 验收口径 |
| --- | --- | --- | --- |
| 4.1 任务管理 | 任务基础信息、状态机、数据集导入 JSON/JSONL/Excel、批量编辑、题目预览、分发策略、配额、截止时间 | Batch 2, Batch 5 | Owner 能导入官方 `qa_quality` 和 `preference_compare` 三种格式，预览并批量编辑，发布后任务广场可领取 |
| 4.2 动态搭建 | Designer/Renderer 解耦、JSON Schema、完整物料、字段联动、自定义校验、分组和多 Tab | Batch 3, Batch 4 | 官方两个模板能在 Designer 预览和 Labeler 作答运行，并覆盖媒体展示、A/B 对比、完整物料 |
| 4.3 标注工作台 | 任务广场搜索筛选、题目导航、草稿保存、提交校验、打回提示、题目级 LLM 辅助、我的数据 | Batch 5, Batch 6 | Labeler 能完成领取、作答、提交、查看打回、修改，并查看个人贡献列表 |
| 4.4 AI Agent | Prompt 模板、评分维度、异步队列、Function Calling/结构化输出、失败重试、幂等和人工兜底 | Batch 7 | `qa_quality` 和 `preference_compare` 各有可追溯 Prompt 模板、结构化结果和 mock provider 稳定输出 |
| 4.5 人工审核 | AI 自动预审后进入人工复审，复审通过进入终审；包含第 1 / 2 轮 Diff、AI 评语、批量操作、打回理由、审计时间线 | Batch 8, Batch 9, Batch 11 | Reviewer 能在复审 / 终审视角切换，单条审核能看到轮次 Diff 和完整时间线 |
| 4.6 数据导出 | JSON/JSONL/CSV/Excel、异步导出、下载历史、字段映射、是否包含审核记录 | Batch 10 | 只导出 `FINAL_APPROVED` 数据，四种导出文件结构正确，可下载，可被下游消费 |
| 第七章验收标准 | 功能完整性、工程质量、产品体验 | Batch 11 | E2E、单元/集成测试、TypeScript 类型检查、响应式截图验收 |
| 第八章提交物 | 源码、README、演示视频、架构图、Demo 截图、AI Coding 记录、部署说明、API 文档 | Batch 12 | `submission/` 目录包含完整答辩交付物 |

## 6. 推荐开发顺序

推荐实际顺序：

```text
Batch 0 -> Batch 1 -> Batch 3 -> Batch 4 -> Batch 2 -> Batch 5 -> Batch 6 -> Batch 7 -> Batch 8 -> Batch 9 -> Batch 10 -> Batch 11 -> Batch 12
```

原因：

- Renderer 是动态表单运行时核心，先做 Renderer，Designer 才有清晰的产物目标。
- Designer 产出模板后，任务发布才有真实模板可绑定。
- 任务发布和数据集导入完成后，Labeler 工作台才有真实任务可领取。
- AI Agent 端依赖提交记录。
- Reviewer 端复审依赖 AI 结果，终审依赖复审结论和轮次 Diff。
- 导出依赖终审通过数据。

## 7. 答辩演示路线

5-10 分钟演示脚本：

1. **Owner 视角**：进入任务管理，创建「问答质量标注 qa_quality」。
2. **Owner 视角**：从官方模板库选择 `qa_quality` 模板，预览 `prompt`、`model_answer`、`reference` 和媒体展示字段。
3. **Owner 视角**：导入 `qa_quality` 的 JSONL 或 Excel 数据，确认 30 条有效记录和字段归一化结果。
4. **Owner 视角**：配置配额、截止时间、AI 审核规则，发布任务。
5. **Labeler 视角**：进入任务广场，领取 `qa_quality` 任务，在标注台完成评分、问题标签、评语、JSON 批注和 AI 预评分。
6. **AI Agent 视角**：进入 `/agent/ai-review` AI 自动预审队列，展示问答质量维度评分、`function_calling` 结构化输出、Prompt 和处理日志。
7. **Reviewer 复审视角**：查看 AI 评语，打回一条数据。
8. **Labeler 视角**：查看打回原因，修改后再次提交。
9. **Reviewer 终审视角**：查看第 1 / 2 轮 Diff、复审意见和完整审计时间线，终审通过。
10. **Owner 视角**：切换到「偏好对比 preference_compare」任务，展示 A/B 对比模板和官方 12 条导入结果。
11. **Owner 视角**：导出 JSON/JSONL/CSV/Excel，展示 `qa_quality` 与 `preference_compare` 的字段映射预设。

## 8. 风险与取舍

优先做扎实：

- 动态表单 `SchemaRenderer` 和 `TemplateDesigner` 的协议边界。
- 状态机和审计日志。
- AI Agent 的队列、结构化输出、重试和人工兜底。
- 提交、AI 自动预审、人工复审、打回、修改、终审、导出的闭环。

可以后做：

- 指派、配额抢单等复杂分发策略。
- 组织层级、单点登录和复杂账号生命周期；但统一登录、RBAC 和四端路由隔离必须在 Batch 0/1 完成。
- 移动端适配和高级数据看板。

注意：富文本、文件/图片上传、JSON 编辑器、分组容器、多 Tab 布局属于 PDF 4.2 的物料和布局要求，必须在 Batch 3/4 的完整物料补强中落地，不能作为答辩版本的可选项遗漏。

可以简化：

- AI 先做 mock provider，再切真实 provider。
- 导出文件先存本地目录。
- 审核 UI 可以先交付复审台，再交付终审台；但状态机和验收链路从一开始就按 `AI 自动预审 -> 人工复审 -> 终审` 设计。
- 初始数据库可用 PostgreSQL 或 MySQL，开发阶段也可先用 SQLite 过渡，但最终 README 需要说明推荐生产数据库。
- 官方数据集仍作为功能验收主线；截图中的「商品标题清洗 v3」作为 UI 结构、组件术语和演示体验的强约束蓝本。

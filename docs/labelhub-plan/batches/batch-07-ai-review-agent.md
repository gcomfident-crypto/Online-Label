# Batch 7: AI Review Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 标注提交后自动进入 AI Agent 端预审队列，Agent 调用 LLM 输出结构化评分和审核结论。

**Architecture:** API 在提交成功后将 `AiReviewJobPayload` 写入 BullMQ。Worker 消费队列，构造 Prompt，调用 `LlmProvider`，解析结构化结果，写 `review_records`，更新 submission 状态。失败自动重试，多次失败转人工。

**Tech Stack:** BullMQ, Redis, TypeScript, Prisma, LLM provider abstraction, JSON schema validation.

---

## 全局修订约束

- 必须遵守统一登录 `/login`、RBAC 和四端独立 Portal：Owner 端 `/owner/*`、Labeler 端 `/labeler/*`、AI Agent 端 `/agent/*`、Reviewer 端 `/reviewer/*`。
- 所有用户可见 UI 文案、API 用户可见错误消息、代码注释和 Git Commit 摘要必须使用简体中文。
- 实现或验收图 1-5 对应页面前，必须先阅读 `docs/labelhub-plan/visual-reference.md`，并按需打开对应本地 PNG；页面结构、组件命名和交互必须对齐 5 张截图，截图中的「商品标题清洗 v3」作为 UI/UX 设计基准和演示蓝本。
- 默认审核链路必须是 `AI 自动预审 -> 人工复审 -> 终审`；人工复审通过只能进入终审待办，导出只读取 `FINAL_APPROVED` 数据。

## 目标

实现 PDF 4.4 机审：异步队列、维度评分、Prompt 模板、结构化输出、失败重试和人工兜底。

## 实现范围

- Owner 配置 AI 审核规则。
- 提交后自动入队。
- Worker 消费 AI 审核任务。
- Mock LLM Provider 和真实 Provider 接口。
- Function Calling 和 JSON Schema structured output 两种结构化输出路径。
- 结构化输出校验。
- Prompt 版本和评分维度版本。
- 官方 profile Prompt 模板：`qa_quality` 与 `preference_compare` 各一套。
- 模型调用元数据追溯：provider、model、temperature、token、耗时、requestId。
- 写入 AI 审核记录。
- AI 队列监控页面。
- 失败重试与手动重跑。
- 严格对齐图 4 AI Agent 机审页面：左侧异步队列和状态分组，右侧提交内容、JSON 字段视图、维度评分、AI 评语、Prompt 模板、处理日志。

## 前端任务

Owner 页面：

- `apps/web/src/pages/owner/ReviewRulePage.tsx`

AI Agent 页面：

- `apps/web/src/pages/agent/AiReviewQueuePage.tsx`

组件：

- `ReviewRuleEditor`
- `ScoreDimensionEditor`
- `AiQueueList`
- `AiReviewDetail`
- `PromptPreview`
- `PromptVersionHistory`
- `DimensionVersionEditor`
- `ModelCallMetadataPanel`
- `RetryJobButton`
- `StructuredOutputPanel`
- `AiQueueStatusTabs`

展示内容：

- 队列状态：待审核、已通过、已打回、转人工、失败。
- 当前提交内容。
- JSON 字段视图。
- 评分维度。
- AI 评语。
- Prompt 模板。
- `function_calling` 结构化输出标识。
- Prompt 版本、评分维度版本和模型参数。
- 原始 Prompt、模型原始输出、结构化解析结果。
- 处理日志。

## 后端任务

模块：

- `ReviewRuleModule`
- `AiReviewQueueModule`
- `LlmProviderModule`

动作：

- 保存任务审核规则。
- 根据 `DatasetProfile` 初始化默认审核规则。
- 保存 Prompt 新版本，旧版本不可覆盖。
- 保存评分维度新版本，旧版本可追溯。
- 查询审核规则。
- 提交后入队。
- 查询 AI job 列表。
- 手动重跑失败 job。
- 查询某条 submission 的 AI 审核结果。

## Agent / 队列任务

Worker 队列：

- Queue name: `ai-review`
- Job payload:

```ts
type AiReviewJobPayload = {
  submissionId: string
  taskId: string
  round: number
  idempotencyKey: string
}
```

Worker 处理流程：

1. 根据 `submissionId` 查询 submission、assignment、task item、review rule。
2. 使用 promptTemplate、rawData、answers 构造 Prompt。
3. Prompt 必须包含官方题目字段、标注员 answers、`expected_dimensions` 或 `dimensions`。
4. 根据 provider 能力选择 `function_calling` 或 `json_schema` structured output。
5. 调用 `LlmProvider.review(input)`。
6. 校验返回结构。
7. 写入 `review_records`，同时保存 Prompt 版本、维度版本和模型调用元数据。
8. 根据 verdict 更新 submission 状态：
   - `pass` -> `AI_PASSED`
   - `reject` -> `AI_REJECTED`
   - `manual` -> `AI_MANUAL`
9. 写入 `audit_logs`。

## 数据库设计

`review_rules`：

- `taskId`
- `promptTemplate`
- `promptVersion`
- `dimensions`
- `dimensionVersion`
- `passThreshold`
- `manualThreshold`
- `provider`
- `model`
- `temperature`

`review_records`：

- `submissionId`
- `reviewerType`: `AI`
- `reviewStage`: `AI_PRECHECK`
- `scores`
- `verdict`
- `comment`
- `rawPrompt`
- `rawOutput`
- `structuredOutput`
- `modelMetadata`
- `retryCount`
- `idempotencyKey`

## API 设计

```text
GET /tasks/:taskId/review-rule
PUT /tasks/:taskId/review-rule
GET /tasks/:taskId/review-rule/versions
GET /ai-review/jobs?status=:status
GET /ai-review/jobs/:submissionId
POST /ai-review/jobs/:submissionId/retry
```

AI 结构化结果：

```json
{
  "scores": {
    "relevance": 92,
    "accuracy": 84,
    "format": 88,
    "safety": 99,
    "overall": 86
  },
  "verdict": "pass",
  "reason": "关键词覆盖核心卖点，标题格式合规，建议通过。"
}
```

`qa_quality` 默认 Prompt 维度：

```text
相关性、准确性、格式合规、安全性、综合分
输入包含 prompt、model_answer、reference、expected_dimensions、标注员 answers
输出 verdict=pass/reject/manual、scores、reason、suggested_fix
```

`preference_compare` 默认 Prompt 维度：

```text
偏好结论 A/B/tie、优势程度 margin、判断依据 dimensions、安全风险 safety_flag、理由质量
输入包含 prompt、response_a、response_b、标注员 preferred/margin/dimensions/annotator_note
输出 verdict=pass/reject/manual、agreement、scores、reason
```

## 关键实现思路

- `LlmProvider` 至少有两个实现：
  - `MockLlmProvider`：本地稳定演示。
  - `HttpLlmProvider`：真实模型接口。
- provider 能力声明必须包含 `supportsFunctionCalling` 和 `supportsJsonSchemaOutput`；优先使用 function calling，不支持时使用 JSON Schema structured output。
- 页面必须展示当前结构化输出模式，优先标记为「function_calling · 结构化」。
- 结构化输出必须通过 zod 或 JSON schema 校验。
- 如果模型返回裸文本，尝试解析失败后进入重试。
- 幂等键：`submissionId:round:ai-review`。
- 如果已经存在同 idempotencyKey 的成功记录，不重复写入。
- `MockLlmProvider` 对相同输入返回稳定结果，便于测试和答辩；真实 provider 必须记录模型名、温度、耗时、输入/输出 token 和 provider requestId。
- `MockLlmProvider` 必须针对官方样例稳定返回：`qa_quality` 的维度评分结构，以及 `preference_compare` 的偏好一致性/理由质量结构。
- Prompt 模板和评分维度发布后不可原地覆盖，新提交引用当前版本，历史审核继续指向当时版本。

## 状态流转设计

Submission：

```text
AI_QUEUED -> AI_REVIEWING -> AI_PASSED -> HUMAN_PENDING
AI_REVIEWING -> AI_REJECTED -> NEEDS_REVISION
AI_REVIEWING -> AI_MANUAL -> HUMAN_PENDING
```

AI Job：

```text
QUEUED -> RUNNING -> SUCCEEDED
RUNNING -> FAILED_RETRYING -> QUEUED
RUNNING -> FAILED_FINAL -> MANUAL_FALLBACK
```

## 测试点

- 提交后队列中出现 AI job。
- Mock provider 返回 pass 时写入 AI 评分。
- Mock provider 返回 reject 时 submission 进入 `NEEDS_REVISION`。
- provider 抛异常时自动重试。
- 重试超过 3 次后转人工。
- 同一 job 重复执行不会重复写成功记录。
- AI 详情页能看到 rawPrompt 和 rawOutput。
- AI 详情页能看到 promptVersion、dimensionVersion、provider、model、temperature、耗时和 token 统计。
- function calling 和 JSON schema output 两种 mock 路径都能产出同一结构化结果。
- `qa_quality` 的 AI 预审 Prompt 包含 `expected_dimensions`，并输出相关性、准确性、格式合规、安全性和综合分。
- `preference_compare` 的 AI 预审 Prompt 包含 `dimensions`，并输出 A/B/tie 判断、一致性和理由质量。
- 图 4 截图级验收：左侧队列状态、右侧 JSON 字段视图、维度评分、AI 评语、Prompt 模板和处理日志完整，所有用户可见文案为简体中文。

## 验收标准

- Labeler 提交后，AI Agent 自动处理。
- AI 评分维度、综合分、结论、理由可见。
- AI 审核记录可追溯。
- Prompt、评分维度、模型参数、原始输出和结构化输出均可追溯。
- 官方两个 profile 都有默认 AI 审核规则，提交后能进入同一 AI 队列并产出不同结构化结果。
- 失败任务可重试。
- 多次失败可转人工兜底。

## 本阶段完成后可演示内容

演示 PDF 中“机审队列”：进入 `/agent/ai-review`，展示左侧队列、右侧提交内容、JSON 字段视图、维度评分、`function_calling` 结构化输出、AI 评语、Prompt、处理日志。

## 下一阶段依赖

Batch 8 人工审核读取 `review_records` 和 submission 状态进行复审。

# Batch 8: Human Review Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Reviewer 可以查看 AI 预审结果，并对提交进行人工复审：复审通过进入终审待办、打回、直接修订后进入终审待办。

**Architecture:** Reviewer 工作台读取 `HUMAN_PENDING` 的 submission，展示 answers、rawData、AI review record 和审计日志。复审动作在事务中写人工 review record、更新 submission/assignment 状态并写审计日志；复审通过不得直接可导出，只能进入 `FINAL_PENDING`。

**Tech Stack:** React, TypeScript, Prisma transactions, shared state machines.

---

## 全局修订约束

- 必须遵守统一登录 `/login`、RBAC 和四端独立 Portal：Owner 端 `/owner/*`、Labeler 端 `/labeler/*`、AI Agent 端 `/agent/*`、Reviewer 端 `/reviewer/*`。
- 所有用户可见 UI 文案、API 用户可见错误消息、代码注释和 Git Commit 摘要必须使用简体中文。
- 实现或验收图 1-5 对应页面前，必须先阅读 `docs/labelhub-plan/visual-reference.md`，并按需打开对应本地 PNG；页面结构、组件命名和交互必须对齐 5 张截图，截图中的「商品标题清洗 v3」作为 UI/UX 设计基准和演示蓝本。
- 默认审核链路必须是 `AI 自动预审 -> 人工复审 -> 终审`；人工复审通过只能进入终审待办，导出只读取 `FINAL_APPROVED` 数据。

## 目标

实现 PDF 4.5 的人工复审台：AI 辅助人工复审，复审通过后进入终审待办，保证三级审核流水线的基础闭环。

## 实现范围

- 审核待办列表。
- 审核结果列表。
- 审核详情。
- AI 评分和评语展示。
- 审核意见输入。
- 通过。
- 打回。
- 直接修订并通过。
- 批量通过。
- 批量打回。
- 指派审核员。
- 审计时间线。
- 审核阶段配置：默认启用 `AI_PRECHECK + RECHECK + FINAL`，本 Batch 交付复审台，Batch 9 交付终审台。
- 严格对齐图 5 的 Reviewer 验收台基础布局：左侧待审列表与批量操作，中间提交内容和 AI 预审结果，右侧统计与审计时间线。

## 前端任务

页面：

- `apps/web/src/pages/reviewer/ReviewListPage.tsx`
- `apps/web/src/pages/reviewer/ReviewDetailPage.tsx`

组件：

- `ReviewQueueTabs`
- `ReviewResultListPage`
- `ReviewSubmissionCard`
- `AiReviewSummary`
- `HumanReviewActionPanel`
- `BulkReviewToolbar`
- `AssignReviewerModal`
- `AuditTimeline`
- `AnswerReadonlyView`
- `ReviewerStatsCards`
- `RecheckActionCards`
- `ReviewStageSwitch`

审核操作：

- 复审通过：必须有可选意见，状态进入 `FINAL_PENDING`。
- 打回：必须填写打回理由。
- 直接修订：弹出表单，修改 answers 后进入 `FINAL_PENDING`。
- 批量通过：仅允许选择同一任务、同一审核阶段的数据。
- 批量打回：必须填写统一打回理由。
- 指派审核员：将待审 submission 分配给指定 Reviewer。

## 后端任务

模块：

- `HumanReviewModule`
- `ReviewTimelineModule`

动作：

- 查询待复审列表。
- 查询审核结果列表。
- 查询审核详情。
- 开始审核。
- 通过。
- 打回。
- 直接修订并通过。
- 批量通过。
- 批量打回。
- 指派审核员。
- 查询审计时间线。

## Agent / 队列任务

本阶段不新增 Agent。人工审核消费 Batch 7 产生的 AI 结果。

## 数据库设计

`review_records` 新增人工记录：

- `reviewerType`: `HUMAN`
- `reviewStage`: `RECHECK`
- `reviewerId`
- `assignedReviewerId`
- `verdict`: `recheck_pass` / `reject` / `revise_pass`
- `comment`
- `revisedAnswers` 可选

`audit_logs`：

- `HUMAN_REVIEW_STARTED`
- `HUMAN_REVIEW_APPROVED`
- `HUMAN_REVIEW_REJECTED`
- `HUMAN_REVIEW_REVISED_APPROVED`
- `HUMAN_REVIEW_BULK_APPROVED`
- `HUMAN_REVIEW_BULK_REJECTED`
- `HUMAN_REVIEW_ASSIGNED`

## API 设计

```text
GET /reviews/pending?stage=recheck
GET /reviews/results?stage=:stage&verdict=:verdict
GET /reviews/:submissionId
POST /reviews/:submissionId/start
POST /reviews/:submissionId/approve
POST /reviews/:submissionId/reject
POST /reviews/:submissionId/revise-approve
POST /reviews/bulk-approve
POST /reviews/bulk-reject
POST /reviews/assign
GET /reviews/:submissionId/timeline
```

打回请求：

```json
{
  "actorId": "user_reviewer_001",
  "reason": "关键词未覆盖“情侣款”卖点，且标题存在多余空格。"
}
```

## 关键实现思路

- Reviewer 只能复审 `HUMAN_PENDING` 或 `RECHECK_REVIEWING` 的 submission。
- 复审通过和直接修订通过后 submission 必须进入 `FINAL_PENDING`，不得进入可导出状态。
- 打回必须写 reason。
- 打回后 assignment 状态回到 `NEEDS_REVISION`，Labeler 才能修改。
- 直接修订要保留原 answers 和 revisedAnswers，审计上要能看出谁改了什么。
- 批量操作不能绕过单条状态机校验；后端逐条校验并在事务中写批量审计 metadata。
- 指派审核员只改变待审归属，不改变审核结论。
- Reviewer 可在结果列表中查看已通过、已打回、已修订通过的历史记录。
- 所有动作必须事务化。

## 状态流转设计

Submission：

```text
HUMAN_PENDING -> RECHECK_REVIEWING
RECHECK_REVIEWING -> RECHECK_APPROVED -> FINAL_PENDING
RECHECK_REVIEWING -> RECHECK_REJECTED -> NEEDS_REVISION
RECHECK_REVIEWING -> RECHECK_REVISED_APPROVED -> FINAL_PENDING
```

Assignment：

```text
SUBMITTED -> UNDER_RECHECK
UNDER_RECHECK -> FINAL_PENDING
SUBMITTED -> NEEDS_REVISION
```

## 测试点

- AI 通过的数据进入人工待审。
- Reviewer 开始复审后状态为 `RECHECK_REVIEWING`。
- 复审通过后 submission 为 `FINAL_PENDING`，不能被 Batch 10 导出。
- 打回后 assignment 为 `NEEDS_REVISION`。
- 打回理由能被 Labeler 查询。
- 直接修订后保留修订记录。
- 批量通过生成多条人工审核记录和一条批量操作审计摘要。
- 批量打回要求统一理由，Labeler 可见该理由。
- 指派审核员后只有被指派 Reviewer 或管理员可领取该条审核。
- 审核结果列表能按阶段和结论筛选。
- 时间线包含 AI 和人工操作。

## 验收标准

- Reviewer 能完成一条数据的复审，复审通过后进入终审待办。
- AI 评语、原始提交、审核意见和时间线可见。
- 打回后 Labeler 能看到原因并重新修改。
- 复审通过后的数据不能被 Batch 10 导出，必须等待 Batch 9 终审通过。
- 审核员可以批量操作和指派待审数据。
- 审核结果列表可追溯每条数据的历史审核结论。

## 本阶段完成后可演示内容

演示人工复审页面：查看 AI 结果，填写复审意见，复审通过进入终审待办或打回，右侧时间线完整更新。

## 下一阶段依赖

Batch 9 将在此基础上加入多轮提交 diff 和终审视图。

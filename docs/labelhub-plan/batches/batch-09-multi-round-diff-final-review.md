# Batch 9: Multi-Round Diff And Final Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 支持打回后的多轮修改、提交 diff 对比，以及复审/终审两级审核。

**Architecture:** 每一轮提交都是不可变 submission 快照，diff 服务比较同一 assignment 下不同 round 的 answers。终审作为独立 review stage，复审通过后进入 `FINAL_PENDING`。

**Tech Stack:** TypeScript, Prisma, React diff view, shared state machines.

---

## 全局修订约束

- 必须遵守统一登录 `/login`、RBAC 和四端独立 Portal：Owner 端 `/owner/*`、Labeler 端 `/labeler/*`、AI Agent 端 `/agent/*`、Reviewer 端 `/reviewer/*`。
- 所有用户可见 UI 文案、API 用户可见错误消息、代码注释和 Git Commit 摘要必须使用简体中文。
- 实现或验收图 1-5 对应页面前，必须先阅读 `docs/labelhub-plan/visual-reference.md`，并按需打开对应本地 PNG；页面结构、组件命名和交互必须对齐 5 张截图，截图中的「商品标题清洗 v3」作为 UI/UX 设计基准和演示蓝本。
- 默认审核链路必须是 `AI 自动预审 -> 人工复审 -> 终审`；人工复审通过只能进入终审待办，导出只读取 `FINAL_APPROVED` 数据。

## 目标

实现 PDF 4.5 中「第 1/2 轮 diff、复审/终审视图、完整审计时间线」。

## 实现范围

- 打回后 Labeler 再次提交。
- 多轮提交保留。
- 第 1/2 轮 answers diff。
- 复审通过后进入终审。
- 终审通过后数据可入库/导出。
- 终审打回后回到 Labeler 修改。
- 支持三阶段审核配置：`INITIAL`、`RECHECK`、`FINAL`，默认启用 `RECHECK + FINAL`；如果任务启用初审，则 AI 后先进入初审。
- 严格对齐图 5 Reviewer 验收台终审布局：左侧待审列表与批量操作，中间第 1 / 2 轮 Diff 视图、AI 预审结果、审核意见和操作卡片，右侧统计与完整审计时间线。

## 前端任务

Labeler：

- 打回提示区域展示上一轮审核意见。
- 修改后重新提交。

Reviewer：

- `RoundDiffView`
- `ReviewStageSwitch`
- `ReviewStageConfigBadge`
- `FinalReviewActionPanel`
- `RoundHistoryTabs`
- `FinalReviewStatsPanel`
- `ReviewAuditSideTimeline`

页面变化：

- 复审视角看 AI 结果和当前轮。
- 终审视角看复审意见、AI 结果、diff 和完整时间线。
- 终审页必须展示第 1 轮提交和第 2 轮提交的字段级 Diff，高亮新增、删除、修改。
- 初审视角只展示初审待办和结论，适合任务负责人配置多级审核时启用。

## 后端任务

模块：

- `SubmissionRoundModule`
- `DiffModule`
- `FinalReviewModule`

动作：

- 查询某 assignment 的所有 rounds。
- 查询两个 round 的 diff。
- 复审通过后进入终审待审。
- 初审通过后进入复审待审。
- 初审打回后回到 Labeler 修改。
- 终审通过。
- 终审打回。

## Agent / 队列任务

- Labeler 二次提交后再次进入 AI 预审队列。
- AI review 的 idempotencyKey 必须包含 round，避免第 1 轮和第 2 轮冲突。

## 数据库设计

继续使用：

- `submissions.round`
- `review_records.reviewStage`

新增推荐字段：

- `submissions.parentSubmissionId` 可选，用于指向上一轮。
- `review_records.reviewStage`: `AI_PRECHECK` / `INITIAL` / `RECHECK` / `FINAL`
- 任务审核配置保存启用阶段数组，例如 `["RECHECK", "FINAL"]` 或 `["INITIAL", "RECHECK", "FINAL"]`。

## API 设计

```text
GET /assignments/:assignmentId/submissions
GET /assignments/:assignmentId/diff?fromRound=1&toRound=2
GET /reviews/final-pending
GET /reviews/initial-pending
POST /reviews/:submissionId/recheck-approve
POST /reviews/:submissionId/initial-approve
POST /reviews/:submissionId/initial-reject
POST /reviews/:submissionId/final-approve
POST /reviews/:submissionId/final-reject
```

diff 响应示例：

```json
{
  "fromRound": 1,
  "toRound": 2,
  "changes": [
    {
      "fieldKey": "keywords",
      "type": "changed",
      "before": ["折叠", "户外"],
      "after": ["折叠", "户外", "5件套", "便携", "露营"]
    }
  ]
}
```

## 关键实现思路

- 不允许覆盖旧 submission。
- Diff 以 `fieldKey` 为单位，不做复杂文本 Diff。
- 对数组字段展示新增/删除项。
- 复审和终审使用同一套 review record 表，通过 `reviewStage` 区分。
- 初审、复审和终审使用同一套 review record 表，通过 `reviewStage` 区分。
- 默认开发路径启用复审和终审；初审作为可配置阶段实现接口和列表，不影响默认演示链路。
- 复审通过不能直接让数据可导出，必须进入终审或任务配置明确关闭终审；答辩默认展示真实终审按钮。

## 状态流转设计

```text
NEEDS_REVISION -> SUBMITTED -> AI_QUEUED -> AI_REVIEWING -> HUMAN_PENDING
HUMAN_REVIEWING -> INITIAL_APPROVED -> RECHECK_PENDING
HUMAN_REVIEWING -> RECHECK_APPROVED -> FINAL_PENDING
FINAL_PENDING -> FINAL_REVIEWING -> FINAL_APPROVED
FINAL_REVIEWING -> FINAL_REJECTED -> NEEDS_REVISION
```

## 测试点

- 第 1 轮被打回后，第 2 轮提交 round 为 2。
- 第 1 轮和第 2 轮 answers 都保留。
- diff 能显示字段变化。
- 图 5 截图级验收：复审 / 终审切换、第 1 / 2 轮 Diff、AI 评语、批量操作和右侧审计时间线完整，所有文案为简体中文。
- 二次提交触发新的 AI review。
- 任务启用初审时，AI 后进入初审待办，初审通过再进入复审。
- 复审通过后进入终审待审。
- 终审通过后数据状态为可导出。
- 终审打回后 Labeler 可再次修改。

## 验收标准

- 一条数据能完整经历：提交 -> AI 打回/人工打回 -> 修改 -> 再提交 -> AI 通过 -> 复审 -> 终审通过。
- 启用初审的任务能经历 AI -> 初审 -> 复审 -> 终审；默认任务能经历 AI -> 复审 -> 终审。
- Reviewer 能看到第 1/2 轮 diff。
- 时间线包含所有轮次和所有审核动作。

## 本阶段完成后可演示内容

演示 PDF 中“验收（人工审核流转）”：第 1 轮和第 2 轮对比，AI 评语，复审/终审切换，完整审计时间线。

## 下一阶段依赖

Batch 10 导出中心只导出 `FINAL_APPROVED` 数据。

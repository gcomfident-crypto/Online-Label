# Batch 6: Labeler Workbench, Drafts And Submissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Labeler 可以在标注工作台逐题作答、自动保存草稿、提交答案并进入 AI 预审状态。

**Architecture:** 工作台复用 Batch 3 的 `SchemaRenderer`。草稿是可覆盖记录，提交是不可变快照。提交时后端再次执行 Schema 校验，并写入审计日志。

**Tech Stack:** React, TypeScript, Zustand, debounce autosave, Prisma transactions.

---

## 全局修订约束

- 必须遵守统一登录 `/login`、RBAC 和四端独立 Portal：Owner 端 `/owner/*`、Labeler 端 `/labeler/*`、AI Agent 端 `/agent/*`、Reviewer 端 `/reviewer/*`。
- 所有用户可见 UI 文案、API 用户可见错误消息、代码注释和 Git Commit 摘要必须使用简体中文。
- 实现或验收图 1-5 对应页面前，必须先阅读 `docs/labelhub-plan/visual-reference.md`，并按需打开对应本地 PNG；页面结构、组件命名和交互必须对齐 5 张截图，截图中的「商品标题清洗 v3」作为 UI/UX 设计基准和演示蓝本。
- 默认审核链路必须是 `AI 自动预审 -> 人工复审 -> 终审`；人工复审通过只能进入终审待办，导出只读取 `FINAL_APPROVED` 数据。

## 目标

实现 PDF 4.3 标注台：题目导航、草稿自动保存、提交校验、打回提示、LLM 辅助入口。

## 实现范围

- Labeler 工作台。
- 题目导航。
- 上一题、下一题、跳题。
- 当前题原始数据 + Schema 动态表单。
- 根据 `DatasetProfile` 切换题目布局：`qa_quality` 使用问答质量评分布局，`preference_compare` 使用 A/B 偏好对比布局。
- 草稿自动保存。
- 草稿保存失败提示和本地临时缓存。
- 手动保存草稿。
- 提交校验。
- 我的贡献统计。
- 我的数据列表：已提交、通过、打回、待修改。
- 我的数据列表支持按任务类型和题目 ID 筛选。
- 打回原因展示区域，先读取已有 review 记录。
- 快捷键：提交、保存草稿、上一题、下一题、报告题目。
- 严格对齐图 3 Labeler 标注台：左侧题目导航，中间标注表单，右侧我的贡献 / 本题历史 / 快捷键面板，底部固定操作区。

## 前端任务

页面：

- `apps/web/src/pages/labeler/LabelerWorkbenchPage.tsx`
- `apps/web/src/pages/labeler/MyDataPage.tsx`

组件：

- `QuestionNavigator`
- `AutosaveIndicator`
- `RejectionNotice`
- `LabelerStatsPanel`
- `MyDataStatusTabs`
- `MyDataTable`
- `KeyboardShortcutHelp`
- `WorkbenchFooterActions`
- `SubmissionValidationSummary`
- `LabelerRightInsightPanel`
- `QuestionStatusList`

行为：

- 进入页面加载 assignment 列表和当前题。
- 左侧题目导航展示序号、题目标题摘要和状态：已提交、草稿、已打回、进行中、待标。
- 使用 Renderer 渲染表单。
- 输入后 800ms debounce 自动保存草稿。
- 自动保存失败时，将 answers 写入浏览器本地临时缓存，并在恢复网络或刷新后提示“检测到本地未同步草稿”。
- 切题前保存当前草稿。
- 上一题/下一题/跳题都必须先检查当前题是否存在未保存改动。
- 点击提交时先前端校验，再调用提交 API。
- 提交成功后当前题状态更新。
- 标注台顶部必须展示草稿自动保存状态，例如「草稿已自动保存 18:02:31」。
- 打回提示必须在表单上方高亮展示上一轮打回原因。
- `LLM 触发组件` 必须出现在题目级表单中，支持「重新生成」和「采纳为答案」中文操作。
- 底部固定操作区必须包含上一题、下一题、保存草稿、提交本题，并展示快捷键提示。
- Labeler 可以进入“我的数据”按状态查看提交、通过、打回、待修改列表，并从打回项回到工作台修改。
- `qa_quality` 工作台重点展示 `prompt`、`model_answer`、`reference`、`expected_dimensions`，并根据 `media_type` 展示媒体素材。
- `preference_compare` 工作台并排展示 `response_a` 与 `response_b`，采集 `preferred`、`margin`、`dimensions`、`safety_flag` 和 `annotator_note`。
- 官方数据中已有的 `preferred`、`margin`、`annotator_note` 默认保留为 rawData/reference seed，不自动生成正式 submission；演示需要预填时由 seed 脚本生成 draft。

## 后端任务

模块：

- `DraftModule`
- `SubmissionModule`
- `LabelerStatsModule`

动作：

- 查询当前 assignment 和题目。
- 保存草稿。
- 读取草稿。
- 提交答案。
- 查询我的贡献统计。
- 查询我的数据列表。
- 查询上一轮打回理由。
- 接收“报告题目”请求，记录题目异常说明，后续 Owner 可查看。

提交事务：

1. 校验 assignment 属于当前 Labeler。
2. 查询任务当前模板和 schemaVersion。
3. 用 Schema 校验 answers。
4. 创建 `submissions` 快照，`round = previousRound + 1`。
5. 更新 assignment 状态为 `SUBMITTED`。
6. 写审计日志。
7. 创建 AI review job 记录或把状态置为 `AI_QUEUED`，为 Batch 7 入队做准备。

## Agent / 队列任务

本阶段可以先不接 BullMQ。提交后只设置状态为 `AI_QUEUED`。Batch 7 会补真实入队。

## 数据库设计

`drafts`：

- `assignmentId`
- `answers`
- `schemaVersion`
- `updatedAt`

`submissions`：

- `assignmentId`
- `round`
- `answers`
- `status`
- `schemaVersion`
- `submittedAt`

`audit_logs`：

- `DRAFT_SAVED`
- `SUBMISSION_CREATED`

## API 设计

```text
GET /labeler/workbench/:taskId
GET /assignments/:assignmentId
GET /assignments/:assignmentId/draft
PUT /assignments/:assignmentId/draft
POST /assignments/:assignmentId/submissions
GET /labeler/stats?taskId=:taskId
GET /labeler/my-data?taskId=:taskId&status=:status&datasetKind=:datasetKind&itemId=:itemId
GET /assignments/:assignmentId/rejection-notice
POST /assignments/:assignmentId/report-issue
```

提交请求：

```json
{
  "actorId": "user_labeler_001",
  "answers": {
    "relevance_score": "5",
    "accuracy_score": "4",
    "format_score": "4",
    "safety_score": "5",
    "issue_tags": ["信息缺失"],
    "summary": "回答基本正确，可补充关键限定。",
    "comment": "模型回答覆盖了核心事实，但对参考答案中的限定条件说明不足。"
  }
}
```

## 关键实现思路

- 草稿和提交分离：草稿可以覆盖，提交不能覆盖。
- 提交时必须创建快照，保存 `schemaVersion`。
- 前端自动保存失败时要显示失败状态，不阻塞继续编辑。
- 本地临时缓存只作为防丢失兜底，提交前仍必须同步到后端并通过后端校验。
- 快捷键需要避开输入法组合键，提交推荐 `Cmd/Ctrl + Enter`，保存草稿推荐 `Cmd/Ctrl + S`。
- 后端提交校验是最终可信校验。
- 当前题上显示上一轮打回意见，帮助 Labeler 修改。
- workbench 不直接信任官方 rawData 中的已标注字段作为提交结果，只有 Labeler 提交的 answers 才进入 `submissions`。

## 状态流转设计

Assignment：

```text
CLAIMED -> IN_PROGRESS
IN_PROGRESS -> SUBMITTED
NEEDS_REVISION -> IN_PROGRESS -> SUBMITTED
```

Submission：

```text
SUBMITTED -> AI_QUEUED
```

## 测试点

- 输入答案后自动保存草稿。
- 刷新页面后草稿恢复。
- 后端保存失败时，本地临时缓存可恢复草稿。
- 上一题/下一题/跳题能正确切换并保留草稿。
- 必填字段为空时提交失败。
- 合法答案提交成功并创建 submission。
- 打回状态下进入工作台能看到打回原因。
- 图 3 截图级验收：左侧题目导航、中间表单、右侧贡献 / 历史 / 快捷键和底部操作区完整，所有文案为简体中文。
- 我的数据列表能按已提交、通过、打回、待修改过滤。
- 我的数据列表能按 `qa_quality` / `preference_compare` 和题目 ID 过滤。
- `qa_quality` 题目能展示 `text/image/video/markdown` 四类媒体。
- `preference_compare` 题目能并排展示 A/B 回答，并保存偏好结论。
- 多轮提交 round 自增。

## 验收标准

- Labeler 能完成「领取 -> 作答 -> 自动保存 -> 提交」。
- 数据库中存在 draft 和 submission。
- 提交时状态变化和审计日志正确。
- 页面能展示提交数量、通过数量、打回数量和待修改数量。
- Labeler 能从“我的数据”的打回项进入修改，并看到上一轮审核意见。
- Labeler 能在官方两个 profile 下完成不同标注结构的提交。

## 本阶段完成后可演示内容

演示 PDF 中“标注台”：题目导航、上一题/下一题/跳题、草稿保存、LLM 辅助 mock、提交校验、打回提示和我的数据列表。

## 下一阶段依赖

Batch 7 会把提交后的 `AI_QUEUED` 变成真实 AI 预审队列任务。

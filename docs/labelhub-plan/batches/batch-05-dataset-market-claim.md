# Batch 5: Dataset Import, Task Market And Claim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Owner 可以导入题目数据，Labeler 可以在任务广场看到发布任务并领取题目。

**Architecture:** Owner 导入官方 `datasets.zip` 中的 JSON/JSONL/Excel，按 `DatasetProfile` 归一化后写入 `task_items`；Labeler 通过任务广场查询 `PUBLISHED` 任务，领取时在事务中创建 `assignments` 并锁定题目。

**Tech Stack:** React, TypeScript, Prisma transactions, API file upload or text import.

---

## 全局修订约束

- 必须遵守统一登录 `/login`、RBAC 和四端独立 Portal：Owner 端 `/owner/*`、Labeler 端 `/labeler/*`、AI Agent 端 `/agent/*`、Reviewer 端 `/reviewer/*`。
- 所有用户可见 UI 文案、API 用户可见错误消息、代码注释和 Git Commit 摘要必须使用简体中文。
- 实现或验收图 1-5 对应页面前，必须先阅读 `docs/labelhub-plan/visual-reference.md`，并按需打开对应本地 PNG；页面结构、组件命名和交互必须对齐 5 张截图，截图中的「商品标题清洗 v3」作为 UI/UX 设计基准和演示蓝本。
- 默认审核链路必须是 `AI 自动预审 -> 人工复审 -> 终审`；人工复审通过只能进入终审待办，导出只读取 `FINAL_APPROVED` 数据。

## 目标

让任务有真实题目数据，并让 Labeler 能进入任务。

## 实现范围

- JSON/JSONL/Excel 数据导入。
- zip 批量导入官方测试数据，并跳过 macOS/Excel 临时文件。
- 按 `DatasetProfile` 校验 `qa_quality` 和 `preference_compare`。
- 题目预览。
- 题目批量编辑。
- 导入错误行定位和失败明细。
- 任务广场。
- 任务广场搜索、筛选、任务卡片状态。
- 先到先得领取。
- 简单配额控制。

## 前端任务

Owner 页面：

- `apps/web/src/pages/owner/DatasetImportPage.tsx`
- 上传或粘贴 JSON/JSONL。
- 上传 Excel `.xlsx`，默认读取第一个 sheet，第一行作为字段名。
- 上传官方 `datasets.zip`，展示可导入 profile：`qa_quality`、`preference_compare`，并显示跳过文件列表。
- 显示导入预览：前 5 条 rawData。
- 显示导入结果：成功条数、失败条数。
- 显示失败明细：行号、字段、错误原因。
- 题目预览表格支持批量选择、批量删除、批量修改字段值。

Labeler 页面：

- `apps/web/src/pages/labeler/TaskMarketPage.tsx`
- 搜索框：按任务标题、任务 ID、标签搜索。
- 筛选器：按标签、奖励规则、截止时间、是否已领取筛选。
- 任务卡片展示：
  - 标题
  - 标签
  - 奖励
  - 剩余题量
  - 截止时间
  - 分发策略
  - 任务状态：可领取、已领取、已满额、已截止
- 领取按钮。

组件：

- `DatasetImportPanel`
- `DatasetErrorTable`
- `DatasetPreviewTable`
- `BulkItemEditDrawer`
- `TaskMarketFilters`
- `TaskMarketCard`
- `TaskQuotaProgress`

## 后端任务

模块：

- `DatasetModule`
- `MarketModule`
- `AssignmentModule`

动作：

- 解析 JSON 数组。
- 解析 JSONL。
- 解析 Excel `.xlsx`，将每行转换为 rawData。
- 解析官方 zip 中的 JSON/JSONL/Excel 文件，忽略 `__MACOSX/`、`.DS_Store`、`._*`、`.~*.xlsx`。
- 按 `DatasetProfile` 校验必填字段：
  - `qa_quality`：`id`、`prompt`、`model_answer`、`expected_dimensions`；当 `media_type != text` 时，`image/video` 题需有 `media_url`，`markdown` 题需有 `content_markdown`。
  - `preference_compare`：`id`、`prompt`、`response_a`、`response_b`。
- 归一化 Excel 字段：`tags`、`expected_dimensions`、`dimensions` 按 ` | ` 拆数组；`safety_flag` 的 `是/否` 转 boolean。
- 写入 `task_items`。
- 批量编辑题目 rawData。
- 批量删除未领取题目。
- 查询发布任务。
- 按关键词、标签、截止时间、领取状态过滤任务。
- 领取任务时创建 assignment。

## Agent / 队列任务

本阶段不涉及 Agent。

## 数据库设计

`task_items`：

- `taskId`
- `rawData`
- `status`: `UNASSIGNED` / `ASSIGNED` / `COMPLETED`
- `itemIndex`

`assignments`：

- `taskId`
- `itemId`
- `labelerId`
- `status`: `CLAIMED` / `IN_PROGRESS` / `SUBMITTED` / `NEEDS_REVISION` / `COMPLETED`
- `claimedAt`

## API 设计

```text
POST /tasks/:taskId/items/import
POST /tasks/:taskId/items/import-zip
GET /tasks/:taskId/items/preview
PATCH /tasks/:taskId/items/bulk-edit
DELETE /tasks/:taskId/items/bulk-delete
GET /market/tasks?keyword=:keyword&tag=:tag&claimStatus=:claimStatus
POST /market/tasks/:taskId/claim
GET /labeler/assignments
```

导入请求示例：

```json
{
  "actorId": "user_owner_001",
  "datasetKind": "qa_quality",
  "format": "jsonl",
  "content": "{\"id\":\"Q0001\",\"prompt\":\"光合作用主要发生在植物细胞的哪个结构中？\",\"model_answer\":\"光合作用主要发生在叶绿体中。\",\"expected_dimensions\":[\"相关性\",\"准确性\"]}"
}
```

Excel 导入约定：

```text
第一行是字段名
qa_quality 默认读取 sheet「标注题目」
preference_compare 默认读取 sheet「偏好对比」
第二行开始是题目数据
空行跳过
缺少 profile 必填字段的行进入失败明细，不写入 task_items
Excel 中以 " | " 分隔的数组字段会被归一化为数组
```

领取响应示例：

```json
{
  "assignmentId": "asg_001",
  "taskId": "task_001",
  "claimedCount": 1
}
```

## 关键实现思路

- 导入只负责 rawData，不负责标注答案。
- JSON/JSONL/Excel 三种导入最终都转换为统一 `rawData: Record<string, unknown>`。
- 官方数据导入由 `DatasetProfile` 决定必填字段、sheet 名、字段归一化和导入统计。
- 同一 profile 的 JSON、JSONL、Excel 导入后，同一 `id` 的 rawData 结构必须一致。
- `preference_compare` 中已有的 `preferred`、`margin`、`annotator_note` 作为官方参考/seed 字段保留在 rawData，不直接生成正式 submission。
- 批量编辑只能修改 `UNASSIGNED` 或未提交题目；已经有 submission 的题目不能被覆盖。
- 题目预览默认分页，避免一次渲染大量数据卡顿。
- 领取时必须使用数据库事务：
  - 找到一条 `UNASSIGNED` 题目。
  - 更新为 `ASSIGNED`。
  - 创建 `assignment`。
  - 更新任务已领取数。
- 任务必须是 `PUBLISHED` 才能领取。
- 任务超过配额或截止时间不能领取。

## 状态流转设计

题目状态：

```text
UNASSIGNED -> ASSIGNED -> COMPLETED
ASSIGNED -> UNASSIGNED
```

领取状态：

```text
CLAIMED -> IN_PROGRESS -> SUBMITTED
```

## 测试点

- 导入 10 条 JSONL 后数据库有 10 条 `task_items`。
- 导入 `qa_quality.json`、`qa_quality.jsonl`、`qa_quality.xlsx` 后均得到 30 条有效题目。
- 导入 `preference_compare.json`、`preference_compare.jsonl`、`preference_compare.xlsx` 后均得到 12 条有效题目。
- 导入官方 zip 时跳过 `__MACOSX`、`.DS_Store`、`._*`、`.~qa_quality.xlsx`。
- 导入 Excel 后数据库行数与有效数据行一致。
- 非 JSON 行返回具体错误行号。
- Excel 缺 profile 必填列时返回具体 sheet 行号。
- Excel `tags = "生物 | 基础科学"` 归一化为 `["生物", "基础科学"]`。
- Excel `safety_flag = "否"` 归一化为 `false`。
- 批量编辑后 rawData 字段被正确更新，已有提交题目不会被覆盖。
- 进行中任务出现在任务广场。
- 任务广场搜索和筛选能缩小结果。
- 草稿/暂停/结束任务不出现在任务广场。
- Labeler 领取后生成 assignment。
- 并发领取不会领取同一题。

## 验收标准

- Owner 能导入官方 `qa_quality` 和 `preference_compare` 的 JSON、JSONL、Excel 数据。
- Owner 能上传官方 zip 并看到 profile、行数、字段、跳过文件和错误行。
- Owner 能预览、批量编辑和定位导入错误。
- Labeler 能看到任务广场。
- Labeler 能搜索和筛选任务卡片。
- Labeler 能领取进行中的任务。
- 数据库中 `task_items.status` 和 `assignments` 正确变化。

## 本阶段完成后可演示内容

Owner 导入官方 `qa_quality` 或 `preference_compare` 数据，Labeler 在任务广场点击领取，系统分配一条题目。

## 下一阶段依赖

Batch 6 会基于 assignment 渲染作答页面，并保存草稿与提交。

# Batch 10: Export Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Owner 可以异步导出终审通过的数据，支持 JSON、JSONL、CSV、Excel 和字段映射。

**Architecture:** API 创建 `export_jobs`，Worker 消费 `export` 队列生成文件，导出历史页面轮询 job 状态并提供下载。

**Tech Stack:** BullMQ, Prisma, Node.js file system or object storage, json2csv, ExcelJS.

---

## 全局修订约束

- 必须遵守统一登录 `/login`、RBAC 和四端独立 Portal：Owner 端 `/owner/*`、Labeler 端 `/labeler/*`、AI Agent 端 `/agent/*`、Reviewer 端 `/reviewer/*`。
- 所有用户可见 UI 文案、API 用户可见错误消息、代码注释和 Git Commit 摘要必须使用简体中文。
- 实现或验收图 1-5 对应页面前，必须先阅读 `docs/labelhub-plan/visual-reference.md`，并按需打开对应本地 PNG；页面结构、组件命名和交互必须对齐 5 张截图，截图中的「商品标题清洗 v3」作为 UI/UX 设计基准和演示蓝本。
- 默认审核链路必须是 `AI 自动预审 -> 人工复审 -> 终审`；人工复审通过只能进入终审待办，导出只读取 `FINAL_APPROVED` 数据。

## 目标

实现数据交付闭环：审核通过的数据可以按下游训练要求导出。

## 实现范围

- 导出配置抽屉。
- 字段映射。
- 是否包含审核记录。
- JSON 导出。
- JSONL 导出。
- CSV 导出。
- Excel 导出。
- 四种格式均为 PDF 4.6 验收必做，不能只实现其中一种。
- 导出历史。
- 异步导出状态。
- 字段映射预览。
- 包含/不包含审核记录的结果对比预览。
- 官方 profile 字段映射预设：`qa_quality` 和 `preference_compare`。

## 前端任务

页面：

- `apps/web/src/pages/owner/ExportCenterPage.tsx`

组件：

- `ExportJobTable`
- `CreateExportDrawer`
- `FieldMappingEditor`
- `FieldMappingPreviewTable`
- `ProfileMappingPresetSelector`
- `ExportFormatSelector`
- `IncludeReviewToggle`
- `ReviewIncludedDiffPreview`
- `DownloadExportButton`

页面行为：

- Owner 选择任务。
- 系统根据任务 `datasetKind` 自动加载官方字段映射预设。
- 选择导出格式。
- 配置字段映射：
  - 原字段名
  - 导出字段名
  - 是否包含
- 选择是否包含审核记录。
- 在创建导出任务前预览前 5 行导出结果。
- 切换“包含审核记录”时显示字段差异：AI 分数、AI 评语、人工审核结论、审核时间线摘要。
- 创建导出任务。
- 查看导出状态和下载文件。

## 后端任务

模块：

- `ExportModule`
- `ExportService`
- `ExportRepository`

动作：

- 创建导出任务。
- 查询导出历史。
- 查询导出详情。
- 下载导出文件。
- 重试失败导出。

## Agent / 队列任务

Worker 队列：

- Queue name: `export`
- Job payload:

```ts
type ExportJobPayload = {
  exportJobId: string
  taskId: string
  format: 'json' | 'jsonl' | 'csv' | 'xlsx'
}
```

Worker 流程：

1. 读取 `export_jobs`。
2. 查询 `FINAL_APPROVED` submissions；禁止导出 `RECHECK_APPROVED`、`FINAL_PENDING` 或任何未终审通过数据。
3. 合并 task item rawData、answers、review records。
4. 应用字段映射。
5. 生成对应格式文件。
6. 写入 `filePath`。
7. 更新 job 状态。

## 数据库设计

`export_jobs`：

- `taskId`
- `format`
- `status`: `QUEUED` / `PROCESSING` / `SUCCEEDED` / `FAILED`
- `fieldMapping`
- `includeReviews`
- `filePath`
- `errorMessage`
- `createdBy`
- `createdAt`
- `finishedAt`

## API 设计

```text
POST /exports
GET /exports?taskId=:taskId
POST /exports/preview
GET /exports/:exportJobId
GET /exports/:exportJobId/download
POST /exports/:exportJobId/retry
```

创建导出请求：

```json
{
  "taskId": "task_001",
  "format": "csv",
  "includeReviews": true,
  "fieldMapping": [
    { "source": "rawData.id", "target": "id", "enabled": true },
    { "source": "rawData.prompt", "target": "prompt", "enabled": true },
    { "source": "rawData.model_answer", "target": "model_answer", "enabled": true },
    { "source": "answers.relevance_score", "target": "relevance_score", "enabled": true },
    { "source": "answers.accuracy_score", "target": "accuracy_score", "enabled": true },
    { "source": "answers.comment", "target": "comment", "enabled": true },
    { "source": "review.overall", "target": "ai_score", "enabled": true }
  ]
}
```

## 关键实现思路

- 导出只读取终审通过数据，不读取草稿、复审通过待终审和未通过数据。
- 导出参数必须保存快照，后续下载不能受页面配置变化影响。
- JSON/JSONL 可以直接写对象。
- CSV 对数组字段用 `|` 连接。
- Excel 用第一行作为 header。
- 字段映射预览使用与正式导出相同的 mapping 函数，只限制返回前 5 行，避免预览和最终导出不一致。
- `includeReviews=true` 时至少包含 AI 综合分、AI 结论、人工最终结论、最终审核意见；`includeReviews=false` 时导出只包含 rawData 和 answers 映射字段。
- `qa_quality` 预设至少导出：`id`、`prompt`、`model_answer`、`relevance_score`、`accuracy_score`、`format_score`、`safety_score`、`issue_tags`、`comment`、`ai_overall`、`human_verdict`。
- `preference_compare` 预设至少导出：`id`、`prompt`、`response_a`、`response_b`、`preferred`、`margin`、`dimensions`、`safety_flag`、`annotator_note`、`human_verdict`。
- 文件可先保存到 `storage/exports/`，部署文档中说明生产环境可替换为对象存储。

## 状态流转设计

```text
QUEUED -> PROCESSING -> SUCCEEDED
PROCESSING -> FAILED
FAILED -> QUEUED
```

## 测试点

- 创建导出 job 后状态为 `QUEUED`。
- Worker 处理后状态为 `SUCCEEDED`。
- JSON 文件内容是数组。
- JSONL 文件每行是一个 JSON 对象。
- CSV 文件有 header。
- Excel 文件可打开。
- `qa_quality` 官方数据四种格式导出字段与预设一致。
- `preference_compare` 官方数据四种格式导出字段与预设一致。
- includeReviews=false 时不包含审核字段。
- 预览结果和最终导出前 5 行字段一致。
- includeReviews=true/false 切换时预览字段差异正确。
- 导出数量等于终审通过数量。
- 复审通过但未终审的数据不会出现在预览和正式导出中。

## 验收标准

- Owner 可以创建导出任务。
- 四种格式均能生成。
- 创建导出前可以预览字段映射结果。
- 官方两个 profile 都能使用字段映射预设导出。
- 导出历史显示状态、创建时间、完成时间和下载入口。
- 导出文件可被下游消费。

## 本阶段完成后可演示内容

Owner 选择已终审通过的数据，配置字段映射，导出 JSON/JSONL/CSV/Excel，并打开文件展示结构。

## 下一阶段依赖

Batch 11 对导出、审核、AI 和核心链路做稳定性补强。

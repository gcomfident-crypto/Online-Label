# LabelHub 基础技术文档

## 1. 统一登录与四端 Portal

统一入口为 `/login`。登录后按角色跳转：

- `OWNER` -> `/owner/tasks`
- `LABELER` -> `/labeler/market`
- `AI_AGENT` -> `/agent/ai-review`
- `REVIEWER` -> `/reviewer/reviews`

四端使用独立 Layout、独立导航、独立路由守卫和独立页面目录。错误角色访问其他 Portal 会进入无权限页；未登录访问 Portal 会跳转登录页。API 层保留角色和资源权限校验，前端守卫不能替代后端权限。

## 2. 官方数据 Profile

`qa_quality` 必需字段：

- `id`
- `prompt`
- `model_answer`
- `expected_dimensions`

可选媒体字段：

- `media_type`
- `media_url`
- `content_markdown`

`preference_compare` 必需字段：

- `id`
- `prompt`
- `response_a`
- `response_b`

参考字段：

- `preferred`
- `margin`
- `dimensions`
- `safety_flag`
- `annotator_note`

## 3. 导入归一化

- JSON：按对象字段直接读取。
- JSONL：逐行解析 JSON。
- Excel：按官方 sheet 读取。
- zip：遍历文件并按扩展名分发给具体 importer。

跳过临时文件：

- `__MACOSX/`
- `.DS_Store`
- `._*`
- `.~*.xlsx`

Excel 归一化：

- `tags`、`expected_dimensions`、`dimensions` 按 ` | ` 拆分为数组。
- `safety_flag` 的 `是/否` 转为 `true/false`。
- 空白字段不伪造默认标注结果。

## 4. 动态表单

Owner 使用 Designer 配置 Schema，Labeler 使用 Renderer 作答。Schema 支持：

- 展示项和输入项。
- 单选、多选、标签选择、文本域、富文本。
- 文件/图片、JSON 编辑器。
- 分组容器、多 Tab 布局。
- 字段联动。
- 题目级 LLM 辅助调用。

Designer 和 Renderer 共用 `LabelHubSchema`，避免设计态与运行态分叉。

## 5. 状态机

任务状态：

```text
DRAFT -> PUBLISHED -> PAUSED -> PUBLISHED -> ENDED
```

提交审核主链路：

```text
SUBMITTED -> AI_QUEUED -> AI_REVIEWING -> HUMAN_PENDING -> RECHECK_REVIEWING -> FINAL_PENDING -> FINAL_REVIEWING -> FINAL_APPROVED
```

打回链路：

```text
RECHECK_REJECTED -> NEEDS_REVISION -> SUBMITTED
FINAL_REJECTED -> NEEDS_REVISION -> SUBMITTED
```

导出状态：

```text
QUEUED -> PROCESSING -> SUCCEEDED
FAILED -> QUEUED
```

关键动作写入审计日志，包括任务发布、AI 转人工、复审打回、复审通过、终审通过和导出。

## 6. AI Agent

默认演示使用：

```text
LLM_PROVIDER=mock
```

真实模型使用：

```text
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=replace_with_deepseek_api_key
```

DeepSeek key 只能来自私有环境变量。AI 预审记录保留 provider、model、结构化输出模式、Prompt、raw output、token 元数据、retryCount 和幂等键。连续失败或模型输出异常会转人工兜底。

## 7. 五张截图映射

| 截图 | 页面 | 技术点 |
| --- | --- | --- |
| 01 Owner 任务发布 | `/owner/tasks` | 任务状态机、发布抽屉、审计 |
| 02 Owner 模板 Designer | `/owner/templates` | Designer/Renderer 共用 Schema |
| 03 Labeler 标注台 | `/labeler/tasks/:taskId/items/:itemId` | 草稿、提交校验、打回提示 |
| 04 AI Agent 预审 | `/agent/ai-review` | 队列、结构化输出、Prompt、重试 |
| 05 Reviewer 验收 | `/reviewer/reviews` | 复审、Diff、审计时间线 |
| 06 Owner 导出中心 | `/owner/exports` | 字段映射、四格式导出、FINAL_APPROVED 过滤 |

## 8. 验收命令

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
docker compose config
```

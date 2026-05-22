# LabelHub 演示脚本

建议时长：5 到 10 分钟。演示前运行 `pnpm demo:reset`，再执行 `pnpm dev`，从 `http://localhost:5173/login` 开始。

## 开场说明

LabelHub 是 AI 数据标注与审核平台，演示重点有三点：

1. 动态表单 Designer/Renderer 使用同一份 Schema。
2. 任务、提交、审核、终审和导出都由状态机与审计日志约束。
3. AI Agent 默认使用 mock provider，可稳定演示结构化预审、重试和人工兜底。

## 演示账号

| 角色 | 登录入口 | 默认页面 |
| --- | --- | --- |
| Owner | `/login` 选择 Owner 演示账号 | `/owner/tasks` |
| Labeler | `/login` 选择 Labeler 演示账号 | `/labeler/market` |
| AI Agent | `/login` 选择 AI Agent 演示账号 | `/agent/ai-review` |
| Reviewer | `/login` 选择 Reviewer 演示账号 | `/reviewer/reviews` |

## 主线一：`qa_quality` 完整闭环

### 1. Owner 创建、导入并发布任务

- 角色：Owner
- 页面：`/owner/tasks`
- 操作：
  1. 说明左侧导航、统计卡片、筛选区、任务表格和发布抽屉，对齐视觉参考图 1。
  2. 打开或新建问答质量任务，确认绑定官方问答质量模板。
  3. 进入 `/owner/tasks/task_qa_quality_demo/dataset`，说明支持 JSON、JSONL、Excel、zip 导入。
  4. 回到任务管理，发布任务。
- 预期结果：
  - 任务状态从草稿或发布准备进入 `PUBLISHED`。
  - 题目数据可见，`qa_quality` 演示数据为 30 条。
  - 发布动作写入审计日志。

### 2. Owner 查看模板 Designer

- 角色：Owner
- 页面：`/owner/templates`
- 操作：
  1. 打开官方问答质量模板。
  2. 说明左侧物料区、中间画布、右侧属性/校验/联动配置，对齐视觉参考图 2。
  3. 展示 Schema JSON、预览和发布版本入口。
- 预期结果：
  - Designer 与 Labeler 标注台共用一份 JSON Schema。
  - Schema 支持展示项、输入项、单选、多选、标签、富文本、文件/图片、JSON 编辑器、分组、多 Tab、联动和 LLM 辅助。

### 3. Labeler 领取、保存草稿并提交

- 角色：Labeler
- 页面：`/labeler/market`、`/labeler/tasks/task_qa_quality_demo/items/item_qa_quality_01`
- 操作：
  1. 在任务广场领取问答质量题目。
  2. 进入标注台，说明题目导航、中间表单、右侧贡献/历史面板和底部操作区，对齐视觉参考图 3。
  3. 填写答案，保存草稿，再提交本题。
- 预期结果：
  - 草稿保存可重复执行。
  - 提交成功后进入 `AI_QUEUED` 或 AI 预审后进入 `HUMAN_PENDING`。
  - API 提交支持幂等键，避免重复提交。

### 4. AI Agent 查看自动预审

- 角色：AI Agent
- 页面：`/agent/ai-review`
- 操作：
  1. 展示左侧异步队列、状态分组和重试入口。
  2. 展示右侧提交内容、JSON 字段、维度评分、AI 评语、Prompt 模板和处理日志，对齐视觉参考图 4。
  3. 说明 mock provider 在本地稳定返回结构化结果，不依赖真实 API Key。
- 预期结果：
  - AI 任务有幂等键、attempts、provider、model 和日志。
  - 连续失败会转人工兜底，仍进入人工复审队列。

### 5. Reviewer 人工复审打回

- 角色：Reviewer
- 页面：`/reviewer/reviews`
- 操作：
  1. 打开待复审列表，说明左侧待审列表和批量操作。
  2. 查看 AI 评语和提交详情。
  3. 填写打回理由并打回。
- 预期结果：
  - 提交状态进入 `NEEDS_REVISION`。
  - Labeler 标注台显示上一轮打回提示。
  - 审计时间线记录打回动作。

### 6. Labeler 二次提交

- 角色：Labeler
- 页面：`/labeler/tasks/task_qa_quality_demo/items/item_qa_quality_01`
- 操作：
  1. 查看打回原因。
  2. 修改答案并再次提交。
- 预期结果：
  - 第二轮提交生成 round 2。
  - Reviewer 可看到第 1 / 2 轮 Diff。

### 7. Reviewer 复审通过并终审

- 角色：Reviewer
- 页面：`/reviewer/reviews`、`/reviewer/final-reviews`
- 操作：
  1. 在复审台查看第 1 / 2 轮 Diff、AI 评语和审计时间线，对齐视觉参考图 5。
  2. 点击通过入库。
  3. 切到终审台，点击终审通过。
- 预期结果：
  - 人工复审通过只进入 `FINAL_PENDING`，不会直接导出。
  - 终审通过后状态为 `FINAL_APPROVED`。

### 8. Owner 导出终审通过数据

- 角色：Owner
- 页面：`/owner/exports`
- 操作：
  1. 选择 `json`、`jsonl`、`csv`、`xlsx` 中任一格式。
  2. 查看字段映射和导出预览。
  3. 创建导出任务。
- 预期结果：
  - 导出预览只包含 `FINAL_APPROVED` 数据。
  - 导出历史出现成功任务。
  - 可说明四种格式共用同一套字段映射。

## 主线二：`preference_compare` 模板与映射

### 1. Owner 查看偏好对比模板

- 角色：Owner
- 页面：`/owner/templates`
- 操作：打开偏好对比官方模板，说明字段 `prompt`、`response_a`、`response_b`、`preferred`、`margin`、`dimensions`、`safety_flag`。
- 预期结果：证明系统通过 DatasetProfile 和 Schema 支持 A/B 偏好题型，而不是硬编码问答质量。

### 2. Owner 导入偏好对比数据

- 角色：Owner
- 页面：`/owner/tasks/task_preference_compare_demo/dataset`
- 操作：说明 JSON、JSONL、Excel 和 zip 导入；Excel 中 `dimensions` 用 ` | ` 拆分，`safety_flag` 的 `是/否` 归一为布尔值。
- 预期结果：演示数据为 12 条，导入统计展示成功行数和错误行数。

### 3. Owner 查看导出字段映射

- 角色：Owner
- 页面：`/owner/exports`
- 操作：切换到偏好对比任务，查看字段映射。
- 预期结果：导出字段可覆盖 rawData、answers 和 review 结果，且仍只导出 `FINAL_APPROVED`。

## 收尾说明

- `LLM_PROVIDER=mock` 确保演示稳定；真实 DeepSeek 通过 `DEEPSEEK_API_KEY` 启用，但 key 不进入仓库。
- 所有核心页面都有双视口 E2E：四端隔离、主链路、中文文案和无横向溢出。
- 最终检查命令：`pnpm typecheck`、`pnpm test`、`pnpm test:e2e`、`docker compose config`。

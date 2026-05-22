# 答辩演示脚本

完整脚本见 `docs/demo-script.md`。本文件是 5 到 10 分钟现场演示版。

## 1. 开场

说明 LabelHub 解决 AI 数据标注、AI 预审、人工复审、终审和导出闭环。强调三点：动态表单、状态机与审计、AI Agent 工程化。

## 2. `qa_quality` 完整闭环

1. Owner 登录 `/login`，进入 `/owner/tasks`。
2. 展示任务管理：统计卡片、筛选、任务表格、发布抽屉。
3. 进入模板 Designer，说明 Designer 与 Renderer 共用 Schema。
4. 进入数据导入页，说明 JSON、JSONL、Excel、zip 和 30 条 `qa_quality`。
5. Labeler 登录，进入 `/labeler/market` 领取题目。
6. 进入标注台，保存草稿并提交。
7. AI Agent 登录，进入 `/agent/ai-review` 查看结构化评分、Prompt、日志、重试和人工兜底。
8. Reviewer 登录，进入 `/reviewer/reviews` 打回一次。
9. Labeler 查看打回原因并二次提交。
10. Reviewer 查看第 1 / 2 轮 Diff，复审通过后进入终审台。
11. Reviewer 在 `/reviewer/final-reviews` 终审通过。
12. Owner 在 `/owner/exports` 创建 JSON/JSONL/CSV/XLSX 导出，说明只导出 `FINAL_APPROVED`。

## 3. `preference_compare` 扩展示例

1. Owner 打开偏好对比模板，说明 `prompt`、`response_a`、`response_b`、`preferred`、`margin`、`dimensions`、`safety_flag`。
2. 展示 12 条 `preference_compare` 演示题目。
3. 展示导出字段映射，说明平台依赖 DatasetProfile 和 Schema 扩展，不是硬编码单一题型。

## 4. 收尾

说明 mock AI 保证演示稳定；真实 DeepSeek 只通过环境变量启用；最终验证命令为 `pnpm typecheck`、`pnpm test`、`pnpm test:e2e`、`docker compose config`。

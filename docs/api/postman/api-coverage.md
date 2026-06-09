# LabelHub API 覆盖清单

生成时间：2026-06-09T16:47:19.875Z

Full Collection 接口总数：76
Demo Collection 接口总数：41

## Demo Collection 主流程接口

| Method | Path | Folder | Summary |
| --- | --- | --- | --- |
| GET | `/health` | 01 System 系统检查 | 健康检查 |
| POST | `/auth/login` | 00 Auth 登录 | 使用演示账号登录 |
| GET | `/me` | 00 Auth 登录 | 获取当前用户 |
| POST | `/tasks` | 02 Owner 任务管理 | 创建任务草稿 |
| GET | `/tasks` | 02 Owner 任务管理 | 查询 Owner 任务列表 |
| GET | `/tasks/{id}` | 02 Owner 任务管理 | 获取任务详情 |
| PATCH | `/tasks/{id}/status` | 02 Owner 任务管理 | 任务状态流转 |
| GET | `/tasks/{id}/audit-logs` | 02 Owner 任务管理 | 查询任务审计日志 |
| POST | `/templates/from-profile` | 03 Owner 模板管理 | 从官方 DatasetProfile 创建模板 |
| GET | `/templates` | 03 Owner 模板管理 | 查询模板列表 |
| GET | `/templates/{id}` | 03 Owner 模板管理 | 获取模板详情 |
| POST | `/templates/{id}/publish` | 03 Owner 模板管理 | 发布模板版本 |
| POST | `/tasks/{taskId}/items/import` | 04 Owner 数据导入 | 导入 JSON、JSONL 或 Excel 题目 |
| GET | `/tasks/{taskId}/items` | 04 Owner 数据导入 | 查询任务题目 |
| GET | `/labeler/tasks` | 05 Labeler 任务领取与标注 | 查询任务广场 |
| POST | `/assignments/claim` | 05 Labeler 任务领取与标注 | 领取任务 |
| GET | `/assignments/{assignmentId}/workbench` | 05 Labeler 任务领取与标注 | 查询标注台数据 |
| GET | `/drafts/{assignmentId}` | 05 Labeler 任务领取与标注 | 查询草稿 |
| PUT | `/drafts/{assignmentId}` | 05 Labeler 任务领取与标注 | 保存草稿 |
| POST | `/submissions/task` | 05 Labeler 任务领取与标注 | 提交整个任务标注结果 |
| GET | `/ai-review/batches` | 06 AI Agent 预审 | 查询 AI 预审批次 |
| GET | `/ai-review/batches/{batchId}` | 06 AI Agent 预审 | 查询 AI 预审批次详情 |
| GET | `/submissions/{submissionId}/ai-review` | 06 AI Agent 预审 | 查询提交的 AI 预审详情 |
| GET | `/reviews/pending/tasks` | 07 Reviewer 人工复核 | 查询待复核任务列表 |
| GET | `/reviews/pending` | 07 Reviewer 人工复核 | 查询待人工复审题目 |
| GET | `/reviews/{assignmentId}/rounds` | 07 Reviewer 人工复核 | 查询提交轮次 |
| GET | `/reviews/{assignmentId}/diff` | 07 Reviewer 人工复核 | 查询轮次 Diff |
| GET | `/reviews/{submissionId}` | 07 Reviewer 人工复核 | 查询复审详情 |
| GET | `/reviews/{submissionId}/timeline` | 07 Reviewer 人工复核 | 查询审计时间线 |
| POST | `/reviews/{submissionId}/start` | 07 Reviewer 人工复核 | 开始人工复审 |
| POST | `/reviews/{submissionId}/pass` | 07 Reviewer 人工复核 | 人工复审通过 |
| POST | `/reviews/{submissionId}/reject` | 07 Reviewer 人工复核 | 人工复审打回 |
| POST | `/exports` | 08 Export 导出中心 | 创建导出任务 |
| GET | `/exports` | 08 Export 导出中心 | 查询导出历史 |
| GET | `/exports/{id}` | 08 Export 导出中心 | 查询导出详情 |
| GET | `/exports/{id}/download` | 08 Export 导出中心 | 下载导出文件 |
| GET | `/tasks/{taskId}/export-preview` | 08 Export 导出中心 | 预览终审通过数据的导出字段映射 |
| GET | `/agent/task-flows` | 09 Task Flow 质检流转 | 查询质检流转任务列表 |
| GET | `/agent/task-flows/{taskId}/logs` | 09 Task Flow 质检流转 | 查询任务流转日志 |
| GET | `/agent/task-flows/{taskId}` | 09 Task Flow 质检流转 | 查询任务流转详情 |
| POST | `/llm/assist` | 10 LLM 辅助能力 | 调用 LLM 辅助生成 |

## Full Collection 工程覆盖接口

| Method | Path | Folder | Summary |
| --- | --- | --- | --- |
| GET | `/health` | 01 System 系统检查 | 健康检查 |
| POST | `/auth/login` | 00 Auth 登录 | 使用演示账号登录 |
| GET | `/me` | 00 Auth 登录 | 获取当前用户 |
| POST | `/tasks` | 02 Owner 任务管理 | 创建任务草稿 |
| GET | `/tasks` | 02 Owner 任务管理 | 查询 Owner 任务列表 |
| GET | `/tasks/summaries` | 02 Owner 任务管理 | 查询 Owner 任务摘要 |
| GET | `/tasks/{id}` | 02 Owner 任务管理 | 获取任务详情 |
| PATCH | `/tasks/{id}` | 02 Owner 任务管理 | 更新任务基础信息 |
| PATCH | `/tasks/{id}/status` | 02 Owner 任务管理 | 任务状态流转 |
| DELETE | `/tasks/{id}` | 02 Owner 任务管理 | 删除任务草稿 |
| PATCH | `/tasks/{id}/review-stage-config` | 02 Owner 任务管理 | 配置审核阶段 |
| GET | `/tasks/{id}/audit-logs` | 02 Owner 任务管理 | 查询任务审计日志 |
| POST | `/templates` | 03 Owner 模板管理 | 创建模板 |
| POST | `/templates/from-profile` | 03 Owner 模板管理 | 从官方 DatasetProfile 创建模板 |
| GET | `/templates` | 03 Owner 模板管理 | 查询模板列表 |
| GET | `/templates/{id}/versions` | 03 Owner 模板管理 | 查询模板版本 |
| GET | `/templates/{id}/versions/{versionId}/diff` | 03 Owner 模板管理 | 查询模板版本 Diff |
| POST | `/templates/{id}/versions/{versionId}/restore` | 03 Owner 模板管理 | 恢复模板版本 |
| GET | `/templates/{id}` | 03 Owner 模板管理 | 获取模板详情 |
| PATCH | `/templates/{id}` | 03 Owner 模板管理 | 更新模板 Schema |
| POST | `/templates/{id}/publish` | 03 Owner 模板管理 | 发布模板版本 |
| DELETE | `/templates/{id}` | 03 Owner 模板管理 | 删除模板草稿 |
| POST | `/tasks/{taskId}/items/import` | 04 Owner 数据导入 | 导入 JSON、JSONL 或 Excel 题目 |
| POST | `/tasks/{taskId}/items/import-zip` | 04 Owner 数据导入 | 导入官方 datasets.zip |
| GET | `/tasks/{taskId}/items` | 04 Owner 数据导入 | 查询任务题目 |
| PATCH | `/task-items/{id}` | 04 Owner 数据导入 | 更新题目 rawData 补丁 |
| GET | `/labeler/tasks` | 05 Labeler 任务领取与标注 | 查询任务广场 |
| POST | `/assignments/claim` | 05 Labeler 任务领取与标注 | 领取任务 |
| GET | `/assignments/{assignmentId}/workbench` | 05 Labeler 任务领取与标注 | 查询标注台数据 |
| GET | `/drafts/{assignmentId}` | 05 Labeler 任务领取与标注 | 查询草稿 |
| PUT | `/drafts/{assignmentId}` | 05 Labeler 任务领取与标注 | 保存草稿 |
| POST | `/submissions` | 05 Labeler 任务领取与标注 | 提交单个 assignment 标注结果 |
| POST | `/submissions/task` | 05 Labeler 任务领取与标注 | 提交整个任务标注结果 |
| GET | `/labeler/submissions` | 05 Labeler 任务领取与标注 | 查询标注员提交历史 |
| GET | `/labeler/assignments` | 05 Labeler 任务领取与标注 | 查询标注员 assignment |
| GET | `/labeler/assignment-tasks` | 05 Labeler 任务领取与标注 | 查询标注员任务聚合 |
| GET | `/labeler/stats` | 05 Labeler 任务领取与标注 | 查询标注员统计 |
| GET | `/ai-review/batches` | 06 AI Agent 预审 | 查询 AI 预审批次 |
| GET | `/ai-review/batches/{batchId}` | 06 AI Agent 预审 | 查询 AI 预审批次详情 |
| GET | `/ai-review/jobs` | 06 AI Agent 预审 | 查询 AI 预审任务 |
| POST | `/ai-review/jobs/{id}/retry` | 06 AI Agent 预审 | 重试 AI 预审任务 |
| POST | `/ai-review/jobs/{id}/complete` | 06 AI Agent 预审 | 完成 AI 预审任务 |
| GET | `/submissions/{submissionId}/ai-review` | 06 AI Agent 预审 | 查询提交的 AI 预审详情 |
| GET | `/reviews/pending/tasks` | 07 Reviewer 人工复核 | 查询待复核任务列表 |
| GET | `/reviews/pending` | 07 Reviewer 人工复核 | 查询待人工复审题目 |
| GET | `/reviews/results` | 07 Reviewer 人工复核 | 查询审核结果 |
| GET | `/reviews/{assignmentId}/rounds` | 07 Reviewer 人工复核 | 查询提交轮次 |
| GET | `/reviews/{assignmentId}/diff` | 07 Reviewer 人工复核 | 查询轮次 Diff |
| POST | `/reviews/batch-pass` | 07 Reviewer 人工复核 | 批量复审通过 |
| POST | `/reviews/batch-reject` | 07 Reviewer 人工复核 | 批量复审打回 |
| POST | `/reviews/assign` | 07 Reviewer 人工复核 | 批量指派 Reviewer |
| GET | `/reviews/{submissionId}` | 07 Reviewer 人工复核 | 查询复审详情 |
| GET | `/reviews/{submissionId}/timeline` | 07 Reviewer 人工复核 | 查询审计时间线 |
| POST | `/reviews/{submissionId}/start` | 07 Reviewer 人工复核 | 开始人工复审 |
| POST | `/reviews/{submissionId}/pass` | 07 Reviewer 人工复核 | 人工复审通过 |
| POST | `/reviews/{submissionId}/reject` | 07 Reviewer 人工复核 | 人工复审打回 |
| POST | `/reviews/{submissionId}/revise-and-pass` | 07 Reviewer 人工复核 | 人工修订并通过 |
| GET | `/tasks/{taskId}/review-rule` | 06 AI Agent 预审 | 查询任务 AI 预审规则 |
| POST | `/tasks/{taskId}/review-rule` | 06 AI Agent 预审 | 保存任务 AI 预审规则 |
| POST | `/exports` | 08 Export 导出中心 | 创建导出任务 |
| GET | `/exports` | 08 Export 导出中心 | 查询导出历史 |
| GET | `/exports/{id}` | 08 Export 导出中心 | 查询导出详情 |
| GET | `/exports/{id}/download` | 08 Export 导出中心 | 下载导出文件 |
| POST | `/exports/{id}/retry` | 08 Export 导出中心 | 重试失败导出 |
| GET | `/tasks/{taskId}/export-preview` | 08 Export 导出中心 | 预览终审通过数据的导出字段映射 |
| GET | `/agent/task-flows` | 09 Task Flow 质检流转 | 查询质检流转任务列表 |
| GET | `/agent/task-flows/{taskId}/logs` | 09 Task Flow 质检流转 | 查询任务流转日志 |
| GET | `/agent/task-flows/{taskId}` | 09 Task Flow 质检流转 | 查询任务流转详情 |
| POST | `/schema/validate` | 01 System 系统检查 | 校验 Schema answers |
| POST | `/llm/assist` | 10 LLM 辅助能力 | 调用 LLM 辅助生成 |
| POST | `/llm/assist/mock` | 10 LLM 辅助能力 | 调用 LLM 模拟辅助生成 |
| POST | `/llm/template-fields/classify` | 10 LLM 辅助能力 | 自动识别模板字段类型 |
| GET | `/debug/seed-status` | 99 Debug 内部调试 | 查询种子数据状态 |
| GET | `/debug/tasks` | 99 Debug 内部调试 | 查询调试任务数据 |
| GET | `/debug/users` | 99 Debug 内部调试 | 查询调试用户数据 |
| GET | `/debug/sample-schema` | 99 Debug 内部调试 | 查询示例 Schema |

说明：Full Collection 由验证脚本反扫 controller 做覆盖校验；Demo Collection 只保留主流程交付接口。

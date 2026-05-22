# API 文档

OpenAPI 文件：`docs/api/openapi.yaml`。

覆盖范围：

- `POST /auth/login`：统一登录。
- `GET /me`：当前用户。
- `/tasks`：任务创建、查询、更新、发布、暂停、结束、审计日志。
- `/templates`：模板创建、官方 profile、Schema 更新、发布。
- `/tasks/:taskId/items/import`：JSON、JSONL、Excel 导入。
- `/tasks/:taskId/items/import-zip`：官方 zip 导入。
- `/labeler/tasks`、`/assignments/claim`：任务广场与领取。
- `/drafts/:assignmentId`：草稿读取和保存。
- `POST /submissions`：标注提交，支持幂等键。
- `/ai-review/jobs`：AI 预审队列、重试和详情。
- `/reviews/*`：人工复审、批量操作、Diff、终审。
- `/exports`：字段映射、导出任务、下载和重试。

所有普通 JSON 响应统一使用：

```json
{
  "data": {},
  "requestId": "req_xxx"
}
```

错误响应统一使用中文 `message`，并携带稳定 `code`。

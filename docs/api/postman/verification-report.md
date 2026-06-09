# LabelHub Postman 文档验证报告

验证时间：2026-06-09T16:48:03.588Z

Controller 路由数：76
OpenAPI 路由数：76
Full Collection 路由数：76
Demo Collection 路由数：41

结论：通过。Full Collection 覆盖全部 controller 路由；Demo Collection 仅包含主流程白名单；环境变量和登录 token 脚本完整。

## Demo Collection 路由清单

- GET /agent/task-flows
- GET /agent/task-flows/{taskId}
- GET /agent/task-flows/{taskId}/logs
- GET /ai-review/batches
- GET /ai-review/batches/{batchId}
- GET /assignments/{assignmentId}/workbench
- GET /drafts/{assignmentId}
- GET /exports
- GET /exports/{id}
- GET /exports/{id}/download
- GET /health
- GET /labeler/tasks
- GET /me
- GET /reviews/pending
- GET /reviews/pending/tasks
- GET /reviews/{assignmentId}/diff
- GET /reviews/{assignmentId}/rounds
- GET /reviews/{submissionId}
- GET /reviews/{submissionId}/timeline
- GET /submissions/{submissionId}/ai-review
- GET /tasks
- GET /tasks/{id}
- GET /tasks/{id}/audit-logs
- GET /tasks/{taskId}/export-preview
- GET /tasks/{taskId}/items
- GET /templates
- GET /templates/{id}
- PATCH /tasks/{id}/status
- POST /assignments/claim
- POST /auth/login
- POST /exports
- POST /llm/assist
- POST /reviews/{submissionId}/pass
- POST /reviews/{submissionId}/reject
- POST /reviews/{submissionId}/start
- POST /submissions/task
- POST /tasks
- POST /tasks/{taskId}/items/import
- POST /templates/from-profile
- POST /templates/{id}/publish
- PUT /drafts/{assignmentId}

## Full Collection 路由清单

- DELETE /tasks/{id}
- DELETE /templates/{id}
- GET /agent/task-flows
- GET /agent/task-flows/{taskId}
- GET /agent/task-flows/{taskId}/logs
- GET /ai-review/batches
- GET /ai-review/batches/{batchId}
- GET /ai-review/jobs
- GET /assignments/{assignmentId}/workbench
- GET /debug/sample-schema
- GET /debug/seed-status
- GET /debug/tasks
- GET /debug/users
- GET /drafts/{assignmentId}
- GET /exports
- GET /exports/{id}
- GET /exports/{id}/download
- GET /health
- GET /labeler/assignment-tasks
- GET /labeler/assignments
- GET /labeler/stats
- GET /labeler/submissions
- GET /labeler/tasks
- GET /me
- GET /reviews/pending
- GET /reviews/pending/tasks
- GET /reviews/results
- GET /reviews/{assignmentId}/diff
- GET /reviews/{assignmentId}/rounds
- GET /reviews/{submissionId}
- GET /reviews/{submissionId}/timeline
- GET /submissions/{submissionId}/ai-review
- GET /tasks
- GET /tasks/summaries
- GET /tasks/{id}
- GET /tasks/{id}/audit-logs
- GET /tasks/{taskId}/export-preview
- GET /tasks/{taskId}/items
- GET /tasks/{taskId}/review-rule
- GET /templates
- GET /templates/{id}
- GET /templates/{id}/versions
- GET /templates/{id}/versions/{versionId}/diff
- PATCH /task-items/{id}
- PATCH /tasks/{id}
- PATCH /tasks/{id}/review-stage-config
- PATCH /tasks/{id}/status
- PATCH /templates/{id}
- POST /ai-review/jobs/{id}/complete
- POST /ai-review/jobs/{id}/retry
- POST /assignments/claim
- POST /auth/login
- POST /exports
- POST /exports/{id}/retry
- POST /llm/assist
- POST /llm/assist/mock
- POST /llm/template-fields/classify
- POST /reviews/assign
- POST /reviews/batch-pass
- POST /reviews/batch-reject
- POST /reviews/{submissionId}/pass
- POST /reviews/{submissionId}/reject
- POST /reviews/{submissionId}/revise-and-pass
- POST /reviews/{submissionId}/start
- POST /schema/validate
- POST /submissions
- POST /submissions/task
- POST /tasks
- POST /tasks/{taskId}/items/import
- POST /tasks/{taskId}/items/import-zip
- POST /tasks/{taskId}/review-rule
- POST /templates
- POST /templates/from-profile
- POST /templates/{id}/publish
- POST /templates/{id}/versions/{versionId}/restore
- PUT /drafts/{assignmentId}


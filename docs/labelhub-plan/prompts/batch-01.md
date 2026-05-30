# Batch 01 可执行 Prompt：共享协议、数据模型与状态机

请在当前仓库实现 Batch 1。先阅读 `docs/labelhub-plan/EXECUTION.md` 和 `docs/labelhub-plan/batches/batch-01-shared-contracts-data-model.md`，然后只实现本批范围。

## 全局修订约束

- 必须遵守统一登录 `/login`、RBAC 和四端独立 Portal：Owner 端 `/owner/*`、Labeler 端 `/labeler/*`、AI Agent 端 `/agent/*`、Reviewer 端 `/reviewer/*`。
- 所有用户可见 UI 文案、API 用户可见错误消息、代码注释和 Git Commit 摘要必须使用简体中文。
- 实现或验收图 1-5 对应页面前，必须先阅读 `docs/labelhub-plan/visual-reference.md`，并按需打开对应本地 PNG；页面结构、组件命名和交互必须对齐 5 张截图，截图中的「商品标题清洗 v3」作为 UI/UX 设计基准和演示蓝本。
- 默认审核链路必须是 `AI 自动预审 -> 人工复审 -> 终审`；人工复审通过只能进入终审待办，导出只读取 `FINAL_APPROVED` 数据。

## Git 版本管理要求

- 开始前运行 `git remote -v`、`git status --short`、`git branch --show-current`。
- 必须确认存在 `origin`；如果没有，停止并提示用户先配置远程仓库。
- 必须在 `codex/labelhub-fullstack` 开发，禁止在 `main` 直接开发。
- 每完成一个小任务提交点并通过相关测试后，运行 `git status --short`，只 stage 本小任务文件，执行 `git commit -m "<type>(labelhub): <中文任务摘要>"`，然后 `git push`，提交摘要必须是简体中文。
- 首次推送分支时使用 `git push -u origin codex/labelhub-fullstack`。
- 不提交 `.env`、`env`、`docs/labelhub-plan/env`、真实密钥、官方 `datasets.zip`、解压数据、`.DS_Store`、`node_modules/`、构建产物、覆盖率报告和临时导出文件。

本 Batch 小任务提交点：shared 枚举与 Schema、DatasetProfile 与归一化、状态机、Prisma schema、seed 与审计服务、基础前端状态组件。

## 工具与依赖处理要求

- 开始前运行 `command -v node`、`command -v pnpm`、`command -v git`、`command -v docker`。
- 项目内依赖可以自动安装，例如 `pnpm install`、`pnpm add <package>`、`pnpm add -D <package>`；依赖变化必须提交 `package.json` 和 `pnpm-lock.yaml`。
- 如果缺少 `node`、`git`、`docker` 或 `pnpm`，先按 `EXECUTION.md` 的工具规则处理，不能静默安装系统级工具。
- Redis/PostgreSQL 优先通过 `docker compose` 启动，不要求本机安装数据库服务。
- Playwright 缺浏览器时，可以自动运行 `pnpm exec playwright install chromium`，只安装 Chromium。
- 需要 `brew`、`sudo`、`npm install -g`、系统级安装或修改系统环境时，必须停止并请求用户确认。
- 网络下载失败最多重试一次；仍失败则停止并报告 blocker。

## 当前目标

建立 LabelHub 的共享类型、RBAC、路由权限元数据、Prisma 数据模型、官方 DatasetProfile、状态机和 seed 基础能力。

## 禁止范围

- 不做复杂页面。
- 不实现真实导入 UI。
- 不提交官方 zip 或解压数据。
- 不让状态迁移散落在业务代码中。
- 不使用 `system` 作为 AI Agent 角色或路由前缀。

## 必须创建或修改

- `packages/shared/src/statuses.ts`
- `packages/shared/src/rbac.ts`
- `packages/shared/src/routes.ts`
- `packages/shared/src/schema.ts`
- `packages/shared/src/datasetProfiles.ts`
- `packages/shared/src/stateMachines.ts`
- `packages/shared/src/export.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/*.test.ts`
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `apps/api/src/audit/audit.service.ts`
- `apps/api/src/state-machine/state-machine.service.ts`
- `apps/web/src/components/StatusTag.tsx`
- `apps/web/src/components/DemoDataBanner.tsx`

## 必须实现

- 共享枚举：
  - `UserRole = OWNER | LABELER | AI_AGENT | REVIEWER`
  - `PortalRoutePrefix = /owner | /labeler | /agent | /reviewer`
  - `RoutePermission`：路由路径、允许角色、默认首页、中文导航名
  - `DatasetKind = qa_quality | preference_compare | generic_json`
  - `DatasetImportFormat = json | jsonl | xlsx | zip`
  - `ReviewStage = AI_PRECHECK | INITIAL | RECHECK | FINAL`
  - `ExportFormat = json | jsonl | csv | xlsx`
- 动态表单协议：
  - `show_item`, `text`, `textarea`, `radio`, `checkbox`, `tag_select`, `rich_text`, `file_upload`, `image_upload`, `json_editor`, `llm_assist`, `group`, `tabs`
  - `FieldValidation`
  - `FieldLinkageRule`
- 官方 DatasetProfile：
  - `qa_quality`：30 条验收，Excel sheet `标注题目`
  - `preference_compare`：12 条验收，Excel sheet `偏好对比`
- 状态机函数：
  - 任务状态
  - 提交状态
  - AI 审核状态
  - 人工审核状态
  - 导出状态
- 中文状态标签：
  - 任务：草稿、进行中、已暂停、已结束
  - 审核：AI 预审中、待人工复审、待终审、终审通过、已打回
- Prisma 模型：
  - `users`, `tasks`, `task_templates`, `task_items`, `assignments`, `drafts`, `submissions`, `review_rules`, `review_records`, `audit_logs`, `export_jobs`

## 必须测试

- DatasetProfile 必填字段校验。
- Excel 归一化：`tags`、`expected_dimensions`、`dimensions`、`safety_flag`。
- 临时文件跳过规则：`__MACOSX/`、`.DS_Store`、`._qa_quality.json`、`.~qa_quality.xlsx`。
- 合法状态迁移通过，非法状态迁移抛错。
- RBAC 测试覆盖四个角色只能访问自己的 Portal 路由。
- 中文状态标签测试覆盖任务、提交、AI 审核、人工复审、终审和导出状态。
- seed 可重复执行，不重复创建基础用户和官方任务。

## 完成后运行

```bash
pnpm typecheck
pnpm test
pnpm exec prisma validate
pnpm exec prisma db seed
```

## 验收标准

- 数据库 schema 能通过 Prisma 校验。
- shared 类型能被 Web/API/Worker 引用。
- seed 后能看到 Owner、Labeler、Reviewer、AI Agent 用户，以及 `qa_quality`、`preference_compare` 两个样例任务。
- 每个小任务提交点都已 commit 并 push 到 `codex/labelhub-fullstack`。

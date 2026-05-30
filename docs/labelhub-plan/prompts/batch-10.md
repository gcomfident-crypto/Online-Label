# Batch 10 可执行 Prompt：导出中心

请在当前仓库实现 Batch 10。先阅读 `docs/labelhub-plan/EXECUTION.md` 和 `docs/labelhub-plan/batches/batch-10-export-center.md`，然后只实现本批范围。

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

本 Batch 小任务提交点：导出 API、字段映射预设、导出队列与 worker、JSON/JSONL/CSV/XLSX exporters、导出中心页面、下载与重试测试。

## 工具与依赖处理要求

- 开始前运行 `command -v node`、`command -v pnpm`、`command -v git`、`command -v docker`。
- 项目内依赖可以自动安装，例如 `pnpm install`、`pnpm add <package>`、`pnpm add -D <package>`；依赖变化必须提交 `package.json` 和 `pnpm-lock.yaml`。
- 如果缺少 `node`、`git`、`docker` 或 `pnpm`，先按 `EXECUTION.md` 的工具规则处理，不能静默安装系统级工具。
- Redis/PostgreSQL 优先通过 `docker compose` 启动，不要求本机安装数据库服务。
- Playwright 缺浏览器时，可以自动运行 `pnpm exec playwright install chromium`，只安装 Chromium。
- 需要 `brew`、`sudo`、`npm install -g`、系统级安装或修改系统环境时，必须停止并请求用户确认。
- 网络下载失败最多重试一次；仍失败则停止并报告 blocker。

## 当前目标

Owner 能异步导出 `FINAL_APPROVED` 终审通过数据，支持 JSON、JSONL、CSV、Excel、字段映射、导出历史和审核记录开关。

## 禁止范围

- 不只实现 JSON。
- 不同步阻塞生成大文件。
- 不导出未终审通过的数据，包括 `RECHECK_APPROVED` 和 `FINAL_PENDING`。
- 不丢失导出参数快照。

## 必须创建或修改

- `apps/api/src/exports/exports.module.ts`
- `apps/api/src/exports/exports.controller.ts`
- `apps/api/src/exports/exports.service.ts`
- `apps/api/src/exports/export-mapping.service.ts`
- `apps/worker/src/queues/export.queue.ts`
- `apps/worker/src/processors/export.processor.ts`
- `apps/worker/src/exporters/jsonExporter.ts`
- `apps/worker/src/exporters/jsonlExporter.ts`
- `apps/worker/src/exporters/csvExporter.ts`
- `apps/worker/src/exporters/xlsxExporter.ts`
- `apps/web/src/pages/owner/ExportCenterPage.tsx`
- `apps/web/src/features/export/ExportConfigDrawer.tsx`
- `apps/web/src/features/export/ExportHistoryTable.tsx`
- `apps/web/src/api/exports.ts`

## 必须实现 API

- `POST /exports`
- `GET /exports`
- `GET /exports/:id`
- `GET /exports/:id/download`
- `POST /exports/:id/retry`
- `GET /tasks/:taskId/export-preview`

## 必须实现导出

- JSON：数组。
- JSONL：每行一个对象。
- CSV：表头稳定，数组字段用 ` | ` 拼接。
- Excel：sheet 名包含任务名或 profile 名。
- 字段映射预设：
  - `qa_quality`
  - `preference_compare`
- 可选择包含或不包含审核记录。
- 导出文件写入本地 `storage/exports` 或等价目录。

## 必须测试

- 四种格式都能生成并下载。
- `qa_quality` 字段映射符合预设。
- `preference_compare` 字段映射符合预设。
- 未终审通过数据不会进入导出，复审通过但未终审的数据也不会进入预览。
- 失败导出可重试。

## 完成后运行

```bash
pnpm typecheck
pnpm test
pnpm dev
```

## 验收标准

- Owner 能从 Web 发起导出并查看历史。
- 导出的 JSON/JSONL/CSV/Excel 可打开且字段正确。
- `export_jobs` 记录 queued、processing、succeeded、failed 状态。
- 每个小任务提交点都已 commit 并 push 到 `codex/labelhub-fullstack`。

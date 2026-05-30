# Batch 05 可执行 Prompt：官方数据导入、任务广场与领取

请在当前仓库实现 Batch 5。先阅读 `docs/labelhub-plan/EXECUTION.md` 和 `docs/labelhub-plan/batches/batch-05-dataset-market-claim.md`，然后只实现本批范围。

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

本 Batch 小任务提交点：JSON/JSONL/Excel/zip importers、数据集 API、题目预览与批量编辑、任务广场 API、领取事务、Owner/Labeler 页面与导入测试。

## 工具与依赖处理要求

- 开始前运行 `command -v node`、`command -v pnpm`、`command -v git`、`command -v docker`。
- 项目内依赖可以自动安装，例如 `pnpm install`、`pnpm add <package>`、`pnpm add -D <package>`；依赖变化必须提交 `package.json` 和 `pnpm-lock.yaml`。
- 如果缺少 `node`、`git`、`docker` 或 `pnpm`，先按 `EXECUTION.md` 的工具规则处理，不能静默安装系统级工具。
- Redis/PostgreSQL 优先通过 `docker compose` 启动，不要求本机安装数据库服务。
- Playwright 缺浏览器时，可以自动运行 `pnpm exec playwright install chromium`，只安装 Chromium。
- 需要 `brew`、`sudo`、`npm install -g`、系统级安装或修改系统环境时，必须停止并请求用户确认。
- 网络下载失败最多重试一次；仍失败则停止并报告 blocker。

## 当前目标

Owner 能导入官方 JSON/JSONL/Excel/zip 数据，Labeler 能在任务广场领取进行中的任务题目。

## 禁止范围

- 不把导入数据当作 submission。
- 不信任 `preference_compare` 中已有的 `preferred`、`margin`、`annotator_note` 作为正式答案。
- 不把 zip 内 macOS 临时文件导入数据库。

## 必须创建或修改

- `apps/api/src/datasets/datasets.module.ts`
- `apps/api/src/datasets/datasets.controller.ts`
- `apps/api/src/datasets/datasets.service.ts`
- `apps/api/src/datasets/importers/*.ts`
- `apps/api/src/assignments/assignments.module.ts`
- `apps/api/src/assignments/assignments.controller.ts`
- `apps/api/src/assignments/assignments.service.ts`
- `apps/web/src/pages/owner/DatasetImportPage.tsx`
- `apps/web/src/pages/owner/components/DatasetPreviewTable.tsx`
- `apps/web/src/pages/labeler/TaskMarketPage.tsx`
- `apps/web/src/api/datasets.ts`
- `apps/web/src/api/assignments.ts`

## 必须实现 API

- `POST /tasks/:taskId/items/import`
- `POST /tasks/:taskId/items/import-zip`
- `GET /tasks/:taskId/items`
- `PATCH /task-items/:id`
- `GET /labeler/tasks`
- `POST /assignments/claim`

## 必须实现导入

- JSON：数组对象。
- JSONL：每个非空行一个对象。
- Excel：第一行作为表头，跳过空行。
- Zip：扫描官方目录结构，识别 `qa_quality` 和 `preference_compare`。
- ExcelJS 解析 xlsx，JSZip 解析 zip。
- 按 DatasetProfile 校验必填字段。
- 导入预览显示 profile、行数、字段、跳过文件、错误行。

## 必须测试

- `qa_quality.json`、`qa_quality.jsonl`、`qa_quality.xlsx` 均得到 30 条。
- `preference_compare.json`、`preference_compare.jsonl`、`preference_compare.xlsx` 均得到 12 条。
- zip 导入跳过 `__MACOSX/`、`.DS_Store`、`._*`、`.~*.xlsx`。
- 并发领取同一题时只创建一个有效 assignment。
- 配额用尽后不能继续领取。

## 完成后运行

```bash
pnpm typecheck
pnpm test
pnpm dev
```

## 验收标准

- Owner 能上传官方 zip 并看到两个 profile 的导入结果。
- `task_items` 保存 `datasetKind`、`externalId`、`rawData`。
- Labeler 能在任务广场搜索、筛选并领取任务。
- 每个小任务提交点都已 commit 并 push 到 `codex/labelhub-fullstack`。

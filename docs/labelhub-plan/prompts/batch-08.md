# Batch 08 可执行 Prompt：人工复审流转

请在当前仓库实现 Batch 8。先阅读 `docs/labelhub-plan/EXECUTION.md` 和 `docs/labelhub-plan/batches/batch-08-human-review-flow.md`，然后只实现本批范围。

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

本 Batch 小任务提交点：人工审核 API、Reviewer 待审/结果列表、审核详情、决策面板、批量操作与指派、审计时间线、复审测试。

## 工具与依赖处理要求

- 开始前运行 `command -v node`、`command -v pnpm`、`command -v git`、`command -v docker`。
- 项目内依赖可以自动安装，例如 `pnpm install`、`pnpm add <package>`、`pnpm add -D <package>`；依赖变化必须提交 `package.json` 和 `pnpm-lock.yaml`。
- 如果缺少 `node`、`git`、`docker` 或 `pnpm`，先按 `EXECUTION.md` 的工具规则处理，不能静默安装系统级工具。
- Redis/PostgreSQL 优先通过 `docker compose` 启动，不要求本机安装数据库服务。
- Playwright 缺浏览器时，可以自动运行 `pnpm exec playwright install chromium`，只安装 Chromium。
- 需要 `brew`、`sudo`、`npm install -g`、系统级安装或修改系统环境时，必须停止并请求用户确认。
- 网络下载失败最多重试一次；仍失败则停止并报告 blocker。

## 当前目标

Reviewer 能查看 AI 预审结果，对提交进行人工复审：复审通过进入终审待办、打回、直接修订后进入终审待办、批量操作、指派审核员。页面必须对齐图 5 的复审基础布局。

## 禁止范围

- 不允许无理由打回。
- 不绕过事务更新 submission、assignment、review_records、audit_logs。
- 不实现终审操作按钮；终审操作留给 Batch 9。
- 不允许复审通过的数据直接进入可导出状态。

## 必须创建或修改

- `apps/api/src/reviews/reviews.module.ts`
- `apps/api/src/reviews/reviews.controller.ts`
- `apps/api/src/reviews/reviews.service.ts`
- `apps/api/src/reviews/dto/*.ts`
- `apps/web/src/pages/reviewer/ReviewListPage.tsx`
- `apps/web/src/pages/reviewer/ReviewDetailPage.tsx`
- `apps/web/src/features/review/AiReviewSummary.tsx`
- `apps/web/src/features/review/ReviewDecisionPanel.tsx`
- `apps/web/src/features/review/AuditTimeline.tsx`
- `apps/web/src/features/review/BatchReviewToolbar.tsx`
- `apps/web/src/api/reviews.ts`

## 必须实现 API

- `GET /reviews/pending`
- `GET /reviews/results`
- `GET /reviews/:submissionId`
- `POST /reviews/:submissionId/pass`
- `POST /reviews/:submissionId/reject`
- `POST /reviews/:submissionId/revise-and-pass`
- `POST /reviews/batch-pass`
- `POST /reviews/batch-reject`
- `POST /reviews/assign`

## 必须实现前端

- 待审列表：AI 建议通过、AI 建议打回、转人工筛选。
- 审核详情：rawData、answers、AI 评分、AI 评语、Prompt 摘要、审计时间线。
- 操作区：
  - 复审通过
  - 打回
  - 直接修订并进入终审
  - 批量通过
  - 批量打回
  - 指派审核员

## 必须测试

- 复审通过后 submission 进入 `FINAL_PENDING`。
- 打回必须填写理由，Labeler 可见上一轮意见。
- 直接修订会保存修订快照和审核记录。
- 复审通过但未终审的数据不能被导出。
- 批量操作对每条数据写审计日志。
- 指派审核员后列表能按 reviewer 过滤。

## 完成后运行

```bash
pnpm typecheck
pnpm test
pnpm dev
```

## 验收标准

- Reviewer 能在 Web 端完成复审。
- 复审通过后的数据进入终审待办，不进入导出范围。
- AI 评语和人工意见都可追溯。
- 打回后 Labeler 工作台能看到原因。
- 每个小任务提交点都已 commit 并 push 到 `codex/labelhub-fullstack`。

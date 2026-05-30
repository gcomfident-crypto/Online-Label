# Batch 09 可执行 Prompt：多轮 Diff 与终审

请在当前仓库实现 Batch 9。先阅读 `docs/labelhub-plan/EXECUTION.md` 和 `docs/labelhub-plan/batches/batch-09-multi-round-diff-final-review.md`，然后只实现本批范围。

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

本 Batch 小任务提交点：轮次查询与 diff service、终审 API、审核阶段配置、Diff/终审前端、二次提交联动、终审测试。

## 工具与依赖处理要求

- 开始前运行 `command -v node`、`command -v pnpm`、`command -v git`、`command -v docker`。
- 项目内依赖可以自动安装，例如 `pnpm install`、`pnpm add <package>`、`pnpm add -D <package>`；依赖变化必须提交 `package.json` 和 `pnpm-lock.yaml`。
- 如果缺少 `node`、`git`、`docker` 或 `pnpm`，先按 `EXECUTION.md` 的工具规则处理，不能静默安装系统级工具。
- Redis/PostgreSQL 优先通过 `docker compose` 启动，不要求本机安装数据库服务。
- Playwright 缺浏览器时，可以自动运行 `pnpm exec playwright install chromium`，只安装 Chromium。
- 需要 `brew`、`sudo`、`npm install -g`、系统级安装或修改系统环境时，必须停止并请求用户确认。
- 网络下载失败最多重试一次；仍失败则停止并报告 blocker。

## 当前目标

支持打回后的多轮修改、轮次 diff、复审/终审两级审核，并让终审通过的数据进入可导出状态。
页面必须对齐图 5 Reviewer 验收台：左侧待审列表与批量操作、中间第 1 / 2 轮 Diff 视图、AI 预审结果、审核意见与操作卡片、右侧统计与完整审计时间线。

## 禁止范围

- 不覆盖历史 submission。
- 不只展示当前轮答案。
- 不让复审通过的数据直接导出，除非任务配置为跳过终审。

## 必须创建或修改

- `apps/api/src/reviews/diff.service.ts`
- `apps/api/src/reviews/final-review.service.ts`
- `apps/api/src/reviews/review-stage.service.ts`
- `apps/web/src/features/review/SubmissionDiffView.tsx`
- `apps/web/src/features/review/RoundSelector.tsx`
- `apps/web/src/pages/reviewer/FinalReviewPage.tsx`
- `packages/shared/src/reviewStages.ts`

## 必须实现 API

- `GET /reviews/:assignmentId/rounds`
- `GET /reviews/:assignmentId/diff?fromRound=1&toRound=2`
- `GET /reviews/final-pending`
- `POST /reviews/:submissionId/final-pass`
- `POST /reviews/:submissionId/final-reject`
- `PATCH /tasks/:taskId/review-stage-config`

## 必须实现行为

- 每次打回后 Labeler 再提交，round 自动递增。
- Diff 对比同一 assignment 的不同 round answers。
- Diff 必须展示第 1 轮提交和第 2 轮提交的字段级新增、删除、修改。
- 默认启用 `RECHECK + FINAL`。
- 可配置启用 `INITIAL + RECHECK + FINAL`。
- 终审通过后 submission 标记为最终通过，可被导出。
- 终审打回后回到 Labeler 修改。

## 必须测试

- Round 1 打回后 Round 2 正确生成。
- Diff 能标出新增、删除、修改字段。
- 图 5 截图级验收：复审 / 终审切换、第 1 / 2 轮 Diff、AI 评语、批量操作和右侧审计时间线完整。
- 复审通过进入 `FINAL_PENDING`。
- 终审通过进入最终通过。
- 终审打回后 Labeler 可见终审意见。

## 完成后运行

```bash
pnpm typecheck
pnpm test
pnpm dev
```

## 验收标准

- Reviewer 能看到第 1/2 轮 diff。
- 审计时间线展示 AI、复审、打回、二次提交、终审全过程。
- 终审通过数据可供 Batch 10 导出。
- 每个小任务提交点都已 commit 并 push 到 `codex/labelhub-fullstack`。

# Batch 06 可执行 Prompt：标注工作台、草稿与提交

请在当前仓库实现 Batch 6。先阅读 `docs/labelhub-plan/EXECUTION.md` 和 `docs/labelhub-plan/batches/batch-06-labeler-workbench-drafts-submissions.md`，然后只实现本批范围。

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

本 Batch 小任务提交点：标注工作台页面、题目导航与 profile 布局、草稿 API、提交 API、我的数据与统计、本地缓存/快捷键、提交测试。

## 工具与依赖处理要求

- 开始前运行 `command -v node`、`command -v pnpm`、`command -v git`、`command -v docker`。
- 项目内依赖可以自动安装，例如 `pnpm install`、`pnpm add <package>`、`pnpm add -D <package>`；依赖变化必须提交 `package.json` 和 `pnpm-lock.yaml`。
- 如果缺少 `node`、`git`、`docker` 或 `pnpm`，先按 `EXECUTION.md` 的工具规则处理，不能静默安装系统级工具。
- Redis/PostgreSQL 优先通过 `docker compose` 启动，不要求本机安装数据库服务。
- Playwright 缺浏览器时，可以自动运行 `pnpm exec playwright install chromium`，只安装 Chromium。
- 需要 `brew`、`sudo`、`npm install -g`、系统级安装或修改系统环境时，必须停止并请求用户确认。
- 网络下载失败最多重试一次；仍失败则停止并报告 blocker。

## 当前目标

Labeler 能逐题作答、自动保存草稿、提交答案，并让提交进入 AI 预审前置状态。
页面必须对齐图 3 Labeler 标注台：左侧题目导航、中间标注表单、右侧贡献 / 历史 / 快捷键面板、底部固定操作区。

## 禁止范围

- 不跳过后端 Schema 校验。
- 不允许提交覆盖已有 submission 快照。
- 不让官方 rawData 中的参考答案自动变成 Labeler answers。

## 必须创建或修改

- `apps/web/src/pages/labeler/WorkbenchPage.tsx`
- `apps/web/src/pages/labeler/MyDataPage.tsx`
- `apps/web/src/features/labeler/QuestionNavigator.tsx`
- `apps/web/src/features/labeler/RejectNotice.tsx`
- `apps/web/src/features/labeler/ContributionStats.tsx`
- `apps/web/src/api/drafts.ts`
- `apps/web/src/api/submissions.ts`
- `apps/api/src/drafts/drafts.module.ts`
- `apps/api/src/drafts/drafts.controller.ts`
- `apps/api/src/drafts/drafts.service.ts`
- `apps/api/src/submissions/submissions.module.ts`
- `apps/api/src/submissions/submissions.controller.ts`
- `apps/api/src/submissions/submissions.service.ts`

## 必须实现 API

- `GET /assignments/:id/workbench`
- `PUT /drafts/:assignmentId`
- `GET /drafts/:assignmentId`
- `POST /submissions`
- `GET /labeler/submissions`
- `GET /labeler/stats`

## 必须实现前端

- 题目导航：上一题、下一题、跳题。
- 草稿自动保存和手动保存。
- 草稿失败提示和本地临时缓存恢复。
- 提交前校验。
- 打回原因展示。
- 我的数据列表：已提交、通过、打回、待修改。
- `qa_quality` 问答质量布局。
- `preference_compare` A/B 偏好布局。
- 顶部必须展示草稿自动保存状态，例如「草稿已自动保存 18:02:31」。
- 打回提示必须在表单上方高亮展示上一轮打回原因。
- 题目级 `LLM 触发组件` 必须支持「重新生成」和「采纳为答案」中文操作。
- 底部固定操作区必须包含上一题、下一题、保存草稿、提交本题和快捷键提示。

## 必须测试

- 草稿可覆盖保存。
- 提交生成不可变 `submissions.round = 1`。
- 打回后二次提交生成 `round = 2`。
- 后端校验阻止缺必填字段提交。
- `qa_quality` 能展示四类媒体。
- `preference_compare` 能保存偏好结论。
- 图 3 截图级验收：左侧题目导航、中间表单、右侧贡献 / 历史 / 快捷键和底部操作区完整，所有文案为简体中文。

## 完成后运行

```bash
pnpm typecheck
pnpm test
pnpm dev
```

## 验收标准

- Labeler 能领取官方任务并在 Web 标注台提交。
- `drafts`、`submissions`、`audit_logs` 都有正确记录。
- 提交后状态进入 AI 预审队列前置状态。
- 每个小任务提交点都已 commit 并 push 到 `codex/labelhub-fullstack`。

# Batch 11 可执行 Prompt：质量加固与体验验收

请在当前仓库实现 Batch 11。先阅读 `docs/labelhub-plan/EXECUTION.md` 和 `docs/labelhub-plan/batches/batch-11-quality-hardening.md`，然后只实现本批范围。

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

本 Batch 小任务提交点：通用 Loading/Empty/Error、API 校验与异常格式、事务与幂等加固、E2E 主链路、视觉截图与性能检查、质量文档更新。

## 工具与依赖处理要求

- 开始前运行 `command -v node`、`command -v pnpm`、`command -v git`、`command -v docker`。
- 项目内依赖可以自动安装，例如 `pnpm install`、`pnpm add <package>`、`pnpm add -D <package>`；依赖变化必须提交 `package.json` 和 `pnpm-lock.yaml`。
- 如果缺少 `node`、`git`、`docker` 或 `pnpm`，先按 `EXECUTION.md` 的工具规则处理，不能静默安装系统级工具。
- Redis/PostgreSQL 优先通过 `docker compose` 启动，不要求本机安装数据库服务。
- Playwright 缺浏览器时，可以自动运行 `pnpm exec playwright install chromium`，只安装 Chromium。
- 如果 `docker compose` 配置检查失败，先报告具体缺失项，不直接安装 Docker。
- 需要 `brew`、`sudo`、`npm install -g`、系统级安装或修改系统环境时，必须停止并请求用户确认。
- 网络下载失败最多重试一次；仍失败则停止并报告 blocker。

## 当前目标

把完整链路从“能跑”打磨到“可稳定答辩演示”，补齐错误处理、并发、幂等、E2E、响应式和视觉一致性。
必须同时补齐四端路由隔离、三级审核流水线、五张截图级 UI 验收和简体中文治理扫描。

## 禁止范围

- 不新增大功能。
- 不重构已经稳定的模块边界。
- 不用跳过测试来制造通过。

## 必须创建或修改

- `apps/web/src/components/AppErrorBoundary.tsx`
- `apps/web/src/components/EmptyState.tsx`
- `apps/web/src/components/PageLoading.tsx`
- `apps/web/src/styles/theme.ts`
- `apps/api/src/common/filters/*.ts`
- `apps/api/src/common/pipes/*.ts`
- `apps/api/src/common/idempotency/*.ts`
- `apps/api/src/common/transactions/*.ts`
- `tests/e2e/*.spec.ts`
- `playwright.config.ts`

## 必须加固

- 所有主要页面具备 Loading、Empty、Error。
- 所有写接口具备参数校验。
- 领取、提交、审核、导出具备事务保护。
- 提交、AI 入队、导出创建具备幂等 key。
- AI 失败三次后转人工可视化。
- 批量审核部分失败时返回逐条结果。
- TypeScript 避免大面积 `any`。
- 五个核心页面必须对齐图 1-5 的布局结构、组件术语和主要交互。
- 核心页面不得出现未治理的硬编码英文用户文案。

## 必须测试

- 状态机单元测试仍全部通过。
- 导入、提交、AI 入队、审核、导出集成测试仍全部通过。
- 并发领取测试覆盖同一题只能被一个 Labeler 成功领取。
- 幂等测试覆盖重复提交、重复 AI 入队、重复导出请求。
- API 错误响应包含稳定错误码和用户可读消息。
- 未登录访问任一 Portal 必须跳转登录页，错误角色访问必须被拦截。

## 必须实现 E2E

- Owner 创建 `qa_quality` 任务、选择官方模板、导入数据、发布。
- 统一登录后四个角色进入各自 Portal，错误角色访问被拦截。
- Labeler 领取、保存草稿、提交。
- AI mock 预审通过或打回。
- Reviewer 打回，Labeler 修改后再提交，Reviewer 终审通过。
- Owner 导出四种格式。

## 必须做视觉验收

- 1280x800 截图检查。
- 1920x1080 截图检查。
- 页面文字不重叠，按钮文字不溢出。
- 表单 50 个字段时交互不卡顿。
- 五张截图级页面在 1280x800 和 1920x1080 下布局结构正确。
- 简体中文治理扫描通过。

## 完成后运行

```bash
pnpm typecheck
pnpm test
pnpm e2e
pnpm dev
```

## 验收标准

- 核心 E2E 通过。
- 四端路由隔离、三级审核流水线和中文治理验收通过。
- Web 端连续演示 10 分钟不报错。
- 关键页面在 1280x800 和 1920x1080 下布局正常。
- 每个小任务提交点都已 commit 并 push 到 `codex/labelhub-fullstack`。

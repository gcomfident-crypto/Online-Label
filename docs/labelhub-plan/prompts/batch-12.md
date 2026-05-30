# Batch 12 可执行 Prompt：部署、文档与答辩材料

请在当前仓库实现 Batch 12。先阅读 `docs/labelhub-plan/EXECUTION.md` 和 `docs/labelhub-plan/batches/batch-12-deploy-docs-demo.md`，然后只实现本批范围。

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

本 Batch 小任务提交点：README 与本地启动文档、部署与 Docker 文档、OpenAPI 与架构图、官方数据说明、submission 材料、演示脚本与截图清单、最终验收记录。

## 工具与依赖处理要求

- 开始前运行 `command -v node`、`command -v pnpm`、`command -v git`、`command -v docker`。
- 项目内依赖可以自动安装，例如 `pnpm install`、`pnpm add <package>`、`pnpm add -D <package>`；依赖变化必须提交 `package.json` 和 `pnpm-lock.yaml`。
- 如果缺少 `node`、`git`、`docker` 或 `pnpm`，先按 `EXECUTION.md` 的工具规则处理，不能静默安装系统级工具。
- Redis/PostgreSQL 优先通过 `docker compose` 启动，不要求本机安装数据库服务。
- Playwright 缺浏览器时，可以自动运行 `pnpm exec playwright install chromium`，只安装 Chromium。
- 如果 `docker compose` 配置检查失败，先报告具体缺失项，不直接安装 Docker。
- 部署文档必须说明系统级依赖由用户预装或由云平台环境提供。
- 部署文档必须说明 DeepSeek 使用 `DEEPSEEK_API_KEY`，但只能写占位值，不能写入 `docs/labelhub-plan/env` 中的真实 key。
- 需要 `brew`、`sudo`、`npm install -g`、系统级安装或修改系统环境时，必须停止并请求用户确认。
- 网络下载失败最多重试一次；仍失败则停止并报告 blocker。

## 当前目标

准备可交付材料：README、部署说明、API 文档、架构图、演示脚本、Demo 截图清单、AI Coding 记录和 `submission/` 目录。
提交物必须解释统一登录、四端 Portal、RBAC、五张截图设计蓝本和 `AI 自动预审 -> 人工复审 -> 终审` 三级审核流水线。

## 禁止范围

- 不提交官方 zip 或解压数据。
- 不写只能在个人电脑路径下运行的唯一启动方式。
- 不让部署说明只覆盖本地，必须包含云部署建议。

## 必须创建或修改

- `README.md`
- `docs/deployment.md`
- `docs/api/openapi.yaml`
- `docs/architecture.md`
- `docs/demo-script.md`
- `docs/demo-data.md`
- `submission/README.md`
- `submission/demo-script.md`
- `submission/basic-technical-doc.md`
- `submission/ai-coding-log.md`
- `submission/screenshots.md`
- `docker-compose.yml`
- `.env.example`

## 必须补齐文档

- 本地启动：
  - 安装依赖
  - 启动 PostgreSQL/Redis
  - Prisma migrate/seed
  - 启动 Web/API/Worker
- 统一登录与四端隔离：
  - `/login`
  - `/owner/*`
  - `/labeler/*`
  - `/agent/*`
  - `/reviewer/*`
  - RBAC 和路由守卫策略
- 官方数据：
  - `qa_quality` 字段说明
  - `preference_compare` 字段说明
  - JSON/JSONL/Excel/zip 导入方式
  - 不提交原始 zip 的说明
- AI 环境变量：
  - `DEEPSEEK_API_KEY`
  - `LLM_PROVIDER=mock|deepseek`
  - 说明 `docs/labelhub-plan/deepseek-api-example.py` 是本机参考示例，`docs/labelhub-plan/env` 是本机密钥文件，不得提交或公开。
- API 文档：
  - 任务
  - 模板
  - 导入
  - 草稿
  - 提交
  - AI 审核
  - 人工审核
  - 导出
- 架构图：
  - 系统架构
  - 数据流
  - 状态机
  - AI Agent 流程
  - 四端 Portal 隔离

## 必须准备演示脚本

- 先演示 `qa_quality` 完整闭环。
- 再演示 `preference_compare` 模板、导入和导出映射。
- 明确每一步的页面路径、角色、预期结果。
- 从 `/login` 开始演示 Owner、Labeler、AI Agent、Reviewer 四端切换。
- 明确复审通过后仍需终审，终审通过后才能导出。
- 说明 mock AI 如何保证演示稳定。

## 必须测试

- 按 README 从零启动成功。
- Docker Compose 能启动依赖服务。
- `pnpm exec prisma db seed` 后能看到 30 条 `qa_quality` 和 12 条 `preference_compare`。
- `submission/` 目录材料齐全。
- 文档中包含五张截图对应的页面结构说明。
- 全部提交物用户可见文案为简体中文，提交示例为中文 Commit 摘要。

## 完成后运行

```bash
pnpm typecheck
pnpm test
pnpm e2e
docker compose config
```

## 验收标准

- 新同学按 README 能启动项目。
- 答辩脚本覆盖 Owner、Labeler、AI Agent、Reviewer 四个独立 Portal。
- 提交物能解释动态表单、状态机、AI Agent 工程化三大难点。
- 每个小任务提交点都已 commit 并 push 到 `codex/labelhub-fullstack`。

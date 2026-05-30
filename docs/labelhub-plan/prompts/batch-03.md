# Batch 03 可执行 Prompt：Schema Renderer MVP

请在当前仓库实现 Batch 3。先阅读 `docs/labelhub-plan/EXECUTION.md` 和 `docs/labelhub-plan/batches/batch-03-schema-renderer-mvp.md`，然后只实现本批范围。

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

本 Batch 小任务提交点：Renderer 核心、字段物料、校验与联动、官方 Schema 示例与媒体展示、LLM assist mock、Playground 与测试。

## 工具与依赖处理要求

- 开始前运行 `command -v node`、`command -v pnpm`、`command -v git`、`command -v docker`。
- 项目内依赖可以自动安装，例如 `pnpm install`、`pnpm add <package>`、`pnpm add -D <package>`；依赖变化必须提交 `package.json` 和 `pnpm-lock.yaml`。
- 如果缺少 `node`、`git`、`docker` 或 `pnpm`，先按 `EXECUTION.md` 的工具规则处理，不能静默安装系统级工具。
- Redis/PostgreSQL 优先通过 `docker compose` 启动，不要求本机安装数据库服务。
- Playwright 缺浏览器时，可以自动运行 `pnpm exec playwright install chromium`，只安装 Chromium。
- 需要 `brew`、`sudo`、`npm install -g`、系统级安装或修改系统环境时，必须停止并请求用户确认。
- 网络下载失败最多重试一次；仍失败则停止并报告 blocker。

## 当前目标

实现动态表单运行时：给定 `LabelhubSchema` 和一条 `rawData`，Web 能渲染官方标注页面、收集 answers、执行校验和字段联动。
同时必须提供「商品标题清洗 v3」截图蓝本 Schema 示例，用于验证 `ShowItem`、`LLM 触发组件`、字段联动和校验提示。

## 禁止范围

- 不实现拖拽 Designer。
- 不实现真实提交。
- 不接真实 LLM。
- 不把 Renderer 写死成官方两个页面。

## 必须创建或修改

- `apps/web/src/features/schema-renderer/SchemaRenderer.tsx`
- `apps/web/src/features/schema-renderer/FieldRenderer.tsx`
- `apps/web/src/features/schema-renderer/fields/*.tsx`
- `apps/web/src/features/schema-renderer/validation.ts`
- `apps/web/src/features/schema-renderer/linkage.ts`
- `apps/web/src/features/schema-renderer/examples/qaQualitySchema.ts`
- `apps/web/src/features/schema-renderer/examples/preferenceCompareSchema.ts`
- `apps/web/src/pages/dev/RendererPlaygroundPage.tsx`
- `apps/api/src/llm/llm.controller.ts`
- `apps/api/src/llm/llm.service.ts`

## 必须实现物料

- `show_item`
- `text`
- `textarea`
- `radio`
- `checkbox`
- `tag_select`
- `rich_text`
- `file_upload`
- `image_upload`
- `json_editor`
- `llm_assist`
- `group`
- `tabs`
- 截图术语必须在用户可见文案中保留：`展示项 ShowItem`、`LLM 触发组件`。

## 必须实现规则

- 必填、最小长度、最大长度、正则、自定义校验 key。
- 条件显示、隐藏、禁用、动态必填、设值。
- `ShowItem` 支持 `text/image/video/markdown` 媒体展示。
- `preference_compare` 支持 A/B 并排展示。
- `LLM 触发组件` 支持「重新生成」「采纳」中文操作，并能写入 `targetFieldKey`。

## 必须实现 API

- `POST /llm/assist/mock`：按 `datasetKind` 返回稳定建议。

## 必须测试

- `qa_quality` 的 `prompt`、`model_answer`、`reference` 能展示。
- `media_type=text|image|video|markdown` 均能渲染。
- `preference_compare` 能并排展示 `response_a` 与 `response_b`。
- 必填、长度、正则、联动规则生效。
- `llm_assist` mock 结果能写入指定字段。
- 「商品标题清洗 v3」示例能触发 `cleaned_title` 长度计数、`category` 联动、`keywords` 标签多选和 `LLM 触发组件` 采纳建议。

## 完成后运行

```bash
pnpm typecheck
pnpm test
pnpm dev
```

## 验收标准

- `/dev/renderer` 能切换 `qa_quality` 和 `preference_compare` 示例。
- 页面能填写 answers，并显示校验错误。
- Renderer 不依赖 Designer 内部状态。
- 每个小任务提交点都已 commit 并 push 到 `codex/labelhub-fullstack`。

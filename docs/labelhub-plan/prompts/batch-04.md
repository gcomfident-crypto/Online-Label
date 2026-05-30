# Batch 04 可执行 Prompt：模板 Designer MVP

请在当前仓库实现 Batch 4。先阅读 `docs/labelhub-plan/EXECUTION.md` 和 `docs/labelhub-plan/batches/batch-04-template-designer-mvp.md`，然后只实现本批范围。

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

本 Batch 小任务提交点：Designer 状态与画布、物料面板、属性配置、模板 API 与版本发布、官方模板库与预览、Designer 测试。

## 工具与依赖处理要求

- 开始前运行 `command -v node`、`command -v pnpm`、`command -v git`、`command -v docker`。
- 项目内依赖可以自动安装，例如 `pnpm install`、`pnpm add <package>`、`pnpm add -D <package>`；依赖变化必须提交 `package.json` 和 `pnpm-lock.yaml`。
- 如果缺少 `node`、`git`、`docker` 或 `pnpm`，先按 `EXECUTION.md` 的工具规则处理，不能静默安装系统级工具。
- Redis/PostgreSQL 优先通过 `docker compose` 启动，不要求本机安装数据库服务。
- Playwright 缺浏览器时，可以自动运行 `pnpm exec playwright install chromium`，只安装 Chromium。
- 需要 `brew`、`sudo`、`npm install -g`、系统级安装或修改系统环境时，必须停止并请求用户确认。
- 网络下载失败最多重试一次；仍失败则停止并报告 blocker。

## 当前目标

Owner 能通过左侧物料、中间画布、右侧配置区搭建标注模板，保存并发布不可变 Schema 版本。
页面必须对齐图 2 Owner 模板配置：左侧物料区、中间画布、右侧属性 / 校验 / 联动配置三栏结构。

## 禁止范围

- 不重新实现 Renderer。
- 不把模板保存为不可解析的 UI 状态。
- 不允许发布没有字段或字段 key 重复的模板。

## 必须创建或修改

- `apps/web/src/pages/owner/TemplateDesignerPage.tsx`
- `apps/web/src/features/template-designer/MaterialPanel.tsx`
- `apps/web/src/features/template-designer/DesignerCanvas.tsx`
- `apps/web/src/features/template-designer/PropertyPanel.tsx`
- `apps/web/src/features/template-designer/OfficialTemplateGallery.tsx`
- `apps/web/src/features/template-designer/templateStore.ts`
- `apps/web/src/api/templates.ts`
- `apps/api/src/templates/templates.module.ts`
- `apps/api/src/templates/templates.controller.ts`
- `apps/api/src/templates/templates.service.ts`
- `apps/api/src/templates/dto/*.ts`

## 必须实现前端

- 左侧物料完整列表。
- dnd-kit 拖拽新增、排序、删除、复制字段。
- 右侧配置：
  - 字段名、标题、占位符、选项、必填、长度、正则、自定义校验 key。
  - 字段联动：条件、动作、目标字段。
- 预览模式复用 Batch 3 `SchemaRenderer`。
- 官方模板一键生成：
  - `qa_quality`
  - `preference_compare`
  - `商品标题清洗 v3` 截图蓝本
- 撤销/重做。
- 右侧属性面板必须包含「基础 / 校验 / 联动」标签页。
- 中间画布必须能展示 `ShowItem` 和 `LLM 触发组件` 字段卡片。

## 必须实现 API

- `POST /templates`
- `GET /templates`
- `GET /templates/:id`
- `PATCH /templates/:id`
- `POST /templates/:id/publish`
- `POST /templates/from-profile`

## 必须测试

- 从官方 `qa_quality` 模板创建后包含媒体展示和评分字段。
- 从官方 `preference_compare` 模板创建后包含 A/B 展示和偏好字段。
- 从「商品标题清洗 v3」蓝本模板创建后，画布结构与图 2 一致，右侧属性面板能配置 `cleaned_title` 的必填、最大长度、正则、自定义函数和字段联动。
- 发布后生成新版本，旧版本不可变。
- 重复字段 key 无法保存。

## 完成后运行

```bash
pnpm typecheck
pnpm test
pnpm dev
```

## 验收标准

- Owner 能在 `/owner/templates` 创建、编辑、预览、发布模板。
- 发布版本能被 Renderer 运行。
- 数据库保存的是可序列化 JSON Schema。
- 每个小任务提交点都已 commit 并 push 到 `codex/labelhub-fullstack`。

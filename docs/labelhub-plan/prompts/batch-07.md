# Batch 07 可执行 Prompt：AI 自动预审 Agent

请在当前仓库实现 Batch 7。先阅读 `docs/labelhub-plan/EXECUTION.md` 和 `docs/labelhub-plan/batches/batch-07-ai-review-agent.md`，然后只实现本批范围。

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

本 Batch 小任务提交点：AI 审核规则 API、BullMQ 队列接线、LLM provider 抽象与 mock、官方 Prompt 模板、Worker processor、队列监控页面、重试幂等测试。

## 工具与依赖处理要求

- 开始前运行 `command -v node`、`command -v pnpm`、`command -v git`、`command -v docker`。
- 项目内依赖可以自动安装，例如 `pnpm install`、`pnpm add <package>`、`pnpm add -D <package>`；依赖变化必须提交 `package.json` 和 `pnpm-lock.yaml`。
- 如果缺少 `node`、`git`、`docker` 或 `pnpm`，先按 `EXECUTION.md` 的工具规则处理，不能静默安装系统级工具。
- Redis/PostgreSQL 优先通过 `docker compose` 启动，不要求本机安装数据库服务。
- Playwright 缺浏览器时，可以自动运行 `pnpm exec playwright install chromium`，只安装 Chromium。
- 需要 `brew`、`sudo`、`npm install -g`、系统级安装或修改系统环境时，必须停止并请求用户确认。
- 网络下载失败最多重试一次；仍失败则停止并报告 blocker。

## 当前目标

标注提交后自动进入 BullMQ AI 预审队列，Worker 调用 `LlmProvider` 输出结构化评分、结论和可追溯日志。页面必须对齐图 4 AI Agent 机审：左侧异步队列和状态分组，右侧提交内容、JSON 字段视图、维度评分、AI 评语、Prompt 模板、处理日志。

## 禁止范围

- 不把裸文本解析作为唯一结果来源。
- 不要求真实 API Key 才能演示。
- 不丢失 rawPrompt、rawOutput、模型元数据。
- 不重复处理同一个 `submissionId + round`。

## 必须创建或修改

- `apps/api/src/ai-review/ai-review.module.ts`
- `apps/api/src/ai-review/ai-review.controller.ts`
- `apps/api/src/ai-review/ai-review.service.ts`
- `apps/api/src/review-rules/*`
- `apps/worker/src/queues/aiReview.queue.ts`
- `apps/worker/src/processors/aiReview.processor.ts`
- `apps/worker/src/llm/LlmProvider.ts`
- `apps/worker/src/llm/MockLlmProvider.ts`
- `apps/worker/src/llm/DeepSeekProvider.ts`
- `apps/worker/src/llm/OpenAiLikeProvider.ts`
- `apps/worker/src/prompts/*.ts`
- `apps/web/src/pages/agent/AiReviewQueuePage.tsx`
- `apps/web/src/pages/owner/AiRuleConfigPage.tsx`

## 必须实现 API

- `POST /tasks/:taskId/review-rule`
- `GET /tasks/:taskId/review-rule`
- `GET /ai-review/jobs`
- `POST /ai-review/jobs/:id/retry`
- `GET /submissions/:id/ai-review`

## 必须实现 Agent

- `MockLlmProvider` 对官方样例稳定返回结构化结果。
- 参考 `docs/labelhub-plan/deepseek-api-example.py` 实现 DeepSeek 真实 provider：使用 OpenAI SDK 兼容接口、`baseURL=https://api.deepseek.com`、默认模型 `deepseek-chat`。
- DeepSeek provider 只从环境变量 `DEEPSEEK_API_KEY` 读取密钥，不读取硬编码 key。
- `docs/labelhub-plan/env` 是本机真实密钥文件，只能用于本地验证变量名，禁止打印、复制、提交或写入日志。
- `qa_quality` Prompt 包含 `prompt`、`model_answer`、`reference`、`expected_dimensions`、Labeler answers。
- `preference_compare` Prompt 包含 `prompt`、`response_a`、`response_b`、`dimensions`、Labeler answers。
- 输出 verdict：`pass | reject | manual`。
- 输出 scores、reason、suggestions。
- 页面必须展示 `function_calling · 结构化` 或 `json_schema · 结构化` 输出模式。
- 失败重试，超过次数转人工兜底。
- 记录 provider、model、temperature、tokens、耗时、requestId。

## 必须测试

- 提交后自动入队。
- Mock pass 写入 AI 评分并进入人工待审。
- Mock reject 进入待修改。
- Mock manual 进入人工待审。
- DeepSeek provider 缺少 `DEEPSEEK_API_KEY` 时必须返回明确配置错误，不得泄露 key。
- 同一 submission 重复入队不会生成重复 review record。
- 结构化输出异常会重试并最终转人工。
- 图 4 截图级验收：左侧队列状态、右侧 JSON 字段视图、维度评分、AI 评语、Prompt 模板和处理日志完整，所有用户可见文案为简体中文。

## 完成后运行

```bash
pnpm typecheck
pnpm test
pnpm dev
```

## 验收标准

- AI Agent 端页面能看到 AI 队列、状态、耗时、失败原因。
- 官方两个 profile 都能产出不同结构化预审结果。
- 无真实 API Key 时完整链路仍可演示。
- 每个小任务提交点都已 commit 并 push 到 `codex/labelhub-fullstack`。

# 测试脚本索引

面向 agent 的测试选择入口。按"选择策略 → 运行入口 → 测试清单 → 报告规范"的顺序组织：agent 先查决策矩阵定位要跑什么，再查入口获取命令，最后按规范输出报告。

## 选择策略：改哪里跑什么

根据改动范围匹配最小测试集和可选补跑项。价值列说明每类测试防什么风险。

| 改动范围 | 必跑（最小集） | 建议补跑 | 防什么风险 |
|-|-|-|-|
| 某个页面 | 同名页面测试 | 相关 E2E | 页面状态、交互、DOM 语义和视觉约定不退化 |
| API service | `*.service.test.ts` → `*.controller.test.ts` | 关联前端页面测试 | 重复提交、状态错流、AI 队列丢失、模板版本破坏 |
| 状态字段/枚举 | `packages/shared` 状态/schema/RBAC | API + 前端触达测试 | 前后端和 worker 共同依赖的业务协议不稳定 |
| 模板设计器 | `TemplateDesignerPage` + `PropertyPanel` + `templateStore` | `tests/e2e/template-designer.spec.ts` | 设计器 store 状态、属性面板配置、字段持久化 |
| 任务主链路 | `tasks` + `assignments` + `submissions` + `reviews` + `ai-review` + `task-flows` | `quality-hardening.spec.ts` | 全链路状态流转、角色操作、数据一致性 |
| 导入导出 | `exports` + `export.processor` + `exporters` + `DatasetImportPage` + `ExportCenterPage` + `datasetProfiles` | E2E 导出相关步骤 | 输入数据丢失、终审过滤错漏、导出格式/字段错位 |
| 登录/权限/路由 | `web-shell.test.tsx` | 相关 E2E | 角色越权、路由泄露、session 策略错误 |
| Worker 队列/处理器 | 对应 processor + `queues.test.ts` | API 侧相关 service | 后台任务幂等、失败态、文件落盘和模型配置不稳定 |
| shared 协议 | 对应 shared 测试 | 所有消费方（API + Web + Worker） | 协议定义与消费方实现不一致 |
| 错误提示/样式/空状态 | `web-shell` + `styles` + `AppFeedbackStates` + `ToastViewport` + `StatusTag` | 涉及页面测试 | 脏数据入库、空白页、误导文案、布局溢出 |

### 按测试分类速查

agent 不确定改动归属哪个分类时，按分类对号入座：

| 分类 | 何时优先跑 |
|-|-|
| 端到端 | 改登录/路由/任务全链路/模板配置/跨角色流程/导出主链路 |
| 后端关键链路 | 改 API/服务层/状态流转/提交/审核/AI 预审/模板发布 |
| 数据导入导出 | 改导入/导出/字段映射/数据集 profile/文件生成 |
| 异常输入与体验 | 改错误提示/权限拦截/样式/空状态/网络失败/配置缺失 |
| 前端交互 | 改 React 页面/组件/抽屉/表格/筛选/设计器/工作台 |
| 共享协议/状态机 | 改 shared 类型/schema/状态/RBAC/数据集协议 |
| Worker 异步 | 改队列/导出 worker/AI 预审 worker/LLM Provider |

## 运行入口速查

| 范围 | 命令 | 说明 |
|-|-|-|
| 全仓 | `pnpm test` | 递归运行各 workspace 的 `vitest run` |
| 前端 | `pnpm --filter @labelhub/web test` | React 页面、组件、样式、工具 |
| API | `pnpm --filter @labelhub/api test` | Nest controller/service、状态机、导出、AI 预审 |
| Worker | `pnpm --filter @labelhub/worker test` | 队列、处理器、导出文件、LLM Provider |
| Shared | `pnpm --filter @labelhub/shared test` | Schema、状态机、RBAC、数据集协议 |
| E2E 全量 | `pnpm test:e2e` | Playwright；`playwright.config.ts` |
| E2E 本机 Chrome | `PW_BROWSER_CHANNEL=chrome pnpm test:e2e` | 不下载 Playwright 托管 Chromium |
| E2E 复用服务 | `PW_BROWSER_CHANNEL=chrome PW_REUSE_EXISTING_SERVER=1 pnpm test:e2e` | 复用已有 API/Web；缺少 `:5175` 时按 config 启动 |

> E2E：baseURL `http://127.0.0.1:5175`，API 健康检查 `http://127.0.0.1:3000/health`。
> 受限沙箱中 `tsx` 创建的本地 IPC pipe 可能需提权才能启动 Playwright webServer。

## 测试清单

### 端到端测试

| 脚本 | 覆盖重点 | 推荐命令 |
|-|-|-|
| `tests/e2e/template-designer.spec.ts` | Owner 新建草稿、配置 ShowItem 与单选字段、保存、列表回显、重开和刷新持久化 | `PW_BROWSER_CHANNEL=chrome PW_REUSE_EXISTING_SERVER=1 pnpm test:e2e tests/e2e/template-designer.spec.ts --project=chromium-1280` |
| `tests/e2e/owner-tasks.spec.ts` | Owner 任务管理发布抽屉、任务发布/暂停/恢复/结束状态流转 | `PW_BROWSER_CHANNEL=chrome pnpm test:e2e tests/e2e/owner-tasks.spec.ts --project=chromium-1280` |
| `tests/e2e/quality-hardening.spec.ts` | 四端路由隔离、qa_quality 全链路（导入→领取→草稿→提交→AI→打回→二次提交→Reviewer 通过→四格式导出）、四视口截图 | `PW_BROWSER_CHANNEL=chrome pnpm test:e2e tests/e2e/quality-hardening.spec.ts --project=chromium-1280` |
| `tests/e2e/renderer-playground.spec.ts` | Renderer 调试台示例切换、模式切换和答案保留 | `PW_BROWSER_CHANNEL=chrome pnpm test:e2e tests/e2e/renderer-playground.spec.ts --project=chromium-1280` |

#### `template-designer.spec.ts` 关键约定

| 项 | 值 |
|-|-|
| 登录账号 | Owner `zhangzexin` / `labelhub@1101101`；mock `**/auth/login` |
| 模板名称 | `自动化测试模板` |
| ShowItem | 数据源 `prompt`，显示名 `用户问题` |
| 标注字段 | 单选 `fieldKey: quality`，标题 `质量判断`，必填 |
| 选项 | `优秀` / `合格` / `不合格`（保存后 value 为 `option_1/2/3`） |
| 保存入口 | 点击配置抽屉外侧 → 确认弹窗"需要保存成草稿吗？" → 点击"保存" |
| 已知差异 | 未暴露"描述"和"数据集类型"控件；空模板 `datasetKind` 为 `generic_json` |
| 截图序列 | `01-owner-home` → `02-template-list` → `03-new-template-empty` → `04-template-name-filled` → `05-fields-configured` → `06-save-draft-confirm` → `07-save-success-list` → `08-reopen-template` → `09-after-refresh` |
| 报告路径 | `docs/verify/reports/template-designer-new-template-regression-YYYYMMDD-HHMM.md` |

### 后端关键链路测试

> 推荐命令：`pnpm --filter @labelhub/api test`

| 脚本 | 覆盖重点 |
|-|-|
| `apps/api/src/api.spec.ts` | API shell、健康检查、演示账号登录、错误 envelope |
| `apps/api/src/tasks/tasks.service.test.ts` | 任务创建、草稿发布、暂停/恢复/结束、审计日志、非法恢复 |
| `apps/api/src/tasks/tasks.controller.test.ts` | 任务创建/列表/详情/保存/状态流转和审计日志接口 |
| `apps/api/src/templates/templates.service.test.ts` | 官方模板草稿、A/B 偏好模板、重复字段名拒绝、草稿发布、不可变版本、兼容报告、版本链占用时拒绝发布 |
| `apps/api/src/templates/templates.controller.test.ts` | 模板创建/列表/详情/保存/发布和官方模板入口接口 |
| `apps/api/src/task-flows/task-flows.service.test.ts` | 任务级主流程节点、操作人时间、打回和再次提交事件、AI 失败阶段 |
| `apps/api/src/state-machine/state-machine.service.test.ts` | 任务/提交/AI 审核/人工复审/导出状态合法迁移和中文错误 |
| `apps/api/src/submissions/submissions.service.test.ts` | 合法提交、AI_QUEUED、AI 模型缺失、副作用阻断、二次提交、幂等提交 |
| `apps/api/src/submissions/submissions.controller.test.ts` | 提交、我的数据、统计接口和参数归一化 |
| `apps/api/src/assignments/assignments.service.test.ts` | 任务广场、领取、并发领取、配额、截止时间、任务状态限制 |
| `apps/api/src/assignments/assignments.controller.test.ts` | 任务广场查询与领取接口、未知状态和默认标注员 |
| `apps/api/src/drafts/drafts.service.test.ts` | 草稿覆盖保存、工作台查询、打回原因、通过后隐藏历史打回、非法草稿保存 |
| `apps/api/src/drafts/drafts.controller.test.ts` | 工作台、读取草稿、保存草稿接口和 answers 归一化 |
| `apps/api/src/reviews/reviews.service.test.ts` | 人工复审列表、AI 评分评语、指派过滤、模板 schema、AI 打回未完成时阻断提前复审 |
| `apps/api/src/reviews/reviews.controller.test.ts` | 人工复审列表/详情/动作/批量和指派接口 |
| `apps/api/src/reviews/diff.service.test.ts` | assignment 不可变提交轮次、答案 diff、缺失轮次错误 |
| `apps/api/src/ai-review/ai-review.service.test.ts` | AI 预审队列、任务级聚合、最新提交批次、历史版本快照 |
| `apps/api/src/ai-review/ai-review.controller.test.ts` | AI 队列、重试和单条机审详情接口 |
| `apps/api/src/ai-review/ai-review-processor.service.test.ts` | 排队任务自动处理、字段级预审结果、真实模型输出、ShowItem 上下文、mock 规则禁用假评语 |
| `apps/api/src/review-rules/review-rules.service.test.ts` | AI 审核规则默认初始化、保存新版本、拒绝 mock provider、任务不存在错误 |
| `apps/api/src/review-rules/review-rules.controller.test.ts` | 任务 AI 审核规则查询和保存接口 |
| `apps/api/src/audit/audit.service.test.ts` | 审计日志写入、metadata 序列化、null/undefined 处理和不可序列化拒绝 |
| `apps/api/src/debug/debug.controller.test.ts` | 开发环境 debug 路由、Renderer 调试示例、非开发环境隐藏 |
| `apps/api/src/env.test.ts` | API 从 workspace 根目录加载 `.env` |
| `apps/api/src/prisma/prisma.service.test.ts` | DATABASE_URL 解析、生产环境缺失报错、本地默认连接 |
| `apps/api/src/prisma-schema.test.ts` | Prisma 核心模型、JSON 字段、草稿唯一性、模板版本元数据 |
| `apps/api/src/seed-data.test.ts` | 稳定基础用户和空业务数据 seed |
| `apps/api/src/common/ai-review-runtime.test.ts` | DeepSeek/OpenAI/custom AI 预审运行时配置解析和缺密钥返回 null |
| `apps/api/src/llm/llm.service.test.ts` | LLM 字段分类、LLM 辅助生成、鉴权失败错误、过滤上传演示值、字段级 AI 预审 |

### 数据导入导出验收

| 脚本 | 覆盖重点 | 推荐命令 |
|-|-|-|
| `apps/api/src/exports/exports.service.test.ts` | 创建导出任务、字段映射快照、文件生成下载、幂等键、只预览/导出复审通过数据、审核字段隐藏、自定义输入文件模板、数组字段合并 | `pnpm --filter @labelhub/api test -- exports` |
| `apps/api/src/exports/exports.controller.test.ts` | 导出创建/历史/详情/下载/重试和预览接口 | |
| `apps/api/src/exports/export-mapping.service.test.ts` | qa_quality 和 preference_compare 官方字段映射、预览行、includeReviews、自定义字段映射过滤 | |
| `apps/worker/src/exporters/exporters.test.ts` | JSON/JSONL/CSV/Excel 文件生成，稳定表头和数组字段拼接 | `pnpm --filter @labelhub/worker test -- export` |
| `apps/worker/src/processors/export.processor.test.ts` | 只导出 FINAL_APPROVED 数据，写入文件，成功/失败状态 | |
| `apps/web/src/pages/owner/DatasetImportPage.test.tsx` | JSONL 导入统计、题目预览刷新、批量写入 rawData 字段 | `pnpm --filter @labelhub/web test -- DatasetImportPage ExportCenterPage autoShowItemTemplate` |
| `apps/web/src/pages/owner/ExportCenterPage.test.tsx` | 导出记录选择、单条/批量格式导出、T 格式任务 ID、排序、空状态、任务接口失败降级 | |
| `apps/web/src/pages/owner/autoShowItemTemplate.test.ts` | 输入文件字段分类、ShowItem 自动生成、媒体 URL 保留、原始字段顺序、模型漏判兜底 | |
| `packages/shared/src/datasetProfiles.test.ts` | qa_quality、preference_compare、generic_json 数据集 profile、必填字段、Excel 字符串数组和中文布尔值归一化 | `pnpm --filter @labelhub/shared test -- datasetProfiles` |

### 异常输入与体验反馈

| 脚本 | 覆盖重点 | 推荐命令 |
|-|-|-|
| `apps/web/src/__tests__/web-shell.test.tsx` | 登录页、角色校验、路由隔离、账号菜单退出、session 存储策略、无权限页面 | `pnpm --filter @labelhub/web test -- web-shell styles request AppFeedbackStates ToastViewport StatusTag` |
| `apps/web/src/__tests__/styles.test.ts` | 全局样式、输入光标、属性面板、下拉层级、滚动、抽屉、表格、ShowItem、模板配置视觉细节 | |
| `apps/web/src/__tests__/vite-config.test.ts` | Vite `/api` 代理和 favicon | |
| `apps/web/src/api/request.test.ts` | API base、data envelope、空错误响应、非 JSON 成功响应、网络失败提示 | |
| `apps/web/src/components/AppFeedbackStates.test.tsx` | 页面 loading、empty state、error boundary 和重试 | |
| `apps/web/src/components/ToastViewport.test.tsx` | Toast 中央浮层、顶部横条、自动消失、悬停暂停、不可关闭加载态 | |
| `apps/web/src/components/StatusTag.test.tsx` | 状态中文标签、tone、圆点、浅底色胶囊、AI 重试 warning | |
| `apps/api/src/debug/debug.controller.test.ts` | debug 路由只在开发环境暴露，避免生产误开 | `pnpm --filter @labelhub/api test -- debug env prisma` |
| `apps/api/src/env.test.ts` | `.env` 加载位置，避免配置误读 | |
| `apps/api/src/prisma/prisma.service.test.ts` | 生产环境数据库 URL 缺失时给出明确中文错误 | |
| `apps/worker/src/llm/DeepSeekProvider.test.ts` | 缺少 `DEEPSEEK_API_KEY` 时明确报错且不泄露密钥 | `pnpm --filter @labelhub/worker test -- DeepSeekProvider` |
| `packages/shared/src/templateValidation.test.ts` | 空字段、重复字段名、物料配置、联动目标、自定义校验白名单、上传字段约束、未完成联动规则 | `pnpm --filter @labelhub/shared test -- templateValidation` |

### 前端页面与组件交互测试

> 推荐命令：`pnpm --filter @labelhub/web test`

| 脚本 | 覆盖重点 |
|-|-|
| `apps/web/src/pages/owner/TaskListPage.test.tsx` | 任务列表、空状态、接口失败降级、新建任务、模板选择、删除、模板配置入口和发布抽屉 |
| `apps/web/src/pages/owner/TemplateDesignerPage.test.tsx` | 模板设计器、官方蓝本、输入文件自动解析、ShowItem 预览、AI Prompt、保存/发布/版本管理 |
| `apps/web/src/pages/owner/TaskDetailPage.test.tsx` | 任务详情和审计日志 |
| `apps/web/src/pages/owner/AiRuleConfigPage.test.tsx` | 任务 AI 审核规则加载和保存新版本 |
| `apps/web/src/pages/owner/components/TaskProgressTimeline.test.tsx` | 任务进度时间线、无 AI 预审链路、AI 打回和再次提交顺序 |
| `apps/web/src/pages/owner/templateDraftHandoff.test.ts` | 模板草稿交接数据校验和 sessionStorage 读取失败处理 |
| `apps/web/src/pages/labeler/TaskMarketPage.test.tsx` | 任务广场、领取、上传文件任务预览、筛选、编号顺序、已领取隐藏 |
| `apps/web/src/pages/labeler/WorkbenchPage.test.tsx` | 标注台结构、任务统一提交、跨题保存、只读态、题目导航、草稿和提交 |
| `apps/web/src/pages/labeler/MyDataPage.test.tsx` | 我的数据按任务聚合、搜索筛选、进度状态、AI 预审胶囊 |
| `apps/web/src/pages/agent/AgentDashboardPage.test.tsx` | AI Agent 看板真实数据聚合、时间范围、导出报告、趋势 tooltip |
| `apps/web/src/pages/agent/AiReviewQueuePage.test.tsx` | AI 预审队列按任务展示、流水线、日志失败降级和错误提示 |
| `apps/web/src/pages/reviewer/ReviewListPage.test.tsx` | Reviewer 任务列表聚合、详情弹层、空表格样式 |
| `apps/web/src/pages/reviewer/ReviewDetailPage.test.tsx` | 人工复审详情三栏、题目切换、时限颜色、字段评论、打回/通过操作 |
| `apps/web/src/features/schema-renderer/SchemaRenderer.test.tsx` | SchemaRenderer、ShowItem、rawData、displayConfig 表格、媒体 URL 渲染 |
| `apps/web/src/features/template-designer/PropertyPanel.test.tsx` | 模板属性面板、基础属性、校验、联动、选项、LLM 提示、ShowItem 配置 |
| `apps/web/src/features/template-designer/templateStore.test.ts` | 设计器 store、添加/复制字段、撤销重做、历史限制、字段排序、拖拽重排 |
| `apps/web/src/features/template-designer/components/FieldMentionInput.test.tsx` | `#` 字段候选、键盘选择、token 删除、中文输入法组合输入 |
| `apps/web/src/features/template-designer/rule-editor/ruleEditorParser.test.ts` | 联动规则 AST 与节点往返解析 |
| `apps/web/src/features/template-designer/rule-editor/ruleEditorSerializer.test.ts` | 结构化联动规则序列化为条件和动作节点 |
| `apps/web/src/hooks/useAdaptiveTablePageSize.test.tsx` | 表格可用高度和窗口变化下的分页行数计算 |

### Worker 异步任务测试

> 推荐命令：`pnpm --filter @labelhub/worker test`

| 脚本 | 覆盖重点 |
|-|-|
| `apps/worker/src/queues.test.ts` | AI 预审和导出队列名、BullMQ payload、幂等键、Redis 地址、队列前缀 |
| `apps/worker/src/processors/aiReview.processor.test.ts` | AI 预审 job，mock pass/reject、幂等、防第三状态、失败记录 |
| `apps/worker/src/processors/export.processor.test.ts` | 导出 job，只导出终审数据，文件写入，成功/失败状态 |
| `apps/worker/src/exporters/exporters.test.ts` | JSON/JSONL/CSV/Excel 生成器 |
| `apps/worker/src/prompts/aiReviewPrompts.test.ts` | qa_quality 和 preference_compare AI 预审 Prompt、审核字段过滤 |
| `apps/worker/src/llm/MockLlmProvider.test.ts` | Mock provider 对 qa_quality 的 pass/reject 稳定输出 |
| `apps/worker/src/llm/DeepSeekProvider.test.ts` | DeepSeek 密钥缺失错误 |

### 共享协议与状态机测试

> 推荐命令：`pnpm --filter @labelhub/shared test`

| 脚本 | 覆盖重点 |
|-|-|
| `packages/shared/src/index.test.ts` | shared 包版本、角色常量、中文名、路由前缀、默认首页 |
| `packages/shared/src/package-entry.test.ts` | `@labelhub/shared` 包名入口和 Node ESM 解析 |
| `packages/shared/src/rbac.test.ts` | 四角色 Portal 路由权限、默认首页和中文导航名 |
| `packages/shared/src/statuses.test.ts` | 任务/提交/AI 审核/人工复审/导出状态中文标签 |
| `packages/shared/src/stateMachines.test.ts` | 任务和提交状态机、返修后重新提交、关闭 AI 预审直入人工复审 |
| `packages/shared/src/reviewStages.test.ts` | 初审/复审链路配置 |
| `packages/shared/src/schema.test.ts` | 动态表单 Schema、物料类型、联动 action、导入/审核/导出格式、自定义校验白名单 |
| `packages/shared/src/schemaRuntime.test.ts` | fieldKey answers 解析、setValue、assertValue、预置校验函数 |
| `packages/shared/src/templateValidation.test.ts` | 模板配置合法性和联动规则完整性 |
| `packages/shared/src/datasetProfiles.test.ts` | 数据集 profile 和数据归一化 |
| `packages/shared/src/aiReviewPrompt.test.ts` | AI 预审 Prompt 编排、ShowItem、字段标准、reviewFieldKeys、分段 Prompt |

## 报告规范

每次跑完测试必须输出一份 Markdown 报告，路径：

```
docs/verify/reports/<测试主题>-YYYYMMDD-HHMM.md
```

命名示例：`docs/verify/reports/template-designer-new-template-regression-20260613-1910.md`

对话最终回复里引用报告路径，简要给出结论和运行命令。

### 截图约定

E2E 测试和手动验证报告应附带页面截图作为业务证据。

**路径**：报告同级目录下建子目录，命名与报告前缀一致。

```
docs/verify/reports/<报告前缀>/screenshots/01__<角色>__<步骤描述>.png
```

**引用**：使用相对路径 `![描述](./<报告子目录>/screenshots/<文件名>)`。

**命名规范**：`<序号>__<角色>__<步骤描述>.png`，如 `01__owner__login-page.png`、`14__ai-agent__first-ai-rejected.png`。

**角色前缀**：`owner` / `labeler` / `reviewer` / `ai-agent` / `agent`。

### 报告模板（两类）

根据测试类型选择：
- **模板 A**：E2E / 手动全流程验证（含截图、多角色步骤、导出证据）
- **模板 B**：单元 / 集成测试（纯自动化断言，无截图）

---

#### 模板 A：E2E / 手动全流程验证

```markdown
# <测试主题>

- 时间：YYYY-MM-DD HH:mm
- 测试分类：<分类>
- 触发原因：<为什么跑>
- 结论：通过 / 未通过 / 部分通过

## 执行信息

| 项目 | 内容 |
|-|-|
| 执行时间 | YYYY-MM-DD HH:mm:ss TZ |
| 测试入口 | `<脚本路径>` |
| 浏览器 | Chrome / Playwright Chromium |
| 命令 | `<完整命令含 env>` |
| 结果 | `N passed` / `N failed` |
| 耗时 | X.Xs |

## 关键数据

| 指标 | 值 |
|-|-|
| 输入题目数 | N |
| 导入题目数 | N |
| 导出题目数 | N |
| 任务状态 | <最终状态> |
| 涉及角色 | Owner / Labeler / AI Agent / Reviewer |

## 覆盖步骤

| 步骤 | 角色 | 操作 | 结果 |
|-|-|-|-|
| 1 | Owner | <操作> | 通过 |
| 2 | Labeler | <操作> | 通过 |
| ... | ... | ... | ... |

## 接口与数据断言

| 断言 | 期望 | 结果 |
|-|-|-|
| <断言项> | <期望值> | 通过 |

## 页面截图

![<步骤描述>](./<子目录>/screenshots/01__<角色>__<描述>.png)

![<步骤描述>](./<子目录>/screenshots/02__<角色>__<描述>.png)

<!-- 按操作流程顺序排列，每个关键步骤一张截图 -->

## 导出证据

| 格式 | 行数 | 路径 |
|-|-|-|
| json | N | `docs/verify/reports/_exports/<task-id>.json` |
| jsonl | N | `docs/verify/reports/_exports/<task-id>.jsonl` |
| csv | N | `docs/verify/reports/_exports/<task-id>.csv` |
| xlsx | N | `docs/verify/reports/_exports/<task-id>.xlsx` |

## 业务证据附件

- 上传文件：[`<文件名>`](./<子目录>/evidence/<文件名>)
- 上传图片：[`<文件名>`](./<子目录>/evidence/<文件名>)

## 产物

| 产物 | 路径 |
|-|-|
| Playwright HTML 报告 | `playwright-report/index.html` |
| 本报告 | `docs/verify/reports/<文件名>.md` |

## 失败与修复

- <无则写"无">

## 未覆盖风险

- <无则写"无">
```

---

#### 模板 B：单元 / 集成测试

```markdown
# <测试主题>

- 时间：YYYY-MM-DD HH:mm
- 测试分类：<分类>
- 触发原因：<为什么跑>
- 结论：通过 / 未通过 / 部分通过

## 涉及脚本

- `path/to/test.spec.ts`：<覆盖重点>

## 运行命令

\`\`\`bash
<完整命令>
\`\`\`

## 运行环境

- 浏览器：<Chrome / Playwright Chromium / 不涉及>
- 服务：<端口、是否复用已有服务>
- 关键环境变量：<如 PW_BROWSER_CHANNEL=chrome>

## 执行结果

| 范围 | 命令 | 结果 |
|-|-|-|
| <范围名> | `<命令>` | N 文件通过，N 断言通过 |

## 覆盖点

1. <覆盖点 1>
2. <覆盖点 2>

## 关键断言

| 断言 | 期望 | 结果 |
|-|-|-|
| <断言项> | <期望值> | 通过 |

## 证据

- Playwright report：`playwright-report/index.html`
- Trace / 截图 / 导出文件：<路径或无>

## 失败与修复

- <无则写"无">

## 未覆盖风险

- <无则写"无">
```

## 维护规则

- **新增脚本**：同步在对应分类的表里加一行。
- **特殊配置**：如需特定环境变量、端口、账号或浏览器 channel，标注在表格或单独章节。
- **命令完整**：不要只写 `pnpm test`；要给出可直接粘贴的完整命令（含 filter、文件名过滤、env）。
- **写清价值**：每行覆盖重点要说明脚本验证的业务风险和触发场景，方便后续 agent 做最小验证选择。

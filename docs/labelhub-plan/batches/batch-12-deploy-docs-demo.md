# Batch 12: Deployment, Documentation And Demo Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 准备结营答辩提交物：README、部署文档、API 文档、架构图、演示视频脚本、demo 数据和一键启动说明。

**Architecture:** 文档与 demo 数据围绕一条固定演示链路组织，确保评审能快速启动、理解架构、看到核心三大难点。

**Tech Stack:** Markdown, OpenAPI/Postman, Mermaid, Docker Compose, seed scripts.

---

## 全局修订约束

- 必须遵守统一登录 `/login`、RBAC 和四端独立 Portal：Owner 端 `/owner/*`、Labeler 端 `/labeler/*`、AI Agent 端 `/agent/*`、Reviewer 端 `/reviewer/*`。
- 所有用户可见 UI 文案、API 用户可见错误消息、代码注释和 Git Commit 摘要必须使用简体中文。
- 实现或验收图 1-5 对应页面前，必须先阅读 `docs/labelhub-plan/visual-reference.md`，并按需打开对应本地 PNG；页面结构、组件命名和交互必须对齐 5 张截图，截图中的「商品标题清洗 v3」作为 UI/UX 设计基准和演示蓝本。
- 默认审核链路必须是 `AI 自动预审 -> 人工复审 -> 终审`；人工复审通过只能进入终审待办，导出只读取 `FINAL_APPROVED` 数据。

## 目标

让项目可交付、可部署、可演示、可讲清楚。

## 实现范围

- README。
- 本地启动指引。
- 统一登录、四端 Portal 和 RBAC 说明。
- Docker Compose。
- 环境变量说明。
- API 文档。
- 架构图。
- 数据流图。
- 状态机图。
- 演示视频脚本。
- 基于官方 `datasets.zip` 的 demo seed 数据。
- AI Coding 过程记录。
- `submission/` 目录结构。
- 五张截图设计蓝本对齐说明。
- 可访问演示环境说明文档。
- 云平台部署说明，不只覆盖本地 Docker Compose。

## 前端任务

- 固定 demo 入口和演示账号。
- 在 `submission/screenshots/` 准备 Demo 截图，文件名按演示顺序编号。
- 准备关键页面截图：
  - 任务管理
  - 模板 Designer
  - 标注工作台
  - AI 预审队列
  - 人工审核
  - 导出中心
- 确保 mock provider 模式下所有演示稳定。

## 后端任务

- 增加 `pnpm db:seed:demo`。
- 增加 `pnpm demo:reset`，清空并重建演示数据。
- demo seed 从官方数据字段结构生成，不把原始 zip 提交到仓库；除非官方明确允许，仓库只记录字段说明和导入方式。
- 输出 OpenAPI 或 Postman Collection。
- 编写部署说明。
- 编写 `submission/demo-environment.md`，说明线上地址、演示账号、模型模式、队列状态检查方式。
- 编写 `submission/basic-technical-doc.md`，说明核心模块、数据模型、状态机和关键设计取舍。

## Agent / 队列任务

- 文档说明如何启用 mock AI：

```text
LLM_PROVIDER=mock
```

- 文档说明如何启用真实 AI：

```text
LLM_PROVIDER=doubao
LLM_API_KEY=...
LLM_MODEL=...
```

不要在仓库提交真实 API Key。

## 数据库设计

demo seed 至少包含：

- 1 个 Owner
- 1 个 Labeler
- 1 个 Reviewer
- 1 个 AI Agent
- 1 个 `qa_quality` 问答质量标注任务
- 1 个 `preference_compare` 偏好对比标注任务
- 2 个已发布官方模板
- `qa_quality` 30 条题目
- `preference_compare` 12 条题目
- 3 条已提交记录
- 2 条 AI 预审记录
- 1 条人工打回记录
- 1 条终审通过记录

## API 设计

文档覆盖：

- 任务管理 API
- 模板 API
- 数据集导入 API
- 标注工作台 API
- AI 审核 API
- 人工审核 API
- 导出 API

## 推荐文件结构

```text
docs/
  architecture.md
  api.md
  deployment.md
  demo-script.md
  state-machines.md
  ai-coding-process.md
  screenshots/

submission/
  README.md
  source.md
  architecture.md
  api.md
  deployment.md
  demo-environment.md
  demo-script.md
  ai-coding-process.md
  basic-technical-doc.md
  screenshots/
  postman/
```

## 关键实现思路

- README 第一屏要讲清楚项目是什么、核心亮点是什么、如何启动。
- README 和 demo 文档必须说明官方数据来源、两个 DatasetProfile 的字段结构、三种导入格式和导入验收数量。
- 架构图突出三大难点：
  - 动态表单 Designer/Renderer。
  - 状态机与审计日志。
  - AI Agent 工程化。
- 架构图和基础技术文档必须解释统一登录、四端路由隔离、RBAC 和 `AI 自动预审 -> 人工复审 -> 终审` 三级审核流水线。
- 演示脚本要从统一登录开始，按四端 Portal 切换，不要按页面随便点。
- `submission/demo-script.md` 演示顺序：先用 `qa_quality` 展示问答质量标注完整闭环，再用 `preference_compare` 展示 A/B 偏好模板、导入和导出字段映射。
- `submission/README.md` 面向评审，必须列出源码位置、启动方式、演示路径、演示账号和交付物索引。
- `submission/source.md` 说明 monorepo 中前端、后端、Agent/Worker、shared 包的职责。
- `submission/deployment.md` 同时覆盖本地 Docker Compose 和任意云平台部署，至少说明数据库、Redis、API、Worker、Web 的环境变量和启动顺序。
- `submission/api.md` 可以引用 OpenAPI/Postman，也可以直接是 Markdown API 文档。
- `submission/ai-coding-process.md` 记录开发思路、阶段计划、关键 prompt、AI 辅助过程和人工取舍。
- `submission/basic-technical-doc.md` 记录官方数据 profile 设计、Excel/JSON/JSONL 归一化规则、临时文件跳过规则和媒体渲染规则。
- `submission/basic-technical-doc.md` 必须记录五张截图如何映射到 Owner 端、Labeler 端、AI Agent 端和 Reviewer 端页面。
- `submission/demo-script.md` 必须从统一登录开始，按 Owner、Labeler、AI Agent、Reviewer 四端切换演示，且说明复审通过后仍需终审。
- 所有文档不得包含真实 API Key，只能出现环境变量名和占位示例。

## 状态流转设计

文档中用 Mermaid 写出：

- 任务状态机。
- 提交流转。
- AI review 状态机。
- 人工审核状态机。
- 导出状态机。

## 测试点

- 新环境按 README 可以启动。
- `pnpm demo:reset` 后演示数据恢复。
- demo reset 后能看到 `qa_quality` 30 条、`preference_compare` 12 条。
- 前端能访问后端。
- Worker 能连接 Redis。
- mock AI 下无需真实 API Key 也能完整演示。
- 统一登录、四端路由隔离、三级审核流水线和中文治理说明齐全。
- `submission/` 目录包含 PDF 第八章要求的所有材料。
- `submission/demo-environment.md` 能让评审直接访问演示环境并知道如何登录。
- API 文档能覆盖任务、模板、标注、AI 审核、人工审核和导出接口。
- `submission/demo-script.md` 覆盖两个官方任务，不再只演示商品标题清洗。

## 验收标准

- 提交物包含源码、README、部署文档、API 文档、架构图、演示截图、演示视频脚本。
- `submission/` 目录结构完整，包含源码说明、README、部署文档、API 文档、Demo 截图、AI Coding 过程记录、基础技术文档和演示环境说明。
- 评审可以用 README 启动项目。
- 答辩时可以按 5-10 分钟脚本完整跑完。
- 答辩脚本覆盖 Owner、Labeler、AI Agent、Reviewer 四个独立 Portal。
- 答辩脚本能证明官方 JSON、JSONL、Excel 数据格式均被纳入开发和验收计划。

## 本阶段完成后可演示内容

最终答辩版本：从项目启动到完整链路演示，再到架构说明和亮点讲解。

## 下一阶段依赖

无。完成后进入录屏、部署和最终提交。

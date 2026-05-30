# Batch 4: Template Designer MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Owner 可以通过组件化配置搭建标注模板，并保存为可运行的 JSON Schema。

**Architecture:** Designer 编辑 shared Schema，Canvas 管理字段顺序，PropertyPanel 修改字段属性，保存后交给 Renderer 预览。模板发布生成不可变版本。

**Tech Stack:** React, TypeScript, dnd-kit, Zustand, UI component library, Prisma API.

---

## 全局修订约束

- 必须遵守统一登录 `/login`、RBAC 和四端独立 Portal：Owner 端 `/owner/*`、Labeler 端 `/labeler/*`、AI Agent 端 `/agent/*`、Reviewer 端 `/reviewer/*`。
- 所有用户可见 UI 文案、API 用户可见错误消息、代码注释和 Git Commit 摘要必须使用简体中文。
- 实现或验收图 1-5 对应页面前，必须先阅读 `docs/labelhub-plan/visual-reference.md`，并按需打开对应本地 PNG；页面结构、组件命名和交互必须对齐 5 张截图，截图中的「商品标题清洗 v3」作为 UI/UX 设计基准和演示蓝本。
- 默认审核链路必须是 `AI 自动预审 -> 人工复审 -> 终审`；人工复审通过只能进入终审待办，导出只读取 `FINAL_APPROVED` 数据。

## 目标

实现 PDF 4.2 的模板配置核心交互：左侧物料、中间画布、右侧属性配置，并能发布模板版本。

## 实现范围

本 Batch 需要覆盖 PDF 4.2 的完整 Designer 能力，允许分基础区和高级区呈现：

- 左侧物料：
  - 展示项 `ShowItem`
  - 单行输入 `TextInput`
  - 多行文本 `Textarea`
  - 单选 `Radio`
  - 多选 `Checkbox`
  - 标签选择 `TagSelect`
  - 富文本 `RichText`
  - 文件上传 `FileUpload`
  - 图片上传 `ImageUpload`
  - JSON 编辑器 `JsonEditor`
  - LLM 触发组件 `LLMAssist`
  - 分组容器 `Group`
  - 多 Tab 布局 `Tabs`
- 中间画布：
  - 添加字段
  - 删除字段
  - 上移/下移
  - 拖拽排序
  - 选中字段
  - 复制字段
  - 撤销/重做最近 20 步 Schema 编辑
- 右侧属性：
  - 标题
  - 字段名
  - 原始数据 sourceKey
  - 必填
  - placeholder
  - 默认值
  - maxLength
  - minLength
  - pattern
  - customValidatorKey
  - options
  - LLM targetFieldKey
  - 文件数量、大小、类型限制
  - 字段联动规则
- 模板保存草稿。
- 模板发布版本。
- 官方模板一键生成：Owner 可从 `qa_quality` 或 `preference_compare` 样例模板开始编辑。
- 截图蓝本模板一键生成：Owner 可从「商品标题清洗 v3」开始编辑，用于验证左侧物料、中间画布、右侧属性 / 校验 / 联动配置。

## 前端任务

页面：

- `apps/web/src/pages/owner/TemplateDesignerPage.tsx`

组件：

- `MaterialPalette`
- `DesignerCanvas`
- `DesignerFieldCard`
- `FieldPropertyPanel`
- `SchemaJsonPreview`
- `RendererPreviewDrawer`
- `TemplateVersionBadge`
- `ValidationRuleEditor`
- `LinkageRuleEditor`
- `SchemaHistoryToolbar`
- `MaterialSection`
- `OfficialTemplateGallery`
- `DatasetProfileTemplateCard`
- `DesignerThreeColumnLayout`
- `SchemaExportButton`

状态管理：

- `useTemplateDesignerStore`
  - `schema`
  - `selectedFieldId`
  - `addField(type)`
  - `updateField(fieldId, patch)`
  - `removeField(fieldId)`
  - `moveField(fieldId, targetIndex)`
  - `duplicateField(fieldId)`
  - `setSchema(schema)`
  - `undo()`
  - `redo()`

## 后端任务

模块：

- `TemplateModule`
- `TemplateService`
- `TemplateRepository`

动作：

- 创建模板草稿。
- 根据 `DatasetProfile` 创建官方模板草稿：`qa_quality`、`preference_compare`。
- 保存 Schema 草稿。
- 发布模板版本。
- 查询模板详情。
- 查询任务当前模板。
- 校验 Schema 完整性，包括字段名唯一、联动目标存在、自定义校验函数在白名单中。
- 发布新版本时生成版本兼容报告，列出新增字段、删除字段、字段类型变化。

## Agent / 队列任务

本阶段不涉及真实 Agent。Designer 中的 `LLMAssist` 只保存配置。

## 数据库设计

使用 `task_templates`：

- `id`
- `taskId`
- `name`
- `version`
- `status`: `DRAFT` / `PUBLISHED` / `ARCHIVED`
- `schema`
- `createdBy`
- `publishedAt`

版本规则：

- 草稿可以覆盖。
- 发布版本不可修改。
- 下一次修改从已发布版本复制出新草稿。
- 任务发布时绑定的是模板发布版本快照；任务发布后的模板变更必须生成新版本，不能影响旧提交。
- Schema 版本兼容策略：新增非必填字段兼容；新增必填字段、删除字段、修改字段类型需要在发布前显示风险提示。

## API 设计

```text
POST /templates
POST /templates/from-profile
GET /templates/:templateId
PATCH /templates/:templateId/schema
POST /templates/:templateId/publish-version
GET /tasks/:taskId/templates
GET /tasks/:taskId/templates/current
```

发布模板请求：

```json
{
  "actorId": "user_owner_001",
  "versionName": "r1"
}
```

官方模板创建请求：

```json
{
  "actorId": "user_owner_001",
  "taskId": "task_001",
  "datasetKind": "qa_quality"
}
```

## 关键实现思路

- Designer 不能直接产生业务提交数据，只产生 Schema。
- `OfficialTemplateGallery` 提供两个官方模板入口：
  - `qa_quality`：展示 `prompt`、`model_answer`、`reference`、媒体素材；采集相关性、准确性、格式合规、安全性、问题标签、一句话总评、详细评语、修订建议、JSON 批注、证据素材和 AI 预评分。
  - `preference_compare`：并排展示 `prompt`、`response_a`、`response_b`；采集偏好结论、优势程度、安全风险、判断维度、一句话结论、判断理由、修订建议、结构化批注、证据素材和 AI 预判。
- Designer 页面必须对齐图 2 的左中右三栏：左侧「物料」分基础物料和布局物料，中间画布展示字段卡片和 `LLM 触发组件`，右侧属性面板分「基础 / 校验 / 联动」标签页。
- 「商品标题清洗 v3」蓝本必须包含：原始商品标题 `ShowItem`、清洗后标题 `TextInput`、主类目 `Radio`、卖点关键词 `TagSelect`、AI 建议清洗 `LLM 触发组件`、分组容器或多 Tab 布局。
- 保存前要校验 Schema：
  - 每个可提交字段必须有唯一 `fieldKey`。
  - `show_item` 必须有 `sourceKey` 或 `sourceKeys`。
  - `radio` 和 `checkbox` 必须至少有一个 option。
  - `tag_select` 必须至少有一个 option，提交值为字符串数组。
  - `file_upload` 和 `image_upload` 必须配置允许类型和大小上限，图片类型必须限制为 `image/*` 或具体图片 MIME。
  - `json_editor` 可配置 JSON Schema 示例，但至少需要运行时校验合法 JSON。
  - `group` 和 `tabs` 必须有 children，children 中可继续嵌套普通字段。
  - `llm_assist.targetFieldKey` 必须指向一个可编辑字段。
  - 字段联动规则必须校验 `targetFieldKey` 存在，`when.fieldKey` 指向可提交字段。
  - 自定义校验只能选择后端注册的白名单 key，例如 `noEmoji`、`noPromoWords`、`validJsonObject`。
- 发布模板时将 Schema 快照保存，后续提交引用 `schemaVersion`。

## 状态流转设计

模板状态：

```text
DRAFT -> PUBLISHED
PUBLISHED -> ARCHIVED
PUBLISHED -> DRAFT_COPY
```

MVP 可以只实现：

```text
DRAFT -> PUBLISHED
PUBLISHED -> DRAFT_COPY
```

## 测试点

- 新建模板后有默认空 schema。
- 从 `qa_quality` 官方模板创建后，画布包含问答质量评分字段和媒体展示字段。
- 从 `preference_compare` 官方模板创建后，画布包含 A/B 对比展示和偏好判定字段。
- 从「商品标题清洗 v3」蓝本模板创建后，画布结构与图 2 一致，右侧属性面板能配置 `cleaned_title` 的必填、最大长度、正则、自定义函数和字段联动。
- 添加字段后中间画布更新。
- 修改右侧属性后 Schema JSON 同步变化。
- 撤销/重做能恢复字段新增、删除、排序和属性修改。
- 保存后刷新页面 Schema 不丢。
- 发布后生成版本号 `r1`。
- 发布版本不能被直接覆盖。
- 发布新版本时显示兼容报告。
- 联动规则和自定义校验配置能在 Renderer 预览中生效。
- 发布后的 Schema 能被 Batch 3 Renderer 正常渲染。

## 验收标准

- Owner 可以从官方 `qa_quality` / `preference_compare` 模板开始搭建和二次编辑。
- Owner 可以配置 PDF 要求的全部物料、联动和校验规则。
- Owner 可以发布模板版本。
- Renderer 预览和 Labeler 运行时使用的是同一份 Schema。
- 数据库中保存了模板版本和 Schema 快照。
- 任务已发布后，模板变更不会影响历史提交和旧版本任务。

## 本阶段完成后可演示内容

演示 PDF 中“模板配置”页面：从官方模板库选择 `qa_quality` 或 `preference_compare`，再通过左侧物料、中间画布、右侧属性配置完成二次编辑，导出 Schema JSON 并发布版本。

## 下一阶段依赖

Batch 2 发布任务时需要绑定已发布模板。Batch 6 标注工作台根据该模板渲染作答页面。

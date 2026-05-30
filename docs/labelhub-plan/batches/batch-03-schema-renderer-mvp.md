# Batch 3: Schema Renderer MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 实现可根据 JSON Schema 动态渲染标注表单的运行时 Renderer。

**Architecture:** Renderer 只消费 shared Schema，不关心 Designer 如何生成 Schema。校验逻辑做成纯函数，前端提交前和后端提交时可以复用同一套规则。

**Tech Stack:** React, TypeScript, Zustand/React Hook state, UI component library, Vitest.

---

## 全局修订约束

- 必须遵守统一登录 `/login`、RBAC 和四端独立 Portal：Owner 端 `/owner/*`、Labeler 端 `/labeler/*`、AI Agent 端 `/agent/*`、Reviewer 端 `/reviewer/*`。
- 所有用户可见 UI 文案、API 用户可见错误消息、代码注释和 Git Commit 摘要必须使用简体中文。
- 实现或验收图 1-5 对应页面前，必须先阅读 `docs/labelhub-plan/visual-reference.md`，并按需打开对应本地 PNG；页面结构、组件命名和交互必须对齐 5 张截图，截图中的「商品标题清洗 v3」作为 UI/UX 设计基准和演示蓝本。
- 默认审核链路必须是 `AI 自动预审 -> 人工复审 -> 终审`；人工复审通过只能进入终审待办，导出只读取 `FINAL_APPROVED` 数据。

## 目标

优先解决动态表单架构的运行时问题：给定一份 Schema 和一条题目 rawData，页面能渲染表单、收集 answers、执行校验。

## 实现范围

Renderer 分两层实现，但本 Batch 的验收必须覆盖 PDF 要求的完整物料：

- 基础闭环物料：`show_item`、`text`、`textarea`、`radio`、`checkbox`、`tag_select`、`llm_assist`。
- 扩展必做物料：`rich_text`、`file_upload`、`image_upload`、`json_editor`、`group`、`tabs`。
- 字段规则：必填、长度、正则、白名单自定义校验函数。
- 字段联动：条件显示、禁用、动态必填、联动设值。
- 布局能力：分组容器和多 Tab 布局。
- 官方数据媒体展示：`qa_quality.media_type` 支持 `text` / `image` / `video` / `markdown`，分别渲染纯文本、图片、视频和 Markdown 图文。
- 官方模板渲染：`qa_quality` 问答质量标注和 `preference_compare` A/B 偏好对比都要有可运行 Schema 示例。
- 截图蓝本模板渲染：必须增加「商品标题清洗 v3」Schema 示例，用于验证 `ShowItem`、单行输入、单选、标签多选、`LLM 触发组件`、字段联动和校验提示。

## 前端任务

组件：

- `SchemaRenderer`
- `FieldRenderer`
- `ShowItemField`
- `MediaShowItemField`
- `SideBySideCompareField`
- `TextField`
- `TextareaField`
- `RadioField`
- `CheckboxField`
- `TagSelectField`
- `RichTextField`
- `FileUploadField`
- `ImageUploadField`
- `JsonEditorField`
- `GroupField`
- `TabsField`
- `LlmAssistField`
- `ValidationMessageList`
- `SchemaLinkageRunner`
- `RejectedNoticeRenderer`
- `FieldCounter`

页面：

- `apps/web/src/pages/dev/SchemaRendererPlayground.tsx`

渲染输入：

```ts
type SchemaRendererProps = {
  schema: LabelhubSchema
  rawData: Record<string, unknown>
  value: Record<string, unknown>
  mode: 'preview' | 'answer' | 'review'
  onChange: (next: Record<string, unknown>) => void
}
```

## 后端任务

- 暴露 schema 校验纯函数给后端使用。
- 暴露 schema 联动计算纯函数给前端和后端复用，保证条件显示和联动校验结果一致。
- 提供开发调试接口读取 seed 模板：

```text
GET /debug/sample-schema
```

## Agent / 队列任务

- `llm_assist` 组件点击“生成建议”时先调用 mock API：

```text
POST /llm/assist/mock
```

- mock 建议需按 profile 返回：`qa_quality` 返回维度评分参考，`preference_compare` 返回 A/B/tie 偏好预判。
- 文件/图片上传在 Renderer 中先使用后端临时上传接口或本地 mock URL，但 answers 中必须保存结构化文件信息：`name`、`url`、`mimeType`、`size`。

## 数据库设计

本阶段不新增表，读取 `task_templates.schema` 的结构。

## API 设计

```text
GET /debug/sample-schema
POST /llm/assist/mock
POST /schema/validate
```

`POST /schema/validate` 请求：

```json
{
  "schema": {},
  "answers": {
    "relevance_score": "5",
    "accuracy_score": "4",
    "format_score": "4",
    "safety_score": "5",
    "issue_tags": ["信息缺失"],
    "comment": "回答基本正确，但参考答案中的关键限定可以补充得更完整。"
  }
}
```

响应：

```json
{
  "valid": true,
  "errors": []
}
```

## 推荐 Schema 示例

```json
{
  "schemaVersion": "1.0",
  "title": "问答质量标注 qa_quality v1",
  "fields": [
    {
      "id": "question_material",
      "type": "show_item",
      "title": "题目原始数据",
      "sourceKeys": ["prompt", "model_answer", "reference", "media_type", "media_url", "content_markdown"]
    },
    {
      "id": "relevance_score",
      "type": "radio",
      "fieldKey": "relevance_score",
      "title": "相关性评分",
      "required": true,
      "options": ["1", "2", "3", "4", "5"]
    },
    {
      "id": "accuracy_score",
      "type": "radio",
      "fieldKey": "accuracy_score",
      "title": "准确性评分",
      "required": true,
      "options": ["1", "2", "3", "4", "5"]
    },
    {
      "id": "format_score",
      "type": "radio",
      "fieldKey": "format_score",
      "title": "格式合规评分",
      "required": true,
      "options": ["1", "2", "3", "4", "5"]
    },
    {
      "id": "safety_score",
      "type": "radio",
      "fieldKey": "safety_score",
      "title": "安全性评分",
      "required": true,
      "options": ["1", "2", "3", "4", "5"]
    },
    {
      "id": "issue_tags",
      "type": "tag_select",
      "fieldKey": "issue_tags",
      "title": "问题类型标签",
      "options": ["事实错误", "答非所问", "格式问题", "安全违规", "信息缺失"]
    },
    {
      "id": "summary",
      "type": "text",
      "fieldKey": "summary",
      "title": "一句话总评",
      "required": true,
      "validation": { "maxLength": 60 }
    },
    {
      "id": "comment",
      "type": "textarea",
      "fieldKey": "comment",
      "title": "详细评语 / 打回理由",
      "required": true
    },
    {
      "id": "structured_note",
      "type": "json_editor",
      "fieldKey": "structured_note",
      "title": "修正后的标准答案 / 评分明细",
      "required": false
    },
    {
      "id": "ai_pre_score",
      "type": "llm_assist",
      "title": "AI 预评分参考",
      "targetFieldKey": "structured_note",
      "promptTemplate": "请根据题目、模型回答、参考答案和标注员评分给出结构化预审建议"
    }
  ]
}
```

`preference_compare` 的 Schema 示例必须至少包含：并排展示 `prompt`、`response_a`、`response_b` 的 ShowItem；`preferred` 单选（A/B/tie）；`margin` 单选；`safety_flag` 单选；`dimensions` 多选/标签选择；`summary` 单行输入；`annotator_note` 多行文本；`revision_suggestion` 富文本；`structured_annotation` JSON 编辑器；`evidence` 文件/图片上传；`llm_assist` AI 预判。

## 关键实现思路

- `show_item` 使用 `sourceKey` 从 rawData 取值。
- `ShowItem` 作为展示项必须支持“不参与提交”的只读原始数据展示，术语在 UI 中固定显示为「展示项 ShowItem」。
- `show_item` 支持 `sourceKeys` 批量展示；`qa_quality` 中根据 `media_type` 决定是否额外渲染 `media_url` 或 `content_markdown`。
- `media_type=text` 时只渲染文本字段；`image` 时使用 `media_url` 渲染图片；`video` 时使用 `media_url` 渲染视频播放器；`markdown` 时渲染 `content_markdown`。
- `preference_compare` 使用并排布局展示 `response_a` 和 `response_b`，但 `model_a/model_b` 默认作为辅助信息展示，不用于偏好暗示。
- 可提交字段使用 `fieldKey` 写入 answers。
- `llm_assist` 不直接入库为答案，只能写入目标字段或生成参考内容。
- `LLM 触发组件` 在 Labeler 作答模式下必须展示「重新生成」「采纳」等中文操作，并能把建议写入 `targetFieldKey`。
- `group` 和 `tabs` 本身不写入 answers，只递归渲染 children。
- `rich_text` 可以先使用组件库富文本或受控 HTML 文本域，但 answers 中保存 HTML 字符串。
- `json_editor` 提交前必须校验 JSON 可解析，answers 中保存对象而不是未解析字符串。
- `file_upload` 和 `image_upload` 提交前校验文件元数据结构，图片额外校验 `mimeType` 以 `image/` 开头。
- 字段联动在每次 answers 变化后重新计算，隐藏字段默认不参与必填校验，除非 Schema 显式配置 `validateWhenHidden=true`。
- 校验函数返回字段级错误：

```ts
type ValidationError = {
  fieldKey: string
  message: string
}
```

## 状态流转设计

本阶段无业务状态流转，但 Renderer 需要支持三种 UI 模式：

- `preview`：Designer 中预览，允许模拟输入。
- `answer`：Labeler 作答，允许编辑和提交校验。
- `review`：Reviewer 查看，只读展示。

联动 action 最少支持：

```text
show      条件满足时显示目标字段
hide      条件满足时隐藏目标字段
require   条件满足时目标字段必填
disable   条件满足时目标字段禁用
setValue  条件满足时给目标字段写入指定值
```

## 测试点

- `show_item` 能正确展示 `qa_quality.prompt`、`model_answer`、`reference`。
- `qa_quality` 中 `media_type` 为 `text/image/video/markdown` 的题目都能正确展示。
- `preference_compare` 能并排展示 A/B 回答。
- 必填文本为空时返回错误。
- 文本超过 35 字返回错误。
- `radio` 只能选择 options 中的值。
- `checkbox` 返回数组。
- `tag_select` 返回字符串数组。
- `textarea`、`rich_text` 能执行长度校验。
- `json_editor` 非法 JSON 会返回字段错误。
- `file_upload` 和 `image_upload` 返回结构化文件元数据。
- `group` 和 `tabs` 能递归渲染 children。
- 条件隐藏字段不触发默认必填错误。
- 白名单自定义校验函数命中时返回指定错误文案。
- `llm_assist` mock 建议可以写入 `qa_quality.structured_note` 或 `preference_compare.structured_annotation`。
- 「商品标题清洗 v3」示例能触发 `cleaned_title` 长度计数、`category` 联动、`keywords` 标签多选和 `LLM 触发组件` 采纳建议。

## 验收标准

- 打开 Renderer Playground 能看到 `qa_quality` 问答质量表单和 `preference_compare` 偏好对比表单。
- 填写后能得到结构化 answers。
- 提交前校验能阻止非法答案。
- 同一份 Schema 可在 `preview` 和 `answer` 模式渲染。
- PDF 要求的全部物料在 Playground 中都有最小可用渲染示例。
- Playground 包含 `qa_quality` 和 `preference_compare` 两个官方模板示例。
- 联动规则和自定义校验能在 Playground 中被触发并展示错误。

## 本阶段完成后可演示内容

给定官方 `qa_quality` 或 `preference_compare` 的 JSON Schema 和题目原始数据，动态渲染出可作答的标注页面。

## 下一阶段依赖

Batch 4 的 Designer 会生成本阶段定义的 Schema。Batch 6 的标注工作台会复用 Renderer。

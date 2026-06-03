  你是一个严谨的全栈工程师。请在当前 LabelHub 代码库中实现“评测模板版本管理”功能。不要只改 UI，必须
  完成后端数据、接口、前端交互、任务引用保护和测试。

  一、先读代码，禁止盲改

  开始前必须先阅读这些文件，理解现有模式：

- prisma/schema.prisma
- apps/api/src/templates/templates.service.ts
- apps/api/src/templates/templates.controller.ts
- apps/api/src/templates/templates.service.test.ts
- apps/api/src/prisma-schema.test.ts
- apps/web/src/api/templates.ts
- apps/web/src/pages/owner/TemplateDesignerPage.tsx
- apps/web/src/pages/owner/TemplateDesignerPage.test.tsx
- apps/web/src/styles.css
- apps/web/src/__tests__/styles.test.ts

  当前已知事实：

- 模板模型是 TaskTemplate。
- TaskTemplate 已有字段：id、name、schema、status、version、parentTemplateId、publishedAt。
- Task 通过 templateId 引用某一个 TaskTemplate。
- 已发布模板不可直接覆盖。
- 任务一旦引用某个模板版本，就不能因为模板恢复而被修改 schema。

  二、产品目标

  为“评测模板”增加版本管理功能。

  每一条模板都必须支持：

1. 查看该模板的所有历史版本。
2. 对任意历史版本和当前版本做 Diff 对比。
3. 恢复到某个历史版本。
4. 如果恢复会影响后续版本，必须给用户明确确认。
5. 如果后续版本正在被未完成任务使用，不能删除这些版本，也不能影响这些任务。

  三、入口要求

  必须实现两个入口，两个入口打开同一个版本管理弹窗或抽屉：

1. 模板列表行入口

  在“评测模板”列表每一行的操作区增加“版本管理”按钮，和复制、删除按钮并列。

  要求：

- 按钮必须阻止行点击冒泡。
- 按钮有 aria-label，例如：`查看 ${template.name} 版本管理`。
- 按钮视觉风格和现有行操作按钮保持一致。
- 不要破坏现有复制、删除、打开模板行的交互。

2. 模板配置抽屉入口

  在打开“模板配置”抽屉后，在顶部右侧操作区增加“版本管理”按钮。

  要求：

- 和“保存并发布版本 vX”、关闭按钮在同一区域。
- 当前模板是已保存模板时可点击。
- 当前是未保存新模板草稿时按钮禁用或隐藏，优先隐藏。
- 点击后打开同一个版本管理弹窗或抽屉。

  四、版本管理弹窗要求

  版本管理弹窗展示当前模板所属版本链的所有版本，按版本号倒序排列。

  每个版本展示：

- 版本号，例如 v5。
- 发布时间。
- 发布人，如果当前系统没有真实发布人，就先展示 createdById 映射或“系统”。
- 状态：当前版本 / 历史版本 / 已归档 / 草稿。
- 是否被任务使用。
- 是否被未完成任务使用。

  每个版本提供两个操作：

- Diff 对比
- 恢复

  弹窗布局建议：

- 左侧：版本列表。
- 右侧：选中版本详情和 Diff 结果。
- 顶部显示模板名称和当前版本。
- 空状态要友好，例如“暂无历史版本”。

  五、Diff 对比要求

  不要做纯 JSON diff。第一版做字段级结构化 Diff。

  后端返回结构化 diff，前端负责展示。

  Diff 至少包含：

- 新增字段
- 删除字段
- 字段标题变化
- 字段类型变化
- 必填校验变化
- 选项变化
- ShowItem 展示字段变化
- schemaVersion 变化
- AI Prompt 配置变化，如果 schema 中存在 aiReviewPrompt

  Diff 数据建议结构：

  {
    summary: {
      added: number,
      removed: number,
      changed: number
    },
    sections: [
      {
        type: "added" | "removed" | "changed",
        title: string,
        items: Array<{
          fieldKey: string,
          label?: string,
          before?: unknown,
          after?: unknown,
          changeDescription: string
        }>
      }
    ]
  }

  前端展示：

- 新增用绿色/成功态。
- 删除用红色/危险态。
- 修改用蓝色或普通强调态。
- 没有差异时展示“两个版本没有结构差异”。

  六、恢复版本规则

  点击“恢复”时必须弹确认框。

  普通情况提示：

  “恢复到 vX 后，vX 之后的版本将被归档，不再作为当前可用版本展示。请确认是否继续？”

  按钮：

- 取消
- 确认恢复

  如果 vX 之后的版本正在被未完成任务使用，提示改为：

  “vX 之后的部分版本正在被未完成任务使用。恢复后，这些任务仍会继续使用原版本；相关版本不会被删除，只
  会从模板主版本链中归档。请确认是否继续？”

  恢复规则：

- 不要物理删除任何被任务引用的版本。
- 不要修改任何任务已经绑定的 templateId。
- 不要修改被任务引用版本的 schema。
- 恢复操作应生成或标记一个新的当前版本，或者把目标版本恢复为当前主版本，具体实现需与现有数据模型一
  致。
- 被恢复版本之后的版本，应标记为 ARCHIVED 或从主版本链中隐藏。
- 如果当前数据模型无法安全表达“主版本链”，需要补充字段，例如 rootTemplateId、archivedAt、
  restoredFromTemplateId。优先选择最小但清晰的数据模型改动。

  七、任务使用保护

  必须识别未完成任务。

  请先检查现有 TaskStatus 枚举。一般规则：

- ENDED 视为完成。
- DRAFT、PUBLISHED、PAUSED 等非 ENDED 状态视为未完成。

  当某个版本被未完成任务使用时：

- 版本管理列表必须标识“未完成任务使用中”。
- 恢复时必须提示用户。
- 不能删除该版本。
- 不能改写该版本 schema。
- 任务继续使用原版本，不随恢复变化。

  八、后端接口

  新增或完善以下接口：

1. GET /templates/:id/versions

  返回同一版本链的所有版本。

  返回字段至少包括：

- id
- name
- version
- schemaVersion
- status
- parentTemplateId
- rootTemplateId，如果新增该字段
- publishedAt
- createdAt
- updatedAt
- usageCount
- activeUsageCount
- isCurrent
- isArchived

2. GET /templates/:id/versions/:versionId/diff

  返回 versionId 与当前版本之间的结构化 diff。

3. POST /templates/:id/versions/:versionId/restore

  恢复到指定版本。

  返回：

- restoredTemplate
- archivedVersions
- affectedActiveTasks
- message 或 warning

  错误处理：

- 模板不存在：TEMPLATE_NOT_FOUND
- 版本不属于同一版本链：TEMPLATE_VERSION_CHAIN_MISMATCH
- 版本不可恢复：TEMPLATE_VERSION_RESTORE_UNAVAILABLE
- 并发或状态冲突：TEMPLATE_VERSION_CONFLICT

  九、前端 API

  在 apps/web/src/api/templates.ts 中新增：

- listTemplateVersions(templateId)
- diffTemplateVersion(templateId, versionId)
- restoreTemplateVersion(templateId, versionId)

  类型要清晰，不要用 any。

  十、前端组件拆分

  不要把所有代码继续塞进 TemplateDesignerPage.tsx。

  建议新增：

- apps/web/src/pages/owner/components/TemplateVersionManagerModal.tsx
- apps/web/src/pages/owner/components/TemplateVersionDiffView.tsx
- apps/web/src/pages/owner/components/TemplateRestoreConfirmDialog.tsx

  如果项目现有风格不适合拆这么细，也至少把版本弹窗独立成一个组件。

  十一、开发流程要求

  必须 TDD：

1. 先写后端失败测试。
2. 跑测试，确认失败原因正确。
3. 写最小后端实现。
4. 跑后端测试通过。
5. 再写前端失败测试。
6. 跑测试，确认失败原因正确。
7. 写最小前端实现。
8. 跑前端测试通过。
9. 最后跑相关回归。

  不要一次性大改。

  十二、必须覆盖的测试

  后端测试：

- 能获取某个模板的所有版本。
- 能计算新增字段、删除字段、字段类型变化。
- 能恢复历史版本。
- 恢复后后续版本被归档。
- 后续版本被未完成任务使用时不会被删除。
- 任务 templateId 不会被恢复操作修改。
- versionId 不属于当前模板版本链时返回错误。

  前端测试：

- 模板列表每行展示“版本管理”按钮。
- 点击列表行版本管理按钮打开弹窗。
- 模板配置抽屉顶部展示“版本管理”按钮。
- 点击抽屉版本管理按钮打开同一个弹窗。
- 弹窗展示历史版本。
- 点击 Diff 对比展示结构化差异。
- 点击恢复弹确认框。
- 有未完成任务引用时展示特殊确认文案。
- 确认恢复后刷新模板列表或当前模板状态。
- 取消恢复不调用接口。

  十三、验收标准

  功能完成后必须满足：

- Web 页面上，模板列表行和模板配置抽屉里都有版本管理入口。
- 用户能看到该模板所有历史版本。
- 用户能查看版本 Diff。
- 用户能恢复历史版本。
- 恢复前有明确确认。
- 未完成任务使用中的版本不会被删除或改写。
- 任务继续使用原来的模板版本。
- 所有新增接口有测试。
- 所有新增 UI 行为有测试。
- 不破坏现有模板创建、复制、删除、发布功能。

  十四、运行验证

  至少运行：

  pnpm --filter @labelhub/api test -- src/templates/templates.service.test.ts
  pnpm --filter @labelhub/api test -- src/prisma-schema.test.ts
  pnpm --filter @labelhub/web test -- src/pages/owner/TemplateDesignerPage.test.tsx
  pnpm --filter @labelhub/web test -- src/__tests__/styles.test.ts
  git diff --check

  如果修改了 Prisma schema，必须确认 prisma generate 能正常执行。

  十五、实现后汇报

  完成后请汇报：

- 改了哪些文件。
- 新增了哪些接口。
- 版本恢复的具体数据规则。
- 任务使用中的版本如何保护。
- 运行了哪些测试，结果是什么。
- 是否有未完成事项。

  这版提示词已经把“AI 每一步该干什么”压实了：先读代码、再补测试、再实现、再验证，并且明确了两个入口
  都必须实现。

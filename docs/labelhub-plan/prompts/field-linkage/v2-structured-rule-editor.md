# 字段联动 V2 结构化规则编辑器开发提示词

你现在要开发字段联动配置 UI 的下一阶段能力：把当前“控制显隐 / 限制选项”这套 `select + sentence` 式配置方式，升级成一个**看起来像纯编辑器、底层仍然是结构化规则 AST** 的规则编辑器。

注意：不要做成完全自由自然语言输入。目标是：

- 用户看到的是“像写规则”的编辑体验
- 系统保存的是结构化规则 JSON
- 运行时执行的是结构化规则，不是解析一段随意中文

## 一、产品目标

当前联动卡片里，“条件字段”“目标字段”还是控件拼装。我要你把它升级成下面这种体验：

```text
当 #category = "食品生鲜" 时
隐藏 #size_table · 显示 #shelf_life
```

这里的 `#category`、`#size_table`、`#shelf_life` 都不是普通文本，而是结构化字段引用 token。

## 二、核心原则

1. 外观像编辑器，但不是自由文本解析器。
2. 字段引用只能通过输入 `#` 触发 mention 候选。
3. 最终保存的不是整段字符串，而是规则 AST。
4. 打开已有规则时，必须能稳定回显成编辑器内容。
5. 运行时仍然走结构化 schema/runtime，不允许前端字符串和后端规则脱节。

## 三、范围

这次只做字段联动配置区，不扩散到别的模块。

先覆盖：

- 控制显隐
- 限制选项

这次可以顺手把规则结构升级到支持多动作，但不要在别的表单里复用这个编辑器。

## 四、目标形态

每条规则是一个 rule block，头部仍保留：

- `联动 1`
- `删除`

主体不再是多个 select，而是一块规则编辑区，例如：

```text
当 #category = "食品生鲜" 时
隐藏 #size_table · 显示 #shelf_life
```

## 五、底层数据结构改造

先升级共享 schema，至少支持“一组条件 + 多个动作”：

```ts
type LinkageRuleV2 = {
  id: string;
  combinator: 'and' | 'or';
  conditions: Array<{
    sourceFieldKey: string;
    operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'exists' | 'notExists';
    value?: unknown;
  }>;
  actions: Array<
    | { type: 'show'; targetFieldKey: string }
    | { type: 'hide'; targetFieldKey: string }
    | { type: 'limitOptions'; targetFieldKey: string; optionValues: string[] }
    | { type: 'validateValue'; targetFieldKey: string; allowedValues: unknown[]; message?: string }
  >;
};
```

要求：

- 旧规则能迁移或兼容读取
- 新编辑器保存时优先产出新结构
- runtime 最终吃的是统一结构

## 六、编辑器节点模型

不要把整个编辑器建立在一整段自由字符串上。请定义中间层节点：

```ts
type RuleEditorNode =
  | { type: 'keyword'; text: '当' | '时' | '显示' | '隐藏' | '且' | '或' | '·' }
  | { type: 'field_ref'; fieldKey: string; displayText: string }
  | { type: 'operator'; value: '=' | '!=' | '包含' | '不包含' | '为空' | '不为空' }
  | { type: 'literal'; value: string }
  | { type: 'whitespace'; text: ' ' }
  | { type: 'group_break' };
```

编辑器渲染这些 node，保存时再把 node 组装回 AST。

## 七、双向转换层

必须实现三层转换，不要偷懒只做字符串正则：

1. `AST -> EditorNodes`
2. `EditorNodes -> AST`
3. `AST -> 可读展示文本`

这样才能保证：

- 打开已有规则时稳定回显
- 编辑过程中实时校验
- 保存时直接产出结构化数据
- 不依赖脆弱的字符串解析

## 八、字段引用 mention 行为

请把字段引用实现成真正的 mention，而不是伪装下拉框。

行为要求：

1. 用户手动输入 `#`
2. 才进入字段候选态
3. 候选列表基于字段标题和 `fieldKey` 过滤
4. 选中后替换为一个 `field_ref node`
5. 视觉上渲染为高亮 token
6. 删除时整体删除
7. 点击 token 可重新进入替换态
8. 不允许系统一点击就自动塞一个固定 `#`
9. 中文输入法组合输入期间不得误选

## 九、编辑器交互规则

请明确这些交互：

1. `#` 才触发字段候选
2. `Enter` 在 mention 态下优先确认候选
3. `Esc` 关闭当前候选层
4. `Backspace` 删除完整字段 token
5. 点击字段 token 可替换
6. 当前规则不完整时，整条规则标记为未完成
7. 未完成规则不可保存
8. 多动作之间用 `·` 分隔
9. 第一版支持 `且 / 或`，但不做嵌套括号表达式

## 十、前端组件拆分建议

建议新增这些文件：

```text
apps/web/src/features/template-designer/rule-editor/
  LinkageRuleEditor.tsx
  RuleLineEditor.tsx
  FieldReferenceToken.tsx
  MentionPopover.tsx
  ruleEditorAst.ts
  ruleEditorParser.ts
  ruleEditorSerializer.ts
  ruleEditorValidation.ts
```

其中：

- `LinkageRuleEditor.tsx`
  联动规则整体编辑器
- `RuleLineEditor.tsx`
  单条规则编辑视图
- `MentionPopover.tsx`
  `#字段` 候选层
- `ruleEditorAst.ts`
  AST 和 node 类型定义
- `ruleEditorParser.ts`
  `EditorNodes -> AST`
- `ruleEditorSerializer.ts`
  `AST -> EditorNodes / displayText`
- `ruleEditorValidation.ts`
  编辑态合法性校验

## 十一、PropertyPanel 接入要求

改造入口优先看：

- `apps/web/src/features/template-designer/PropertyPanel.tsx`

要求：

- 保留“字段联动”折叠区
- 保留“联动 1 / 删除”
- 移除当前 `select + sentence` 的字段选择方式
- 用新规则编辑器替换联动卡片主体
- 不要把这个能力扩散到别的页面

## 十二、字段过滤规则

mention 候选字段仍要遵守现有联动合法性规则：

- 不展示 `show_item`
- 不展示 `group`
- 不展示 `tabs`
- 不展示 `llm_assist`
- 条件字段只展示允许作为联动源的字段
- 动作字段要按动作类型过滤
- `show / hide` 目标字段必须是可提交字段
- `limitOptions` 目标字段必须是 `radio / checkbox / tag_select`

不要在 UI 里重写一份完全独立的规则，尽量复用现有合法字段判断函数。

## 十三、视觉与动画要求

视觉上要像编辑器，不像表单。

要求：

- 字段 token 是浅高亮引用块，不是按钮
- 操作符和关键字是普通文字
- 字面值是可编辑文本
- 非法片段要有错误态
- 候选面板是轻量 popover，不是原生 select
- token 的出现和消失有自然过渡动画
- mention 面板打开和关闭都有过渡动画
- 长字段名不能撑坏布局

## 十四、运行时和后端要求

前端编辑器不是孤岛。请同步处理：

- shared schema
- template validation
- runtime 执行逻辑
- 模板保存/读取兼容

至少保证：

- `show/hide` 多动作可执行
- `limitOptions` 新结构可执行
- 非法规则保存时报错
- 隐藏字段仍然不参与必填和提交

## 十五、测试要求

至少补这些测试：

1. 输入 `#` 才触发字段候选
2. 不输入 `#` 不出现字段候选
3. `#cat` 能过滤到 `category`
4. 选中字段后生成字段引用 token
5. 删除 token 后恢复普通输入态
6. 点击 token 后可替换
7. 中文输入法期间不会误触发
8. `AST -> EditorNodes` 正确
9. `EditorNodes -> AST` 正确
10. 多动作规则保存后结构正确
11. 打开已有规则时能正确回显
12. runtime 能执行多动作 `show/hide`
13. `limitOptions` 在新结构下仍然生效

## 十六、验收标准

完成后必须满足：

- 联动卡片主体看起来像规则编辑器，不再像 select 拼句子
- 字段引用只能通过输入 `#` 触发
- 已绑定字段以高亮 token 展示
- 保存后仍是结构化规则，不是自由文本
- 重新打开模板时规则可以稳定回显
- 现有联动逻辑不回归
- web 侧测试通过

## 十七、实施顺序

按这个顺序开发：

1. shared schema 升级
2. template validation 升级
3. runtime 兼容新结构
4. 前端 rule editor 组件实现
5. PropertyPanel 接入
6. 回显与保存联调
7. 单测和页面验证

## 十八、不要做的事

这次不要做：

- 完全自由自然语言规则输入
- AI 去解析用户写的一整句中文
- 任意嵌套括号表达式
- 跨页面全局复用编辑器
- 自定义脚本规则

这次的正确目标是：

**把字段联动从“表单式配置”升级成“结构化规则编辑器”，外观像编辑器，底层仍然是严谨的 AST 和规则运行时。**

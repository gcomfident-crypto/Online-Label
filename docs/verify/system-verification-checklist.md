# LabelHub 系统闭环验收测试清单

目标：不再新增功能，集中验证现有系统是否已经形成完整业务闭环，状态流转、模板约束、页面交互和视觉表现是否存在阻断问题。

## 零、本轮新增验收原则：按 datasets 输入逐个跑闭环

本轮验收必须以 `/Users/zzx/workspace/LH/datasets` 下的文件作为真实输入来源，而不是只用演示数据或手造数据。测试目标不是证明某个页面能打开，而是证明每一个有效数据文件都能从 Owner 导入开始，完整走到最终导出。

### 0.1 有效数据输入文件

以下文件必须分别作为独立输入跑完整业务闭环。

1. `/Users/zzx/workspace/LH/datasets/preference_compare/excel/preference_compare.xlsx`
2. `/Users/zzx/workspace/LH/datasets/preference_compare/json/preference_compare.json`
3. `/Users/zzx/workspace/LH/datasets/preference_compare/jsonl/3条.jsonl`
4. `/Users/zzx/workspace/LH/datasets/preference_compare/jsonl/preference_compare.jsonl`
5. `/Users/zzx/workspace/LH/datasets/qa_quality/excel/qa_quality.xlsx`
6. `/Users/zzx/workspace/LH/datasets/qa_quality/excel/qa_quality copy.xlsx`
7. `/Users/zzx/workspace/LH/datasets/qa_quality/json/qa_quality.json`
8. `/Users/zzx/workspace/LH/datasets/qa_quality/jsonl/qa_quality.jsonl`

### 0.2 需求说明文件

以下文件不作为数据导入输入，而是作为模板、页面渲染、标注约束、导出字段的验收依据。

1. `/Users/zzx/workspace/LH/datasets/preference_compare/标注要求.md`
2. `/Users/zzx/workspace/LH/datasets/qa_quality/标注要求.md`

如果系统把这些 Markdown 文件误当作数据集导入并生成任务，这是错误。

### 0.2-A 测试模板使用规则

不同数据集目录必须使用对应的模板策略。模板选择本身就是验收对象，不能混用，也不能用系统默认兜底模板、临时 mock 模板或字段自动推断结果掩盖模板缺失问题。

1. `/Users/zzx/workspace/LH/datasets/preference_compare` 路径下的所有测试用例，直接使用系统中已经发布的 `模型对比模版` 进行测试。
2. `/Users/zzx/workspace/LH/datasets/qa_quality` 路径下的所有测试用例，不能直接测试数据导入闭环，必须先根据 `/Users/zzx/workspace/LH/datasets/qa_quality/标注要求.md` 搭建并发布 `qa_quality` 专用模板。
3. `qa_quality` 专用模板发布完成后，`/Users/zzx/workspace/LH/datasets/qa_quality` 路径下的测试用例只能绑定这个搭建好的专用模板进行测试。
4. `qa_quality` 测试用例禁止使用 `模型对比模版`，也禁止使用临时 mock 模板、默认模板或自动兜底模板。
5. 如果 `qa_quality` 专用模板没有实现 `标注要求.md` 中的字段展示、组件类型、校验约束、AI 预审映射、Reviewer 字段评论映射和导出字段要求，必须先完成模板和相关功能开发，再继续执行 `qa_quality` 的全流程验收。
6. Owner 发布任务时必须截图证明当前任务绑定的模板名称和模板版本；测试报告中必须记录该输入文件使用的模板名称、模板版本和模板来源。

### 0.3 非业务文件和异常输入

以下文件必须验证为“不会被当成有效数据导入”。系统可以忽略，也可以给出明确错误，但不能静默生成脏任务。

1. `/Users/zzx/workspace/LH/datasets/.DS_Store`
2. `/Users/zzx/workspace/LH/datasets/preference_compare/.DS_Store`
3. `/Users/zzx/workspace/LH/datasets/qa_quality/.DS_Store`
4. `/Users/zzx/workspace/LH/datasets/qa_quality/excel/.~qa_quality.xlsx`

验收标准：

1. `.DS_Store` 不能进入任务数据。
2. Excel 临时锁文件 `.~qa_quality.xlsx` 不能进入任务数据。
3. 非业务文件如果被用户手动上传，必须给出明确、可定位的错误。
4. 错误提示要说明文件名和原因，不能只显示“导入失败”。

### 0.4 同输入全流程重跑规则

任何一个输入文件在任意阶段发现问题后，修复完成不能只测失败步骤，必须用同一个输入文件从头重跑完整闭环。

重跑范围：

1. Owner 导入该文件。
2. Owner 绑定或生成模板。
3. Owner 发布任务。
4. Labeler 领取任务。
5. Labeler 完成所有题目并提交整个任务。
6. AI Agent 预审。
7. Labeler 处理 AI 打回。
8. AI Agent 再次预审。
9. Reviewer 审核。
10. Labeler 处理 Reviewer 打回。
11. Reviewer 再次复审。
12. 任务最终完成。
13. Owner 导出结果。
14. 校验导出文件格式和字段内容。

判断标准：同一个输入文件重跑通过后，才算这个输入文件验收通过。

### 0.5 遇错即停和全量回归规则

任意输入文件、任意角色、任意阶段一旦发现 Bug，必须立即停止继续测试后续输入文件。

Bug 包括但不限于：

1. UI 错位、遮挡、状态展示不一致。
2. 业务状态流转错误。
3. Console 报错。
4. 接口报错。
5. 导入、提交、审核、导出结果不符合数据契约。
6. 截图证据无法证明当前步骤成功。

发现 Bug 后必须执行以下动作：

1. 保存失败现场截图。
2. 记录当前 URL、角色、输入文件、操作步骤和错误原文。
3. 定位根因并修复。
4. 修复后不能只重测失败步骤。
5. 修复后必须从本清单第一个有效输入文件开始，重新执行全部端到端验证。
6. 回归过程中的每一步操作仍然必须重新截图。

只有所有有效输入文件都在修复后的同一轮回归中通过，才允许生成最终通过结论。

## 一、最高优先级：完整业务闭环

必须验证一条任务从创建到最终完成的完整链路。

1. Owner 创建模板。
2. Owner 创建任务。
3. Owner 发布任务。
4. Labeler 领取任务。
5. Labeler 完成所有题目后统一提交任务。
6. AI Agent 开始预审。
7. AI Agent 建议打回部分题。
8. Labeler 只能修改 AI 打回题，不能修改 AI 通过题。
9. Labeler 修改后再次提交整个任务。
10. AI Agent 再次预审。
11. AI Agent 全部通过后，任务进入 Reviewer。
12. Reviewer 能看到完整题目列表。
13. Reviewer 打回部分题。
14. Labeler 只能修改 Reviewer 打回题。
15. Labeler 再次提交整个任务。
16. Reviewer 再次复审。
17. 所有题最终通过。
18. 整个任务状态变成完成。

## 二、任务状态流转测试

核心判断：任务是整体流转，不允许单题提前暴露最终状态。

1. Reviewer 单独点某题通过或打回后，Labeler 侧不能马上看到该题最终状态变化。
2. Reviewer 审完整个任务后，Labeler 才统一看到返工状态。
3. AI 预审阶段不能单题提前暴露最终状态。
4. 一个任务里只要还有题未最终完成，任务不能显示完成。
5. 所有题最终完成后，任务才显示完成。
6. 第 1 轮、第 2 轮、第 N 轮状态不能串。
7. Labeler 重新提交后，上一轮打回状态不能污染新一轮。
8. AI 打回、Reviewer 打回、最终完成三类状态不能混淆。
9. 任务列表状态、题目列表状态、流程详情状态必须一致。
10. 待修改、待审核、已完成数量必须和真实题目状态一致。

## 三、Owner 侧测试

1. 草稿任务不会出现在质检流转里。
2. 未发布任务不会被 Labeler 领取。
3. 发布后任务才能进入任务广场。
4. 任务发布后模板配置被冻结，不能被后续模板修改影响。
5. Owner 修改草稿模板后，再发布任务使用正确版本。
6. 任务详情里的流程进度、任务日志、题目数统计一致。
7. 删除、下架、未发布任务不会出现在 Labeler、AI Agent、Reviewer 流程中。
8. Owner 页面任务状态与 Labeler 工作台、AI Agent 队列、Reviewer 队列一致。
9. 任务名称、模板名称、版本号展示正确。
10. 长任务名、长模板名不会撑破页面。

## 四、模板配置约束测试

模板是整个系统的数据契约，必须重点验证。

1. 必填字段为空时不能提交。
2. 单选字段校验生效。
3. 多选字段校验生效。
4. 文本字段校验生效。
5. JSON 字段校验生效。
6. 表格字段校验生效。
7. 字段显隐联动生效。
8. 被隐藏字段是否参与校验，要符合模板配置。
9. 字段默认值生效。
10. 模板版本号显示正确。
11. 任务绑定的是发布时的模板版本。
12. 修改模板新版本后，旧任务不受影响。
13. Labeler 页面渲染字段顺序和模板配置一致。
14. Reviewer “本轮提交”字段顺序和模板配置一致。
15. AI 字段级预审结果能正确映射到模板字段。
16. Reviewer 字段级评论能正确映射到 Labeler 对应字段。
17. 模板配置错误时不能静默兜底。
18. 无效模板应给出明确错误，而不是 mock 或模糊提示。

## 四-A、qa_quality 标注要求专项验收

`/Users/zzx/workspace/LH/datasets/qa_quality/标注要求.md` 里的要求必须逐条验收。这个目录之前没有被充分测试，如果发现要求没有实现，结论不是“测试失败可忽略”，而是必须继续完成开发。

### 4A.1 原始字段展示验收

以下字段必须能被正确导入、展示或参与模板配置。

1. `id`：题目唯一编号，只展示，不参与标注。
2. `category`：题目类别，只展示，不参与标注。
3. `difficulty`：难度，只展示，不参与标注。
4. `lang`：语言或翻译方向，只展示，不参与标注。
5. `media_type`：原始数据类型，决定素材渲染方式。
6. `media_url`：图片或视频素材地址，媒体题必须展示。
7. `content_markdown`：Markdown 图文正文，Markdown 题必须渲染。
8. `prompt`：用户输入或任务说明，只展示。
9. `model_answer`：待评估模型回答，标注核心对象，必须展示。
10. `reference`：参考答案或评判要点，辅助展示。
11. `tags`：题目标签，展示。
12. `expected_dimensions`：该题重点评估维度，必须影响标注判断或提示。

### 4A.2 媒体渲染验收

1. `media_type = text` 时，页面按文本题展示。
2. `media_type = image` 时，页面展示图片素材或可打开图片链接。
3. `media_type = video` 时，页面展示视频素材或可打开视频链接。
4. `media_type = markdown` 时，页面渲染 `content_markdown`。
5. Markdown 中的图片、视频、链接不能以未处理原始字符串糊在页面上。
6. 媒体素材缺失时必须有明确提示，不能静默空白。
7. Labeler、AI Agent、Reviewer 三侧看到的原始素材必须一致。

### 4A.3 标注组件覆盖验收

`qa_quality` 模板必须覆盖以下组件类型或等价能力。

1. 展示项 ShowItem：展示 `prompt`、`model_answer`、`reference`、媒体素材。
2. 相关性评分：1-5 分单选。
3. 准确性评分：1-5 分单选。
4. 格式合规评分：1-5 分单选。
5. 安全性评分：1-5 分单选。
6. 问题类型标签：多选或标签选择。
7. 一句话总评：单行输入。
8. 详细评语或打回理由：多行文本。
9. 修订建议：富文本编辑器或等价富文本能力。
10. 修正后的标准答案：JSON 编辑器。
11. 证据素材：图片上传或文件上传。
12. AI 预评分参考：LLM 交互组件或等价 AI 辅助能力。

### 4A.4 qa_quality 标注约束验收

1. 1-5 分字段只能提交合法分值。
2. 详细评语在打回时必填。
3. 安全性为低分时，问题类型标签应能标出安全违规。
4. `expected_dimensions` 中出现的维度必须在页面上给 Labeler 明确提示。
5. JSON 编辑器必须校验 JSON 合法性。
6. 上传字段必须限制非法文件或给出明确错误。
7. LLM 预评分只能作为参考，不能绕过人工标注必填约束。
8. AI 预审结果必须能映射到具体 qa_quality 字段。
9. Reviewer 字段级评论必须能落到 qa_quality 对应字段。
10. 导出结果必须保留 qa_quality 的原始题目字段和标注结果字段。

## 四-B、preference_compare 标注要求专项验收

`/Users/zzx/workspace/LH/datasets/preference_compare/标注要求.md` 是偏好对比数据集的验收依据。

### 4B.1 原始字段展示验收

1. `id` 展示正确。
2. `task_type` 展示正确。
3. `lang` 展示正确。
4. `prompt` 展示正确。
5. `response_a` 和 `response_b` 并排或清晰对照展示。
6. `model_a` 和 `model_b` 展示时不能诱导 Labeler 偏向模型名。

### 4B.2 标注字段验收

1. `preferred` 只能选择 `A`、`B`、`tie`。
2. `margin` 只能选择明显优于、略优于、相当。
3. `dimensions` 支持多选。
4. `safety_flag` 能正确处理布尔值和 Excel 中的是/否。
5. `annotator_note` 必填。
6. 多轮返工时，Reviewer 字段评论能落到 `preferred`、`margin`、`dimensions`、`safety_flag`、`annotator_note` 对应字段。

## 五、Labeler 侧测试

1. 未领取任务不能进入标注台。
2. 领取后可以进入标注台。
3. 草稿保存生效。
4. 切题后草稿不丢。
5. 所有题完成前不能提交整个任务。
6. 所有题完成后才能提交整个任务。
7. 提交后当前任务进入只读态。
8. AI 打回后，只能修改 AI 打回题。
9. Reviewer 打回后，只能修改 Reviewer 打回题。
10. 没被打回的题禁止修改。
11. 左侧题目导航状态和右侧主内容状态一致。
12. 左侧状态不能出现过多混乱状态。
13. 当前题切换不会丢数据。
14. 保存草稿按钮状态正确。
15. 提交任务按钮状态正确。
16. 报告题目按钮状态正确。
17. 快捷键不会误触错误操作。
18. 本题历史展示轮次正确。
19. Reviewer 字段评论显示在对应字段，不只显示在顶部整体原因里。
20. 修改被打回字段后，对应高亮或提示能按规则清除。

## 六、AI Agent 侧测试

1. 只展示已经进入 AI 预审阶段的任务。
2. Owner 未发布草稿不展示。
3. AI 预审中状态正确。
4. AI 预审失败状态正确。
5. AI 建议通过统计正确。
6. AI 建议打回统计正确。
7. AI 对整任务预审完成后，才推进到下一阶段。
8. AI 打回题目后，Labeler 修改完成再提交，AI 能再次预审。
9. AI 再次预审不会读取旧答案。
10. AI 预审日志不记录无意义的单题完成事件。
11. AI 预审结果能进入任务日志。
12. AI 预审完成后能正确流转到 Reviewer。
13. AI 页面里的“已完成”不能和 Reviewer 最终完成混淆。
14. AI 接口失败时页面提示明确。
15. AI 重试逻辑不会产生重复轮次或重复日志。

## 七、Reviewer 侧测试

1. Reviewer 能看到完整题目列表。
2. 左侧能看出哪些题需要重点复审。
3. Reviewer 审核前，Labeler 不能看到单题通过或打回状态。
4. Reviewer 审完整个任务后，才统一返给 Labeler。
5. Reviewer 可以通过题目。
6. Reviewer 可以打回题目。
7. Reviewer 字段级评论编辑卡片能打开。
8. 点击取消不保存评论。
9. 点击发送后评论停靠右侧。
10. 多条评论按字段顺序排列，不按发送顺序。
11. 已评论字段黄色下划线高亮。
12. 打回 payload 只包含已发送字段评论。
13. 空评论不能发送。
14. 通过题不会带打回评论。
15. Reviewer 再次复审时仍能看到完整题目列表。
16. Reviewer 能看出哪些题是 Labeler 修改后需要复审的。
17. 最后一题审核完成后，整个任务进入完成。
18. 批量通过、批量打回不会破坏整任务流转规则。
19. Reviewer 页面空列表状态正常。
20. Reviewer 审核失败时不应错误更新本地状态。

## 八、字段级评论专项测试

这是近期高风险改动，需要单独验收。

1. 点击字段 A，右侧打开字段 A 评论卡片。
2. 写内容后点取消，字段 A 不高亮。
3. 写内容后点发送，字段 A 高亮。
4. 点击字段 B 写评论，右侧卡片按字段顺序排序。
5. 修改已评论字段，原评论更新，不重复新增。
6. 打回后 Labeler 对应字段看到评论。
7. 没评论的字段不显示修改建议。
8. Reviewer 名称不展示在评论卡片里。
9. Reviewer 头像不展示在评论卡片里。
10. 卡片 UI 在小屏、窄右栏下不溢出。
11. 长评论换行正常。
12. 字段名很长时不撑破卡片。
13. 评论卡片右上角不显示三个点。
14. 取消按钮不会误提交。
15. 发送按钮禁用状态正确。
16. 已发送评论进入打回 payload。
17. 未发送草稿不进入打回 payload。
18. 打回后字段评论能进入 Labeler 返工页面。

## 九、任务日志测试

1. Owner 发布时间和人正确。
2. Labeler 领取时间和人正确。
3. Labeler 提交时间正确。
4. AI 预审开始记录正确。
5. AI 预审结束记录正确。
6. AI 打回记录正确。
7. Labeler 返工提交记录正确。
8. Reviewer 打回记录正确。
9. Reviewer 通过记录正确。
10. 最终任务完成时间正确。
11. 不记录无意义文案，例如“任务进入可领取状态”。
12. 日志弹窗可以滚动。
13. 长日志不会撑破页面。
14. 多轮返工日志顺序正确。
15. 日志中的人名、时间、题号、轮次一致。

## 十、流程进度 UI 测试

1. 只显示五个节点：Owner 发布、Labeler 标注、AI Agent 预审、Reviewer 检查、任务完成。
2. 已完成节点显示正确颜色。
3. 当前节点显示正确颜色。
4. 未开始节点不显示数字。
5. 未开始节点下方不显示“未发生”。
6. 节点 hover 卡片显示经办人和时间。
7. hover 卡片和节点垂直对齐。
8. 相邻节点颜色不同时连接线渐变。
9. 右侧节点是灰色时连接线灰色。
10. 整体在桌面下不挤压错位。
11. 整体在窄屏下不挤压错位。
12. 流程进度不占用过多垂直空间。
13. 不显示无意义标题，例如“任务流转详情”。

## 十一、状态统一测试

需要统一检查这些页面的状态是否一致。

1. Labeler 左侧题目导航。
2. Labeler 工作台任务列表。
3. AI Agent 质检流转列表。
4. Reviewer 左侧题目列表。
5. Owner 任务详情。
6. 任务流转详情。
7. 任务日志。

建议用户可见流程状态只保留以下五类。

1. 待标注。
2. AI处理中。
3. 待审核。
4. 已完成。
5. 异常。

Labeler 自己的填写完成度单独表达。

1. 未填写。
2. 草稿。
3. 已标注。

重点验证：填写完成度不能和流程状态混在一起。

## 十二、权限测试

1. Owner 不能进入 Labeler 标注台。
2. Labeler 不能进入 Reviewer 页面。
3. Reviewer 不能修改 Labeler 草稿。
4. AI Agent 不能操作人工审核。
5. 未登录访问会跳登录。
6. 登录身份切换后页面权限刷新正确。
7. 直接输入 URL 不能绕过权限。
8. 越权接口请求不能成功。
9. 错误身份访问页面时提示明确。
10. 退出登录后不能继续访问受保护页面。

## 十三、数据一致性测试

1. 题目总数在 Owner、Labeler、AI、Reviewer 页面一致。
2. 待审数量一致。
3. 待修改数量一致。
4. 已完成数量一致。
5. 提交轮次一致。
6. 每轮答案快照不被后续修改覆盖。
7. 草稿不会覆盖已提交结果。
8. Reviewer 打回评论不会丢。
9. AI 预审结果不会错绑到其他题。
10. 同一个任务多题同时流转时不会串题。
11. 多轮返工后最终答案取最新一轮。
12. 旧轮次数据仍可在历史里查看。
13. 任务完成后不允许继续修改答案。
14. 任务完成后统计数据稳定。

## 十三-A、导入格式验收

每一个有效数据文件都必须验证导入行为。

### 13A.1 Excel 导入

适用文件：

1. `/Users/zzx/workspace/LH/datasets/preference_compare/excel/preference_compare.xlsx`
2. `/Users/zzx/workspace/LH/datasets/qa_quality/excel/qa_quality.xlsx`
3. `/Users/zzx/workspace/LH/datasets/qa_quality/excel/qa_quality copy.xlsx`

验收项：

1. 文件能被 Owner 正常选择并上传。
2. 表头能正确识别。
3. 行数识别正确。
4. 空行不会生成脏题。
5. 布尔、数字、文本、多选字段不会被错误转型。
6. 中文列名或特殊字符不会导致字段丢失。
7. `qa_quality copy.xlsx` 与 `qa_quality.xlsx` 的导入结果应一致，除非文件内容本身不同。
8. Excel 临时锁文件 `.~qa_quality.xlsx` 必须被拒绝或忽略，不能生成任务。

### 13A.2 JSON 导入

适用文件：

1. `/Users/zzx/workspace/LH/datasets/preference_compare/json/preference_compare.json`
2. `/Users/zzx/workspace/LH/datasets/qa_quality/json/qa_quality.json`

验收项：

1. 顶层数组或系统支持的 JSON 结构能正确导入。
2. 每条 JSON 记录生成一条题目。
3. 嵌套字段、数组字段、布尔字段不丢失。
4. 非法 JSON 必须给出明确错误。
5. JSON 字段顺序不应影响模板字段映射。

### 13A.3 JSONL 导入

适用文件：

1. `/Users/zzx/workspace/LH/datasets/preference_compare/jsonl/3条.jsonl`
2. `/Users/zzx/workspace/LH/datasets/preference_compare/jsonl/preference_compare.jsonl`
3. `/Users/zzx/workspace/LH/datasets/qa_quality/jsonl/qa_quality.jsonl`

验收项：

1. 每一行生成一条题目。
2. `3条.jsonl` 必须导入 3 条题目。
3. 空行处理符合预期，不能生成空题。
4. 某一行 JSON 非法时必须明确指出行号。
5. JSONL 中文文件名不能导致上传或解析失败。

## 十三-B、导出格式验收

每个有效输入文件跑完整任务闭环后，都必须验证导出。导出不是最后点一下按钮，而是要校验文件内容能证明流程结果正确。

### 13B.1 导出入口和权限

1. Owner 能在任务完成后导出结果。
2. 未完成任务不能导出最终结果，或必须明确标识为非最终导出。
3. Labeler、Reviewer、AI Agent 如果没有导出权限，不能绕过页面或接口导出。
4. 导出接口失败时必须提示明确。

### 13B.2 导出格式

需要验证系统当前支持的所有导出格式。若系统支持 Excel、JSON、JSONL 或 CSV，则每一种都必须分别验证。

1. Excel 导出能被正常打开。
2. JSON 导出是合法 JSON。
3. JSONL 导出每行都是合法 JSON。
4. CSV 导出如果存在，编码和中文字段不能乱码。
5. 文件名包含任务名、任务 ID 或时间信息，不能生成无法区分的通用文件名。
6. 导出文件扩展名和真实内容格式一致。

### 13B.3 导出内容

1. 导出题目数等于原始输入题目数。
2. 导出包含原始题目字段。
3. 导出包含 Labeler 最终标注结果。
4. 导出包含最终通过状态。
5. 导出包含最新轮次答案，不导出已被修正的旧答案作为最终答案。
6. 导出能追踪任务 ID、题目 ID、轮次或提交时间。
7. `preference_compare` 导出必须包含 `preferred`、`margin`、`dimensions`、`safety_flag`、`annotator_note`。
8. `qa_quality` 导出必须包含相关性、准确性、格式合规、安全性、问题类型标签、一句话总评、详细评语、修订建议、JSON 标准答案、证据素材引用。
9. Reviewer 字段级打回意见不应覆盖最终标注答案，但应能在审计或日志导出中追踪。
10. AI 预审结果如果系统设计为可导出，必须和页面展示一致。

### 13B.4 导出回归规则

如果某个输入文件在导出阶段发现问题，修复后必须用同一个输入文件从 Owner 导入开始重跑完整闭环，再重新导出验证。

## 十四、错误和异常测试

1. AI 预审接口 500 时页面提示明确。
2. 领取任务接口失败时提示明确。
3. 提交任务失败时不清空草稿。
4. 保存草稿失败时提示明确。
5. Reviewer 打回失败时不改变本地状态。
6. AI 预审失败后可以重试。
7. 网络慢时 loading 状态正常。
8. 空列表状态正常。
9. 后端返回脏数据时页面不要静默吞掉关键错误。
10. 不要出现“HTTP 500 但用户不知道哪里错”的模糊体验。
11. 模板错误不能用 mock 值兜底。
12. 接口错误不能静默失败。
13. 异常状态必须可定位到具体接口或具体任务。
14. 用户重新刷新页面后状态不应错乱。

## 十五、UI 视觉回归测试

1. Labeler 左侧题目导航是否拥挤。
2. Reviewer 右侧评论卡片是否像参考图。
3. 流程进度条是否过大。
4. 流程进度节点是否错位。
5. 任务日志弹窗是否可滚动。
6. 顶部 tab 宽度是否和内容对齐。
7. 表格空状态是否正常。
8. 长任务名是否换行或溢出。
9. 长模板名是否溢出。
10. 长字段名是否撑破卡片。
11. 小屏下三栏布局是否可用。
12. 滚动区域是否互相抢滚动。
13. 固定区域是否遮挡内容。
14. 按钮布局是否被挤压。
15. 页面刷新后布局是否闪烁明显。
16. hover 卡片是否被容器裁剪。
17. 弹窗层级是否正确。
18. 右侧评论卡片是否存在多余图标。

## 十六、最小必须跑的验收场景

如果时间不够，至少跑下面场景。注意：这些场景不是只跑一次，而是要覆盖 `0.1 有效数据输入文件` 中列出的每一个有效输入文件。

1. Owner 发布任务 -> Labeler 领取 -> Labeler 提交整任务。
2. AI 打回部分题 -> Labeler 只能修改打回题 -> 再提交。
3. AI 全部通过 -> Reviewer 收到任务。
4. Reviewer 字段级打回 -> Labeler 对应字段看到评论。
5. Labeler 修改后 -> Reviewer 再次复审 -> 全部通过。
6. 任务最终完成 -> 所有页面状态一致。
7. 模板必填、显隐、字段顺序、版本冻结生效。
8. 流程进度、任务日志、左侧题目导航视觉检查。
9. Owner 导出最终结果 -> 校验导出格式和内容。
10. 使用 `.DS_Store`、Markdown 要求文件、Excel 临时锁文件作为异常输入 -> 系统明确拒绝或忽略，不能生成任务。

## 十七、建议执行顺序

1. 先按 `0.1` 建立输入文件矩阵。
2. 对每个有效输入文件跑完整业务闭环。
3. 每个输入文件完成后立即跑导出格式和导出内容校验。
4. 再跑状态流转测试。
5. 再跑模板配置约束测试。
6. 再跑 `qa_quality` 标注要求专项测试。
7. 再跑 `preference_compare` 标注要求专项测试。
8. 再跑 Reviewer 字段级评论专项测试。
9. 再跑 Labeler 返工权限测试。
10. 最后做 UI 截图回归。
11. 对 `.DS_Store`、Markdown 要求文件、Excel 临时锁文件跑异常输入测试。

## 十八、提交前判断标准

可以提交的最低标准如下。

1. `0.1` 中每个有效输入文件都完整跑通业务闭环。
2. 每个有效输入文件都完成最终导出，且导出格式和内容校验通过。
3. 任意输入发现问题后，修复后已经用同一个输入文件从头重跑完整闭环。
4. `qa_quality/标注要求.md` 中的字段展示、媒体渲染、组件类型、标注约束全部实现或有明确验收结论。
5. `preference_compare/标注要求.md` 中的字段展示、偏好标注字段、必填约束全部实现或有明确验收结论。
6. `.DS_Store`、Markdown 要求文件、Excel 临时锁文件不会被误导入成任务。
7. 任务状态不再单题提前暴露。
8. Labeler 只能修改被打回题。
9. AI 和 Reviewer 多轮返工不串轮次。
10. 模板约束真实生效。
11. Reviewer 字段评论能回显到 Labeler 对应字段。
12. 任务日志和流程进度能解释整条生命周期。
13. 关键页面没有明显视觉错位。
14. 所有核心接口失败都有明确提示。
15. 没有用 mock、静默失败或兜底值掩盖真实错误。

## 十九、每个输入文件必须生成独立测试报告

每一个有效输入文件完整跑通后，都必须生成一个独立测试报告。报告的作用不是简单写“通过”，而是用截图和关键数据证明：这个文件作为输入时，Owner、Labeler、AI Agent、Reviewer 各角色各阶段都真实执行成功。

### 19.1 报告保存位置

报告统一保存到以下目录。

```text
/Users/zzx/workspace/LH/docs/verify/reports
```

如果目录不存在，测试前先创建。

### 19.2 报告命名规则

每个输入文件对应一个 Markdown 报告。

命名格式：

```text
<dataset_kind>__<format>__<source_file_stem>__verification-report.md
```

示例：

```text
preference_compare__excel__preference_compare__verification-report.md
preference_compare__jsonl__3条__verification-report.md
qa_quality__excel__qa_quality__verification-report.md
qa_quality__json__qa_quality__verification-report.md
```

### 19.3 截图保存位置

每个报告对应一个同名截图目录。

目录格式：

```text
/Users/zzx/workspace/LH/docs/verify/reports/<report_id>/screenshots
```

示例：

```text
/Users/zzx/workspace/LH/docs/verify/reports/qa_quality__json__qa_quality/screenshots
```

### 19.4 截图命名规则

截图必须按执行顺序编号，方便回放整条流程。

命名格式：

```text
<step_no>__<role>__<stage>.png
```

示例：

```text
01__owner__task-created.png
02__owner__task-published.png
03__labeler__task-claimed.png
04__labeler__all-items-annotated.png
05__labeler__task-submitted.png
06__ai-agent__precheck-running.png
07__ai-agent__precheck-rejected.png
08__labeler__ai-rework-visible.png
09__labeler__ai-rework-submitted.png
10__ai-agent__precheck-passed.png
11__reviewer__review-queue-visible.png
12__reviewer__field-comment-created.png
13__reviewer__task-rejected.png
14__labeler__reviewer-comment-visible.png
15__labeler__reviewer-rework-submitted.png
16__reviewer__final-review-passed.png
17__owner__task-completed.png
18__owner__export-created.png
19__owner__export-content-verified.png
```

### 19.5 每个报告必须包含的信息

每份报告至少包含以下内容。

1. 输入文件绝对路径。
2. 数据集类型：`preference_compare` 或 `qa_quality`。
3. 输入格式：Excel、JSON、JSONL。
4. 输入文件行数或题目数。
5. 导入后系统识别的题目数。
6. 任务 ID。
7. 任务名称。
8. 模板名称。
9. 模板版本。
10. Owner 用户。
11. Labeler 用户。
12. AI Agent 预审结果摘要。
13. Reviewer 用户。
14. 最终任务状态。
15. 导出文件路径。
16. 导出格式。
17. 导出题目数。
18. 是否通过全流程验收。
19. 如果失败，失败阶段、错误信息、修复说明、重跑记录。

### 19.6 每个报告必须覆盖的流程截图

以下截图缺一不可，除非该输入文件对应的流程没有触发某阶段。未触发必须在报告里说明原因。

#### Owner 阶段

1. Owner 选择并上传输入文件。
2. Owner 看到导入预览或导入成功结果。
3. Owner 看到题目数和字段映射结果。
4. Owner 创建或绑定模板。
5. Owner 发布任务。
6. Owner 任务详情显示任务进入可领取或流转状态。

#### Labeler 首轮标注阶段

1. Labeler 任务广场看到该任务。
2. Labeler 成功领取该任务。
3. Labeler 标注台显示该输入文件导入的题目。
4. Labeler 左侧题目导航显示正确题目数。
5. Labeler 完成所有题目标注。
6. Labeler 成功提交整个任务。

#### AI Agent 首轮预审阶段

1. AI Agent 队列看到该任务。
2. AI Agent 开始预审或显示预审中。
3. AI Agent 预审完成。
4. 如果 AI 打回，截图证明哪些题进入待修改。
5. 如果 AI 全部通过，截图证明任务进入 Reviewer 阶段。

#### Labeler AI 返工阶段

1. Labeler 工作台看到任务待修改。
2. Labeler 只能修改 AI 打回题。
3. Labeler 不能修改 AI 通过题。
4. Labeler 修改后重新提交整个任务。

#### AI Agent 再次预审阶段

1. AI Agent 看到 Labeler 重新提交后的任务。
2. AI Agent 再次预审完成。
3. AI Agent 预审通过并流转到 Reviewer。

#### Reviewer 审核阶段

1. Reviewer 队列看到该任务。
2. Reviewer 页面看到完整题目列表。
3. Reviewer 能看出需要重点审核的题。
4. Reviewer 打开某题的本轮提交字段。
5. Reviewer 创建字段级评论卡片。
6. Reviewer 已评论字段黄色下划线高亮。
7. Reviewer 打回任务或通过任务。

#### Labeler Reviewer 返工阶段

1. Labeler 工作台看到 Reviewer 打回后的待修改任务。
2. Labeler 对应字段看到 Reviewer 字段评论。
3. Labeler 只能修改 Reviewer 打回题。
4. Labeler 修改后重新提交整个任务。

#### Reviewer 最终复审阶段

1. Reviewer 再次看到该任务。
2. Reviewer 能识别哪些题需要再次复审。
3. Reviewer 通过所有剩余题。
4. Reviewer 页面显示任务没有待审题。

#### Owner 完成和导出阶段

1. Owner 任务详情显示任务完成。
2. 流程进度显示任务完成。
3. 任务日志能看到从发布到完成的关键记录。
4. Owner 发起导出。
5. 导出文件生成成功。
6. 打开或解析导出文件，证明格式正确。
7. 导出题目数和输入题目数一致。
8. 导出内容包含最终标注结果。

### 19.7 报告中截图引用格式

报告中必须用相对路径引用截图。

示例：

```md
![Owner 发布任务](./qa_quality__json__qa_quality/screenshots/05__owner__task-published.png)
```

不要只写截图文件名，也不要只写“见截图”。报告必须能在 Markdown 预览里直接看到截图。

### 19.8 失败和修复记录

如果某个输入文件中途失败，报告必须记录失败信息。

失败记录至少包含：

1. 失败阶段。
2. 失败截图。
3. 错误提示原文。
4. 失败原因判断。
5. 修复文件或修复说明。
6. 修复后是否使用同一个输入文件从头重跑。
7. 重跑截图目录。
8. 最终结论。

### 19.9 报告通过标准

一个输入文件的测试报告只有同时满足以下条件，才能标记为通过。

1. 报告文件存在。
2. 截图目录存在。
3. Owner、Labeler、AI Agent、Reviewer、导出阶段截图齐全。
4. 报告中所有截图引用有效。
5. 输入题目数和导出题目数一致。
6. 全流程最终状态为任务完成。
7. 导出文件格式正确。
8. 如出现过失败，必须有修复记录和同输入全流程重跑记录。

### 19.10 提交前报告总览

所有输入文件跑完后，还要生成总览报告。

保存路径：

```text
/Users/zzx/workspace/LH/docs/verify/reports/verification-summary.md
```

总览报告必须包含：

1. 所有输入文件列表。
2. 每个输入文件的报告链接。
3. 每个输入文件的最终状态：通过 / 失败 / 阻塞。
4. 每个输入文件的题目数。
5. 每个输入文件的导出题目数。
6. 失败问题汇总。
7. 已修复问题汇总。
8. 未修复风险清单。
9. 是否达到提交标准的最终结论。

## 20. 测试模板使用规则

### 20.1 preference_compare 测试模板

`/Users/zzx/workspace/LH/datasets/preference_compare` 路径下的所有有效测试用例，直接使用系统中已发布的 `模型对比模版` 进行全流程测试。

验证重点是：

1. 输入文件能否被 `模型对比模版` 正确导入。
2. 题目字段能否正确映射到任务题目。
3. Labeler 标注、AI Agent 预审、Reviewer 检查、任务完成、导出结果是否完整闭环。
4. 导出文件格式和题目数量是否与原始输入一致。

### 20.2 qa_quality 测试模板

`/Users/zzx/workspace/LH/datasets/qa_quality` 路径下的所有有效测试用例，不能直接套用 `模型对比模版`。

测试前必须先根据以下文件搭建并发布专用模板：

```text
/Users/zzx/workspace/LH/datasets/qa_quality/标注要求.md
```

搭建完成后，必须使用该专用模板执行 `qa_quality` 全流程测试。

验证重点是：

1. 模板字段、组件类型、校验规则必须覆盖 `标注要求.md` 中的要求。
2. 输入文件能否被该专用模板正确导入。
3. Labeler 页面是否按模板要求展示和提交。
4. AI Agent 预审是否能基于该模板生成建议。
5. Reviewer 是否能基于该模板完成检查、评论、通过和打回。
6. 导出文件是否包含该模板要求的最终标注结果。

如果 `qa_quality` 专用模板无法搭建，或者 `标注要求.md` 中的要求当前系统不支持，结论不能记为测试通过；必须先完成对应开发或模板能力补齐，再重新执行测试。

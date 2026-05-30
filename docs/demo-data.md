# 官方数据与演示数据说明

LabelHub 的最终演示围绕两个官方 DatasetProfile：`qa_quality` 和 `preference_compare`。仓库不提交官方 `datasets.zip`、解压数据或本机密钥文件；`prisma/seed.ts` 按同一字段结构生成可重复演示数据。

## 演示 seed 内容

运行：

```bash
pnpm exec prisma db seed
```

或重置：

```bash
pnpm demo:reset
```

会生成：

- 4 个演示用户：Owner、Labeler、Reviewer、AI Agent。
- 2 个已发布官方模板：问答质量模板、偏好对比模板。
- 2 个进行中任务：`qa_quality` 30 条题目、`preference_compare` 12 条题目。
- 3 条提交记录：问答质量第 1 轮打回、第 2 轮终审通过、偏好对比待人工复审。
- 2 条 AI 预审任务：一次 mock 通过、一次 mock 转人工兜底。
- 1 条人工打回记录、1 条终审通过记录、1 条示例导出记录。

## `qa_quality` 字段

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 官方题目唯一标识 |
| `prompt` | string | 是 | 用户问题 |
| `model_answer` | string | 是 | 待评估模型回答 |
| `expected_dimensions` | string[] | 是 | 期望评估维度 |
| `media_type` | string | 否 | 媒体类型，例如 image、audio、markdown |
| `media_url` | string | 否 | 媒体地址 |
| `content_markdown` | string | 否 | Markdown 补充内容 |
| `tags` | string[] | 否 | 题目标签 |

验收数量：JSON、JSONL、Excel 各 30 条；Excel sheet 名为 `标注题目`。

## `preference_compare` 字段

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 官方题目唯一标识 |
| `prompt` | string | 是 | 用户问题 |
| `response_a` | string | 是 | 候选回答 A |
| `response_b` | string | 是 | 候选回答 B |
| `preferred` | string | 否 | 官方参考偏好 |
| `margin` | number | 否 | 偏好强度参考 |
| `dimensions` | string[] | 否 | 对比维度 |
| `safety_flag` | boolean | 否 | 是否存在安全风险 |
| `annotator_note` | string | 否 | 标注参考备注 |

验收数量：JSON、JSONL、Excel 各 12 条；Excel sheet 名为 `偏好对比`。

## 导入格式

Owner 可在数据导入页执行三类导入：

1. JSON：数组或对象集合，字段名与 DatasetProfile 一致。
2. JSONL：每行一条 JSON 记录。
3. Excel：按官方 sheet 读取字段并归一化。
4. zip：上传官方 `datasets.zip` 的 base64 内容，服务端忽略系统临时文件。

zip 导入忽略：

- `__MACOSX/`
- `.DS_Store`
- `._*`
- `.~*.xlsx`

Excel 归一化规则：

- `tags`、`expected_dimensions`、`dimensions` 使用 ` | ` 拆分为数组。
- `safety_flag` 中 `是` / `否` 转为 `true` / `false`。
- 空字符串按缺省值或空字段处理，不生成伪造标注结果。

## 演示数据路径

| 用途 | 文件或命令 |
| --- | --- |
| Prisma seed | `prisma/seed.ts` |
| 演示重置 | `prisma/demo-reset.ts` |
| 写入 seed | `pnpm exec prisma db seed` |
| 清空并重建 | `pnpm demo:reset` |
| seed 状态调试 | `GET /debug/seed-status` |

## 不提交的数据

以下内容不得进入 git：

- 官方 `datasets.zip`。
- 解压后的官方原始数据。
- `.env`、`env`、`docs/labelhub-plan/env`。
- 真实 `DEEPSEEK_API_KEY`。
- 临时上传文件、导出文件和测试报告。

## 演示口径

答辩时先用 `qa_quality` 展示完整闭环：Owner 发布任务、Labeler 标注、AI 预审、Reviewer 打回、Labeler 二次提交、Reviewer 复审通过、终审通过、Owner 导出。

随后用 `preference_compare` 展示 A/B 偏好模板、导入字段和导出字段映射，说明系统不是为单一题型硬编码，而是依赖 DatasetProfile 与动态 Schema 扩展。

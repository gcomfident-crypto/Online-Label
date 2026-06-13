# 后端 API 全量测试

- 时间：2026-06-13 20:27
- 测试分类：后端关键链路
- 触发原因：全量后端回归
- 结论：部分通过（7 个失败，224 个通过）

## 涉及脚本

按 vitest 运行顺序覆盖的 35 个测试文件，覆盖 API shell、任务、模板、状态机、提交、领取、草稿、审核、导出、审计、LLM、debug、数据集、prisma 等全部后端模块。

## 运行命令

```bash
pnpm --filter @labelhub/api test
```

## 运行环境

- 浏览器：不涉及
- 服务：API(3000)、PostgreSQL(5432)、Redis(6379) 均在线
- 关键环境变量：`.env` 中 `LLM_MODEL=v4flash`、`LLM_PROVIDER=deepseek`

## 执行结果

| 范围 | 命令 | 结果 |
|-|-|-|
| API 全量 | `pnpm --filter @labelhub/api test` | 35 文件，5 失败 / 30 通过（231 测试，7 失败 / 224 通过） |

## 失败明细

### 1. `.env` 模型名不匹配（2 处）

| 测试 | 预期 | 实际 |
|-|-|-|
| `review-rules.service.test.ts` > 查询缺省规则时按 qa_quality profile 初始化默认 AI 审核规则 | `model: 'deepseek-chat'` | `model: 'v4flash'` |
| `ai-review-processor.service.test.ts` > 旧 mock 规则没有真实模型配置时不落回本地假评语 | `model: 'deepseek-chat'` | `model: 'v4flash'` |

**原因**：`.env` 中 `LLM_MODEL=v4flash`，测试硬编码期望 `deepseek-chat`。不是代码回归，是测试与本地配置不匹配。

### 2. `drafts.service.test.ts` — `getWorkbench` 缺少 `labelerId`（3 处）

| 测试 | 错误 |
|-|-|
| 工作台查询返回题目、Schema、草稿和提交历史 | `BadRequestException: 请求缺少当前标注员 ID` |
| 上一轮打回原因优先展示审核记录 comment | 同上 |
| 最新提交已经通过时不再展示历史打回原因 | 同上 |

**原因**：`drafts.service.ts:232` 调用 `assertAssignmentBelongsToLabeler`，现在要求传入 `labelerId`，但测试未传。3 个 `getWorkbench` 相关测试均未提供 `labelerId`。

### 3. `drafts.controller.test.ts` — spy 参数多了 `undefined`（1 处）

**错误**：`getWorkbench` 被调用 `('assignment_1', undefined)` 而非 `('assignment_1')`。

**原因**：Controller 层额外传了 `labelerId`（为 `undefined`）。与上述 service 测试同源问题。

### 4. `assignments.service.test.ts` — `assignedCount` 语义变化（1 处）

**错误**：`listMarketTasks` 返回 `assignedCount: 0`，测试期望 `1`。同时新增了 `claimedByMeCount: 0` 字段。

**原因**：广场任务聚合逻辑或 mock 数据与新的 `claimedByMeCount` 字段重构后，`assignedCount` 计算口径变了。

## 覆盖点

1. API shell、健康检查、登录、错误 envelope
2. 任务创建/发布/暂停/恢复/结束全生命周期
3. 模板草稿/AB 版本/发布/兼容报告
4. 任务状态机合法/非法迁移
5. 提交、AI 队列、幂等、二次提交
6. 草稿覆盖保存、工作台、打回原因
7. 人工复审列表/详情/动作/批量
8. AI 预审队列、处理、LLM 调用、失败态
9. 审核规则默认初始化、版本管理
10. 导出创建/映射/文件生成/预览
11. 数据集导入统计、批量写入
12. 审计日志、debug 路由、环境变量

## 关键断言

| 断言 | 期望 | 结果 |
|-|-|-|
| 全部 231 测试 | 全部通过 | 224 通过，7 失败 |

## 证据

无截图 / trace（纯单元/集成测试，无浏览器交互）。

## 失败与修复

- **模型名不匹配（2）**：`.env` 中 `LLM_MODEL=v4flash` 是本地配置。测试期望值 `deepseek-chat` 为官方默认值。可选择更新测试期望为动态读取 `.env`，或统一本地 `.env` 的模型名。
- **`getWorkbench` 缺 labelerId（4）**：`drafts.service.ts:324` 新增了 `assertAssignmentBelongsToLabeler` 校验要求传入 `labelerId`，但对应 3 个 service 测试和 1 个 controller 测试未适配。需要补传 `labelerId` 参数。
- **`assignedCount` 语义变化（1）**：新增 `claimedByMeCount` 字段后，`assignedCount` 计算逻辑或 mock 数据变了。需对齐测试期望或服务实现。

## 未覆盖风险

- 失败测试中有 6/7 属于测试与近期代码变更不同步（`getWorkbench` 签名变化、模型名硬编码、新字段语义），需确认是代码行为正确后更新测试，还是代码回归需要修。

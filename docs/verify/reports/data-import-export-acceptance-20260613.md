# 数据导入导出验收报告

执行时间：2026-06-13 19:46:00 CST  
执行目录：`/Users/houshikang/Documents/Codex/2026-06-08-github-labelhub/Online-Label`

## 结论

本次完成数据导入导出专项自动化验收，专项测试全部通过。

完整端到端闭环脚本 `docs/verify/run-system-verification.mjs` 未能在当前仓库直接运行，原因是脚本硬编码旧路径 `/Users/zzx/workspace/LH`，并且当前仓库不存在 `datasets/` 输入目录。因此本报告结论限定为“专项自动化验收通过”，不等同于“按真实 datasets 文件完成全流程闭环验收”。

## 已执行验收

| 范围 | 命令 | 结果 |
|-|-|-|
| API 导入导出专项 | `pnpm --dir apps/api exec vitest run src/exports/exports.service.test.ts src/exports/exports.controller.test.ts src/exports/export-mapping.service.test.ts src/datasets/importers/dataset-importer.test.ts src/datasets/datasets.service.test.ts src/datasets/datasets.controller.test.ts` | 6 个测试文件通过，34 个断言通过 |
| Worker 导出专项 | `pnpm --filter @labelhub/worker test -- src/exporters/exporters.test.ts src/processors/export.processor.test.ts` | 7 个测试文件通过，22 个断言通过 |
| Shared 数据集协议 | `pnpm --filter @labelhub/shared test -- src/datasetProfiles.test.ts` | 11 个测试文件通过，68 个断言通过 |
| Web 导入导出页面 | `pnpm --dir apps/web exec vitest run src/pages/owner/DatasetImportPage.test.tsx src/pages/owner/ExportCenterPage.test.tsx src/pages/owner/autoShowItemTemplate.test.ts` | 3 个测试文件通过，19 个断言通过 |

合计：27 个测试文件通过，143 个断言通过。

## 覆盖点

1. 导入解析：覆盖 JSON、JSONL、Excel 数据导入器，导入统计和数据服务接口。
2. 数据集协议：覆盖 `qa_quality`、`preference_compare`、`generic_json` profile、必填字段、Excel 字符串数组和中文布尔值归一化。
3. 导出服务：覆盖导出任务创建、字段映射快照、预览、文件生成、幂等键、只导出复审通过数据、审核字段隐藏、自定义字段映射过滤。
4. 导出文件生成：覆盖 JSON、JSONL、CSV、XLSX 文件生成、稳定表头和数组字段拼接。
5. Worker 导出处理：覆盖仅导出 `FINAL_APPROVED` 数据、文件写入、成功和失败状态。
6. 前端导入导出：覆盖 JSONL 导入统计、题目预览刷新、批量写入 rawData、导出记录选择、单条/批量格式导出、任务 ID 展示、排序、空状态和接口失败降级。
7. 自动模板生成：覆盖输入字段分类、ShowItem 自动生成、媒体 URL 保留、原始字段顺序和模型漏判兜底。

## 阻断与风险

1. `docs/verify/run-system-verification.mjs` 不能直接运行。实际错误为从 `/Users/zzx/workspace/LH/apps/api/package.json` 解析依赖，导致 `Cannot find module 'exceljs'`。
2. 当前仓库根目录没有 `datasets/` 目录，无法按 `docs/verify/system-verification-checklist.md` 要求对 8 个真实输入文件逐个跑完整闭环。
3. 沙箱内通过包脚本执行 API 全量测试时，`supertest` 监听 `0.0.0.0` 会触发 `listen EPERM`；本次已改用精确文件方式完成导入导出专项验证。

## 验收判定

专项自动化验收：通过。  
真实数据全流程闭环验收：未执行，原因是当前仓库缺少数据输入目录且全流程脚本存在硬编码旧路径。

建议后续修复 `run-system-verification.mjs` 的 `ROOT` 为当前工作目录或环境变量，并补齐 `datasets/` 后，再运行真实输入文件的端到端闭环验收。

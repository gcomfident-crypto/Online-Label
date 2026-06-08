# 系统验收总览报告

生成时间：2026-06-08T01:59:00.429Z

## 有效输入文件结果

| 输入文件 | 报告 | 状态 | 题目数 | 导出题目数 |
| --- | --- | --- | ---: | ---: |
| `/Users/zzx/workspace/LH/datasets/preference_compare/excel/preference_compare.xlsx` | [报告](./preference_compare__excel__preference_compare__verification-report.md) | 通过 | 12 | 12 |
| `/Users/zzx/workspace/LH/datasets/preference_compare/json/preference_compare.json` | [报告](./preference_compare__json__preference_compare__verification-report.md) | 通过 | 12 | 12 |
| `/Users/zzx/workspace/LH/datasets/preference_compare/jsonl/3条.jsonl` | [报告](./preference_compare__jsonl__3条__verification-report.md) | 通过 | 3 | 3 |
| `/Users/zzx/workspace/LH/datasets/preference_compare/jsonl/preference_compare.jsonl` | [报告](./preference_compare__jsonl__preference_compare__verification-report.md) | 通过 | 12 | 12 |
| `/Users/zzx/workspace/LH/datasets/qa_quality/excel/qa_quality.xlsx` | [报告](./qa_quality__excel__qa_quality__verification-report.md) | 通过 | 10 | 10 |
| `/Users/zzx/workspace/LH/datasets/qa_quality/excel/qa_quality copy.xlsx` | [报告](./qa_quality__excel__qa_quality_copy__verification-report.md) | 通过 | 30 | 30 |
| `/Users/zzx/workspace/LH/datasets/qa_quality/json/qa_quality.json` | [报告](./qa_quality__json__qa_quality__verification-report.md) | 通过 | 30 | 30 |
| `/Users/zzx/workspace/LH/datasets/qa_quality/jsonl/qa_quality.jsonl` | [报告](./qa_quality__jsonl__qa_quality__verification-report.md) | 通过 | 30 | 30 |

## 异常输入

- `/Users/zzx/workspace/LH/datasets/.DS_Store`: HTTP 400, 生成题目数 0
- `/Users/zzx/workspace/LH/datasets/preference_compare/.DS_Store`: HTTP 400, 生成题目数 0
- `/Users/zzx/workspace/LH/datasets/qa_quality/.DS_Store`: HTTP 201, 生成题目数 0
- `/Users/zzx/workspace/LH/datasets/qa_quality/excel/.~qa_quality.xlsx`: HTTP 201, 生成题目数 0
- `/Users/zzx/workspace/LH/datasets/preference_compare/标注要求.md`: HTTP 400, 生成题目数 0
- `/Users/zzx/workspace/LH/datasets/qa_quality/标注要求.md`: HTTP 201, 生成题目数 0

## 已修复问题

- AI 字段级预审缺失 score 时按 decision 归一化，避免 qa_quality tag_select 字段导致 AI job 失败。
- qa_quality 验证脚本真实生成并选择上传证据附件/证据截图，草稿、导出和报告均校验两个证据字段非空。

## 最终结论

达到提交标准。

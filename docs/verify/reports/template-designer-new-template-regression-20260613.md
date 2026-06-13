# 新建评测模板 E2E 回归测试报告

## 结论

> 通过。新建评测模板草稿、字段配置、草稿保存、重新打开与刷新后持久化链路均完成验证。

## 执行信息

| 项目 | 内容 |
| --- | --- |
| 执行时间 | 2026-06-13 19:10:33 CST |
| 测试入口 | `tests/e2e/template-designer.spec.ts` |
| 用例名称 | `Owner 评测模板支持新建草稿、配置字段并持久化` |
| Playwright 项目 | `chromium-1280` |
| 浏览器 | 本机 Google Chrome，通过 `PW_BROWSER_CHANNEL=chrome` 指定 |
| 命令 | `PW_BROWSER_CHANNEL=chrome PW_REUSE_EXISTING_SERVER=1 pnpm test:e2e tests/e2e/template-designer.spec.ts --project=chromium-1280` |
| 结果 | `1 passed` |
| 用例耗时 | 6.4s |
| 总耗时 | 8.0s |

## 覆盖范围

| 验证点 | 结果 |
| --- | --- |
| Owner 账号登录并进入任务管理首页 | 通过 |
| 进入“评测模板”页面并展示模板列表 | 通过 |
| 打开“新增模板”配置抽屉 | 通过 |
| 编辑模板名称为 `自动化测试模板` | 通过 |
| 拖入 `展示项 ShowItem` 并配置展示名 `用户问题` | 通过 |
| 拖入 `单选` 字段并配置 `quality` / `质量判断` | 通过 |
| 勾选单选字段必填 | 通过 |
| 添加 `优秀`、`合格`、`不合格` 三个选项 | 通过 |
| 点击抽屉外侧触发草稿保存确认 | 通过 |
| 保存后列表出现草稿模板，字段数为 2 | 通过 |
| 重新打开模板后字段配置仍存在 | 通过 |
| 刷新页面后草稿仍存在 | 通过 |
| 浏览器控制台无 error 级日志 | 通过 |

## 接口与数据断言

测试内对接口做了可重复 Mock：

| 接口 | 行为 |
| --- | --- |
| `POST **/auth/login` | 校验账号 `zhangzexin`、密码 `labelhub@1101101`，返回 Owner 会话 |
| `GET **/templates` | 返回测试内存中的模板列表 |
| `POST **/templates` | 捕获保存草稿请求体并返回新建草稿模板 |

保存草稿请求体断言通过：

| 字段 | 期望 | 结果 |
| --- | --- | --- |
| `name` | `自动化测试模板` | 通过 |
| `datasetKind` | `generic_json` | 通过 |
| `schema.fields.length` | `2` | 通过 |
| ShowItem `sourceKeys` | `['prompt']` | 通过 |
| ShowItem 展示字段 | `{ sourceKey: 'prompt', label: '用户问题' }` | 通过 |
| 单选 `fieldKey` | `quality` | 通过 |
| 单选 `label` | `质量判断` | 通过 |
| 单选必填 | `validation.required: true` | 通过 |
| 单选选项 | `优秀`、`合格`、`不合格` | 通过 |

## 运行过程记录

首次在受限沙箱中运行同一命令时，Playwright webServer 启动阶段失败：

```text
Error: listen EPERM: operation not permitted /var/folders/.../tsx-501/51221.pipe
Error: Process from config.webServer was not able to start. Exit code: 1
```

该失败发生在 `tsx` 创建本地 IPC pipe 时，属于执行环境权限限制，不是业务用例失败。随后使用同一命令在沙箱外重跑，测试通过。

## 产物

| 产物 | 路径 |
| --- | --- |
| Playwright HTML 报告 | `playwright-report/index.html` |
| 最近一次运行状态 | `test-results/.last-run.json` |
| 本报告 | `docs/verify/reports/template-designer-new-template-regression-20260613.md` |

`test-results/.last-run.json` 内容显示：

```json
{
  "status": "passed",
  "failedTests": []
}
```

## 风险与建议

- 当前用例通过接口 Mock 验证前端新建模板链路和请求体结构，不覆盖真实后端数据库写入。
- 该用例固定在 `chromium-1280` 视口，尚未覆盖 1920、2560、3840 项目。
- 若后续需要验证真实服务链路，建议补充一轮非 Mock 的 API/Web 联调回归，并保留数据库清理脚本。

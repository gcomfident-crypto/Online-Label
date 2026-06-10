# LabelHub Postman API 文档

本目录由 `scripts/generate-postman-docs.mjs` 生成，属于方案 B：手工维护 OpenAPI，生成 Postman Collection。

## 文件

- `labelhub-demo.postman_collection.json`：主流程交付 Collection，只保留演示和对外交付需要的核心接口。
- `labelhub-full.postman_collection.json`：工程覆盖 Collection，覆盖当前 controller 的全部接口。
- `labelhub-local.postman_environment.json`：本地环境，默认 `http://localhost:3000`。
- `labelhub-prod.postman_environment.json`：线上演示环境，默认 `http://115.190.153.31/api`。
- `api-coverage.md`：生成时的接口覆盖清单。
- `verification-report.md`：静态验证报告。
- `runtime-smoke-report.md`：运行层 smoke 验证记录。

## 应该导入哪个 Collection

- 演示、交付、给非研发同学看：导入 `labelhub-demo.postman_collection.json`。
- 排查接口覆盖、研发自测、确认 controller 全量路由：导入 `labelhub-full.postman_collection.json`。

## 直接导入链接

在 Postman 中选择 `Import -> Link`，按需粘贴以下链接：

- Demo Collection：`https://raw.githubusercontent.com/gcomfident-crypto/Online-Label/zzx/develop/docs/api/postman/labelhub-demo.postman_collection.json`
- Full Collection：`https://raw.githubusercontent.com/gcomfident-crypto/Online-Label/zzx/develop/docs/api/postman/labelhub-full.postman_collection.json`
- 线上环境：`https://raw.githubusercontent.com/gcomfident-crypto/Online-Label/zzx/develop/docs/api/postman/labelhub-prod.postman_environment.json`
- 本地环境：`https://raw.githubusercontent.com/gcomfident-crypto/Online-Label/zzx/develop/docs/api/postman/labelhub-local.postman_environment.json`

## 使用步骤

1. 在 Postman 导入 Demo Collection 链接。
2. 导入 `labelhub-prod.postman_environment.json` 线上环境链接，或导入 `labelhub-local.postman_environment.json` 本地环境链接。
3. 选择对应环境。
4. 先运行 `00 Auth 登录` 文件夹里的登录请求，登录脚本会自动保存 token。
5. 再按 Owner、Labeler、AI Agent、Reviewer、Export 的业务顺序执行接口。

## Collection 边界

- Demo Collection：41 个核心接口，不包含 debug、mock、内部重试、批量指派、底层 schema 校验等接口。
- Full Collection：76 个接口，必须和 `apps/api/src/**/*.controller.ts` 保持完全一致。

## 重新生成

```bash
node scripts/generate-postman-docs.mjs
node scripts/verify-postman-docs.mjs
```

## 命令行 smoke 验证

没有 Postman 云端 API Key 时，可以用 Newman 本地运行标准 Postman Collection：

```bash
pnpm dlx newman run docs/api/postman/labelhub-demo.postman_collection.json -e docs/api/postman/labelhub-prod.postman_environment.json --folder "00 Auth 登录" --folder "01 System 系统检查" --reporters cli
```

## 成功标准

- Demo Collection 能被 Postman 导入，且不暴露 debug/mock/internal/high-level 接口。
- Full Collection 能被 Postman 导入，且覆盖 controller 的全部真实路由。
- Local / Prod 环境变量完整。
- 登录请求能自动保存不同角色 token。
- `apps/api/src/**/*.controller.ts` 中的真实路由与 `docs/api/openapi.yaml`、Full Collection 覆盖一致。

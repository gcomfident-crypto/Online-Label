# LabelHub Postman Runtime Smoke Report

验证时间：2026-06-10 Asia/Shanghai

## 命令

```bash
pnpm dlx newman run docs/api/postman/labelhub-demo.postman_collection.json -e docs/api/postman/labelhub-prod.postman_environment.json --folder "00 Auth 登录" --folder "01 System 系统检查" --reporters cli
```

## 结果

- Collection：`labelhub-demo.postman_collection.json`
- 环境：`LabelHub Prod`
- baseUrl：`http://115.190.153.31/api`
- 请求数：7
- 断言数：12
- 失败数：0
- 覆盖 smoke 范围：Owner / Labeler / AI Agent / Reviewer 登录、`GET /me`、`GET /health`

## 结论

通过。Demo Collection 可以被 Newman 作为标准 Postman Collection 执行，登录 token 脚本能正常写入环境变量，线上 API 代理路径 `/api` 可用。

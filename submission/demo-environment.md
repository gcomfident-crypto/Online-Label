# 演示环境说明

## 本地演示地址

- Web：`http://localhost:5173`
- API：`http://localhost:3000`
- 登录页：`http://localhost:5173/login`

## 演示账号

登录页直接选择账号，无需密码：

- Owner 演示账号
- Labeler 演示账号
- AI Agent 演示账号
- Reviewer 演示账号

## 数据准备

```bash
docker compose up -d postgres redis
pnpm exec prisma db push
pnpm demo:reset
```

`pnpm demo:reset` 后应有：

- `qa_quality` 30 条题目。
- `preference_compare` 12 条题目。
- 一条问答质量终审通过数据。
- 一条偏好对比待人工复审数据。

## 模型模式

默认：

```text
LLM_PROVIDER=mock
LLM_MODEL=mock-stable-reviewer
```

mock 模式不依赖真实密钥，适合答辩录屏。DeepSeek 模式只在私有环境设置 `DEEPSEEK_API_KEY`。

## 队列检查

- Web 页面：`/agent/ai-review`
- API：`GET /ai-review/jobs`
- Redis：通过云平台或本地 Redis 监控查看连接状态

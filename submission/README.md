# LabelHub 提交材料索引

## 项目信息

- 项目名称：LabelHub
- 源码分支：`codex/labelhub-fullstack`
- 源码根目录：当前仓库根目录
- Web 地址：本地默认 `http://localhost:5173`
- API 地址：本地默认 `http://localhost:3000`

## 快速启动

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres redis
pnpm exec prisma db push
pnpm exec prisma db seed
pnpm dev
```

重置演示数据：

```bash
pnpm demo:reset
```

## 演示账号

| 角色 | 登录方式 | 默认页面 |
| --- | --- | --- |
| Owner | `/login` 选择 Owner 演示账号 | `/owner/tasks` |
| Labeler | `/login` 选择 Labeler 演示账号 | `/labeler/market` |
| AI Agent | `/login` 选择 AI Agent 演示账号 | `/agent/ai-review` |
| Reviewer | `/login` 选择 Reviewer 演示账号 | `/reviewer/reviews` |

## 交付物

| 文件 | 内容 |
| --- | --- |
| `submission/source.md` | 源码目录和模块职责 |
| `submission/architecture.md` | 系统架构摘要 |
| `submission/deployment.md` | 本地与云部署说明 |
| `submission/api.md` | API 文档入口 |
| `submission/demo-environment.md` | 演示环境与账号说明 |
| `submission/demo-script.md` | 答辩演示脚本 |
| `submission/basic-technical-doc.md` | 基础技术文档 |
| `submission/ai-coding-log.md` | AI Coding 过程记录 |
| `submission/screenshots.md` | Demo 截图清单 |
| `submission/screenshots/` | 关键页面截图 |

## 演示主线

先演示 `qa_quality` 完整闭环：Owner 创建并发布任务、Labeler 领取和提交、AI Agent mock 预审、Reviewer 打回、Labeler 二次提交、Reviewer 复审通过、终审通过、Owner 导出。

再演示 `preference_compare`：官方 A/B 偏好模板、12 条演示题目、JSON/JSONL/Excel/zip 导入能力和导出字段映射。

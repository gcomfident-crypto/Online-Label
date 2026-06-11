<p align="center">
  <img src="./apps/web/src/assets/LabelHub_logo_closer_transparent.png" alt="LabelHub" width="760" />
</p>

<p align="center">
  An online collaboration platform for data labeling, automated pre-review, human review, and result export.
  <br />
  支持数据标注、自动预审、人工复审及结果导出的在线协作平台
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-blue.svg?cacheSeconds=2592000" />
  <img alt="Workspace" src="https://img.shields.io/badge/workspace-pnpm-0f766e.svg" />
  <img alt="Web" src="https://img.shields.io/badge/web-React%20%2B%20Vite-306DF7.svg" />
  <img alt="API" src="https://img.shields.io/badge/api-NestJS%20%2B%20Prisma-EA2845.svg" />
  <img alt="Database" src="https://img.shields.io/badge/database-PostgreSQL-4169E1.svg" />
</p>

<p align="center">
  <a href="./README-EN.md">English</a> | <a href="./README.md">中文文档</a>
</p>

## ⚡️ Project Overview

LabelHub is an online platform for AI data labeling operations. It covers **labeling template configuration, item import, task publishing, labeling submission, AI automated pre-review, human review, and data export**, forming a traceable end-to-end loop for labeling tasks.

## 🧩 Architecture and Module Breakdown

<p align="center">
  <img src="./docs/readme/architecture-modules.png" alt="LabelHub architecture and module breakdown" width="920" />
</p>

## 🌍 Online Experience

You can visit the online platform. View existing tasks or create your own tasks to quickly experience the core features: [115.190.153.31](http://115.190.153.31/)

## Demo Accounts

The current frontend login page uses demo accounts and does not connect to a real identity provider. Enter both account and password.

| Role           | Frontend account | Frontend password | Login identity dropdown | Display name | Default home          |
| -------------- | ---------------- | ----------------- | ----------------------- | ------------ | --------------------- |
| Task Owner     | `zhangzexin`     | `LabelHub@1101101` | Owner Task Manager      | 张泽鑫       | `/owner/tasks`        |
| Labeler        | `wangyuyang`     | `1101101`         | Labeler                 | 王昱阳       | `/labeler/market`     |
| Labeler        | `houshikang`     | `1101101`         | Labeler                 | 侯士康       | `/labeler/market`     |
| AI Agent       | `agent`          | `1101101`         | AI Agent Pre-review     | AI Agent     | `/agent/ai-review`    |
| Human Reviewer | `xinzezhang`     | `1101101`         | Reviewer                | 鑫泽张       | `/reviewer/reviews`   |

When the account matches one of the accounts above, the role is determined by the account. When the account does not match, the role is determined by the "Login identity" dropdown.

## 📄 Documentation

* [Technical Documentation and Presentation - Feishu Cloud Document](https://scnylr3i9roc.feishu.cn/docx/R2rUdIlj9oSUBaxNQ3zcGW3onjc)
* [AI Coding Process Record - Feishu Cloud Document](https://scnylr3i9roc.feishu.cn/docx/GYqJddDLgo7qlIxKjbschFzlntf)
* [API Documentation and Postman Import Guide](./docs/api/postman/README.md)
* [Postman Collection - Direct Import](https://raw.githubusercontent.com/gcomfident-crypto/Online-Label/zzx/develop/docs/api/postman/labelhub-demo.postman_collection.json)

## 📷 System Screenshots

### Owner

Owner can independently complete the full flow of creating tasks, configuring templates, publishing tasks, reviewing results, and exporting data. Exported files are structured for downstream use.

<p align="center">
  <img src="./docs/readme/owner/1.png" alt="Owner screenshot 1" width="18%" hspace="3" />
  <img src="./docs/readme/owner/2.png" alt="Owner screenshot 2" width="18%" hspace="3" />
  <img src="./docs/readme/owner/3.png" alt="Owner screenshot 3" width="18%" hspace="3" />
  <img src="./docs/readme/owner/4.png" alt="Owner screenshot 4" width="18%" hspace="3" />
  <img src="./docs/readme/owner/5.png" alt="Owner export result screenshot" width="18%" hspace="3" />
</p>

### Labeler

Labeler can independently complete claiming tasks, answering items, submitting results, viewing rejections, and revising answers.

<p align="center">
  <img src="./docs/readme/labeler/1.png" alt="Labeler screenshot 1" width="22%" hspace="6" />
  <img src="./docs/readme/labeler/2.png" alt="Labeler screenshot 2" width="22%" hspace="6" />
  <img src="./docs/readme/labeler/3.png" alt="Labeler screenshot 3" width="22%" hspace="6" />
  <img src="./docs/readme/labeler/4.png" alt="Labeler screenshot 4" width="22%" hspace="6" />
</p>

### Agent

AI Agent automated pre-review runs normally, with visible and traceable results.

<p align="center">
  <img src="./docs/readme/agent/1.png" alt="Agent screenshot 1" width="46%" hspace="8" />
  <img src="./docs/readme/agent/2.png" alt="Agent screenshot 2" width="46%" hspace="8" />
</p>

### Reviewer

Reviewer can review labeling results and inspect the audit history of each item.

<p align="center">
  <img src="./docs/readme/reviewer/1.png" alt="Reviewer screenshot 1" width="46%" hspace="8" />
  <img src="./docs/readme/reviewer/2.png" alt="Reviewer screenshot 2" width="46%" hspace="8" />
</p>

## 🎬 Demo Video

<p align="center">
  <a href="https://www.bilibili.com/video/BV1DBE96DET8" target="_blank">
    <img src="https://i0.hdslb.com/bfs/archive/c1fb25d895a941764962c0556a3de91d1a43b58f.jpg" alt="LabelHub demo video" width="720" />
  </a>
</p>

<p align="center">
  <a href="https://www.bilibili.com/video/BV1DBE96DET8">Watch the LabelHub demo video</a>
</p>

<!-- Docsify + docsify-bilibili:
- Bilibili video
- aid=116724712081364&bvid=BV1DBE96DET8&cid=39006898467&p=1
-->

## 🔄 Workflow

1. Owner designs templates, imports items, creates tasks, and publishes them
2. Labeler claims tasks, answers items one by one, saves drafts, submits answers, and revises them based on AI Agent or Reviewer pre-review comments
3. AI Agent performs automated pre-review, writes structured scores, and routes the result to human review or back to Labeler for revision
4. Reviewer performs recheck and final review based on diffs, comments, and audit records
5. Owner exports reviewed labeling data from the export center

## 🚀 Quick Start

### Prerequisites

| Tool    | Version                       | Purpose                    |
| ------- | ----------------------------- | -------------------------- |
| Node.js | `^20.19.0` or `>=22.12.0`     | Vite, NestJS, Prisma, tests |
| pnpm    | `10.x`                        | Monorepo package manager   |
| Docker  | Latest stable                 | PostgreSQL and Redis       |
| Git     | Latest stable                 | Source checkout            |

### Source Deployment

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres redis
pnpm exec prisma db push
pnpm exec prisma db seed
pnpm dev
```

Default service URLs:

| Service    | URL                     |
| ---------- | ----------------------- |
| Web        | `http://localhost:5173` |
| API        | `http://localhost:3000` |
| PostgreSQL | `localhost:5432`        |
| Redis      | `localhost:6379`        |

Start services separately when you need isolated logs:

```bash
pnpm --filter @labelhub/api dev
pnpm --filter @labelhub/web dev
pnpm --filter @labelhub/worker dev
```

### AI Configuration

`.env.example` uses DeepSeek-compatible placeholder configuration. Real keys must only be written to local `.env` or cloud platform secret management

```text
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
DEEPSEEK_API_KEY=replace_with_deepseek_api_key
```

## Team Responsibilities

| Member | Primary role | Work scope |
| ------ | ------------ | ---------- |
| Zhang Zexin | Development | Core frontend/backend features, database models, API documentation, deployment, and major issue fixes |
| Wang Yuyang | Product design | Business flow design, multi-role collaboration paths, page interaction requirements, and demo flow planning |
| Hou Shikang | Testing | Feature testing, end-to-end acceptance, import/export verification, and UX issue feedback |

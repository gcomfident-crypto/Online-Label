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

## 🌍 Online Experience

You can visit the online platform. View existing tasks or create your own tasks to quickly experience the core features: [115.190.153.31](http://115.190.153.31/)

## 📷 System Screenshots

### Owner

<p align="center">
  <img src="./docs/readme/owner/1.png" alt="Owner screenshot 1" width="22%" hspace="6" />
  <img src="./docs/readme/owner/2.png" alt="Owner screenshot 2" width="22%" hspace="6" />
  <img src="./docs/readme/owner/3.png" alt="Owner screenshot 3" width="22%" hspace="6" />
  <img src="./docs/readme/owner/4.png" alt="Owner screenshot 4" width="22%" hspace="6" />
</p>

### Labeler

<p align="center">
  <img src="./docs/readme/labeler/1.png" alt="Labeler screenshot 1" width="22%" hspace="6" />
  <img src="./docs/readme/labeler/2.png" alt="Labeler screenshot 2" width="22%" hspace="6" />
  <img src="./docs/readme/labeler/3.png" alt="Labeler screenshot 3" width="22%" hspace="6" />
  <img src="./docs/readme/labeler/4.png" alt="Labeler screenshot 4" width="22%" hspace="6" />
</p>

### Agent

<p align="center">
  <img src="./docs/readme/agent/1.png" alt="Agent screenshot 1" width="46%" hspace="8" />
  <img src="./docs/readme/agent/2.png" alt="Agent screenshot 2" width="46%" hspace="8" />
</p>

### Reviewer

<p align="center">
  <img src="./docs/readme/reviewer/1.png" alt="Reviewer screenshot 1" width="46%" hspace="8" />
  <img src="./docs/readme/reviewer/2.png" alt="Reviewer screenshot 2" width="46%" hspace="8" />
</p>

## 🎬 Demo Video

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

## Demo Accounts

The current frontend login page creates a demo session; it is not real username-password authentication. You need to enter both account and password, but the password is only checked as non-empty and is not validated against a specific value. Use `password` for consistency.

| Role           | Frontend account           | Frontend password | Login identity dropdown | Default home          |
| -------------- | -------------------------- | ----------------- | ----------------------- | --------------------- |
| Task Owner     | `owner`                    | `password`        | Owner Task Manager      | `/owner/tasks`        |
| Labeler        | `labeler`                  | `password`        | Labeler                 | `/labeler/market`     |
| AI Agent       | `agent`/`ai`/`ai_agent`    | `password`        | AI Agent Pre-review     | `/agent/ai-review`    |
| Human Reviewer | `reviewer`                 | `password`        | Reviewer                | `/reviewer/reviews`   |

When the account matches one of the aliases above, the role is determined by the account. When the account does not match an alias, the role is determined by the "Login identity" dropdown.

The backend `/auth/login` endpoint is an independent demo API and does not accept passwords. Log in by role:

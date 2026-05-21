# AI Coding 过程记录

## 开发方式

本项目按 Batch 顺序推进，每个小任务完成后运行相关测试、提交并推送到 `codex/labelhub-fullstack`。开发过程中坚持以下约束：

- 先读取计划和现有代码，再做最小必要改动。
- 所有用户可见文案和提交摘要使用简体中文。
- 真实密钥、本机 env、官方 zip 和解压数据不进入仓库。
- 每个功能点补相应单测或 E2E。
- 完成前运行类型检查、单元测试、E2E 和 Docker Compose 配置检查。

## 阶段记录

| 阶段 | 主要工作 | 验证方式 |
| --- | --- | --- |
| 初始化 | monorepo、Web/API/Worker/shared 基础骨架 | typecheck、基础测试 |
| Shared 与数据模型 | 角色、RBAC、状态机、DatasetProfile、Prisma schema、seed | shared/api 单测 |
| Renderer | 动态 Schema runtime、字段组件、联动、LLM 辅助 | Web 单测、Renderer E2E |
| Designer | 官方模板、三栏 Designer、Schema 发布 | Web 单测、Designer E2E |
| 任务与导入 | Owner 任务管理、发布抽屉、官方数据导入 | API/Web 单测 |
| 标注链路 | 任务广场、领取、草稿、提交、我的数据 | API/Web 单测 |
| AI 预审 | Mock/DeepSeek provider、结构化输出、失败兜底 | Worker/API 单测 |
| 人工复审 | 待审列表、批量操作、打回、通过入终审 | API/Web 单测 |
| 多轮与终审 | 第 1 / 2 轮 Diff、终审通过/打回 | API/Web 单测 |
| 导出中心 | 字段映射、四格式导出、只导出终审通过 | API/Worker/Web 单测 |
| 质量加固 | Loading/Empty/Error、幂等、事务、中文治理、双视口 E2E | typecheck、test、test:e2e |
| 交付材料 | README、部署、OpenAPI、架构、演示脚本、submission | YAML 检查、最终验证 |

## 人工取舍

- 演示默认使用 mock AI，避免答辩时依赖外部模型可用性。
- DeepSeek provider 保留真实接口，但只读取 `DEEPSEEK_API_KEY` 环境变量。
- 当前仓库没有 Prisma migrations，README 明确使用 `prisma db push` 从零建表，正式环境可在补迁移后切换到 `migrate deploy`。
- 官方原始数据不提交，seed 使用同字段结构生成可重复演示数据。

## 关键 Prompt 方向

- 统一登录、四端隔离和 RBAC 不允许退化成单页角色切换。
- 审核链路固定为 `AI 自动预审 -> 人工复审 -> 终审`。
- 导出只读取 `FINAL_APPROVED`。
- Batch11 增加中文文案扫描、双视口截图和无横向溢出检查。
- Batch12 补齐面向评审的新同学启动文档和答辩材料。

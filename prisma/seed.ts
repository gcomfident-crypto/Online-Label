import 'dotenv/config';

import { fileURLToPath } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  createLabelHubSchema,
  type DatasetKind,
  type LabelHubSchema,
} from '@labelhub/shared';

type SeedUser = {
  id: string;
  name: string;
  role: 'OWNER' | 'LABELER' | 'REVIEWER' | 'AI_AGENT';
};

type SeedTemplate = {
  id: string;
  name: string;
  description: string;
  datasetKind: DatasetKind;
  schemaVersion: string;
  schema: Prisma.InputJsonValue;
  createdById: string;
};

type SeedTask = {
  id: string;
  title: string;
  description: string;
  status: 'DRAFT';
  templateId: string;
  createdById: string;
};

type SeedTaskItem = {
  taskId: string;
  externalId: string;
  datasetKind: DatasetKind;
  rawData: Prisma.InputJsonValue;
  sortOrder: number;
};

export type SeedData = {
  users: SeedUser[];
  templates: SeedTemplate[];
  tasks: SeedTask[];
  taskItems: SeedTaskItem[];
};

export const SEED_USER_IDS = [
  'user_owner_zhang_man',
  'user_labeler_li_lei',
  'user_reviewer_wang_fang',
  'user_ai_agent_system',
] as const;

export const SEED_TEMPLATE_IDS = [
  'template_qa_quality_official_draft',
  'template_preference_compare_official_draft',
] as const;

export const SEED_TASK_IDS = [
  'task_qa_quality_demo',
  'task_preference_compare_demo',
] as const;

const SCHEMA_VERSION = '2026-05-21.1';
const DEFAULT_DATABASE_URL =
  'postgresql://labelhub:labelhub_password@localhost:5432/labelhub?schema=public';

export function buildSeedData(): SeedData {
  const users: SeedUser[] = [
    { id: SEED_USER_IDS[0], name: '张满', role: 'OWNER' },
    { id: SEED_USER_IDS[1], name: '李雷', role: 'LABELER' },
    { id: SEED_USER_IDS[2], name: '王芳', role: 'REVIEWER' },
    { id: SEED_USER_IDS[3], name: '系统机审账号', role: 'AI_AGENT' },
  ];

  const templates: SeedTemplate[] = [
    {
      id: SEED_TEMPLATE_IDS[0],
      name: '官方问答质量模板草稿',
      description: '用于评估问答内容事实性、完整性和表达质量的官方草稿模板。',
      datasetKind: 'qa_quality',
      schemaVersion: SCHEMA_VERSION,
      schema: toPrismaJson(createQaQualitySchema()),
      createdById: SEED_USER_IDS[0],
    },
    {
      id: SEED_TEMPLATE_IDS[1],
      name: '官方偏好对比模板草稿',
      description: '用于对比两个候选回答并选择更优结果的官方草稿模板。',
      datasetKind: 'preference_compare',
      schemaVersion: SCHEMA_VERSION,
      schema: toPrismaJson(createPreferenceCompareSchema()),
      createdById: SEED_USER_IDS[0],
    },
  ];

  const tasks: SeedTask[] = [
    {
      id: SEED_TASK_IDS[0],
      title: '问答质量标注任务草稿',
      description: '演示用 qa_quality 问答质量标注任务，包含 30 条题目。',
      status: 'DRAFT',
      templateId: SEED_TEMPLATE_IDS[0],
      createdById: SEED_USER_IDS[0],
    },
    {
      id: SEED_TASK_IDS[1],
      title: '偏好对比标注任务草稿',
      description: '演示用 preference_compare 偏好对比任务，包含 12 条题目。',
      status: 'DRAFT',
      templateId: SEED_TEMPLATE_IDS[1],
      createdById: SEED_USER_IDS[0],
    },
  ];

  return {
    users,
    templates,
    tasks,
    taskItems: [...createQaQualityItems(), ...createPreferenceCompareItems()],
  };
}

export async function seed(prisma = createPrismaClient()): Promise<void> {
  const data = buildSeedData();

  for (const user of data.users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        name: user.name,
        role: user.role,
      },
      create: user,
    });
  }

  for (const template of data.templates) {
    await prisma.taskTemplate.upsert({
      where: { id: template.id },
      update: {
        name: template.name,
        description: template.description,
        datasetKind: template.datasetKind,
        schemaVersion: template.schemaVersion,
        schema: template.schema,
        createdById: template.createdById,
      },
      create: template,
    });
  }

  for (const task of data.tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: {
        title: task.title,
        description: task.description,
        status: task.status,
        templateId: task.templateId,
        createdById: task.createdById,
      },
      create: task,
    });
  }

  for (const item of data.taskItems) {
    await prisma.taskItem.upsert({
      where: {
        taskId_externalId: {
          taskId: item.taskId,
          externalId: item.externalId,
        },
      },
      update: {
        datasetKind: item.datasetKind,
        rawData: item.rawData,
        sortOrder: item.sortOrder,
      },
      create: item,
    });
  }
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg(resolveDatabaseUrl()),
  });
}

function resolveDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function createQaQualitySchema(): LabelHubSchema {
  return createLabelHubSchema({
    schemaVersion: SCHEMA_VERSION,
    datasetKind: 'qa_quality',
    fields: [
      {
        key: 'quality',
        type: 'radio',
        label: '整体质量',
        options: [
          { label: '优秀', value: 'excellent' },
          { label: '合格', value: 'pass' },
          { label: '需修改', value: 'needs_revision' },
        ],
        validation: { required: true },
      },
      {
        key: 'issues',
        type: 'checkbox',
        label: '问题类型',
        options: [
          { label: '事实错误', value: 'factual_error' },
          { label: '遗漏关键信息', value: 'missing_key_info' },
          { label: '表达不清', value: 'unclear' },
          { label: '格式不符合要求', value: 'format_issue' },
        ],
      },
      {
        key: 'comment',
        type: 'textarea',
        label: '审核意见',
        placeholder: '说明判断依据或需要修订的内容',
      },
    ],
  });
}

function createPreferenceCompareSchema(): LabelHubSchema {
  return createLabelHubSchema({
    schemaVersion: SCHEMA_VERSION,
    datasetKind: 'preference_compare',
    fields: [
      {
        key: 'preferred',
        type: 'radio',
        label: '更优回答',
        options: [
          { label: '回答 A', value: 'A' },
          { label: '回答 B', value: 'B' },
          { label: '质量相当', value: 'tie' },
        ],
        validation: { required: true },
      },
      {
        key: 'preference_reason',
        type: 'checkbox',
        label: '选择依据',
        options: [
          { label: '更准确', value: 'more_accurate' },
          { label: '更完整', value: 'more_complete' },
          { label: '更易读', value: 'more_readable' },
          { label: '更安全', value: 'safer' },
        ],
      },
      {
        key: 'comment',
        type: 'textarea',
        label: '对比说明',
        placeholder: '简要说明偏好判断',
      },
    ],
  });
}

function createQaQualityItems(): SeedTaskItem[] {
  return Array.from({ length: 30 }, (_, index) => {
    const itemNumber = index + 1;

    return {
      taskId: SEED_TASK_IDS[0],
      externalId: `qa_quality_${String(itemNumber).padStart(2, '0')}`,
      datasetKind: 'qa_quality',
      sortOrder: itemNumber,
      rawData: toPrismaJson({
        question: `用户问题 ${itemNumber}：如何判断回答是否解决了核心诉求？`,
        answer: `示例回答 ${itemNumber}：先确认问题目标，再检查事实依据、步骤完整性和表达清晰度。`,
        reference: `参考要点 ${itemNumber}：覆盖事实性、完整性、清晰度和安全边界。`,
        rubric: ['事实准确', '信息完整', '表达清晰', '无安全风险'],
      }),
    };
  });
}

function createPreferenceCompareItems(): SeedTaskItem[] {
  return Array.from({ length: 12 }, (_, index) => {
    const itemNumber = index + 1;

    return {
      taskId: SEED_TASK_IDS[1],
      externalId: `preference_compare_${String(itemNumber).padStart(2, '0')}`,
      datasetKind: 'preference_compare',
      sortOrder: itemNumber,
      rawData: toPrismaJson({
        prompt: `对比题 ${itemNumber}：请给新用户解释 LabelHub 的任务草稿状态。`,
        responseA: `回答 A-${itemNumber}：草稿状态表示任务仍可编辑，尚未正式发布给标注员。`,
        responseB: `回答 B-${itemNumber}：草稿通常代表任务未发布，可以继续调整模板、题目和说明。`,
        criteria: ['准确性', '完整性', '可读性', '安全性'],
      }),
    };
  });
}

function isDirectRun(moduleUrl: string, argvPath?: string): boolean {
  if (!argvPath) {
    return false;
  }

  return fileURLToPath(moduleUrl) === argvPath;
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  const prisma = createPrismaClient();

  seed(prisma)
    .then(async () => {
      await prisma.$disconnect();
      console.log('LabelHub seed 数据已写入。');
    })
    .catch(async (error: unknown) => {
      await prisma.$disconnect();
      console.error(error);
      process.exitCode = 1;
    });
}

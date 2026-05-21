import { Inject, Injectable } from '@nestjs/common';

import {
  SEED_TASK_IDS,
  SEED_TEMPLATE_IDS,
  SEED_USER_IDS,
} from './seed-ids.ts';
import { PrismaService } from '../prisma/prisma.service.ts';

export type SeedStatus = {
  users: number;
  templates: number;
  tasks: number;
  taskItems: {
    qa_quality: number;
    preference_compare: number;
  };
};

export type DebugTask = {
  id: string;
  title: string;
  status: string;
  templateId: string;
  createdById: string | null;
  itemCount: number;
};

export type DebugUser = {
  id: string;
  name: string;
  role: string;
};

type DebugPrismaClient = {
  user: {
    count: (args: {
      where: { id: { in: readonly string[] } };
    }) => Promise<number>;
    findMany: (args: {
      orderBy: { createdAt: 'asc' };
      select: { id: true; name: true; role: true };
    }) => Promise<DebugUser[]>;
  };
  taskTemplate: {
    count: (args: {
      where: { id: { in: readonly string[] } };
    }) => Promise<number>;
  };
  task: {
    count: (args: {
      where: { id: { in: readonly string[] } };
    }) => Promise<number>;
    findMany: (args: {
      orderBy: { createdAt: 'asc' };
      select: {
        id: true;
        title: true;
        status: true;
        templateId: true;
        createdById: true;
        _count: { select: { items: true } };
      };
    }) => Promise<
      Array<Omit<DebugTask, 'itemCount'> & { _count: { items: number } }>
    >;
  };
  taskItem: {
    count: (args: {
      where: {
        taskId: string;
        datasetKind: 'qa_quality' | 'preference_compare';
      };
    }) => Promise<number>;
  };
};

@Injectable()
export class DebugService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: DebugPrismaClient,
  ) {}

  async getSeedStatus(): Promise<SeedStatus> {
    const [users, templates, tasks, qaItems, preferenceItems] = await Promise.all([
      this.prisma.user.count({ where: { id: { in: SEED_USER_IDS } } }),
      this.prisma.taskTemplate.count({
        where: { id: { in: SEED_TEMPLATE_IDS } },
      }),
      this.prisma.task.count({ where: { id: { in: SEED_TASK_IDS } } }),
      this.prisma.taskItem.count({
        where: {
          taskId: 'task_qa_quality_demo',
          datasetKind: 'qa_quality',
        },
      }),
      this.prisma.taskItem.count({
        where: {
          taskId: 'task_preference_compare_demo',
          datasetKind: 'preference_compare',
        },
      }),
    ]);

    return {
      users,
      templates,
      tasks,
      taskItems: {
        qa_quality: qaItems,
        preference_compare: preferenceItems,
      },
    };
  }

  async listTasks(): Promise<DebugTask[]> {
    const tasks = await this.prisma.task.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        status: true,
        templateId: true,
        createdById: true,
        _count: { select: { items: true } },
      },
    });

    return tasks.map(({ _count, ...task }) => ({
      ...task,
      itemCount: _count.items,
    }));
  }

  listUsers(): Promise<DebugUser[]> {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, role: true },
    });
  }
}

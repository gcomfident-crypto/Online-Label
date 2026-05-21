import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import {
  DebugService,
  type DebugTask,
  type DebugUser,
  type SeedStatus,
} from './debug.service.ts';

export const DEBUG_ENV = 'DEBUG_ENV';

type DebugEnv = {
  NODE_ENV?: string;
};

type DebugServiceLike = {
  getSeedStatus: () => Promise<SeedStatus>;
  listTasks: () => Promise<DebugTask[]>;
  listUsers: () => Promise<DebugUser[]>;
};

@Controller('debug')
export class DebugController {
  constructor(
    @Inject(DebugService)
    private readonly debugService: DebugServiceLike,
    @Optional()
    @Inject(DEBUG_ENV)
    private readonly env: DebugEnv = process.env,
  ) {}

  @Get('seed-status')
  async getSeedStatus(): Promise<SeedStatus> {
    this.assertDebugEnabled();
    return this.debugService.getSeedStatus();
  }

  @Get('tasks')
  async listTasks(): Promise<DebugTask[]> {
    this.assertDebugEnabled();
    return this.debugService.listTasks();
  }

  @Get('users')
  async listUsers(): Promise<DebugUser[]> {
    this.assertDebugEnabled();
    return this.debugService.listUsers();
  }

  private assertDebugEnabled(): void {
    if (this.env.NODE_ENV !== 'production') {
      return;
    }

    throw new NotFoundException({
      code: 'NOT_FOUND',
      message: '调试接口仅在开发环境可用。',
    });
  }
}

import { describe, expect, it, vi } from 'vitest';

import {
  LABELHUB_QUEUE_NAMES,
  createWorkerConfig,
  startWorker,
  startWorkerRuntime,
} from './queues.ts';

describe('LabelHub Worker 壳', () => {
  it('导出 ai-review 与 export 队列名', () => {
    expect(LABELHUB_QUEUE_NAMES).toEqual(['ai-review', 'export']);
  });

  it('默认读取本地 Redis 地址与 labelhub 队列前缀', () => {
    expect(createWorkerConfig({})).toEqual({
      redisUrl: 'redis://localhost:6379',
      queuePrefix: 'labelhub',
    });
  });

  it('支持通过环境变量覆盖 Worker 配置', () => {
    expect(
      createWorkerConfig({
        REDIS_URL: 'redis://example:6379',
        BULLMQ_QUEUE_PREFIX: 'custom',
      }),
    ).toEqual({
      redisUrl: 'redis://example:6379',
      queuePrefix: 'custom',
    });
  });

  it('启动时打印就绪日志', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    startWorker();

    expect(log).toHaveBeenCalledWith('LabelHub worker ready');
    log.mockRestore();
  });

  it('运行时启动后保持可停止的常驻句柄', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const runtime = startWorkerRuntime();

    expect(runtime.config).toEqual(createWorkerConfig({}));
    expect(runtime.stop).toEqual(expect.any(Function));

    await runtime.stop();
    log.mockRestore();
  });
});

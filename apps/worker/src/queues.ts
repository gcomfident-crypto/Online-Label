export const LABELHUB_QUEUE_NAMES = ['ai-review', 'export'] as const;

export type LabelHubQueueName = (typeof LABELHUB_QUEUE_NAMES)[number];

export type WorkerConfig = {
  redisUrl: string;
  queuePrefix: string;
};

export type WorkerRuntime = {
  config: WorkerConfig;
  stop: () => Promise<void>;
};

type WorkerEnv = {
  REDIS_URL?: string;
  BULLMQ_QUEUE_PREFIX?: string;
};

export function createWorkerConfig(env: WorkerEnv = process.env): WorkerConfig {
  return {
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    queuePrefix: env.BULLMQ_QUEUE_PREFIX ?? 'labelhub',
  };
}

export function startWorker(config: WorkerConfig = createWorkerConfig()): WorkerConfig {
  console.log('LabelHub worker ready');
  return config;
}

export function startWorkerRuntime(config: WorkerConfig = createWorkerConfig()): WorkerRuntime {
  startWorker(config);

  const keepAlive = setInterval(() => undefined, 60_000);

  return {
    config,
    stop: async () => {
      clearInterval(keepAlive);
    },
  };
}

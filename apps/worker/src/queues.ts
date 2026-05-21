export const LABELHUB_QUEUE_NAMES = ['ai-review', 'export'] as const;

export type LabelHubQueueName = (typeof LABELHUB_QUEUE_NAMES)[number];

export type WorkerConfig = {
  redisUrl: string;
  queuePrefix: string;
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

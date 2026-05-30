import 'reflect-metadata';

import { fileURLToPath } from 'node:url';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.ts';
import { loadWorkspaceEnv } from './env.ts';

loadWorkspaceEnv();

export const DEFAULT_API_PORT = 3000;

export function resolveApiPort(env: NodeJS.ProcessEnv = process.env): number {
  return Number(env.API_PORT ?? env.PORT ?? DEFAULT_API_PORT);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = resolveApiPort();
  await app.listen(port);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void bootstrap();
}

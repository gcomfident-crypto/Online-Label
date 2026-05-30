import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadDotenvFile, type DotenvConfigOutput } from 'dotenv';

type DotenvLoader = (options: {
  path: string;
  override?: boolean;
  quiet?: boolean;
}) => DotenvConfigOutput;

export function loadWorkspaceEnv(options: {
  cwd?: string;
  loader?: DotenvLoader;
} = {}): DotenvConfigOutput | null {
  const envPath = resolveWorkspaceEnvPath(options.cwd ?? process.cwd());

  if (!envPath) {
    return null;
  }

  return (options.loader ?? loadDotenvFile)({
    path: envPath,
    override: false,
    quiet: true,
  });
}

export function resolveWorkspaceEnvPath(cwd: string): string | null {
  const candidates = [
    resolve(cwd, '.env'),
    resolve(cwd, '..', '..', '.env'),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

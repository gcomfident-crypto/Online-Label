import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadWorkspaceEnv } from './env.ts';

const tempRoots: string[] = [];

describe('loadWorkspaceEnv', () => {
  afterEach(() => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();

      if (root) {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it('API 工作目录在 apps/api 时加载工作区根目录 .env', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'labelhub-env-'));
    tempRoots.push(workspaceRoot);
    const apiCwd = join(workspaceRoot, 'apps', 'api');
    mkdirSync(apiCwd, { recursive: true });
    writeFileSync(join(workspaceRoot, '.env'), 'DEEPSEEK_API_KEY=test-key\n');
    const loadedPaths: string[] = [];

    loadWorkspaceEnv({
      cwd: apiCwd,
      loader: (options) => {
        loadedPaths.push(options.path);
        return { parsed: { DEEPSEEK_API_KEY: 'test-key' } };
      },
    });

    expect(loadedPaths).toEqual([join(workspaceRoot, '.env')]);
  });
});

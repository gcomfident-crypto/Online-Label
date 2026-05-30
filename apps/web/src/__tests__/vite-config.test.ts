import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Vite 开发代理', () => {
  it('通过 /api 前缀将工作区 API 请求代理到本地 API 服务', () => {
    const configPath = join(process.cwd(), 'vite.config.ts');
    const configSource = readFileSync(configPath, 'utf8');

    expect(configSource).toContain("'/api': {");
    expect(configSource).toContain("target: 'http://localhost:3000'");
    expect(configSource).toContain("path.replace(/^\\/api/, '')");
  });
});

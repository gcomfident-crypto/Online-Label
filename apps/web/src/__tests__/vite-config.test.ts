import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Vite 开发代理', () => {
  it('将 LLM mock 请求代理到本地 API 服务', () => {
    const configPath = join(process.cwd(), 'vite.config.ts');
    const configSource = readFileSync(configPath, 'utf8');

    expect(configSource).toContain("'/llm': 'http://localhost:3000'");
  });
});

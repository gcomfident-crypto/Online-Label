import { existsSync, readFileSync } from 'node:fs';
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

  it('浏览器标签页使用裁切后的 PNG favicon', () => {
    const indexSource = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

    expect(indexSource).toContain('<link rel="icon" type="image/png" href="/src/assets/favicon.png" />');
    expect(existsSync(join(process.cwd(), 'src/assets/favicon.png'))).toBe(true);
  });
});
